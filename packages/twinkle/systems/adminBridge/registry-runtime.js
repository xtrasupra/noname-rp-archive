"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  getPlayerUuid,
  playerAdminLevel,
  playerFractionId,
  playerFractionRank,
} = require("../../utils/player.js");

const DATA_DIR = path.resolve(__dirname, "../../data");
const OVERRIDES_FILE = path.join(DATA_DIR, "admin-registry-overrides.json");
const FACTORY_FILE = path.join(DATA_DIR, "system-factory.json");
const systemsRoot = path.resolve(__dirname, "..");

const state = {
  installed: false,
  startedAt: new Date().toISOString(),
  events: new Map(),
  commands: new Map(),
  blips: new Map(),
  nextBlipId: 1,
  overrides: {},
  factory: { commands: [], items: [], factions: [], jobs: [], workflows: [] },
  factoryCommands: new Set(),
  factoryEntities: [],
  workflowCommands: new Set(),
  workflowZoneState: new Map(),
  workflowLastRun: new Map(),
};

function lazyGameServices() {
  return {
    inventory: require("../inventory/inventory.service.js"),
    items: require("../inventory/inventory.items.js"),
    clothes: require("../admin/admin.clothes.js"),
    db: require("../../database/query.js"),
    logsDb: require("../../database/logs.js"),
  };
}

function getPlayerData(player) {
  if (!player) return null;
  return {
    id: Number(player.id || 0),
    uuid: getPlayerUuid(player),
    name: String(player.name || ""),
    adminLevel: playerAdminLevel(player),
    fractionId: playerFractionId(player),
    fractionRank: playerFractionRank(player),
    cash: Number(player.character?.cash || player.getVariable?.("cash") || 0),
    level: Number(player.character?.level || player.getVariable?.("level") || 0),
    health: Number(player.health || 0),
    armour: Number(player.armour || 0),
    dimension: Number(player.dimension || 0),
    position: {
      x: Number(player.position?.x || 0),
      y: Number(player.position?.y || 0),
      z: Number(player.position?.z || 0),
    },
  };
}

function syncCash(player, cash) {
  if (!player) return;
  player.character = player.character || {};
  player.character.cash = Number(cash || 0);
  player.setVariable?.("cash", player.character.cash);
  player.call?.("client:money:update", [player.character.cash]);
}

