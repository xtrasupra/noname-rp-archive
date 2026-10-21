"use strict";

const crypto = require("crypto");
const { formatCartPurchaseNotification } = require("../business/business.notification.js");
const inventory = require("../inventory/inventory.service.js");
const licenses = require("../licenses/license.service.js");
const repository = require("./fishing.repository.js");
const config = require("./fishing.config.js");
const logs = require("../../database/logs.js");
const db = require("../../database/query.js");
const businessService = require("../business/business.service.js");
const quests = require("../quests/quest.service.js");

try {
  global.__twinkleFishingRuntime?.shutdown?.("reload");
} catch (error) {
  console.error("[FISHING] Previous runtime shutdown failed:", error);
}

const commercePurchaseLocks = global.__twinkleCommercePurchaseLocks || {};
if (!(commercePurchaseLocks.fishing instanceof Set)) commercePurchaseLocks.fishing = new Set();
if (!(commercePurchaseLocks.hunting instanceof Set)) commercePurchaseLocks.hunting = new Set();
global.__twinkleCommercePurchaseLocks = commercePurchaseLocks;

const fishingRuntime = {
  active: true,
  events: [],
  commands: [],
  timers: [],
  profiles: new Map(),
  shopSessions: new Map(),
  shopPurchases: commercePurchaseLocks.fishing,
  sessions: new Map(),
  pointLeases: new Map(),
  operations: new Map(),
  shutdown: null,
};
global.__twinkleFishingRuntime = fishingRuntime;

function registerServerEvent(eventName, handler) {
  const guardedHandler = (...args) => {
    if (!fishingRuntime.active) return undefined;

    try {
      const result = handler(...args);
      if (!result || typeof result.then !== "function") return result;

      return result.catch((error) => {
        console.error(`[FISHING] Event ${eventName} failed:`, error);
        const player = args[0];
        if (player && mp.players.exists(player)) {
          notifyError(player, "Действие рыбалки не выполнено. Попробуйте ещё раз.");
        }
        return undefined;
      });
    } catch (error) {
      console.error(`[FISHING] Event ${eventName} failed:`, error);
      const player = args[0];
      if (player && mp.players.exists(player)) {
        notifyError(player, "Действие рыбалки не выполнено. Попробуйте ещё раз.");
      }
      return undefined;
    }
  };
  mp.events.add(eventName, guardedHandler);
  fishingRuntime.events.push({ eventName, handler: guardedHandler });
  return guardedHandler;
}

function registerServerCommand(commandName, handler) {
  const name = String(commandName || "").trim().toLowerCase();
  if (!name) return null;

  const guardedHandler = (player, fullText = "", args = []) => {
    if (!fishingRuntime.active) return undefined;
    const parsedArgs = Array.isArray(args) && args.length
      ? args.map((arg) => String(arg))
      : String(fullText || "").trim().split(/\s+/).filter(Boolean);
    return handler(player, fullText, ...parsedArgs);
  };

  if (typeof mp.registerCommand !== "function") {
    throw new Error("Project command registry is unavailable");
  }

  mp.registerCommand(name, guardedHandler);
  fishingRuntime.commands.push({ name, handler: guardedHandler });

  return guardedHandler;
}

function registerTimer(callback, delay) {
  const timer = setInterval(callback, delay);
  fishingRuntime.timers.push(timer);
  return timer;
}

