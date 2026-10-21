"use strict";

const fs = require("fs");
const path = require("path");
const chat = require("../chat/chat.service.js");
const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");

const NPC_POS_FILE = path.resolve(__dirname, "../../../../npcPos.txt");
let positionWriteQueue = Promise.resolve();

const {
  ADMIN_ACTION_TYPES,
  sendAdminAction,
  logAdminAction,
  getAdminLevel,
  getName,
  getUuid,
} = require("./admin.logs.js");

function hasAccess(player, level) {
  return getAdminLevel(player) >= Number(level || 1);
}

function deny(player) {
  return chat.sendError(player, "Нет доступа к команде.");
}

function info(player, text) {
  return chat.sendInfo(player, text);
}

function ok(player, text) {
  return chat.sendSuccess(player, text);
}

function err(player, text) {
  return chat.sendError(player, text);
}

function parseArgs(fullText) {
  return String(fullText || "").trim().split(/\s+/).filter(Boolean);
}

function appendPositionRecord(record) {
  const line = `${JSON.stringify(record)}\r\n`;
  const write = () => fs.promises.appendFile(NPC_POS_FILE, line, "utf8");
  positionWriteQueue = positionWriteQueue.catch(() => undefined).then(write);
  return positionWriteQueue;
}

function getPlayerById(id) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) return null;

  try {
    return mp.players.at(targetId) || null;
  } catch {
    return null;
  }
}

function getVehicleById(id) {
  const vehicleId = Number(id);
  if (!Number.isInteger(vehicleId)) return null;

  try {
    return mp.vehicles.at(vehicleId) || null;
  } catch {
    return null;
  }
}

function getPlayerByUuid(uuid) {
  const targetUuid = Number(uuid);
  if (!Number.isInteger(targetUuid)) return null;

  let found = null;

  mp.players.forEach((player) => {
    if (getUuid(player) === targetUuid) {
      found = player;
    }
  });

  return found;
}

async function sql(query, params = []) {
  if (typeof db.query === "function") {
    return db.query(query, params);
  }

  if (typeof db.withConn === "function") {
    return db.withConn(async (conn) => {
      const [rows] = await conn.query(query, params);
      return rows;
    });
  }

  throw new Error("database/query.js должен экспортировать query() или withConn()");
}

function getAffectedRows(result) {
  if (!result) return 0;
  if (typeof result.affectedRows === "number") return result.affectedRows;
  if (Array.isArray(result) && typeof result[0]?.affectedRows === "number") return result[0].affectedRows;
  return 0;
}

function getDistance(a, b) {
  if (!a || !b) return 999999;

  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function destroyVehicleSafe(vehicle) {
  if (!vehicle) return false;

  try {
    if (!mp.vehicles.exists(vehicle)) return false;
  } catch {
    return false;
  }

  try {
    vehicle.destroy();
    return true;
  } catch (e) {
    console.log("[ADMIN] destroyVehicleSafe error:", e.message);
    return false;
  }
}

function syncCash(target, cash) {
  if (!target) return;

  target.character = target.character || {};
  target.character.cash = Number(cash || 0);
  target.setVariable("cash", target.character.cash);

  try {
    target.call("client:money:update", [target.character.cash]);
  } catch {}
}

function revivePlayer(player) {
  if (!player) return false;

  const pos = player.position;

  try {
    player.spawn(new mp.Vector3(pos.x, pos.y, pos.z));
  } catch {
    try {
      player.health = 100;
    } catch {}
  }

  try {
    player.health = 100;
    player.armour = 0;
  } catch {}

  try {
    player.call("client:player:revive");
  } catch {}

  return true;
}

mp.registerCommand("testhouse", (player) => {

    mp.events.call(
        "s:objectEditor:requestMenu",
        player,
        JSON.stringify({
            propertyKind: "house",
            propertyId: 999999
        })
    );

    player.outputChatBox("Тестовый дом открыт.");

});

mp.registerCommand("testfurniture", (player) => {

    mp.events.call(
        "s:objectEditor:buy",
        player,
        JSON.stringify({
            propertyKind: "house",
            propertyId: 999999,
            furnitureId: 1
        })
    );

});

mp.registerCommand("veh", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const model = String(fullText || "").trim();

  if (!model) {
    return err(player, "Использование: /veh [model]");
  }

  const pos = player.position;

  const vehicle = mp.vehicles.new(
    mp.joaat(model),
    new mp.Vector3(pos.x, pos.y + 3, pos.z),
    {
      heading: player.heading || 0,
      dimension: player.dimension || 0,
      numberPlate: "ADMIN",
    }
  );

  vehicle.setVariable("ownerType", "admin");
  vehicle.setVariable("ownerId", 0);
  vehicle.setVariable("adminVehicle", true);
  vehicle.setVariable("engine", true);
  vehicle.setVariable("locked", false);
  vehicle.setVariable("fuel", 100);
  vehicle.setVariable("fuelMax", 100);
  vehicle.setVariable("fuelConsumption", 1);

  vehicle.engine = true;
  vehicle.locked = false;

  ok(player, `Создан транспорт ${model} ID ${vehicle.id}.`);

  logAdminAction(player, `создал админский транспорт ${model} ID ${vehicle.id}`);
});