const gameApi = {
  getPlayerData,
  getArg(args, index = 0) {
    return args[Math.max(0, Number(index || 0))];
  },
  findPlayer(value) {
    const target = Number(value);
    let found = null;
    mp.players.forEach((player) => {
      if (!found && (Number(player.id) === target || getPlayerUuid(player) === target)) found = player;
    });
    return found;
  },
  async addItem(player, itemId, amount = 1) {
    return lazyGameServices().inventory.addItem(player, String(itemId), Number(amount || 1));
  },
  async openInventory(player) {
    return lazyGameServices().inventory.openInventory(player);
  },
  async setClothes(player, component, drawable, texture = 0, palette = 0) {
    return lazyGameServices().clothes.setAndSaveClothes(
      player, Number(component), Number(drawable), Number(texture), Number(palette)
    );
  },
  async setProp(player, prop, drawable, texture = 0) {
    return lazyGameServices().clothes.setAndSaveProp(
      player, Number(prop), Number(drawable), Number(texture)
    );
  },
  async changeMoney(player, amount) {
    const uuid = getPlayerUuid(player);
    const delta = Number(amount || 0);
    if (!uuid || !Number.isFinite(delta)) return false;
    const { db, logsDb } = lazyGameServices();
    await db.query("UPDATE characters SET cash = GREATEST(cash + ?, 0) WHERE uuid = ?", [delta, uuid]);
    const current = Number(player.character?.cash || player.getVariable?.("cash") || 0);
    const nextCash = Math.max(0, current + delta);
    syncCash(player, nextCash);
    await logsDb.writeMoneyLog({
      source: "admin_bridge",
      action: delta >= 0 ? "give" : "take",
      currency: "cash",
      amount: delta,
      balanceBefore: current,
      balanceAfter: nextCash,
      target: player,
      comment: "registry changeMoney",
    });
    return true;
  },
  async setMoney(player, amount) {
    const uuid = getPlayerUuid(player);
    const value = Math.max(0, Number(amount || 0));
    if (!uuid) return false;
    const { db, logsDb } = lazyGameServices();
    const current = Number(player.character?.cash || player.getVariable?.("cash") || 0);
    await db.query("UPDATE characters SET cash = ? WHERE uuid = ?", [value, uuid]);
    syncCash(player, value);
    await logsDb.writeMoneyLog({
      source: "admin_bridge",
      action: "set",
      currency: "cash",
      amount: value - current,
      balanceBefore: current,
      balanceAfter: value,
      target: player,
      comment: "registry setMoney",
    });
    return true;
  },
  async setFraction(player, fractionId, rank = 1) {
    const uuid = getPlayerUuid(player);
    const faction = Math.max(0, Number(fractionId || 0));
    const factionRank = faction ? Math.max(1, Number(rank || 1)) : 0;
    if (!uuid) return false;
    const { db } = lazyGameServices();
    await db.query("DELETE FROM fraction_members WHERE character_uuid = ?", [uuid]);
    if (faction) {
      await db.query(
        `INSERT INTO fraction_members (fraction_id, character_uuid, rank_index)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE fraction_id = VALUES(fraction_id), rank_index = VALUES(rank_index)`,
        [faction, uuid, factionRank]
      );
    }
    await db.query("UPDATE characters SET has_fraction = ? WHERE uuid = ?", [
      faction ? 1 : 0, uuid,
    ]);
    player.fraction = faction;
    player.fractionId = faction;
    player.fractionRank = factionRank;
    player.character = player.character || {};
    player.character.fraction_id = faction;
    player.character.fraction_rank = factionRank;
    player.character.has_fraction = faction ? 1 : 0;
    player.hasFraction = Boolean(faction);
    player.setVariable?.("fraction", faction);
    player.setVariable?.("fractionId", faction);
    player.setVariable?.("fractionRank", factionRank);
    player.setVariable?.("hasFraction", Boolean(faction));
    return true;
  },
  async setAdminLevel(player, level) {
    const uuid = getPlayerUuid(player);
    const value = Math.max(0, Math.min(10, Number(level || 0)));
    if (!uuid) return false;
    const { db } = lazyGameServices();
    await db.withConn(async (conn) => {
      await conn.beginTransaction();
      try {
        const [characters] = await conn.query(
          `SELECT uuid, account_id, username, lastname
             FROM characters
            WHERE uuid = ?
            LIMIT 1
            FOR UPDATE`,
          [uuid]
        );
        const character = characters[0];
        if (!character) throw new Error("CHARACTER_NOT_FOUND");

        await conn.query(
          "UPDATE characters SET has_admin_profile = ? WHERE uuid = ?",
          [value > 0 ? 1 : 0, uuid]
        );

        if (value > 0) {
          const displayName = [character.username, character.lastname]
            .filter(Boolean)
            .join(" ")
            .trim()
            .slice(0, 64) || `Administrator #${uuid}`;
          await conn.query(
            `INSERT INTO twinkle_admin.admin_profiles
              (account_id, character_uuid, admin_level, admsite_access,
               role_code, department_code, display_name, is_active)
             VALUES (?, ?, ?, 1, 'helper', 'administrator', ?, 1)
             ON DUPLICATE KEY UPDATE
               character_uuid = VALUES(character_uuid),
               admin_level = VALUES(admin_level),
               admsite_access = 1,
               display_name = VALUES(display_name),
               is_active = 1`,
            [Number(character.account_id), uuid, value, displayName]
          );
        } else {
          await conn.query(
            `UPDATE twinkle_admin.admin_profiles
                SET admin_level = 0, admsite_access = 0, is_active = 0
              WHERE character_uuid = ? OR account_id = ?`,
            [uuid, Number(character.account_id)]
          );
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });
    player.adminLevel = value;
    player.admin = value;
    player.character = player.character || {};
    player.character.admin_level = value;
    player.character.has_admin_profile = value > 0 ? 1 : 0;
    player.hasAdminProfile = value > 0;
    player.setVariable?.("adminLevel", value);
    player.setVariable?.("admin", value);
    player.setVariable?.("hasAdminProfile", value > 0);
    return true;
  },
  spawnVehicle(model, position, options = {}) {
    const hash = typeof model === "number" ? model : mp.joaat(String(model));
    return mp.vehicles.new(hash, new mp.Vector3(
      Number(position?.x || 0), Number(position?.y || 0), Number(position?.z || 0)
    ), {
      heading: Number(options.heading || 0),
      dimension: Number(options.dimension || 0),
      numberPlate: String(options.numberPlate || "TWINKLE").slice(0, 8),
      color: Array.isArray(options.color) ? options.color : [[120, 80, 255], [20, 20, 20]],
    });
  },
};

function hash(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function sourceFromStack() {
  const stack = String(new Error().stack || "").split("\n");
  const line = stack.find((item) =>
    item.includes(`${path.sep}systems${path.sep}`) &&
    !item.includes(`${path.sep}adminBridge${path.sep}registry-runtime.js`)
  );
  const match = line && line.match(/\(?(.+?\.js):(\d+):(\d+)\)?$/);
  if (!match) return { file: "runtime", line: 0 };
  return {
    file: path.relative(path.resolve(systemsRoot, ".."), match[1]).replace(/\\/g, "/"),
    line: Number(match[2] || 0),
  };
}

function loadOverrides() {
  try {
    state.overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8")) || {};
  } catch {
    state.overrides = {};
  }
}

function saveOverrides() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(state.overrides, null, 2), "utf8");
}

function loadFactory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FACTORY_FILE, "utf8"));
    state.factory = {
      commands: Array.isArray(parsed?.commands) ? parsed.commands : [],
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      factions: Array.isArray(parsed?.factions) ? parsed.factions : [],
      jobs: Array.isArray(parsed?.jobs) ? parsed.jobs : [],
      workflows: Array.isArray(parsed?.workflows) ? parsed.workflows : [],
    };
  } catch {
    state.factory = { commands: [], items: [], factions: [], jobs: [], workflows: [] };
  }
}