function getPlayerStaticId(player) {
  return Number(
    player?.uuid ||
    player?.characterId ||
    player?.character?.uuid ||
    player?.characterData?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function getPlayerCash(player) {
  return Number(
    player?.character?.cash ??
    player?.characterData?.cash ??
    player?.getVariable?.("cash") ??
    0
  );
}

function syncPlayerCash(player, value) {
  const cash = Math.max(0, Number(value || 0));
  if (player?.character) player.character.cash = cash;
  if (player?.characterData) player.characterData.cash = cash;
  if (player) {
    player.cash = cash;
    player.money = cash;
  }
  try { player.setVariable("cash", cash); } catch {}
  try { player.call("client:money:update", [cash]); } catch {}
  try { player.call("c:hud:update", [JSON.stringify({ player: { cash } })]); } catch {}
}

async function addPlayerCash(player, amount) {
  const value = Math.max(0, Math.round(Number(amount || 0)));
  const nextCash = getPlayerCash(player) + value;
  const staticId = getPlayerStaticId(player);

  if (value > 0 && staticId) {
    await db.query(
      "UPDATE characters SET cash = cash + ? WHERE uuid = ?",
      [value, staticId]
    );
  }

  syncPlayerCash(player, nextCash);
  return nextCash;
}

function getDistance(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function notify(player, message, variant = "info", duration = 4500) {
  if (!player || !message) return;
  try {
    player.call("client:notification", [variant, String(message), duration]);
    return;
  } catch {}

  try {
    player.outputChatBox(String(message));
  } catch {}
}

function notifySuccess(player, message) {
  notify(player, message, "success");
}

function notifyError(player, message) {
  notify(player, message, "error");
}

function getPlayers() {
  try {
    if (typeof mp.players.toArray === "function") return mp.players.toArray();
  } catch {}

  const players = [];
  try {
    mp.players.forEach((player) => players.push(player));
  } catch {}
  return players;
}

function findPlayerById(playerId) {
  return getPlayers().find((player) => Number(player?.id) === Number(playerId)) || null;
}

function runExclusive(player, label, operation) {
  const staticId = getPlayerStaticId(player);
  const playerId = Number(player?.id);
  const key = staticId > 0 ? `static:${staticId}` : `player:${playerId}`;
  const previous = fishingRuntime.operations.get(key) || Promise.resolve();
  let current = null;

  current = previous
    .catch(() => {})
    .then(operation)
    .catch((error) => {
      console.error(`[FISHING] exclusive operation failed (${label}, ${key}):`, error);
      if (label !== "catch") {
        notifyError(player, "Система рыбалки временно недоступна.");
      }
      return false;
    })
    .finally(() => {
      if (fishingRuntime.operations.get(key) === current) {
        fishingRuntime.operations.delete(key);
      }
    });

  fishingRuntime.operations.set(key, current);
  return current;
}

async function ensureProfile(player) {
  const staticId = getPlayerStaticId(player);
  if (!staticId) return repository.createDefaultProfile();
  if (fishingRuntime.profiles.has(staticId)) return fishingRuntime.profiles.get(staticId);

  const profile = await repository.loadProfile(staticId);
  fishingRuntime.profiles.set(staticId, profile);
  return profile;
}

async function saveProfile(player) {
  const staticId = getPlayerStaticId(player);
  if (!staticId) return false;
  const profile = fishingRuntime.profiles.get(staticId) || await ensureProfile(player);
  profile.lastSeenAt = Date.now();
  return repository.saveProfile(staticId, profile);
}

function getLevelByXp(xp) {
  const totalXp = Math.max(0, Number(xp || 0));
  let level = 1;
  config.levelXp.forEach((threshold, index) => {
    if (totalXp >= Number(threshold || 0)) level = Math.max(level, index + 1);
  });
  return level;
}

function addFishingXp(profile, amount) {
  profile.xp = Math.max(0, Math.floor(Number(profile.xp || 0) + Number(amount || 0)));
  const previousLevel = Math.max(1, Number(profile.level || 1));
  profile.level = getLevelByXp(profile.xp);
  if (profile.level >= 5 && !profile.unlockedPoints.includes("north_chumash_secret")) {
    profile.unlockedPoints.push("north_chumash_secret");
  }
  return profile.level > previousLevel;
}

function getUnlockedPoints(profile) {
  const unlocked = new Set(Array.isArray(profile.unlockedPoints) ? profile.unlockedPoints : []);
  return config.points.filter((point) => {
    if (Number(profile.level || 1) < Number(point.minLevel || 1)) return false;
    return !point.secret || unlocked.has(point.id);
  });
}

function getClientPoints(profile) {
  return getUnlockedPoints(profile).map((point) => ({
    id: point.id,
    name: point.name,
    type: point.type,
    minLevel: point.minLevel,
    position: point.position,
    blip: point.blip,
  }));
}

function getPointById(pointId) {
  const id = String(pointId || "");
  return config.points.find((point) => point.id === id) || null;
}

function isPointUnlocked(profile, point) {
  if (!point) return false;
  if (Number(profile.level || 1) < Number(point.minLevel || 1)) return false;
  return !point.secret || (Array.isArray(profile.unlockedPoints) && profile.unlockedPoints.includes(point.id));
}

function getNearestPoint(player, profile) {
  if (!player?.position) return null;
  const range = Number(config.session.pointRange || 30);
  return getUnlockedPoints(profile)
    .map((point) => ({ point, distance: getDistance(player.position, point.position) }))
    .filter((entry) => entry.distance <= range)
    .sort((a, b) => a.distance - b.distance)[0]?.point || null;
}

function syncPlayer(player) {
  const staticId = getPlayerStaticId(player);
  const profile = staticId ? fishingRuntime.profiles.get(staticId) : null;
  const active = Boolean(profile?.active);

  try {
    player.setVariable("fishingActive", active);
  } catch {}

  try {
    player.call(active ? "fishing:setup" : "fishing:teardown", [
      active
        ? JSON.stringify({
            active: true,
            level: Number(profile.level || 1),
            xp: Number(profile.xp || 0),
            points: getClientPoints(profile),
            pointRange: Number(config.session.pointRange || 30),
          })
        : "",
    ]);
  } catch {}
}

function getRestriction(player, starting = false) {
  if (!player || !mp.players.exists(player)) return "Игрок не найден.";
  if (!getPlayerStaticId(player)) return "Персонаж не загружен.";
  if (player.vehicle) return "Выйдите из транспорта.";
  if (Number(player.dimension || 0) !== 0) return "Рыбалка доступна только в обычном мире.";
  if (Number(player.health || 0) <= 0) return "Нельзя рыбачить без сознания.";
  if (player.__activeJob) return "Сначала завершите текущую работу.";

  if (starting) {
    const huntingActive = Boolean(
      player?.getVariable?.("huntingActive") ||
      global.twinkleHunting?.isPlayerActive?.(player)
    );
    if (huntingActive) return "Сначала завершите охоту.";
  }

  return "";
}

async function hasFishingLicense(player) {
  try {
    if (await licenses.hasLicense(player, "fishing")) return true;
  } catch (error) {
    console.error("[FISHING] License check failed:", error);
    notifyError(player, "Не удалось проверить лицензию на рыболовство.");
    return false;
  }

  notifyError(player, "Для рыбалки нужна лицензия: рыболовство.");
  return false;
}

async function startFreeFishing(player) {
  return runExclusive(player, "start_free", async () => {
    const restriction = getRestriction(player, true);
    if (restriction) return notifyError(player, restriction), false;

    const profile = await ensureProfile(player);
    profile.active = true;
    profile.mode = "free";
    await saveProfile(player);
    syncPlayer(player);
    notifySuccess(player, "Рыбалка начата. Точки ловли появились на карте.");
    return true;
  });
}

async function finishFishing(player) {
  return runExclusive(player, "finish", async () => {
    const profile = await ensureProfile(player);
    if (!profile.active) {
      syncPlayer(player);
      notify(player, "Активной рыбалки нет.");
      return false;
    }

    cancelSession(player, "finish");
    profile.active = false;
    profile.mode = null;
    await saveProfile(player);
    syncPlayer(player);
    notifySuccess(player, "Рыбалка завершена. Точки скрыты.");
    return true;
  });
}

async function assignQuest(player) {
  return runExclusive(player, "assign_quest", async () => {
    const restriction = getRestriction(player, true);
    if (restriction) return notifyError(player, restriction), false;

    const profile = await ensureProfile(player);
    if (profile.currentQuest) {
      notifyError(player, "У вас уже есть активное рыболовное задание.");
      return false;
    }

    const previous = JSON.parse(JSON.stringify(profile));
    const issued = new Set(Array.isArray(profile.issuedQuestIds) ? profile.issuedQuestIds : []);
    let pool = config.quests.filter((quest) => !issued.has(quest.id));
    if (pool.length === 0) {
      profile.issuedQuestIds = [];
      pool = config.quests.slice();
    }
    const quest = pool[Math.floor(Math.random() * pool.length)] || config.quests[0];
    profile.currentQuest = {
      ...quest,
      progress: 0,
      startedAt: Date.now(),
    };
    profile.issuedQuestIds.push(quest.id);
    profile.active = true;
    profile.mode = "quest";
    profile.lastSeenAt = Date.now();

    try {
      const hasLicense = await licenses.hasLicense(player, "fishing");
      const hasDocument = hasLicense
        ? await licenses.hasLicenseDocumentItem(player, "fishing")
        : false;
      if (!hasLicense || !hasDocument) {
        const staticId = getPlayerStaticId(player);
        await licenses.issueQuestLicense(player, "fishing", {
          transactionWork: (connection) => repository.saveProfile(staticId, profile, connection),
        });
      } else {
        await saveProfile(player);
      }
    } catch (error) {
      Object.keys(profile).forEach((key) => delete profile[key]);
      Object.assign(profile, previous);
      console.error("[FISHING] Quest start transaction failed:", error);
      notifyError(player, "Не удалось начать рыболовное задание. Попробуйте ещё раз.");
      return false;
    }

    syncPlayer(player);
    notifySuccess(player, `Задание принято: ${quest.title}. Поймайте ${quest.target} рыбы.`);
    return true;
  });
}

async function submitQuest(player) {
  return runExclusive(player, "submit_quest", async () => {
    const profile = await ensureProfile(player);
    const quest = profile.currentQuest;
    if (!quest) {
      notifyError(player, "Активного рыболовного задания нет.");
      return false;
    }

    if (Number(quest.progress || 0) < Number(quest.target || 1)) {
      notifyError(player, `Задание не завершено: ${quest.progress || 0}/${quest.target || 1}.`);
      return false;
    }

    const cash = getPlayerCash(player);
    const rewardCash = Math.max(0, Math.round(Number(quest.rewardCash || 0)));
    syncPlayerCash(player, cash + rewardCash);
    addFishingXp(profile, Number(quest.rewardXp || 0));
    profile.completedQuestIds.push(quest.id);
    profile.currentQuest = null;
    profile.active = false;
    profile.mode = null;
    await saveProfile(player);
    syncPlayer(player);
    notifySuccess(player, `Задание сдано: +$${rewardCash}, +${quest.rewardXp || 0} XP.`);
    return true;
  });
}

function getGearPayload(playerGearItems, profile) {
  const byId = (ids) => ids.map((itemId) => ({
    itemId,
    items: playerGearItems.filter((item) => String(item.itemId || item.id) === itemId),
  })).filter((entry) => entry.items.length > 0);

  return {
    rods: byId(config.gear.rods),
    reels: byId(config.gear.reels),
    lines: byId(config.gear.lines),
    hooks: byId(config.gear.hooks),
    baits: byId(config.gear.baits),
    support: byId(config.gear.support),
    points: getClientPoints(profile),
  };
}

async function buildCastPayload(player, preferredRod = null) {
  const profile = await ensureProfile(player);
  const ids = [
    ...config.gear.rods,
    ...config.gear.reels,
    ...config.gear.lines,
    ...config.gear.hooks,
    ...config.gear.baits,
    ...config.gear.support,
  ];
  const items = await inventory.getItemsById(player, ids);
  const point = getNearestPoint(player, profile);
  const gear = getGearPayload(items, profile);

  return {
    title: "Подготовка рыбалки",
    active: Boolean(profile.active),
    point: point ? {
      id: point.id,
      name: point.name,
      type: point.type,
      position: point.position,
    } : null,
    level: Number(profile.level || 1),
    pointRange: Number(config.session.pointRange || 30),
    preferred: preferredRod?.uid ? { rodUid: String(preferredRod.uid) } : null,
    gear,
  };
}

async function openCastSetup(player, preferredRod = null) {
  const restriction = getRestriction(player, false);
  if (restriction) return notifyError(player, restriction), false;
  if (!await hasFishingLicense(player)) return false;

  const profile = await ensureProfile(player);
  if (!profile.active) {
    notifyError(player, "Сначала начните рыбалку у рыбака.");
    return false;
  }

  const point = getNearestPoint(player, profile);
  if (!point) {
    notifyError(player, "Подойдите к активной точке ловли.");
    return false;
  }

  const payload = await buildCastPayload(player, preferredRod);
  try {
    player.call("fishing:castSetup", [JSON.stringify(payload)]);
  } catch {}
  return true;
}

function normalizeCastPayload(raw) {
  let data = raw;
  try {
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    data = {};
  }
  data = data && typeof data === "object" ? data : {};
  return {
    pointId: String(data.pointId || ""),
    rodUid: String(data.rodUid || ""),
    reelUid: String(data.reelUid || ""),
    lineUid: String(data.lineUid || ""),
    hookItemId: String(data.hookItemId || ""),
    baitItemId: String(data.baitItemId || ""),
    supportUids: Array.isArray(data.supportUids) ? data.supportUids.map(String).filter(Boolean) : [],
    power: Math.min(1, Math.max(0.15, Number(data.power || 0.65))),
  };
}

async function validateGear(player, payload) {
  const rodItem = payload.rodUid ? await inventory.getOwnedItemByUid(player, payload.rodUid) : null;
  const reelItem = payload.reelUid ? await inventory.getOwnedItemByUid(player, payload.reelUid) : null;
  const lineItem = payload.lineUid ? await inventory.getOwnedItemByUid(player, payload.lineUid) : null;
  const supportItems = [];

  if (!rodItem || !config.gear.rods.includes(String(rodItem.itemId || rodItem.id))) {
    return { ok: false, reason: "Выберите удочку из инвентаря." };
  }
  if (!reelItem || !config.gear.reels.includes(String(reelItem.itemId || reelItem.id))) {
    return { ok: false, reason: "Выберите катушку." };
  }
  if (!lineItem || !config.gear.lines.includes(String(lineItem.itemId || lineItem.id))) {
    return { ok: false, reason: "Выберите леску." };
  }
  if (!config.gear.hooks.includes(payload.hookItemId)) {
    return { ok: false, reason: "Выберите крючок." };
  }
  if (!config.gear.baits.includes(payload.baitItemId)) {
    return { ok: false, reason: "Выберите наживку." };
  }

  for (const uid of payload.supportUids.slice(0, 3)) {
    const item = await inventory.getOwnedItemByUid(player, uid);
    if (item && config.gear.support.includes(String(item.itemId || item.id))) {
      supportItems.push(item);
    }
  }

  const hasConsumables = await inventory.hasItems(player, [
    { itemId: payload.hookItemId, amount: 1 },
    { itemId: payload.baitItemId, amount: 1 },
  ]);
  if (!hasConsumables) {
    return { ok: false, reason: "Не хватает крючка или наживки." };
  }

  return {
    ok: true,
    rod: rodItem,
    reel: reelItem,
    line: lineItem,
    supportItems,
    rodItemId: String(rodItem.itemId || rodItem.id || ""),
    reelItemId: String(reelItem.itemId || reelItem.id || ""),
    lineItemId: String(lineItem.itemId || lineItem.id || ""),
  };
}

function cleanupLeases(now = Date.now()) {
  for (const [pointId, lease] of fishingRuntime.pointLeases.entries()) {
    if (!lease || Number(lease.expiresAt || 0) <= now) {
      fishingRuntime.pointLeases.delete(pointId);
      continue;
    }
    const player = lease.player;
    if (!player || !mp.players.exists(player)) {
      fishingRuntime.pointLeases.delete(pointId);
    }
  }
}

function reservePoint(player, pointId) {
  cleanupLeases();
  const existing = fishingRuntime.pointLeases.get(pointId);
  if (existing && existing.player !== player && Number(existing.expiresAt || 0) > Date.now()) {
    return false;
  }
  fishingRuntime.pointLeases.set(pointId, {
    player,
    expiresAt: Date.now() + Number(config.session.leaseMs || 30000),
  });
  return true;
}

function releasePoint(player, pointId) {
  const lease = fishingRuntime.pointLeases.get(pointId);
  if (!lease || lease.player === player) {
    fishingRuntime.pointLeases.delete(pointId);
  }
}

function clearSessionTimers(session) {
  if (!session) return;
  ["biteTimer", "hookTimer", "retryTimer", "reelTimer"].forEach((key) => {
    const timer = session[key];
    if (timer) {
      try { clearTimeout(timer); } catch {}
      try { clearInterval(timer); } catch {}
    }
    session[key] = null;
  });
}

function cancelSession(player, reason = "cancelled") {
  const playerId = Number(player?.id);
  const session = fishingRuntime.sessions.get(playerId);
  if (!session) return false;

  clearSessionTimers(session);
  releasePoint(player, session.pointId);
  fishingRuntime.sessions.delete(playerId);
  try {
    player.call("fishing:sessionEnd", [String(reason)]);
  } catch {}
  return true;
}

function weightedPick(entries, getWeight) {
  const weighted = entries
    .map((entry) => ({ entry, weight: Math.max(0, Number(getWeight(entry) || 0)) }))
    .filter((entry) => entry.weight > 0);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.entry;
  }
  return weighted[weighted.length - 1]?.entry || entries[0] || null;
}

function chooseSpecies(point, profile, gear) {
  const speciesIds = Array.isArray(point?.species) ? point.species : Object.keys(config.species);
  const candidates = speciesIds
    .map((id) => ({ id, ...config.species[id] }))
    .filter((entry) => entry.id && entry.name);
  const levelBonus = Math.max(0, Number(profile.level || 1) - 1) * 0.04;
  const baitBonus = String(gear?.baitItemId || "") === "fishing_bait_spinner" ? 1.45 : 1;

  return weightedPick(candidates, (entry) => {
    const rarity = String(entry.rarity || "common");
    const base = Number(config.rarityWeights[rarity] || 1);
    const rareModifier = rarity === "rare" || rarity === "epic" ? 1 + levelBonus * baitBonus : 1;
    return base * rareModifier;
  });
}

function randomBetween(min, max) {
  return Number(min || 0) + Math.random() * (Number(max || 0) - Number(min || 0));
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function getQuality(score) {
  if (score >= 0.9) return { id: "excellent", name: "Отличное", multiplier: 1.45 };
  if (score >= 0.72) return { id: "good", name: "Хорошее", multiplier: 1.18 };
  if (score <= 0.24) return { id: "poor", name: "Слабое", multiplier: 0.72 };
  return { id: "normal", name: "Обычное", multiplier: 1 };
}

function createCatch(player, session, profile) {
  const point = getPointById(session.pointId) || getUnlockedPoints(profile)[0];
  const species = chooseSpecies(point, profile, session.gear);
  const weightKg = Number(randomBetween(species.weight[0], species.weight[1]).toFixed(2));
  const lengthCm = Number(randomBetween(species.length[0], species.length[1]).toFixed(1));
  const sizeScore = (weightKg - Number(species.weight[0])) / Math.max(0.1, Number(species.weight[1]) - Number(species.weight[0]));
  const quality = getQuality((sizeScore + Math.random()) / 2);
  const price = Math.max(12, Math.round(Number(species.basePrice || 20) * weightKg * quality.multiplier));
  const now = Date.now();
  const uid = `fish:${getPlayerStaticId(player)}:${now}:${Math.random().toString(36).slice(2, 10)}`;
  const freshMs = session.hasCooler ? 6 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;

  return {
    uid,
    ownerStaticId: getPlayerStaticId(player),
    speciesId: species.id,
    speciesName: species.name,
    pointId: point.id,
    pointName: point.name,
    weightKg,
    lengthCm,
    quality: quality.id,
    qualityName: quality.name,
    rarity: species.rarity,
    price,
    xp: Number(species.xp || 5),
    caughtAt: now,
    freshUntil: now + freshMs,
  };
}

async function completeCatch(player, session) {
  return runExclusive(player, "catch", async () => {
    const profile = await ensureProfile(player);
    const fish = createCatch(player, session, profile);
    const itemResult = await inventory.addItemInstance(player, "fishing_fish", {
      uid: fish.uid,
      itemId: "fishing_fish",
      name: `Свежая рыба «${fish.speciesName}»`,
      type: "Рыболовная добыча",
      fishUid: fish.uid,
      speciesId: fish.speciesId,
      speciesName: fish.speciesName,
      pointId: fish.pointId,
      pointName: fish.pointName,
      fishWeightKg: fish.weightKg,
      fishLengthCm: fish.lengthCm,
      fishQuality: fish.quality,
      fishQualityName: fish.qualityName,
      fishRarity: fish.rarity,
      freshUntil: fish.freshUntil,
      basePrice: fish.price,
      weight: Math.max(0.15, Number(fish.weightKg || 0)),
    });

    if (!itemResult?.ok) {
      notifyError(player, itemResult?.reason === "weight"
        ? "Рыба сорвалась: нет свободного веса в инвентаре."
        : "Рыба сорвалась: нет свободного места в инвентаре.");
      return false;
    }

    let leveled = false;
    try {
      await repository.insertCatch(fish);
      profile.stats.caught = Math.max(0, Number(profile.stats.caught || 0)) + 1;
      profile.journal[fish.speciesId] = {
        name: fish.speciesName,
        caught: Math.max(0, Number(profile.journal[fish.speciesId]?.caught || 0)) + 1,
        bestWeightKg: Math.max(Number(profile.journal[fish.speciesId]?.bestWeightKg || 0), fish.weightKg),
        lastCaughtAt: fish.caughtAt,
      };
      const record = profile.records[fish.speciesId];
      if (!record || Number(record.weightKg || 0) < fish.weightKg) {
        profile.records[fish.speciesId] = {
          speciesName: fish.speciesName,
          weightKg: fish.weightKg,
          lengthCm: fish.lengthCm,
          caughtAt: fish.caughtAt,
        };
      }
      if (profile.currentQuest) {
        const quest = profile.currentQuest;
        const point = getPointById(fish.pointId);
        if (!quest.pointType || point?.type === quest.pointType) {
          quest.progress = Math.min(Number(quest.target || 1), Number(quest.progress || 0) + 1);
        }
      }
      leveled = addFishingXp(profile, fish.xp);
      await saveProfile(player);
    } catch (error) {
      console.error("[FISHING] catch persistence failed:", error);
    }

    notifySuccess(
      player,
      `Поймано: ${fish.speciesName}, ${fish.weightKg} кг. +${fish.xp} XP${leveled ? " Новый уровень!" : ""}`
    );
    logs.writeLog({
      type: "fishing",
      level: "info",
      player: { uuid: getPlayerStaticId(player), name: String(player?.name || `Player ${player?.id}`) },
      message: "catch",
      data: fish,
    }).catch((error) => console.error("[FISHING] catch log failed:", error));
    await quests.recordProgress(player, {
      type: "fishing.fish_caught",
      subjectId: String(fish.speciesId || "fish"),
      idempotencyKey: `fishing_caught:${getPlayerStaticId(player)}:${fish.uid}`,
      amount: 1,
      metadata: {
        fishUid: fish.uid,
        speciesId: fish.speciesId,
        pointId: fish.pointId,
        weightKg: fish.weightKg,
      },
    }, { sync: true });
    return true;
  });
}

function sendReelingState(player, session) {
  try {
    player.call("fishing:reelingState", [JSON.stringify({
      token: session.token,
      progress: session.progress,
      tension: session.tension,
      fishPower: session.fishPower,
      pointName: session.pointName,
    })]);
  } catch {}
}

function startReeling(player, session) {
  session.state = "reeling_minigame";
  session.progress = 0.12;
  session.tension = 0.38;
  session.reelingStartedAt = Date.now();
  session.lastInputAt = session.reelingStartedAt;
  session.lastAcceptedReelInputAt = 0;
  try {
    player.call("fishing:reelingStart", [JSON.stringify({
      token: session.token,
      pointName: session.pointName,
      progress: session.progress,
      tension: session.tension,
    })]);
  } catch {}

  session.reelTimer = setInterval(async () => {
    if (!fishingRuntime.active || !mp.players.exists(player)) return cancelSession(player, "lost");
    if (getRestriction(player, false)) return cancelSession(player, "restricted");

    const sinceInput = Date.now() - Number(session.lastInputAt || 0);
    const fishPull = Number(session.fishPower || 0.9) * (sinceInput > 900 ? 0.028 : 0.016);
    session.progress = Math.max(0, Math.min(1, Number(session.progress || 0) - fishPull));
    session.tension = Math.max(0, Math.min(1, Number(session.tension || 0) + (sinceInput > 700 ? 0.035 : -0.018)));

    if (session.tension >= 1 || session.progress <= 0) {
      const profile = await ensureProfile(player);
      profile.stats.escaped = Math.max(0, Number(profile.stats.escaped || 0)) + 1;
      await saveProfile(player);
      notifyError(player, "Рыба сорвалась.");
      return cancelSession(player, "escaped");
    }

    if (session.progress >= 1) {
      clearSessionTimers(session);
      await completeCatch(player, session);
      cancelSession(player, "caught");
      return;
    }

    sendReelingState(player, session);
  }, Number(config.session.reelTickMs || 250));
}

function getTimingPayload(session) {
  return {
    token: session.token,
    pointName: session.pointName,
    phase: "timing",
    durationMs: Number(session.timingDurationMs || config.session.timingDurationMs || 2400),
    targetStart: Number(session.timingTargetStart || config.session.timingTargetStart || 0.68),
    targetEnd: Number(session.timingTargetEnd || config.session.timingTargetEnd || 0.84),
    startedAt: Number(session.timingStartedAt || Date.now()),
  };
}

function normalizeTimingAttempt(raw) {
  let data = raw;
  try {
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    data = { token: String(raw || "") };
  }
  if (!data || typeof data !== "object") data = { token: String(raw || "") };

  return {
    token: String(data.token || raw || ""),
    progress: Number(data.progress),
  };
}

function getTimingProgress(session, reportedProgress) {
  const duration = Math.max(900, Number(session.timingDurationMs || config.session.timingDurationMs || 2400));
  const elapsed = Date.now() - Number(session.timingStartedAt || Date.now());
  const serverProgress = clamp(elapsed / duration);
  const clientProgress = Number.isFinite(reportedProgress) ? clamp(reportedProgress) : serverProgress;

  // Local CEF can be a few frames ahead of the server event. Use the CEF value
  // when it is close enough, otherwise trust the server clock.
  return Math.abs(clientProgress - serverProgress) <= 0.18 ? clientProgress : serverProgress;
}

function scheduleTimingDeadline(player, session) {
  if (!session || !player) return;
  if (session.hookTimer) {
    try { clearTimeout(session.hookTimer); } catch {}
    session.hookTimer = null;
  }

  const duration = Math.max(900, Number(session.timingDurationMs || config.session.timingDurationMs || 2400));
  session.hookTimer = setTimeout(async () => {
    if (!fishingRuntime.active || !mp.players.exists(player)) return cancelSession(player, "lost");
    if (fishingRuntime.sessions.get(player.id) !== session) return;
    await missTimingAttempt(player, session, "late");
  }, duration + 450);
}

function scheduleNextTimingAttempt(player, session, delayMs = 0) {
  if (!session || !player || fishingRuntime.sessions.get(player.id) !== session) return false;

  session.state = "timing_retry";
  if (session.hookTimer) {
    try { clearTimeout(session.hookTimer); } catch {}
    session.hookTimer = null;
  }
  if (session.retryTimer) {
    try { clearTimeout(session.retryTimer); } catch {}
    session.retryTimer = null;
  }

  session.retryTimer = setTimeout(() => {
    if (!fishingRuntime.active || !mp.players.exists(player)) return cancelSession(player, "lost");
    if (fishingRuntime.sessions.get(player.id) !== session) return;
    session.retryTimer = null;
    session.state = "timing_minigame";
    session.timingStartedAt = Date.now();
    try {
      player.call("fishing:castAccepted", [JSON.stringify(getTimingPayload(session))]);
    } catch {}
    scheduleTimingDeadline(player, session);
  }, Math.max(0, Number(delayMs || 0)));

  return true;
}

async function missTimingAttempt(player, session, reason = "missed") {
  if (!session || !player || fishingRuntime.sessions.get(player.id) !== session) return false;
  if (session.state !== "timing_minigame" && session.state !== "timing_resolving") return false;

  session.state = "timing_retry";
  if (session.hookTimer) {
    try { clearTimeout(session.hookTimer); } catch {}
    session.hookTimer = null;
  }

  try {
    const retryProfile = await ensureProfile(player);
    retryProfile.stats.escaped = Math.max(0, Number(retryProfile.stats.escaped || 0)) + 1;
    await saveProfile(player);
  } catch (error) {
    console.error("[FISHING] timing retry profile update failed:", error);
  }

  const retryDelayMs = Math.max(250, Number(config.session.timingRetryDelayMs || 1000));
  try {
    player.call("fishing:timingRetry", [JSON.stringify({
      ...getTimingPayload(session),
      phase: "fail",
      reason,
      retryDelayMs,
    })]);
  } catch {}

  scheduleNextTimingAttempt(player, session, retryDelayMs);
  return false;

  const profile = await ensureProfile(player);
  profile.stats.escaped = Math.max(0, Number(profile.stats.escaped || 0)) + 1;
  await saveProfile(player);
  notifyError(player, reason === "early" ? "Слишком рано. Рыба сорвалась." : "Рыба сорвалась.");
  cancelSession(player, "missed");
  return false;
}

async function startCast(player, rawPayload) {
  return runExclusive(player, "start_cast", async () => {
    const restriction = getRestriction(player, false);
    if (restriction) return notifyError(player, restriction), false;
    if (!await hasFishingLicense(player)) return false;

    const profile = await ensureProfile(player);
    if (!profile.active) return notifyError(player, "Сначала начните рыбалку у рыбака."), false;
    if (fishingRuntime.sessions.has(player.id)) return notifyError(player, "Вы уже рыбачите."), false;

    const payload = normalizeCastPayload(rawPayload);
    const point = getPointById(payload.pointId) || getNearestPoint(player, profile);
    if (!point || !isPointUnlocked(profile, point)) return notifyError(player, "Точка ловли недоступна."), false;
    if (getDistance(player.position, point.position) > Number(config.session.pointRange || 30)) {
      return notifyError(player, "Вы слишком далеко от точки ловли."), false;
    }
    if (Number(profile.cooldowns?.cast || 0) > Date.now()) {
      return notifyError(player, "Подождите перед следующим забросом."), false;
    }
    if (!reservePoint(player, point.id)) {
      return notifyError(player, "Эта точка сейчас занята другим рыбаком."), false;
    }

    const gear = await validateGear(player, payload);
    if (!gear.ok) {
      releasePoint(player, point.id);
      notifyError(player, gear.reason);
      return false;
    }

    const removed = await inventory.removeItems(player, [
      { itemId: payload.hookItemId, amount: 1 },
      { itemId: payload.baitItemId, amount: 1 },
    ]);
    if (!removed) {
      releasePoint(player, point.id);
      notifyError(player, "Не удалось списать крючок или наживку.");
      return false;
    }

    await inventory.damageItemByUid(player, payload.rodUid, config.gear.rods, 1);
    await inventory.damageItemByUid(player, payload.lineUid, config.gear.lines, 1);
    await inventory.damageItemByUid(player, payload.reelUid, config.gear.reels, 1);

    const token = `${Date.now()}:${player.id}:${Math.random().toString(36).slice(2)}`;
    const speciesPreview = chooseSpecies(point, profile, { baitItemId: payload.baitItemId });
    const timingDurationMs = Math.max(900, Number(config.session.timingDurationMs || 2400));
    const timingTargetStart = clamp(config.session.timingTargetStart || 0.68, 0.05, 0.94);
    const timingTargetEnd = clamp(config.session.timingTargetEnd || 0.84, timingTargetStart + 0.03, 0.98);
    const session = {
      token,
      state: "timing_minigame",
      playerId: Number(player.id),
      staticId: getPlayerStaticId(player),
      pointId: point.id,
      pointName: point.name,
      startedAt: Date.now(),
      castPosition: {
        x: Number(player.position.x || 0),
        y: Number(player.position.y || 0),
        z: Number(player.position.z || 0),
      },
      gear: {
        rodUid: payload.rodUid,
        reelUid: payload.reelUid,
        lineUid: payload.lineUid,
        rodItemId: gear.rodItemId,
        reelItemId: gear.reelItemId,
        lineItemId: gear.lineItemId,
        hookItemId: payload.hookItemId,
        baitItemId: payload.baitItemId,
      },
      hasCooler: gear.supportItems.some((item) => String(item.itemId || item.id) === "fishing_cooler"),
      fishPower: Number(speciesPreview?.difficulty || 1),
      timingDurationMs,
      timingTargetStart,
      timingTargetEnd,
      timingStartedAt: Date.now(),
      progress: 0,
      tension: 0,
    };

    fishingRuntime.sessions.set(player.id, session);
    profile.stats.casts = Math.max(0, Number(profile.stats.casts || 0)) + 1;
    profile.stats.bites = Math.max(0, Number(profile.stats.bites || 0)) + 1;
    profile.cooldowns.cast = Date.now() + Number(config.session.castCooldownMs || 3500);
    await saveProfile(player);

    try {
      player.call("fishing:castAccepted", [JSON.stringify({
        ...getTimingPayload(session),
      })]);
    } catch {}

    scheduleTimingDeadline(player, session);

    return true;

    const biteDelay = randomBetween(config.session.biteDelayMinMs, config.session.biteDelayMaxMs);
    session.biteTimer = setTimeout(async () => {
      if (!fishingRuntime.active || !mp.players.exists(player)) return cancelSession(player, "lost");
      if (fishingRuntime.sessions.get(player.id) !== session) return;
      session.state = "bite";
      const activeProfile = await ensureProfile(player);
      activeProfile.stats.bites = Math.max(0, Number(activeProfile.stats.bites || 0)) + 1;
      await saveProfile(player);
      try {
        player.call("fishing:bite", [JSON.stringify({
          token,
          hookWindowMs: Number(config.session.hookWindowMs || 5200),
        })]);
      } catch {}

      session.hookTimer = setTimeout(async () => {
        if (fishingRuntime.sessions.get(player.id) !== session) return;
        const p = await ensureProfile(player);
        p.stats.escaped = Math.max(0, Number(p.stats.escaped || 0)) + 1;
        await saveProfile(player);
        notifyError(player, "Вы не успели подсечь рыбу.");
        cancelSession(player, "missed");
      }, Number(config.session.hookWindowMs || 5200));
    }, biteDelay);

    return true;
  });
}

async function hookFish(player, rawToken = "") {
  const session = fishingRuntime.sessions.get(Number(player?.id));
  const attempt = normalizeTimingAttempt(rawToken);
  if (!session || session.token !== attempt.token || session.state !== "timing_minigame") return false;

  const progress = getTimingProgress(session, attempt.progress);
  const targetStart = clamp(session.timingTargetStart || config.session.timingTargetStart || 0.68);
  const targetEnd = clamp(session.timingTargetEnd || config.session.timingTargetEnd || 0.84);
  if (progress < targetStart || progress > targetEnd) {
    return missTimingAttempt(player, session, progress < targetStart ? "early" : "late");
  }

  session.state = "timing_resolving";
  clearSessionTimers(session);
  const caught = await completeCatch(player, session);
  if (caught) {
    // A cast consumes one hook/bait set and can produce at most one catch.
    // Starting another attempt requires a fresh server-validated cast.
    cancelSession(player, "caught");
    return true;
  }
  return missTimingAttempt(player, session, "catch_failed");
}

function handleReelInput(player, raw) {
  const session = fishingRuntime.sessions.get(Number(player?.id));
  if (!session || session.state !== "reeling_minigame") return false;
  let data = raw;
  try {
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    data = {};
  }
  data = data && typeof data === "object" ? data : {};
  if (String(data.token || "") !== session.token) return false;

  const action = String(data.action || "pull");
  if (action !== "pull" && action !== "release") return false;
  const now = Date.now();
  const minInterval = Math.max(80, Number(config.session.reelInputMinIntervalMs || 120));
  if (now - Number(session.lastAcceptedReelInputAt || 0) < minInterval) return false;
  session.lastAcceptedReelInputAt = now;
  session.lastInputAt = now;
  if (action === "release") {
    session.tension = Math.max(0, Number(session.tension || 0) - 0.12);
    session.progress = Math.max(0, Number(session.progress || 0) - 0.025);
  } else {
    const elapsedSeconds = Math.max(0, now - Number(session.reelingStartedAt || now)) / 1000;
    const maxServerProgress = Math.min(
      1,
      0.12 + elapsedSeconds * Math.max(0.1, Number(config.session.reelMaxProgressPerSecond || 0.38))
    );
    const requestedProgress = Number(session.progress || 0) + 0.12 / Math.max(0.75, Number(session.fishPower || 1));
    session.progress = Math.min(maxServerProgress, requestedProgress);
    session.tension = Math.min(1, Number(session.tension || 0) + 0.085);
  }
  sendReelingState(player, session);
  return true;
}

async function sellFishItemsAtomic(player, fishItems, coefficient) {
  const staticId = getPlayerStaticId(player);
  const priceCoefficient = Math.max(0, Number(coefficient || 1));
  const currentProfile = await ensureProfile(player);
  let committedProfile = null;
  const result = await inventory.sellItemInstances(
    player,
    fishItems.map((item) => item.uid),
    {
      validateItem: (item) => (
        String(item?.itemId || item?.id) === "fishing_fish" &&
        Number(item?.freshUntil || 0) > Date.now() &&
        Boolean(item?.fishUid || item?.uid)
      ),
      getPrice: (item) => Math.max(1, Math.round(Number(item.basePrice || 0) * priceCoefficient)),
      transactionWork: async (connection, sale) => {
        for (const fish of sale.items) {
          const [updated] = await connection.query(
            `UPDATE fishing_catch_ledger
                SET sold_at = CURRENT_TIMESTAMP
              WHERE uid = ? AND owner_static_id = ? AND sold_at IS NULL`,
            [String(fish.fishUid || fish.uid), staticId]
          );
          if (Number(updated?.affectedRows || 0) !== 1) {
            throw Object.assign(new Error("stale_catch"), { saleReason: "invalid_item" });
          }
        }
        committedProfile = repository.normalizeProfile(JSON.parse(JSON.stringify(currentProfile)));
        committedProfile.stats.sold = Math.max(0, Number(committedProfile.stats.sold || 0)) + sale.items.length;
        committedProfile.stats.earned = Math.max(0, Number(committedProfile.stats.earned || 0)) + sale.totalPrice;
        committedProfile.lastSeenAt = Date.now();
        await repository.saveProfile(staticId, committedProfile, connection);
      },
    }
  );
  if (!result.ok) return result;
  fishingRuntime.profiles.set(staticId, committedProfile);
  syncPlayerCash(player, result.cash);
  return result;
}

async function sellFish(player, coefficient = 1, buyerId = "") {
  return runExclusive(player, "sell_fish", async () => {
    const fresh = (await inventory.getItemsById(player, "fishing_fish"))
      .filter((item) => Number(item.freshUntil || 0) > Date.now())
      .sort((a, b) => Number(b.basePrice || 0) - Number(a.basePrice || 0))[0];
    if (!fresh) return notifyError(player, "Свежей рыбы для продажи не найдено."), false;
    const result = await sellFishItemsAtomic(player, [fresh], coefficient);
    if (!result.ok) return notifyError(player, "Продажа не выполнена: состояние улова изменилось."), false;
    const [soldFish] = result.items;
    notifySuccess(player, `Рыба «${soldFish.speciesName || "улов"}» продана за $${result.totalPrice}.`);
    logs.writeLog({
      type: "fishing",
      level: "info",
      player: { uuid: getPlayerStaticId(player), name: String(player?.name || `Player ${player?.id}`) },
      message: "fish_sold",
      data: { buyerId, uid: String(soldFish.fishUid || soldFish.uid), speciesId: soldFish.speciesId, price: result.totalPrice, coefficient },
    }).catch((error) => console.error("[FISHING] sell log failed:", error));
    await quests.recordProgress(player, {
      type: "finance.cash_earned",
      subjectId: "fishing",
      idempotencyKey: `fishing_cash:${getPlayerStaticId(player)}:${String(soldFish.fishUid || soldFish.uid)}`,
      amount: Math.max(1, Number(result.totalPrice || 1)),
      metadata: {
        buyerId,
        fishUid: String(soldFish.fishUid || soldFish.uid),
        speciesId: soldFish.speciesId,
        source: "fishing_sale",
      },
    }, { sync: false });
    await quests.recordProgress(player, {
      type: "fishing.fish_sold",
      subjectId: String(soldFish.speciesId || "fish"),
      idempotencyKey: `fishing_sold:${getPlayerStaticId(player)}:${String(soldFish.fishUid || soldFish.uid)}`,
      amount: Math.max(1, Number(result.totalPrice || 1)),
      metadata: {
        buyerId,
        fishUid: String(soldFish.fishUid || soldFish.uid),
        speciesId: soldFish.speciesId,
        totalPrice: result.totalPrice,
      },
    }, { sync: true });
    return true;
  });
}

async function sellAllFish(player, coefficient = 1, buyerId = "") {
  return runExclusive(player, "sell_all_fish", async () => {
    const freshFish = (await inventory.getItemsById(player, "fishing_fish"))
      .filter((item) => Number(item.freshUntil || 0) > Date.now())
      .sort((a, b) => Number(b.basePrice || 0) - Number(a.basePrice || 0));
    if (!freshFish.length) return notifyError(player, "Свежего улова для продажи не найдено."), false;
    const result = await sellFishItemsAtomic(player, freshFish, coefficient);
    if (!result.ok) return notifyError(player, "Продажа не выполнена: состояние улова изменилось."), false;
    const soldBatchKey = crypto
      .createHash("sha1")
      .update(result.items.map((fish) => String(fish.fishUid || fish.uid)).join("|"))
      .digest("hex");
    notifySuccess(player, `Продано рыбы: ${result.items.length} шт. Выручка: $${result.totalPrice}.`);
    logs.writeLog({
      type: "fishing",
      level: "info",
      player: { uuid: getPlayerStaticId(player), name: String(player?.name || `Player ${player?.id}`) },
      message: "fish_sold_all",
      data: {
        buyerId,
        count: result.items.length,
        totalPrice: result.totalPrice,
        coefficient,
        items: result.items.map((fish) => ({
          uid: String(fish.fishUid || fish.uid),
          speciesId: fish.speciesId,
          speciesName: fish.speciesName,
          price: Math.max(1, Math.round(Number(fish.basePrice || 0) * Math.max(0, Number(coefficient || 1)))),
        })),
      },
    }).catch((error) => console.error("[FISHING] sell all log failed:", error));
    await quests.recordProgress(player, {
      type: "finance.cash_earned",
      subjectId: "fishing",
      idempotencyKey: `fishing_cash_batch:${getPlayerStaticId(player)}:${soldBatchKey}`,
      amount: Math.max(1, Number(result.totalPrice || 1)),
      metadata: {
        buyerId,
        count: result.items.length,
        source: "fishing_sale_batch",
        totalPrice: result.totalPrice,
      },
    }, { sync: false });
    await quests.recordProgress(player, {
      type: "fishing.fish_sold",
      subjectId: "fish_batch",
      idempotencyKey: `fishing_sold_batch:${getPlayerStaticId(player)}:${soldBatchKey}`,
      amount: Math.max(1, Number(result.totalPrice || 1)),
      metadata: {
        buyerId,
        count: result.items.length,
        totalPrice: result.totalPrice,
      },
    }, { sync: true });
    return true;
  });
}

function getShopPayload(player, purchaseState = null, multiplier = 100) {
  const staticId = getPlayerStaticId(player);
  const profile = staticId ? fishingRuntime.profiles.get(staticId) : null;
  const level = Math.max(1, Number(profile?.level || 1));

  return {
    contractVersion: 1,
    title: config.shop.title,
    seller: config.shop.seller,
    guide: config.shop.guide,
    cash: getPlayerCash(player),
    level,
    categories: config.shop.categories,
    items: Object.entries(config.shop.items).map(([id, product]) => ({
      id,
      category: product.category,
      name: product.name,
      description: product.description,
      icon: product.icon,
      amount: product.amount,
      price: Math.max(0, Math.round(Number(product.price || 0) * multiplier / 100)),
      minLevel: Math.max(1, Number(product.minLevel || 1)),
      locked: level < Math.max(1, Number(product.minLevel || 1)),
    })),
    ...(purchaseState && typeof purchaseState === "object" ? purchaseState : {}),
  };
}

async function openShop(player, npcId = config.seller.id) {
  const business = await businessService.repository.getBusiness("fishing_noah");
  if (!business?.isOpen || (business.ownerUuid && business.taxPaidUntil && new Date(business.taxPaidUntil).getTime() < Date.now())) {
    notifyError(player, "Магазин рыбака сейчас закрыт.");
    return false;
  }
  fishingRuntime.shopSessions.set(Number(player.id), {
    npcId,
    openedAt: Date.now(),
  });
  try {
    const multiplier = Math.max(50, Math.min(200, Number(business.catalog?.fishing_markup || 100)));
    player.call("client:fishingShop:open", [JSON.stringify(getShopPayload(player, null, multiplier))]);
  } catch (error) {
    console.error("[FISHING] open shop error:", error);
  }
  return true;
}

function closeShop(player) {
  if (!player) return;
  fishingRuntime.shopSessions.delete(Number(player.id));
  try {
    player.call("client:fishingShop:close", []);
  } catch {}
}

async function buyShopCart(player, rawItems, isNearSeller) {
  const playerId = Number(player?.id);
  const staticId = getPlayerStaticId(player);
  const purchaseKey = staticId > 0 ? `static:${staticId}` : `player:${playerId}`;
  if (fishingRuntime.shopPurchases.has(purchaseKey)) return false;
  fishingRuntime.shopPurchases.add(purchaseKey);
  try {
    return await runExclusive(player, "shop_purchase", async () => {
    if (!fishingRuntime.shopSessions.has(Number(player.id)) || !isNearSeller(player)) {
      notifyError(player, "Магазин недоступен: подойдите к рыбаку заново.");
      closeShop(player);
      return false;
    }

    let payload = rawItems;
    try {
      if (typeof payload === "string") payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
    const items = Array.isArray(payload) ? payload : payload?.items;
    const merged = new Map();
    (Array.isArray(items) ? items : []).forEach((entry) => {
      const itemId = String(entry?.itemId || entry?.id || "");
      const quantity = Math.floor(Number(entry?.quantity || 1));
      if (!itemId || !Number.isInteger(quantity)) return;
      merged.set(itemId, Number(merged.get(itemId) || 0) + quantity);
    });
    const cart = Array.from(merged.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
    if (cart.length < 1 || cart.length > 20) {
      notifyError(player, "Корзина пуста или содержит слишком много позиций.");
      return false;
    }

    const profile = await ensureProfile(player);
    const grantsByItem = new Map();
    let baseTotalPrice = 0;
    const business = await businessService.repository.getBusiness("fishing_noah");
    const markup = Math.max(50, Math.min(200, Number(business?.catalog?.fishing_markup || 100)));

    for (const entry of cart) {
      const product = config.shop.items[entry.itemId];
      if (!product) return notifyError(player, `Товар ${entry.itemId} не найден.`), false;
      if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 10) {
        notifyError(player, "В корзине можно выбрать от 1 до 10 упаковок каждого товара.");
        return false;
      }
      if (Number(profile.level || 1) < Number(product.minLevel || 1)) {
        notifyError(player, `${product.name} откроется на ${product.minLevel} уровне рыбалки.`);
        return false;
      }
      baseTotalPrice += Math.max(0, Number(product.price || 0)) * entry.quantity;
      grantsByItem.set(
        entry.itemId,
        Number(grantsByItem.get(entry.itemId) || 0) + Math.max(1, Number(product.amount || 1)) * entry.quantity
      );
    }

    const pricingLines = cart.map((entry) => ({
      quantity: entry.quantity,
      unitPrice: Math.max(0, Number(config.shop.items[entry.itemId]?.price || 0)),
    }));
    const totalPrice = pricingLines.reduce(
      (sum, line) => sum + Math.max(0, Math.round(line.unitPrice * markup / 100)) * line.quantity,
      0
    );

    if (getPlayerCash(player) < totalPrice) {
      notifyError(player, "Недостаточно наличных.");
      return false;
    }

    const grants = Array.from(grantsByItem.entries()).map(([itemId, amount]) => ({ itemId, amount }));
    const stockQuantity = cart.reduce((total, entry) => total + entry.quantity, 0);
    const purchase = await inventory.purchaseItems(
      player,
      grants,
      totalPrice,
      businessService.createPurchaseOptions(
        "fishing_noah",
        player,
        [{
          id: "fishing_supplies",
          name: "Fishing supplies",
          quantity: stockQuantity,
          stockKey: "service_units",
          unitPrice: stockQuantity > 0 ? Math.round(totalPrice / stockQuantity) : 0,
        }],
        totalPrice,
        "fishing_shop",
        "cash",
        { key: "fishing_markup", basePrice: baseTotalPrice, lines: pricingLines }
      )
    );
    if (!purchase?.ok) {
      const messages = {
        cash: "Недостаточно наличных.",
        weight: "Недостаточно свободного веса в инвентаре.",
        slots: "Нет свободного места в инвентаре.",
        character: "Персонаж не загружен.",
        closed: "Магазин рыбака сейчас закрыт.",
        tax: "Магазин рыбака закрыт из-за просроченного налога.",
        stock: "На складе бизнеса закончились товары.",
      };
      notifyError(player, messages[purchase.reason] || "Не удалось выполнить покупку. Деньги и инвентарь не изменены.");
      return false;
    }

    syncPlayerCash(player, purchase.cash);
    notifySuccess(
      player,
      formatCartPurchaseNotification(
        cart.map((entry) => ({
          name: config.shop.items[entry.itemId]?.name || entry.itemId,
          quantity: entry.quantity,
        })),
        totalPrice
      )
    );
    return true;
    });
  } finally {
    fishingRuntime.shopPurchases.delete(purchaseKey);
  }
}

function canShow(player, onlyIf) {
  const profile = fishingRuntime.profiles.get(getPlayerStaticId(player));
  const key = String(onlyIf || "");
  if (key === "fishingActive") return Boolean(profile?.active);
  if (key === "fishingInactive") return !profile?.active;
  if (key === "fishingHasQuest") return Boolean(profile?.currentQuest);
  if (key === "fishingNoQuest") return !profile?.currentQuest;
  return true;
}

async function showInfo(player) {
  const profile = await ensureProfile(player);
  const quest = profile.currentQuest
    ? ` Задание: ${profile.currentQuest.title} (${profile.currentQuest.progress}/${profile.currentQuest.target}).`
    : "";
  notify(
    player,
    `Рыбалка: уровень ${profile.level}, XP ${profile.xp}. Купите комплект снастей, начните сессию у Noah, идите к точке на карте и нажмите E. После заброса нажмите Space в зелёной зоне и выполняйте подсказки вываживания. Улов продаётся рыбаку или скупщику.${quest}`,
    "info",
    14000
  );
  return true;
}

async function showStats(player) {
  const profile = await ensureProfile(player);
  const stats = profile.stats || {};
  notify(player, `Журнал рыбака: забросов ${stats.casts || 0}, поймано ${stats.caught || 0}, продано ${stats.sold || 0}, заработано $${stats.earned || 0}.`, "info", 8000);
  return true;
}

function syncLoadedCharacter(player) {
  ensureProfile(player)
    .then(() => syncPlayer(player))
    .catch((error) => console.error("[FISHING] characterReady sync failed:", error));
}

registerServerEvent("fishing:characterReady", (player) => syncLoadedCharacter(player));
registerServerEvent("fishing:item:useRod", async (player, item) => openCastSetup(player, item));
registerServerEvent("server:fishing:requestCastSetup", async (player) => openCastSetup(player));
registerServerEvent("server:fishing:startCast", async (player, rawPayload) => startCast(player, rawPayload));
registerServerEvent("server:fishing:hook", (player, token) => {
  hookFish(player, token).catch((error) => {
    console.error("[FISHING] timing hook error:", error);
    notifyError(player, error?.message || "Рыбалка прервана.");
    cancelSession(player, "error");
  });
});
registerServerEvent("server:fishing:reelInput", (player, rawPayload) => handleReelInput(player, rawPayload));
registerServerEvent("server:fishing:cancel", (player) => cancelSession(player, "cancelled"));
registerServerEvent("server:fishingShop:buyCart", async (player, rawCart) => {
  const purchased = await buyShopCart(player, rawCart, (p) => fishingService.isNearSeller(p));
  if (!fishingRuntime.shopSessions.has(Number(player?.id))) return;
  try {
    const business = await businessService.repository.getBusiness("fishing_noah");
    const multiplier = Math.max(50, Math.min(200, Number(business?.catalog?.fishing_markup || 100)));
    player.call("client:fishingShop:open", [JSON.stringify(getShopPayload(player, {
      purchaseRevision: Date.now(),
      purchaseSucceeded: Boolean(purchased),
    }, multiplier))]);
  } catch (error) {
    console.error("[FISHING] Failed to acknowledge shop purchase:", error);
  }
});
registerServerEvent("server:fishingShop:close", (player) => closeShop(player));

registerServerEvent("playerQuit", (player) => {
  const staticId = getPlayerStaticId(player);
  cancelSession(player, "quit");
  fishingRuntime.shopSessions.delete(Number(player?.id));
  if (staticId) {
    const profile = fishingRuntime.profiles.get(staticId);
    if (profile) repository.saveProfile(staticId, profile).catch(() => {});
  }
  fishingRuntime.profiles.delete(staticId);
});

registerServerEvent("playerDeath", (player) => {
  cancelSession(player, "death");
  closeShop(player);
});

registerTimer(() => {
  cleanupLeases();
  for (const [playerId, session] of fishingRuntime.sessions.entries()) {
    const player = findPlayerById(playerId);
    if (!player || !mp.players.exists(player)) {
      fishingRuntime.sessions.delete(playerId);
      continue;
    }
    const distance = getDistance(player.position, session.castPosition);
    if (distance > Number(config.session.movementCancelDistance || 7.5)) {
      notifyError(player, "Рыбалка отменена: вы отошли от места заброса.");
      cancelSession(player, "moved");
    }
  }
}, Number(config.session.watchdogMs || 1500));

registerServerCommand("fishstart", (player) => startFreeFishing(player));
registerServerCommand("fishstop", (player) => finishFishing(player));
registerServerCommand("fishcast", (player) => openCastSetup(player));

fishingRuntime.shutdown = (reason = "reload") => {
  fishingRuntime.active = false;
  for (const timer of fishingRuntime.timers) {
    try { clearInterval(timer); } catch {}
  }
  for (const [playerId, session] of fishingRuntime.sessions.entries()) {
    const player = findPlayerById(playerId);
    clearSessionTimers(session);
    if (player) {
      try { player.call("fishing:sessionEnd", [String(reason)]); } catch {}
    }
  }
  fishingRuntime.sessions.clear();
  fishingRuntime.pointLeases.clear();
  fishingRuntime.shopSessions.clear();
  fishingRuntime.operations.clear();
  fishingRuntime.events.splice(0).forEach(({ eventName, handler }) => {
    try { mp.events.remove(eventName, handler); } catch {}
  });
  fishingRuntime.commands.splice(0).forEach(({ name, handler }) => {
    try { mp.unregisterCommand?.(name, handler); } catch {}
  });
};

const fishingService = {
  config,
  ensureProfile,
  saveProfile,
  startFreeFishing,
  finishFishing,
  assignQuest,
  submitQuest,
  openShop,
  closeShop,
  openCastSetup,
  sellFish,
  sellAllFish,
  showInfo,
  showStats,
  canShow,
  runExclusive,
  isPlayerActive(player) {
    const profile = fishingRuntime.profiles.get(getPlayerStaticId(player));
    return Boolean(profile?.active);
  },
  isNearSeller(player) {
    return Boolean(
      player?.position &&
      Number(player.dimension || 0) === 0 &&
      getDistance(player.position, config.seller.position) <= Number(config.seller.colshapeRadius || 5) + 1.5
    );
  },
  getShopPayload,
};

global.twinkleFishing = fishingService;
module.exports = fishingService;

repository.ensureSchema()
  .then(() => console.log("[FISHING] Loaded; database schema ready"))
  .catch((error) => console.error("[FISHING] Database schema initialization failed:", error));