mp.registerCommand("gw", (player, fullText) => {
  if (!hasAccess(player, 5)) return deny(player);

  const args = parseArgs(fullText);
  const target = getPlayerById(args[0]);
  const weapon = args[1];
  const ammo = Number(args[2] || 10000);

  if (!target || !weapon) {
    return err(player, "Использование: /gw [ID] [weapon] [ammo]");
  }

  const finalAmmo = Number.isInteger(ammo) && ammo > 0 ? Math.min(ammo, 50000) : 10000;

  target.giveWeapon(mp.joaat(weapon), finalAmmo);

  ok(player, `Вы выдали ${weapon} x${finalAmmo} игроку ${target.name} [ID ${target.id}].`);
  info(target, `Администратор выдал вам оружие ${weapon}.`);

  logAdminAction(player, `выдал оружие ${weapon} x${finalAmmo}`, target);
});

mp.registerCommand("hp", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const args = parseArgs(fullText);
  const target = getPlayerById(args[0]);
  const hp = Number(args[1]);

  if (!target || !Number.isFinite(hp)) {
    return err(player, "Использование: /hp [ID] [HP]");
  }

  if (hp < 0 || hp > 100) {
    return err(player, "HP должен быть от 0 до 100.");
  }

  target.health = hp;

  ok(player, `Вы установили ${hp} HP игроку ${target.name} [ID ${target.id}].`);
  info(target, `Вам установлено ${hp} HP.`);

  logAdminAction(player, `установил HP ${hp}`, target);
});

mp.registerCommand("tp", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const target = getPlayerById(fullText);
  if (!target) return err(player, "Использование: /tp [ID]");

  player.dimension = target.dimension;
  player.position = new mp.Vector3(target.position.x, target.position.y, target.position.z + 1);

  ok(player, `Вы телепортировались к ${target.name} [ID ${target.id}].`);
});

mp.registerCommand("cargh", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const vehicle = getVehicleById(fullText);
  if (!vehicle) return err(player, "Использование: /cargh [Veh ID]");

  vehicle.dimension = player.dimension;
  vehicle.position = new mp.Vector3(player.position.x, player.position.y + 2, player.position.z);

  ok(player, `Вы телепортировали машину ID ${vehicle.id} к себе.`);
});

mp.registerCommand("delveh", (player) => {
  if (!hasAccess(player, 1)) return deny(player);

  let nearest = null;
  let nearestDistance = 10;

  mp.vehicles.forEach((vehicle) => {
    try {
      if (!vehicle || !mp.vehicles.exists(vehicle)) return;
      if (!vehicle.position || !player.position) return;
      if (Number(vehicle.dimension || 0) !== Number(player.dimension || 0)) return;

      const distance = getDistance(player.position, vehicle.position);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = vehicle;
      }
    } catch {}
  });

  if (!nearest) {
    return err(player, "Рядом нет транспорта.");
  }

  const id = nearest.id;

  if (!destroyVehicleSafe(nearest)) {
    return err(player, "Не удалось удалить транспорт.");
  }

  ok(player, `Вы удалили ближайший транспорт ID ${id}.`);
  logAdminAction(player, `удалил ближайший транспорт ID ${id}`);
});

mp.registerCommand("delvehid", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const vehicleId = Number(fullText);

  if (!Number.isInteger(vehicleId)) {
    return err(player, "Использование: /delvehid [Veh ID]");
  }

  let targetVehicle = null;

  mp.vehicles.forEach((vehicle) => {
    try {
      if (!vehicle || !mp.vehicles.exists(vehicle)) return;

      if (Number(vehicle.id) === vehicleId) {
        targetVehicle = vehicle;
      }
    } catch {}
  });

  if (!targetVehicle) {
    return err(player, `Транспорт ID ${vehicleId} не найден.`);
  }

  if (!destroyVehicleSafe(targetVehicle)) {
    return err(player, "Не удалось удалить транспорт.");
  }

  ok(player, `Вы удалили транспорт ID ${vehicleId}.`);
  logAdminAction(player, `удалил транспорт ID ${vehicleId}`);
});

mp.registerCommand("rdelveh", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const radiusInput = Number(fullText || 100);
  const radius = Number.isFinite(radiusInput) ? Math.max(1, Math.min(radiusInput, 500)) : 100;

  let removed = 0;

  mp.vehicles.forEach((vehicle) => {
    try {
      if (!vehicle || !mp.vehicles.exists(vehicle)) return;
      if (!vehicle.position || !player.position) return;
      if (Number(vehicle.dimension || 0) !== Number(player.dimension || 0)) return;

      if (getDistance(player.position, vehicle.position) <= radius) {
        if (destroyVehicleSafe(vehicle)) removed++;
      }
    } catch {}
  });

  ok(player, `Удалено транспорта в радиусе ${radius}м: ${removed}.`);

  if (removed > 0) {
    logAdminAction(player, `удалил транспорт в радиусе ${radius}м. Количество: ${removed}`);
  }
});

mp.registerCommand("setdim", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const args = parseArgs(fullText);
  const target = getPlayerById(args[0]);
  const dim = Number(args[1]);

  if (!target || !Number.isInteger(dim)) {
    return err(player, "Использование: /setdim [ID] [Dimension]");
  }

  target.dimension = dim;

  ok(player, `Вы установили dimension ${dim} игроку ${target.name}.`);
  info(target, `Ваш dimension изменён на ${dim}.`);

  logAdminAction(player, `установил dimension ${dim}`, target);
});