function saveFactory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FACTORY_FILE, JSON.stringify(state.factory, null, 2), "utf8");
}

async function executeFactoryActions(player, actionList, commandArgs = []) {
  const vars = { player: getPlayerData(player), args: commandArgs };
  for (const action of Array.isArray(actionList) ? actionList : []) {
    const type = String(action?.type || "");
    if (type === "notify") player?.outputChatBox?.(String(action.text || ""));
    else if (type === "broadcast") mp.players.broadcast(String(action.text || ""));
    else if (type === "addItem") await gameApi.addItem(player, action.itemId, action.amount);
    else if (type === "money") await gameApi.changeMoney(player, action.amount);
    else if (type === "health" && player) player.health = Number(action.value ?? action.amount ?? 100);
    else if (type === "armour" && player) player.armour = Number(action.value ?? action.amount ?? 100);
    else if (type === "fraction") await gameApi.setFraction(player, action.fractionId, action.rank);
    else if (type === "adminLevel") await gameApi.setAdminLevel(player, action.level);
    else if (type === "teleport" && player) {
      player.position = new mp.Vector3(Number(action.x || 0), Number(action.y || 0), Number(action.z || 0));
    } else if (type === "vehicle") {
      gameApi.spawnVehicle(action.model, player?.position || action.position, {
        heading: action.heading || 0,
        dimension: player?.dimension || 0,
      });
    } else if (type === "clientEvent") {
      player?.call?.(String(action.eventName || ""), Array.isArray(action.args) ? action.args : []);
    } else if (type === "delay") {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(action.milliseconds || 0))));
    } else if (type === "condition") {
      const field = String(action.field || "");
      const actual = field.split(".").reduce((value, key) => value?.[key], vars);
      const expected = action.value;
      const ok = action.operator === ">=" ? Number(actual) >= Number(expected)
        : action.operator === "<=" ? Number(actual) <= Number(expected)
        : action.operator === "!=" ? String(actual) !== String(expected)
        : String(actual) === String(expected);
      if (!ok) return false;
    }
  }
  return true;
}

function workflowValue(value, context) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  return value.slice(1).split(".").reduce((current, key) => current?.[key], context);
}

function checkWorkflowCondition(node, context) {
  const left = workflowValue(node.left, context);
  const right = workflowValue(node.right, context);
  switch (node.operator) {
    case ">": return Number(left) > Number(right);
    case ">=": return Number(left) >= Number(right);
    case "<": return Number(left) < Number(right);
    case "<=": return Number(left) <= Number(right);
    case "!=": return String(left) !== String(right);
    case "contains": return String(left ?? "").includes(String(right ?? ""));
    default: return String(left) === String(right);
  }
}

async function executeWorkflow(workflow, player, triggerData = {}) {
  if (!workflow || workflow.enabled === false) return false;
  const nodes = new Map((workflow.nodes || []).map((node) => [String(node.id), node]));
  let nodeId = String(workflow.startNode || workflow.nodes?.[0]?.id || "");
  const context = {
    player: getPlayerData(player),
    trigger: triggerData,
    vars: {},
  };
  let steps = 0;
  while (nodeId && steps++ < 100) {
    const node = nodes.get(nodeId);
    if (!node) break;
    if (node.type === "condition") {
      nodeId = checkWorkflowCondition(node, context) ? String(node.yes || "") : String(node.no || "");
      continue;
    }
    if (node.type === "setVariable") {
      context.vars[String(node.name || "value")] = workflowValue(node.value, context);
    } else if (node.type === "finish") {
      return true;
    } else {
      const action = { ...node };
      for (const [key, value] of Object.entries(action)) action[key] = workflowValue(value, context);
      await executeFactoryActions(player, [action], Array.isArray(triggerData.args) ? triggerData.args : []);
      context.player = getPlayerData(player);
    }
    nodeId = String(node.next || "");
  }
  return true;
}

function registerWorkflowCommand(workflow) {
  const command = String(workflow.trigger?.command || workflow.code || "").replace(/^\//, "").toLowerCase();
  if (!command || state.workflowCommands.has(command)) return;
  state.workflowCommands.add(command);
  mp.registerCommand(command, async (player, fullText) => {
    const current = state.factory.workflows.find((item) =>
      item.enabled !== false && item.trigger?.type === "command" &&
      String(item.trigger?.command || item.code).replace(/^\//, "").toLowerCase() === command
    );
    if (!current) return;
    await executeWorkflow(current, player, {
      type: "command",
      text: String(fullText || ""),
      args: String(fullText || "").trim().split(/\s+/).filter(Boolean),
    });
  });
}

function applyWorkflows() {
  for (const workflow of state.factory.workflows) {
    if (workflow.enabled !== false && workflow.trigger?.type === "command") registerWorkflowCommand(workflow);
  }
}

function registerFactoryCommand(command) {
  const name = String(command?.code || "").replace(/^\//, "").toLowerCase();
  if (!name || state.factoryCommands.has(name)) return;
  state.factoryCommands.add(name);
  mp.registerCommand(name, async (player, fullText) => {
    const current = state.factory.commands.find((item) => item.code.replace(/^\//, "").toLowerCase() === name);
    if (!current || current.enabled === false) return;
    const adminLevel = getPlayerData(player)?.adminLevel || 0;
    if (adminLevel < Number(current.requiredLevel || 0)) {
      return player.outputChatBox?.("Недостаточно прав для этой команды.");
    }
    const args = String(fullText || "").trim().split(/\s+/).filter(Boolean);
    await executeFactoryActions(player, current.actions, args);
  });
}

async function applyFactoryFaction(fraction) {
  const { db } = lazyGameServices();
  const id = Number(fraction.fractionId || 0);
  if (!id) return;
  await require("../fractions/fraction.service.js").ensureSchema();
  const spawn = fraction.spawn || {};
  await db.query(
    `INSERT INTO fractions
      (fraction_id, name, short_name, type, balance, spawn_points, settings, is_active,
       spawn_x, spawn_y, spawn_z, spawn_h, spawn_dimension)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), short_name=VALUES(short_name), type=VALUES(type),
       balance=VALUES(balance), spawn_points=VALUES(spawn_points), settings=VALUES(settings),
       is_active=VALUES(is_active), spawn_x=VALUES(spawn_x), spawn_y=VALUES(spawn_y),
       spawn_z=VALUES(spawn_z), spawn_h=VALUES(spawn_h), spawn_dimension=VALUES(spawn_dimension)`,
    [
      id, String(fraction.name || `Fraction ${id}`), String(fraction.shortName || "").slice(0, 32),
      ["state", "ghetto", "mafia", "adm"].includes(fraction.type) ? fraction.type : "state",
      Number(fraction.balance || 0), JSON.stringify([spawn]), JSON.stringify(fraction.settings || {}),
      fraction.enabled === false ? 0 : 1, spawn.x || 0, spawn.y || 0, spawn.z || 0,
      spawn.heading || 0, spawn.dimension || 0,
    ]
  );
  await db.query("DELETE FROM fraction_ranks WHERE fraction_id = ?", [id]);
  for (const [index, rank] of (fraction.ranks || []).entries()) {
    await db.query(
      `INSERT INTO fraction_ranks
        (fraction_id, rank_index, rank_name, salary, permissions, is_leader)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, Number(rank.index || index + 1), String(rank.name || `Ранг ${index + 1}`),
        Number(rank.salary || 0), JSON.stringify(rank.permissions || []), rank.isLeader ? 1 : 0]
    );
  }
  if (Array.isArray(fraction.departments)) {
    await db.query("DELETE FROM fraction_departments WHERE fraction_id = ?", [id]);
    for (const [index, department] of fraction.departments.entries()) {
      const code = String(department.code || "").trim().toUpperCase().slice(0, 32);
      const name = String(department.name || "").trim().slice(0, 96);
      if (!code || !name) continue;
      await db.query(
        `INSERT INTO fraction_departments
          (fraction_id, code, name, description, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          name,
          String(department.description || "").trim().slice(0, 255) || null,
          Number(department.sortOrder ?? index),
          department.enabled === false ? 0 : 1,
        ]
      );
    }
  }
}

function clearFactoryEntities() {
  for (const entity of state.factoryEntities) {
    try { entity?.destroy?.(); } catch {}
  }
  state.factoryEntities = [];
}

function applyFactoryJob(job) {
  if (job.enabled === false) return;
  const npc = job.npc || {};
  const position = new mp.Vector3(Number(npc.x || 0), Number(npc.y || 0), Number(npc.z || 0));
  if (mp.peds?.new && npc.model) {
    const ped = mp.peds.new(mp.joaat(String(npc.model)), position, {
      heading: Number(npc.heading || 0), dimension: Number(npc.dimension || 0), frozen: true,
    });
    state.factoryEntities.push(ped);
  }
  if (job.blip?.enabled !== false) {
    const blip = mp.blips.new(Number(job.blip?.sprite || 1), position, {
      name: String(job.name || job.code), color: Number(job.blip?.color || 0),
      scale: Number(job.blip?.scale || 0.85), shortRange: true,
    });
    state.factoryEntities.push(blip);
  }
  const commandName = `job_${String(job.code || "").replace(/[^a-z0-9_]/gi, "").toLowerCase()}`;
  if (commandName !== "job_" && !state.factoryCommands.has(commandName)) {
    state.factoryCommands.add(commandName);
    mp.registerCommand(commandName, async (player) => {
      const current = state.factory.jobs.find((item) => `job_${item.code}`.toLowerCase() === commandName);
      if (!current || current.enabled === false) return;
      player.factoryJob = current.code;
      player.factoryJobPoint = 0;
      if (current.vehicle?.model) {
        const vehicle = gameApi.spawnVehicle(current.vehicle.model, player.position, {
          heading: player.heading || 0, dimension: player.dimension || 0,
        });
        try { player.putIntoVehicle(vehicle, 0); } catch {}
      }
      player.outputChatBox?.(`Работа «${current.name}» начата. Точек: ${(current.routePoints || []).length}.`);
      player.call?.("factory:job:start", [JSON.stringify(current)]);
    });
  }
}

async function applyFactory() {
  const items = lazyGameServices().items;
  for (const item of state.factory.items) {
    if (item.enabled !== false && item.id) items[item.id] = { ...item, actions: item.actions || ["give", "drop", "info"] };
  }
  for (const command of state.factory.commands) registerFactoryCommand(command);
  clearFactoryEntities();
  for (const job of state.factory.jobs) applyFactoryJob(job);
  for (const fraction of state.factory.factions) {
    applyFactoryFaction(fraction).catch((error) => console.error("[SYSTEM_FACTORY] faction:", error));
  }
  applyWorkflows();
}

function compileOverride(code, eventId) {
  const body = String(code || "").trim();
  if (!body) throw new Error("Код обработчика пуст");
  if (body.length > 100000) throw new Error("Код обработчика слишком большой");
  try {
    return new Function(
      "context",
      "args",
      `"use strict"; return (async () => {\n${body}\n})();\n//# sourceURL=admin-event-${eventId}.js`
    );
  } catch (error) {
    throw new Error(`Ошибка синтаксиса: ${error.message}`);
  }
}

function executeRegistered(entry, context, args) {
  const published = state.overrides[entry.id];
  if (!published?.enabled || !published?.code) {
    return entry.original.apply(context, args);
  }
  if (!entry.compiled || entry.compiledHash !== published.hash) {
    entry.compiled = compileOverride(published.code, entry.id);
    entry.compiledHash = published.hash;
  }
  const original = (...nextArgs) => entry.original.apply(context, nextArgs.length ? nextArgs : args);
  return entry.compiled(
    {
      mp: global.mp,
      event: { id: entry.id, name: entry.name, source: entry.source },
      original,
      game: gameApi,
      log: (...values) => console.log(`[EVENT_STUDIO:${entry.name}]`, ...values),
    },
    args
  );
}

function registerEvent(name, handler, kind = "event") {
  const source = sourceFromStack();
  const duplicate = Array.from(state.events.values()).filter((item) => item.name === name).length + 1;
  const id = hash(`${kind}:${name}:${source.file}:${source.line}:${duplicate}`).slice(0, 20);
  const entry = {
    id,
    kind,
    name: String(name),
    source,
    original: handler,
    originalSource: String(handler),
    registeredAt: new Date().toISOString(),
    calls: 0,
    failures: 0,
    lastCalledAt: null,
    lastError: null,
  };
  entry.proxy = function (...args) {
    entry.calls += 1;
    entry.lastCalledAt = new Date().toISOString();
    try {
      const result = executeRegistered(entry, this, args);
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          entry.failures += 1;
          entry.lastError = String(error?.stack || error);
          console.error(`[EVENT_STUDIO] ${entry.name}:`, error);
        });
      }
      return result;
    } catch (error) {
      entry.failures += 1;
      entry.lastError = String(error?.stack || error);
      console.error(`[EVENT_STUDIO] ${entry.name}:`, error);
      throw error;
    }
  };
  state.events.set(id, entry);
  return entry;
}

function registerCommand(name, handler, originalRegister) {
  const entry = registerEvent(String(name).toLowerCase(), handler, "command");
  state.commands.set(entry.id, entry);
  return originalRegister(name, entry.proxy);
}

function install() {
  if (state.installed || !global.mp) return;
  state.installed = true;
  loadOverrides();

  const originalEventsAdd = mp.events.add.bind(mp.events);
  mp.events.add = function (name, handler) {
    if (name && typeof name === "object" && !Array.isArray(name)) {
      const wrapped = {};
      for (const [eventName, eventHandler] of Object.entries(name)) {
        wrapped[eventName] = typeof eventHandler === "function"
          ? registerEvent(eventName, eventHandler).proxy
          : eventHandler;
      }
      return originalEventsAdd(wrapped);
    }
    if (typeof handler !== "function") return originalEventsAdd(name, handler);
    return originalEventsAdd(name, registerEvent(name, handler).proxy);
  };

  if (typeof mp.registerCommand === "function") {
    const originalRegisterCommand = mp.registerCommand.bind(mp);
    mp.registerCommand = (name, handler) => registerCommand(name, handler, originalRegisterCommand);
  }
  if (typeof mp.events.addCommand === "function") {
    const originalAddCommand = mp.events.addCommand.bind(mp.events);
    mp.events.addCommand = (name, handler) => registerCommand(name, handler, originalAddCommand);
  }

  if (mp.blips && typeof mp.blips.new === "function") {
    const originalBlipNew = mp.blips.new.bind(mp.blips);
    mp.blips.new = function (sprite, position, options = {}) {
      const source = sourceFromStack();
      const instance = originalBlipNew(sprite, position, options);
      const id = state.nextBlipId++;
      state.blips.set(id, {
        id,
        source,
        sprite: Number(sprite || 1),
        name: String(options.name || `Blip ${id}`),
        color: Number(options.color || 0),
        scale: Number(options.scale || 1),
        shortRange: options.shortRange !== false,
        dimension: Number(options.dimension || 0),
        position: {
          x: Number(position?.x || 0),
          y: Number(position?.y || 0),
          z: Number(position?.z || 0),
        },
        instance,
        createdAt: new Date().toISOString(),
      });
      return instance;
    };
  }
  mp.events.add("factory:job:completePoint", async (player, jobCode, pointIndex) => {
    const job = state.factory.jobs.find((item) => String(item.code) === String(jobCode));
    if (!job || player.factoryJob !== job.code) return;
    const index = Number(pointIndex || 0);
    if (index !== Number(player.factoryJobPoint || 0)) return;
    const points = Array.isArray(job.routePoints) ? job.routePoints : [];
    const point = points[index];
    if (!point || !player.position) return;
    const dx = Number(player.position.x || 0) - Number(point.x || 0);
    const dy = Number(player.position.y || 0) - Number(point.y || 0);
    const dz = Number(player.position.z || 0) - Number(point.z || 0);
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 12) return;
    const reward = Number(job.reward?.perPoint || 0);
    if (reward > 0) await gameApi.changeMoney(player, reward);
    player.factoryJobPoint = index + 1;
    if (player.factoryJobPoint >= points.length) {
      const base = Number(job.reward?.base || 0);
      if (base > 0) await gameApi.changeMoney(player, base);
      player.outputChatBox?.(`Работа «${job.name}» завершена.`);
      player.call?.("factory:job:finish");
      player.factoryJob = null;
      player.factoryJobPoint = 0;
    } else {
      player.call?.("factory:job:next", [player.factoryJobPoint]);
    }
  });
  mp.events.add("playerReady", async (player) => {
    for (const workflow of state.factory.workflows.filter((item) => item.enabled !== false && item.trigger?.type === "playerReady")) {
      await executeWorkflow(workflow, player, { type: "playerReady" });
    }
  });
  mp.events.add("playerDeath", async (player, reason, killer) => {
    for (const workflow of state.factory.workflows.filter((item) => item.enabled !== false && item.trigger?.type === "playerDeath")) {
      await executeWorkflow(workflow, player, { type: "playerDeath", reason, killerId: killer?.id ?? null });
    }
  });
  setInterval(async () => {
    const now = Date.now();
    for (const workflow of state.factory.workflows.filter((item) => item.enabled !== false)) {
      const trigger = workflow.trigger || {};
      if (trigger.type === "timer") {
        const interval = Math.max(1000, Number(trigger.intervalMs || 60000));
        const last = Number(state.workflowLastRun.get(workflow.id) || 0);
        if (now - last >= interval) {
          state.workflowLastRun.set(workflow.id, now);
          const players = [];
          mp.players.forEach((player) => players.push(player));
          for (const player of players) await executeWorkflow(workflow, player, { type: "timer" });
        }
      }
      if (trigger.type === "zone") {
        mp.players.forEach((player) => {
          const dx = Number(player.position?.x || 0) - Number(trigger.x || 0);
          const dy = Number(player.position?.y || 0) - Number(trigger.y || 0);
          const dz = Number(player.position?.z || 0) - Number(trigger.z || 0);
          const inside = Math.sqrt(dx * dx + dy * dy + dz * dz) <= Number(trigger.radius || 3);
          const key = `${workflow.id}:${player.id}`;
          const wasInside = state.workflowZoneState.get(key) === true;
          state.workflowZoneState.set(key, inside);
          if (inside && !wasInside) executeWorkflow(workflow, player, { type: "zone" }).catch(console.error);
        });
      }
    }
  }, 1000);
  loadFactory();
  applyFactory().catch((error) => console.error("[SYSTEM_FACTORY] apply error:", error));
  console.log("[REGISTRY] Runtime registry installed");
}