mp.registerCommand("setcardim", (player, fullText) => {
  if (!hasAccess(player, 3)) return deny(player);

  const args = parseArgs(fullText);
  const vehicle = getVehicleById(args[0]);
  const dim = Number(args[1]);

  if (!vehicle || !Number.isInteger(dim)) {
    return err(player, "Использование: /setcardim [Veh ID] [Dimension]");
  }

  vehicle.dimension = dim;

  ok(player, `Вы перенесли машину ID ${vehicle.id} в dimension ${dim}.`);
  logAdminAction(player, `перенёс машину ID ${vehicle.id} в dimension ${dim}`);
});

mp.registerCommand("asms", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const args = parseArgs(fullText);
  const target = getPlayerById(args.shift());
  const text = args.join(" ").trim();

  if (!target || !text) {
    return err(player, "Использование: /asms [ID] [Text]");
  }

  chat.sendToPlayer(target, `[ADMIN] ${player.name}: ${text}`, "#006400");
  ok(player, `Вы ответили игроку ${target.name} [ID ${target.id}]: ${text}`);
});

mp.registerCommand("o", (player, fullText) => {
  if (!hasAccess(player, 5)) return deny(player);

  const text = String(fullText || "").trim();
  if (!text) return err(player, "Использование: /o [Text]");

  chat.sendGlobal(`${player.name}: ${text}`, "#9c27b0");
  logAdminAction(player, `отправил сообщение в /o: ${text}`);
});

mp.registerCommand("givemoney", async (player, fullText) => {
  if (!hasAccess(player, 7)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);
    const amount = Number(args[1]);

    if (!Number.isInteger(targetUuid) || !Number.isFinite(amount) || amount <= 0) {
      return err(player, "Использование: /givemoney [UUID] [Count]");
    }

    if (amount > 100000000) {
      return err(player, "Слишком большая сумма.");
    }

    const beforeRows = await sql("SELECT cash, username, lastname, account_id FROM characters WHERE uuid = ? LIMIT 1", [targetUuid]);
    const beforeCash = Number(beforeRows?.[0]?.cash || 0);
    const result = await sql("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [amount, targetUuid]);

    if (getAffectedRows(result) <= 0) {
      return err(player, `Персонаж UUID ${targetUuid} не найден.`);
    }

    const target = getPlayerByUuid(targetUuid);

    if (target) {
      const currentCash = Number(target.character?.cash || target.getVariable?.("cash") || 0);
      syncCash(target, currentCash + amount);
      chat.sendToPlayer(target, `Вам выдали ${amount}$`, "#66cc66");
    }

    await logsDb.writeMoneyLog({
      source: "admin_command",
      action: "give",
      currency: "cash",
      amount,
      balanceBefore: beforeCash,
      balanceAfter: beforeCash + amount,
      actor: player,
      target,
      targetUuid,
      targetName: target?.name || [beforeRows?.[0]?.username, beforeRows?.[0]?.lastname].filter(Boolean).join(" ") || null,
      accountId: beforeRows?.[0]?.account_id || null,
      comment: "/givemoney",
      metadata: { command: "givemoney" },
    });

    ok(player, `Вы выдали ${amount}$ игроку UUID ${targetUuid}.`);

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.MANAGEMENT,
      message: `${getName(player)} #${getUuid(player)} выдал $${amount} игроку #${targetUuid}`,
    });
  } catch (e) {
    console.log("[ADMIN] /givemoney error:", e);
    return err(player, "Ошибка выполнения /givemoney.");
  }
});

mp.registerCommand("takemoney", async (player, fullText) => {
  if (!hasAccess(player, 7)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);
    const amount = Number(args[1]);

    if (!Number.isInteger(targetUuid) || !Number.isFinite(amount) || amount <= 0) {
      return err(player, "Использование: /takemoney [UUID] [Count]");
    }

    if (amount > 100000000) {
      return err(player, "Слишком большая сумма.");
    }

    const beforeRows = await sql("SELECT cash, username, lastname, account_id FROM characters WHERE uuid = ? LIMIT 1", [targetUuid]);
    const beforeCash = Number(beforeRows?.[0]?.cash || 0);
    const afterCash = Math.max(beforeCash - amount, 0);
    const result = await sql("UPDATE characters SET cash = GREATEST(cash - ?, 0) WHERE uuid = ?", [amount, targetUuid]);

    if (getAffectedRows(result) <= 0) {
      return err(player, `Персонаж UUID ${targetUuid} не найден.`);
    }

    const target = getPlayerByUuid(targetUuid);

    if (target) {
      const currentCash = Number(target.character?.cash || target.getVariable?.("cash") || 0);
      syncCash(target, Math.max(currentCash - amount, 0));
      chat.sendToPlayer(target, `У вас изъяли ${amount}$`, "#ff6666");
    }

    await logsDb.writeMoneyLog({
      source: "admin_command",
      action: "take",
      currency: "cash",
      amount: -amount,
      balanceBefore: beforeCash,
      balanceAfter: afterCash,
      actor: player,
      target,
      targetUuid,
      targetName: target?.name || [beforeRows?.[0]?.username, beforeRows?.[0]?.lastname].filter(Boolean).join(" ") || null,
      accountId: beforeRows?.[0]?.account_id || null,
      comment: "/takemoney",
      metadata: { command: "takemoney", requestedAmount: amount },
    });

    ok(player, `Вы изъяли ${amount}$ у игрока UUID ${targetUuid}.`);

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.MANAGEMENT,
      message: `${getName(player)} #${getUuid(player)} изъял $${amount} у игрока #${targetUuid}`,
    });
  } catch (e) {
    console.log("[ADMIN] /takemoney error:", e);
    return err(player, "Ошибка выполнения /takemoney.");
  }
});

mp.registerCommand("makeadmin", async (player, fullText) => {
  if (!hasAccess(player, 7)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);
    const newLevel = Number(args[1]);
    const issuerLevel = getAdminLevel(player);

    if (!Number.isInteger(targetUuid) || !Number.isInteger(newLevel)) {
      return err(player, "Использование: /makeadmin [UUID] [LVL]");
    }

    if (newLevel < 0 || newLevel >= issuerLevel) {
      return err(player, `Уровень должен быть от 0 до ${issuerLevel - 1}.`);
    }

    if (getUuid(player) === targetUuid) {
      return err(player, "Нельзя менять свой уровень администратора.");
    }

    const profile = await db.withConn(async (conn) => {
      await conn.beginTransaction();

      try {
        const [characters] = await conn.query(
          `SELECT uuid, account_id, username, lastname
             FROM characters
            WHERE uuid = ?
            LIMIT 1
            FOR UPDATE`,
          [targetUuid]
        );
        const character = characters[0];

        if (!character) {
          throw new Error("CHARACTER_NOT_FOUND");
        }

        const displayName = [character.username, character.lastname]
          .filter(Boolean)
          .join(" ")
          .trim()
          .slice(0, 64) || `Administrator #${targetUuid}`;

        await conn.query(
          "UPDATE characters SET has_admin_profile = ? WHERE uuid = ?",
          [newLevel > 0 ? 1 : 0, targetUuid]
        );

        if (newLevel > 0) {
          await conn.query(
            `INSERT INTO twinkle_admin.admin_profiles
              (
                account_id,
                character_uuid,
                admin_level,
                admsite_access,
                role_code,
                department_code,
                display_name,
                is_active
              )
             VALUES (?, ?, ?, 1, 'helper', 'administrator', ?, 1)
             ON DUPLICATE KEY UPDATE
                character_uuid = VALUES(character_uuid),
                admin_level = VALUES(admin_level),
                admsite_access = 1,
                display_name = VALUES(display_name),
                is_active = 1`,
            [
              Number(character.account_id),
              targetUuid,
              newLevel,
              displayName,
            ]
          );
        } else {
          await conn.query(
            `UPDATE twinkle_admin.admin_profiles
                SET admin_level = 0,
                    admsite_access = 0,
                    is_active = 0
              WHERE character_uuid = ? OR account_id = ?`,
            [targetUuid, Number(character.account_id)]
          );
        }

        let adminProfile = null;

        if (newLevel > 0) {
          const [profiles] = await conn.query(
            `SELECT id, account_id, character_uuid, admin_level,
                    admsite_access, role_code, department_code,
                    display_name, is_active
               FROM twinkle_admin.admin_profiles
              WHERE account_id = ?
              LIMIT 1`,
            [Number(character.account_id)]
          );
          adminProfile = profiles[0] || null;
        }

        await conn.commit();
        return adminProfile;
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });

    const target = getPlayerByUuid(targetUuid);

    if (target) {
      target.adminLevel = newLevel;
      target.admin = newLevel;
      target.setVariable("adminLevel", newLevel);
      target.setVariable("admin", newLevel);

      if (target.character) {
        target.character.admin_level = newLevel;
        target.character.has_admin_profile = newLevel > 0 ? 1 : 0;
        target.character.adminProfile = profile;
      }
      target.hasAdminProfile = newLevel > 0;
      target.adminProfile = profile;
      target.setVariable("hasAdminProfile", newLevel > 0);

      chat.sendToPlayer(target, `Ваш уровень администратора изменён на ${newLevel}.`, "#66ccff");
    }

    ok(player, `Установлен admin_level ${newLevel} персонажу UUID ${targetUuid}.`);

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.MANAGEMENT,
      message: `${getName(player)} #${getUuid(player)} установил admin_level ${newLevel} игроку #${targetUuid}`,
    });
  } catch (e) {
    console.log("[ADMIN] /makeadmin error:", e);
    if (e?.message === "CHARACTER_NOT_FOUND") {
      return err(player, `Персонаж UUID ${targetUuid} не найден.`);
    }
    return err(player, "Ошибка выполнения /makeadmin.");
  }
});

mp.registerCommand("setname", async (player, fullText) => {
  if (!hasAccess(player, 7)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);
    const firstName = args[1];
    const lastName = args[2] || "";

    if (!Number.isInteger(targetUuid) || !firstName) {
      return err(player, "Использование: /setname [UUID] [Имя] [Фамилия]");
    }

    const result = await sql(
      "UPDATE characters SET username = ?, lastname = ? WHERE uuid = ?",
      [firstName, lastName, targetUuid]
    );

    if (getAffectedRows(result) <= 0) {
      return err(player, `Персонаж UUID ${targetUuid} не найден.`);
    }

    const fullName = [firstName, lastName].filter(Boolean).join("_");
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    const target = getPlayerByUuid(targetUuid);

    if (target) {
      target.name = fullName;
      target.setVariable("displayName", displayName);

      if (target.character) {
        target.character.username = firstName;
        target.character.lastname = lastName;
      }

      chat.sendToPlayer(target, `Ваше имя изменено на ${displayName}.`, "#66ccff");
    }

    ok(player, `Имя персонажа UUID ${targetUuid} изменено на ${displayName}.`);

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.MANAGEMENT,
      message: `${getName(player)} #${getUuid(player)} изменил имя игрока #${targetUuid} на ${displayName}`,
    });
  } catch (e) {
    console.log("[ADMIN] /setname error:", e);
    return err(player, "Ошибка выполнения /setname.");
  }
});