function listSystems() {
  function countJsFiles(directory) {
    let count = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) count += countJsFiles(target);
      else if (entry.name.endsWith(".js")) count += 1;
    }
    return count;
  }
  try {
    return fs.readdirSync(systemsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const directory = path.join(systemsRoot, entry.name);
        return {
          code: entry.name,
          source: `systems/${entry.name}`,
          files: countJsFiles(directory),
          events: Array.from(state.events.values()).filter((item) => item.source.file.startsWith(`systems/${entry.name}/`)).length,
          commands: Array.from(state.commands.values()).filter((item) => item.source.file.startsWith(`systems/${entry.name}/`)).length,
          blips: Array.from(state.blips.values()).filter((item) => item.source.file.startsWith(`systems/${entry.name}/`)).length,
        };
      });
  } catch {
    return [];
  }
}

function serializeEvent(entry, includeSource = false) {
  const published = state.overrides[entry.id] || null;
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    source: entry.source,
    calls: entry.calls,
    failures: entry.failures,
    lastCalledAt: entry.lastCalledAt,
    lastError: entry.lastError,
    registeredAt: entry.registeredAt,
    overridden: Boolean(published?.enabled),
    version: Number(published?.version || 0),
    publishedAt: published?.publishedAt || null,
    ...(includeSource ? {
      originalSource: entry.originalSource,
      publishedCode: published?.code || "",
    } : {}),
  };
}

function serializeBlip(entry) {
  const { instance, ...data } = entry;
  return data;
}

function snapshot() {
  const events = Array.from(state.events.values());
  let items = [];
  try {
    items = Object.values(lazyGameServices().items).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      stackable: Boolean(item.stackable),
      equipSlot: item.equipSlot || null,
    }));
  } catch {}
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    startedAt: state.startedAt,
    systems: listSystems(),
    events: events.filter((item) => item.kind === "event").map((item) => serializeEvent(item)),
    commands: events.filter((item) => item.kind === "command").map((item) => serializeEvent(item)),
    blips: Array.from(state.blips.values()).map(serializeBlip),
    capabilities: {
      playerData: ["uuid", "name", "adminLevel", "fractionId", "fractionRank", "cash", "health", "armour", "dimension", "position"],
      actions: Object.keys(gameApi),
    },
    catalogs: {
      items,
      clothesComponents: [
        { id: 0, name: "Лицо" }, { id: 1, name: "Маска" }, { id: 2, name: "Волосы" },
        { id: 3, name: "Торс" }, { id: 4, name: "Штаны" }, { id: 5, name: "Сумка" },
        { id: 6, name: "Обувь" }, { id: 7, name: "Аксессуар" }, { id: 8, name: "Майка" },
        { id: 9, name: "Броня" }, { id: 10, name: "Деколь" }, { id: 11, name: "Верх" },
      ],
      propComponents: [
        { id: 0, name: "Головной убор" }, { id: 1, name: "Очки" }, { id: 2, name: "Уши" },
        { id: 6, name: "Часы" }, { id: 7, name: "Браслет" },
      ],
    },
  };
}