mp.registerCommand("tempname", (player, fullText) => {
  if (!hasAccess(player, 5)) return deny(player);

  const args = parseArgs(fullText);
  const firstName = args[0];
  const lastName = args[1] || "";

  if (!firstName) {
    return err(player, "Использование: /tempname [Имя] [Фамилия]");
  }

  if (!player.originalName) {
    player.originalName = player.name;
  }

  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  player.name = [firstName, lastName].filter(Boolean).join("_");
  player.setVariable("displayName", displayName);

  ok(player, `Временное имя установлено: ${displayName}.`);
  logAdminAction(player, `установил себе временное имя ${displayName}`);
});

mp.registerCommand("resettempname", (player) => {
  if (!hasAccess(player, 5)) return deny(player);

  if (!player.originalName) {
    return err(player, "У вас нет временного имени.");
  }

  player.name = player.originalName;
  player.setVariable("displayName", player.originalName.replace("_", " "));

  delete player.originalName;

  ok(player, `Временное имя сброшено: ${player.name}.`);
});

mp.registerCommand("tpc", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  const args = parseArgs(fullText);
  const x = Number(args[0]);
  const y = Number(args[1]);
  const z = Number(args[2]);
  const dim = args[3] !== undefined ? Number(args[3]) : Number(player.dimension || 0);

  if (![x, y, z, dim].every(Number.isFinite)) {
    return err(player, "Использование: /tpc [x] [y] [z] [dim?]");
  }

  player.dimension = dim;
  player.position = new mp.Vector3(x, y, z);

  ok(player, `Вы телепортированы: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)} dim ${dim}.`);
});

mp.registerCommand("pos", async (player) => {
  if (!hasAccess(player, 1)) return deny(player);

  const pos = player.position;
  const heading = Number(player.heading || 0);
  const dimension = Number(player.dimension || 0);

  if (!pos || ![pos.x, pos.y, pos.z, heading, dimension].every((value) => Number.isFinite(Number(value)))) {
    return err(player, "Не удалось получить текущие координаты.");
  }

  const record = {
    x: Number(Number(pos.x).toFixed(3)),
    y: Number(Number(pos.y).toFixed(3)),
    z: Number(Number(pos.z).toFixed(3)),
    heading: Number(heading.toFixed(2)),
    dimension: Math.trunc(dimension),
  };

  try {
    await appendPositionRecord(record);
  } catch (error) {
    console.error(`[POS] Failed to append ${NPC_POS_FILE}:`, error);
    return err(player, "Координаты получены, но сохранить их в npcPos.txt не удалось.");
  }

  ok(
    player,
    `Сохранено в npcPos.txt: ${record.x.toFixed(3)}, ${record.y.toFixed(3)}, ${record.z.toFixed(3)} | heading: ${record.heading.toFixed(2)} | dim: ${record.dimension}`
  );

  console.log(`[POS] ${player.name}: ${JSON.stringify(record)} -> ${NPC_POS_FILE}`);
});

mp.registerCommand("hardban", async (player, fullText) => {
  if (!hasAccess(player, 6)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);
    const days = Number(args[1]);
    const reason = args.slice(2).join(" ").trim();

    if (!Number.isInteger(targetUuid) || !Number.isInteger(days) || !reason) {
      return err(player, "Использование: /hardban [UUID] [days] [reason]");
    }

    if (days < 1 || days > 10000) {
      return err(player, "Срок hardban должен быть от 1 до 10000 дней.");
    }

    const rows = await sql(
      `SELECT c.uuid, c.account_id, COALESCE(ap.admin_level, 0) AS admin_level,
              a.login, a.LastHwid, a.social_club_id, a.LastIp
       FROM characters c
       JOIN accounts a ON a.id = c.account_id
       LEFT JOIN twinkle_admin.admin_profiles ap
         ON ap.character_uuid = c.uuid AND ap.is_active = 1
       WHERE c.uuid = ?
       LIMIT 1`,
      [targetUuid]
    );

    if (!rows.length) {
      return err(player, `Персонаж UUID ${targetUuid} не найден.`);
    }

    const targetData = rows[0];
    const issuerLevel = getAdminLevel(player);

    if (Number(targetData.admin_level || 0) > 0 && issuerLevel <= Number(targetData.admin_level || 0)) {
      return err(player, "Нельзя забанить администратора с равным или выше уровнем.");
    }

    const socialClub = String(targetData.social_club_id || "");

    await sql(
      `INSERT INTO twinkle_admin.bans
       (account_id, character_uuid, social_club_id, social_club, hwid, ip, reason, admin, date, unban_date, ban_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'hardban')`,
      [
        targetData.account_id,
        targetData.uuid,
        socialClub,
        socialClub,
        targetData.LastHwid || "",
        targetData.LastIp || "",
        reason,
        player.name || `Admin #${player.id}`,
        days,
      ]
    );

    const unbanRows = await sql(
      `SELECT DATE_FORMAT(DATE_ADD(NOW(), INTERVAL ? DAY), '%d.%m.%Y %H:%i:%s') AS unban_str`,
      [days]
    );

    const unbanStr = unbanRows[0]?.unban_str || `${days} дн.`;
    const target = getPlayerByUuid(targetUuid);
    const isOnline = !!target;

    if (target) {
      chat.sendToPlayer(target, `Вы получили HARD BAN до ${unbanStr}. Причина: ${reason}`, "#ff6666");

      setTimeout(() => {
        try {
          if (mp.players.exists(target)) {
            logsDb.setPlayerQuitReason(target, "ban", `HardBan: ${reason}`, player);
            target.kick("HardBan");
          }
        } catch {}
      }, 500);
    }

    chat.sendGlobal(
      `Администратор ${player.name} выдал HARD BAN игроку [UUID:${targetUuid}] до ${unbanStr}. Причина: ${reason}`,
      "#9c27b0"
    );

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.STAFF,
      message: `${getName(player)} #${getUuid(player)} выдал ${isOnline ? "онлайн" : "оффлайн"} HARD BAN игроку #${targetUuid} на ${days} дн.\nПричина: ${reason}`,
    });

    return ok(player, `HardBan выдан UUID ${targetUuid} до ${unbanStr}.`);
  } catch (e) {
    console.log("[HARDBAN CMD ERROR]", e);
    return err(player, "Ошибка выполнения /hardban.");
  }
});

mp.registerCommand("mute", async (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args.shift());
    const minutes = Number(args.shift());
    const reason = args.join(" ").trim();

    if (!Number.isInteger(targetUuid) || !Number.isInteger(minutes) || minutes <= 0 || !reason) {
      return err(player, "Использование: /mute [uuid] [minutes] [reason]");
    }

    if (minutes > 100000) {
      return err(player, "Слишком большой срок мута.");
    }

    await sql("DELETE FROM twinkle_admin.mutes WHERE uuid = ?", [targetUuid]);

    await sql(
      `INSERT INTO twinkle_admin.mutes
       (uuid, admin_uuid, reason, remaining_seconds, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [targetUuid, getUuid(player), reason, minutes * 60, Math.floor(Date.now() / 1000)]
    );

    const target = getPlayerByUuid(targetUuid);

    if (target) {
      target.isMuted = true;
      target.muteData = {
        reason,
        remainingSeconds: minutes * 60,
        lastTick: Math.floor(Date.now() / 1000),
      };

      target.setVariable("isMuted", true);
      chat.sendError(target, `Вам выдали мут на ${minutes} мин. Причина: ${reason}`);
    }

    chat.sendGlobal(`[MUTE] ${player.name} выдал мут игроку #${targetUuid} на ${minutes} мин.`, "#ff9900");

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.STAFF,
      message: `${getName(player)} #${getUuid(player)} выдал ${target ? "онлайн" : "оффлайн"} MUTE игроку #${targetUuid} на ${minutes} мин.\nПричина: ${reason}`,
    });

    return ok(player, `Мут выдан игроку #${targetUuid} на ${minutes} мин.`);
  } catch (e) {
    console.log("[ADMIN] /mute error:", e);
    return err(player, "Ошибка выполнения /mute.");
  }
});

mp.registerCommand("unban", async (player, fullText) => {
  if (!hasAccess(player, 2)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args.shift());
    const reason = args.join(" ").trim();

    if (!Number.isInteger(targetUuid) || !reason) {
      return err(player, "Использование: /unban [uuid] [reason]");
    }

    const result = await sql("DELETE FROM twinkle_admin.bans WHERE character_uuid = ?", [targetUuid]);

    if (getAffectedRows(result) <= 0) {
      return err(player, "Активный бан не найден.");
    }

    chat.sendGlobal(`[UNBAN] ${player.name} снял бан игроку #${targetUuid}. Причина: ${reason}`, "#66cc66");

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.STAFF,
      message: `${getName(player)} #${getUuid(player)} снял BAN игроку #${targetUuid}.\nПричина: ${reason}`,
    });

    return ok(player, `Бан снят с игрока #${targetUuid}.`);
  } catch (e) {
    console.log("[ADMIN] /unban error:", e);
    return err(player, "Ошибка выполнения /unban.");
  }
});

mp.registerCommand("unmute", async (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args.shift());
    const reason = args.join(" ").trim();

    if (!Number.isInteger(targetUuid) || !reason) {
      return err(player, "Использование: /unmute [uuid] [reason]");
    }

    const result = await sql("DELETE FROM twinkle_admin.mutes WHERE uuid = ?", [targetUuid]);

    if (getAffectedRows(result) <= 0) {
      return err(player, "Активный мут не найден.");
    }

    const target = getPlayerByUuid(targetUuid);

    if (target) {
      target.isMuted = false;
      target.muteData = null;
      target.setVariable("isMuted", false);
      chat.sendSuccess(target, "Ваш мут был снят.");
    }

    chat.sendGlobal(`[UNMUTE] ${player.name} снял мут игроку #${targetUuid}. Причина: ${reason}`, "#66cc66");

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.STAFF,
      message: `${getName(player)} #${getUuid(player)} снял MUTE игроку #${targetUuid}.\nПричина: ${reason}`,
    });

    return ok(player, `Мут снят с игрока #${targetUuid}.`);
  } catch (e) {
    console.log("[ADMIN] /unmute error:", e);
    return err(player, "Ошибка выполнения /unmute.");
  }
});