function getEvent(id) {
  const entry = state.events.get(String(id));
  return entry ? serializeEvent(entry, true) : null;
}

function validateEvent(id, code) {
  if (!state.events.has(String(id))) throw new Error("Событие не найдено на сервере");
  compileOverride(code, id);
  return { ok: true, hash: hash(code) };
}

function publishEvent(id, code, enabled = true, author = "web-admin") {
  const entry = state.events.get(String(id));
  if (!entry) throw new Error("Событие не найдено на сервере");
  compileOverride(code, id);
  const previous = state.overrides[id] || null;
  state.overrides[id] = {
    code: String(code),
    enabled: enabled !== false,
    hash: hash(code),
    version: Number(previous?.version || 0) + 1,
    author: String(author || "web-admin"),
    publishedAt: new Date().toISOString(),
    history: [
      ...(Array.isArray(previous?.history) ? previous.history : []),
      ...(previous ? [{ ...previous, history: undefined }] : []),
    ].slice(-20),
  };
  entry.compiled = null;
  saveOverrides();
  return getEvent(id);
}

function rollbackEvent(id) {
  const entry = state.events.get(String(id));
  const current = state.overrides[id];
  if (!entry || !current) throw new Error("Опубликованная версия не найдена");
  const history = Array.isArray(current.history) ? current.history : [];
  const previous = history.pop();
  if (previous) state.overrides[id] = { ...previous, history };
  else delete state.overrides[id];
  entry.compiled = null;
  saveOverrides();
  return getEvent(id);
}

function updateBlip(id, patch) {
  const entry = state.blips.get(Number(id));
  if (!entry) throw new Error("Блип не найден");
  for (const key of ["name", "color", "scale", "shortRange", "dimension"]) {
    if (patch[key] !== undefined) {
      entry[key] = patch[key];
      try { entry.instance[key] = patch[key]; } catch {}
    }
  }
  entry.updatedAt = new Date().toISOString();
  return serializeBlip(entry);
}

function factorySnapshot() {
  return JSON.parse(JSON.stringify(state.factory));
}

function normalizeFactoryKind(kind) {
  if (!["commands", "items", "fractions", "jobs", "workflows"].includes(kind)) throw new Error("Неизвестный тип конструктора");
  return kind;
}

async function upsertFactory(kind, payload) {
  const targetKind = normalizeFactoryKind(kind);
  const key = targetKind === "fractions" ? "fractionId" : targetKind === "commands" ? "code" : "id";
  const value = payload?.[key] ?? (targetKind === "jobs" ? payload?.code : null);
  const normalizedKey = targetKind === "jobs" ? "code" : key;
  if (value === undefined || value === null || String(value).trim() === "") throw new Error("Не указан системный идентификатор");
  const list = state.factory[targetKind];
  const index = list.findIndex((item) => String(item[normalizedKey]) === String(value));
  const record = { ...payload, [normalizedKey]: targetKind === "fractions" ? Number(value) : String(value).trim() };
  if (targetKind === "items") {
    if (record.equipSlot && record.clothesComponent !== undefined && record.clothesComponent !== null && record.clothesComponent !== "") {
      record.clothes = {
        component: Number(record.clothesComponent), drawable: Number(record.drawable || 0),
        texture: Number(record.texture || 0), palette: Number(record.palette || 0),
      };
    }
    if (record.equipSlot && record.propId !== undefined && record.propId !== null && record.propId !== "") {
      record.prop = {
        prop: Number(record.propId), drawable: Number(record.drawable || 0), texture: Number(record.texture || 0),
      };
    }
    if (!record.useEvent) delete record.useEvent;
    if (!record.equipSlot) delete record.equipSlot;
  }
  if (index >= 0) list[index] = record;
  else list.push(record);
  saveFactory();
  await applyFactory();
  return record;
}

async function deleteFactory(kind, id) {
  const targetKind = normalizeFactoryKind(kind);
  const key = targetKind === "fractions" ? "fractionId" : targetKind === "commands" ? "code" : targetKind === "jobs" ? "code" : "id";
  state.factory[targetKind] = state.factory[targetKind].filter((item) => String(item[key]) !== String(id));
  saveFactory();
  await applyFactory();
  return true;
}

module.exports = {
  install,
  snapshot,
  getEvent,
  validateEvent,
  publishEvent,
  rollbackEvent,
  updateBlip,
  factorySnapshot,
  upsertFactory,
  deleteFactory,
};