mp.registerCommand("makeleader", async (player, fullText) => {
  if (!hasAccess(player, 7)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);
    const fractionId = Number(args[1]);

    if (!Number.isInteger(targetUuid) || !Number.isInteger(fractionId)) {
      return err(player, "Использование: /makeleader [UUID] [FRACTION ID]");
    }

    const target = getPlayerByUuid(targetUuid);

    if (fractionId === 0) {
      await sql("DELETE FROM fraction_members WHERE character_uuid = ?", [targetUuid]);
      await sql("UPDATE fractions SET leader_uuid = NULL WHERE leader_uuid = ?", [targetUuid]);
      await sql(
        "UPDATE characters SET has_fraction = 0 WHERE uuid = ?",
        [targetUuid]
      );

      if (target) {
        target.fraction = 0;
        target.fractionId = 0;
        target.fractionRank = 0;
        target.setVariable("fraction", 0);
        target.setVariable("fractionId", 0);
        target.setVariable("fractionRank", 0);
        target.setVariable("hasFraction", false);
        target.hasFraction = false;

        if (target.character) {
          target.character.fraction_id = 0;
          target.character.fraction_rank = 0;
          target.character.has_fraction = 0;
        }

        chat.sendToPlayer(target, "Вы были сняты с лидерки.", "#ff6666");
      }

      ok(player, `UUID ${targetUuid} снят с лидерки.`);

      sendAdminAction({
        type: ADMIN_ACTION_TYPES.MANAGEMENT,
        message: `${getName(player)} #${getUuid(player)} снял игрока #${targetUuid} с лидерки`,
      });

      return;
    }

    let fractionRows = await sql("SELECT * FROM fractions WHERE fraction_id = ? LIMIT 1", [fractionId]);
    if (Array.isArray(fractionRows?.[0])) fractionRows = fractionRows[0];

    if (!fractionRows || !fractionRows.length) {
      return err(player, `Фракция ID ${fractionId} не найдена.`);
    }

    const fraction = fractionRows[0];

    let leaderRankRows = await sql(
      `SELECT * FROM fraction_ranks WHERE fraction_id = ? AND is_leader = 1 LIMIT 1`,
      [fractionId]
    );

    if (Array.isArray(leaderRankRows?.[0])) leaderRankRows = leaderRankRows[0];

    if (!leaderRankRows || !leaderRankRows.length) {
      return err(player, `Во фракции ID ${fractionId} отсутствует лидерский ранг.`);
    }

    const leaderRank = leaderRankRows[0];

    await sql("DELETE FROM fraction_members WHERE fraction_id = ? AND rank_index = ?", [
      fractionId,
      leaderRank.rank_index,
    ]);

    await sql("UPDATE fractions SET leader_uuid = ? WHERE fraction_id = ?", [targetUuid, fractionId]);

    await sql(
      `INSERT INTO fraction_members (fraction_id, character_uuid, rank_index)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fraction_id = VALUES(fraction_id),
         rank_index = VALUES(rank_index)`,
      [fractionId, targetUuid, leaderRank.rank_index]
    );

    await sql("UPDATE characters SET has_fraction = 1 WHERE uuid = ?", [targetUuid]);

    if (target) {
      target.fraction = fractionId;
      target.fractionId = fractionId;
      target.fractionRank = Number(leaderRank.rank_index);
      target.setVariable("fraction", fractionId);
      target.setVariable("fractionId", fractionId);
      target.setVariable("fractionRank", Number(leaderRank.rank_index));

      if (target.character) {
        target.character.fraction_id = fractionId;
        target.character.fraction_rank = Number(leaderRank.rank_index);
        target.character.has_fraction = 1;
      }
      target.hasFraction = true;
      target.setVariable("hasFraction", true);

      chat.sendToPlayer(target, `Вы были назначены лидером фракции ${fraction.name}.`, "#66cc66");
    }

    ok(player, `UUID ${targetUuid} назначен лидером фракции ID ${fractionId}.`);

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.MANAGEMENT,
      message: `${getName(player)} #${getUuid(player)} назначил игрока #${targetUuid} лидером фракции ${fraction.short_name || fraction.name} [${fractionId}]`,
    });
  } catch (e) {
    console.error("[ADMIN] /makeleader error:", e);
    return err(player, "Ошибка выполнения команды. Подробности в консоли.");
  }
});

mp.registerCommand("afraconline", async (player) => {
  if (!hasAccess(player, 1)) return deny(player);

  try {
    let fractions = await sql(
      `SELECT fraction_id, name, short_name
       FROM fractions
       ORDER BY fraction_id ASC`
    );

    if (Array.isArray(fractions?.[0])) fractions = fractions[0];

    if (!fractions || !fractions.length) {
      return chat.sendToPlayer(player, "Фракции не найдены.", "#ff6666");
    }

    const online = {};

    mp.players.forEach((target) => {
      const fractionId = Number(
        target.fractionId ||
          target.fraction ||
          target.character?.fraction_id ||
          target.getVariable?.("fractionId") ||
          0
      );

      if (!fractionId) return;
      online[fractionId] = Number(online[fractionId] || 0) + 1;
    });

    chat.sendToPlayer(player, "===== Онлайн фракций =====", "#66ccff");

    fractions.forEach((fraction) => {
      const fractionId = Number(fraction.fraction_id);
      const count = Number(online[fractionId] || 0);

      chat.sendToPlayer(
        player,
        `[${fractionId}] ${fraction.short_name || fraction.name}: ${count} чел.`,
        count > 0 ? "#66cc66" : "#999999"
      );
    });
  } catch (e) {
    console.error("[ADMIN] /afraconline error:", e);
    return err(player, "Ошибка выполнения команды.");
  }
});

mp.registerCommand("auninvite", async (player, fullText) => {
  if (!hasAccess(player, 4)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const targetUuid = Number(args[0]);

    if (!Number.isInteger(targetUuid)) {
      return err(player, "Использование: /auninvite [UUID]");
    }

    let memberRows = await sql(
      `SELECT fm.*, fr.is_leader, f.name AS fraction_name
       FROM fraction_members fm
       LEFT JOIN fraction_ranks fr
         ON fr.fraction_id = fm.fraction_id
        AND fr.rank_index = fm.rank_index
       LEFT JOIN fractions f
         ON f.fraction_id = fm.fraction_id
       WHERE fm.character_uuid = ?
       LIMIT 1`,
      [targetUuid]
    );

    if (Array.isArray(memberRows?.[0])) memberRows = memberRows[0];

    if (!memberRows || !memberRows.length) {
      return err(player, "Игрок не состоит во фракции.");
    }

    const member = memberRows[0];

    if (Number(member.is_leader) === 1) {
      return err(player, "Нельзя уволить лидера фракции через /auninvite.");
    }

    await sql("DELETE FROM fraction_members WHERE character_uuid = ?", [targetUuid]);
    await sql(
      "UPDATE characters SET has_fraction = 0 WHERE uuid = ?",
      [targetUuid]
    );

    const target = getPlayerByUuid(targetUuid);

    if (target) {
      target.fraction = 0;
      target.fractionId = 0;
      target.fractionRank = 0;
      target.setVariable("fraction", 0);
      target.setVariable("fractionId", 0);
      target.setVariable("fractionRank", 0);
      target.setVariable("hasFraction", false);
      target.hasFraction = false;

      if (target.character) {
        target.character.fraction_id = 0;
        target.character.fraction_rank = 0;
        target.character.has_fraction = 0;
      }

      chat.sendToPlayer(
        target,
        `Администратор уволил вас из фракции ${member.fraction_name || member.fraction_id}.`,
        "#ff6666"
      );
    }

    ok(player, `UUID ${targetUuid} уволен из фракции ${member.fraction_name || member.fraction_id}.`);

    logAdminAction(
      player,
      `уволил из фракции ${member.fraction_name || member.fraction_id}`,
      target || null
    );
  } catch (e) {
    console.error("[ADMIN] /auninvite error:", e);
    return err(player, "Ошибка выполнения команды.");
  }
});

mp.registerCommand("afracmoney", async (player, fullText) => {
  if (!hasAccess(player, 7)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const fractionId = Number(args[0]);
    const action = String(args[1] || "").toLowerCase();
    const amount = Number(args[2]);

    if (!Number.isInteger(fractionId) || !["add", "take", "set"].includes(action) || !Number.isFinite(amount) || amount < 0) {
      return err(player, "Использование: /afracmoney [FRAC ID] [add/take/set] [AMOUNT]");
    }

    let fractionRows = await sql("SELECT * FROM fractions WHERE fraction_id = ? LIMIT 1", [fractionId]);
    if (Array.isArray(fractionRows?.[0])) fractionRows = fractionRows[0];

    if (!fractionRows || !fractionRows.length) {
      return err(player, `Фракция ID ${fractionId} не найдена.`);
    }

    const fraction = fractionRows[0];
    const currentBalance = Number(fraction.balance || 0);

    let newBalance = currentBalance;

    if (action === "add") newBalance = currentBalance + amount;

    if (action === "take") {
      if (currentBalance < amount) {
        return err(player, `Недостаточно средств. Баланс фракции: $${currentBalance}.`);
      }

      newBalance = currentBalance - amount;
    }

    if (action === "set") newBalance = amount;

    await sql("UPDATE fractions SET balance = ? WHERE fraction_id = ?", [newBalance, fractionId]);

    ok(
      player,
      `Баланс фракции ${fraction.short_name || fraction.name} изменён: $${currentBalance} → $${newBalance}.`
    );

    sendAdminAction({
      type: ADMIN_ACTION_TYPES.MANAGEMENT,
      message: `${getName(player)} #${getUuid(player)} изменил баланс фракции ${fraction.short_name || fraction.name} [${fractionId}]: $${currentBalance} → $${newBalance}`,
    });
  } catch (e) {
    console.error("[ADMIN] /afracmoney error:", e);
    return err(player, "Ошибка выполнения команды.");
  }
});

mp.registerCommand("rescue", (admin, fullText) => {
  if (!hasAccess(admin, 1)) return deny(admin);

  const args = parseArgs(fullText);
  const targetId = Number(args[0]);

  if (!Number.isInteger(targetId)) {
    return err(admin, "Использование: /rescue [ID]");
  }

  const target = getPlayerById(targetId);

  if (!target) {
    return err(admin, "Игрок не найден.");
  }

  revivePlayer(target);

  ok(admin, `Вы реанимировали игрока ${target.name || target.id}.`);
  info(target, `Администратор ${admin.name || admin.id} реанимировал вас.`);

  logAdminAction(admin, "реанимировал", target);
});

mp.registerCommand("incar", (player, fullText) => {
  if (!hasAccess(player, 1)) return deny(player);

  try {
    const args = parseArgs(fullText);
    const vehicleId = Number(args[0]);
    const seatId = Number(args[1] ?? 0);

    if (!Number.isInteger(vehicleId)) {
      return err(player, "Использование: /incar [vehId] [seatId]");
    }

    const vehicle = getVehicleById(vehicleId);

    if (!vehicle) {
      return err(player, "Транспорт не найден.");
    }

    player.putIntoVehicle(vehicle, seatId);

    ok(player, `Вы посажены в транспорт ID: ${vehicleId} | Seat: ${seatId}`);
  } catch (e) {
    console.log("[INCAR CMD ERROR]", e);
    return err(player, "Ошибка выполнения /incar.");
  }
});

console.log("[ADMIN COMMANDS] Loaded");

