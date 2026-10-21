"use strict";

const db = require("../../database/index.js");
const { ensureTableSchema } = require("../../database/schemaMigration.js");
const chat = require("../chat/chat.service.js");
const hud = require("../hud/hud.service.js");
const inventory = require("../inventory/inventory.service.js");
const deathService = require("../../death/death.service.js");
const { applyCharacterAppearance } = require("../../characters/appearance.js");
const adminClothes = require("./admin.clothes.js");
const adminLogs = require("./admin.logs.js");
const { getAdminLevel, getUuid, getPlayerName } = require("../../utils/player.js");
const config = require("./jail.config.js");
const core = require("./jail.core.js");

const activePlayers = new Set();
const sentenceLocks = new Map();
let schemaPromise = null;
let sentenceGeneration = 0;

const CREATE_JAIL_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS jail_sentences (
    character_uuid INT NOT NULL,
    admin_uuid INT NULL,
    reason VARCHAR(255) NOT NULL,
    remaining_seconds INT UNSIGNED NOT NULL,
    total_seconds INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (character_uuid),
    INDEX idx_jail_sentences_admin (admin_uuid),
    INDEX idx_jail_sentences_remaining (remaining_seconds)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = db.withConn((connection) =>
    ensureTableSchema(connection, CREATE_JAIL_TABLE_SQL)
  ).catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function exists(player) {
  try {
    return Boolean(player && mp.players.exists(player));
  } catch {
    return false;
  }
}

function safeCall(player, eventName, args = []) {
  if (!exists(player)) return false;

  try {
    player.call(eventName, args);
    return true;
  } catch {
    return false;
  }
}

function getAffectedRows(result) {
  if (!result) return 0;
  if (typeof result.affectedRows === "number") return result.affectedRows;
  if (Array.isArray(result) && typeof result[0]?.affectedRows === "number") {
    return result[0].affectedRows;
  }
  return 0;
}

function withSentenceLock(uuid, task) {
  const characterUuid = Number(uuid);
  const previous = sentenceLocks.get(characterUuid) || Promise.resolve();
  const current = previous.catch(() => undefined).then(task);

  sentenceLocks.set(characterUuid, current);

  return current.finally(() => {
    if (sentenceLocks.get(characterUuid) === current) {
      sentenceLocks.delete(characterUuid);
    }
  });
}

function getPlayerById(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) return null;

  try {
    return mp.players.at(id) || null;
  } catch {
    return null;
  }
}

function getPlayerByUuid(value) {
  const uuid = Number(value);
  if (!Number.isInteger(uuid) || uuid <= 0) return null;

  let found = null;
  mp.players.forEach((player) => {
    if (!found && getUuid(player) === uuid) found = player;
  });
  return found;
}

function getGender(player) {
  return String(
    player?.character?.gender ||
      player?.characterData?.gender ||
      player?.getVariable?.("gender") ||
      "male"
  ).toLowerCase() === "female"
    ? "female"
    : "male";
}

function getPrisonOutfit(player) {
  return config.PRISON_OUTFITS[getGender(player)] || config.PRISON_OUTFITS.male;
}

function applyPrisonOutfit(player) {
  if (!exists(player) || !player.jailData) return false;

  const outfit = getPrisonOutfit(player);

  for (const [componentId, item] of Object.entries(outfit.components)) {
    try {
      player.setClothes(
        Number(componentId),
        Number(item.drawable),
        Number(item.texture),
        Number(item.palette || 0)
      );
    } catch (error) {
      console.error(`[JAIL] Failed to set component ${componentId}:`, error.message);
    }
  }

  for (const propId of outfit.clearProps) {
    try {
      player.clearProp(Number(propId));
    } catch {}
  }

  player.jailData.lastOutfitApplyAt = Date.now();
  return true;
}

function removePlayerWeapons(player) {
  if (!exists(player) || !player.jailData) return;

  try {
    player.removeAllWeapons();
  } catch {
    try {
      if (Number(player.weapon || 0)) player.removeWeapon(Number(player.weapon));
    } catch {}
  }

  try {
    player.call("inventory:client:weaponEquipped", [0, 0, false]);
  } catch {}
}

function disableAdminEscapeState(player) {
  if (!exists(player) || !player.adminFlyEnabled) return;

  player.adminFlyEnabled = false;

  try {
    player.setVariable("adminFlyEnabled", false);
  } catch {}

  safeCall(player, "admin:fly:set", [false]);

  mp.players.forEach((viewer) => {
    safeCall(viewer, "admin:fly:ghostPlayer", [player.id, false]);
  });
}

function getClientPayload(player) {
  const state = player?.jailData;
  const outfit = getPrisonOutfit(player);

  return {
    active: Boolean(state),
    remainingSeconds: Math.max(0, Number(state?.remainingSeconds || 0)),
    reason: String(state?.reason || ""),
    bounds: config.CELL_BOUNDS,
    spawn: config.CELL_SPAWN,
    dimension: config.CELL_SPAWN.dimension,
    outfit,
  };
}

function syncClient(player) {
  safeCall(player, "c:jail:set", [JSON.stringify(getClientPayload(player))]);
}

function buildHudTask(player) {
  if (!player?.jailData) return null;

  return {
    id: "jail:sentence",
    type: "red",
    title: "Деморган",
    description: `Осталось ${core.formatDuration(player.jailData.remainingSeconds)} · Причина: ${player.jailData.reason}`,
  };
}

function updateHud(player) {
  if (!exists(player)) return;

  try {
    const task = buildHudTask(player);
    hud.update(player, {
      tasks: {
        merge: true,
        isVisible: true,
        items: task
          ? [task]
          : [{ id: "jail:sentence", hidden: true }],
      },
    });
  } catch (error) {
    console.error("[JAIL] HUD update error:", error.message);
  }
}

function setSyncedState(player, active) {
  try {
    player.setVariable("jailActive", Boolean(active));
    player.setVariable(
      "jailRemaining",
      active ? Math.max(0, Number(player.jailData?.remainingSeconds || 0)) : 0
    );
  } catch {}
}

function teleportToCell(player, notifyClient = true) {
  if (!exists(player) || !player.jailData) return false;

  try {
    if (player.vehicle) player.removeFromVehicle();
  } catch {}

  try {
    player.dimension = config.CELL_SPAWN.dimension;
    player.position = new mp.Vector3(
      config.CELL_SPAWN.x,
      config.CELL_SPAWN.y,
      config.CELL_SPAWN.z
    );
    player.heading = config.CELL_SPAWN.heading;
  } catch (error) {
    console.error("[JAIL] Cell teleport error:", error.message);
    return false;
  }

  if (notifyClient) {
    safeCall(player, "c:jail:correctPosition", [JSON.stringify(getClientPayload(player))]);
  }

  return true;
}

function enforcePlayer(player) {
  if (!exists(player) || !player.jailData) return;

  disableAdminEscapeState(player);

  let position = null;
  let dimension = null;
  let inVehicle = false;

  try {
    position = player.position;
    dimension = player.dimension;
    inVehicle = Boolean(player.vehicle);
  } catch {}

  const inside = core.isInsideCell(
    position,
    dimension,
    config.CELL_BOUNDS,
    config.CELL_SPAWN.dimension
  );

  if (!inside || inVehicle) {
    teleportToCell(player, true);
    player.jailData.positionCorrections += 1;
  }

  const now = Date.now();
  if (now - Number(player.jailData.lastWeaponClearAt || 0) >= 1000) {
    removePlayerWeapons(player);
    player.jailData.lastWeaponClearAt = now;
  }

  if (now - Number(player.jailData.lastOutfitApplyAt || 0) >= config.OUTFIT_REFRESH_INTERVAL_MS) {
    applyPrisonOutfit(player);
  }
}

async function restoreVisualState(player, expectedGeneration) {
  if (!exists(player) || player.jailData) return;

  const character = player.character || player.characterData;
  if (!character) return;

  try {
    await applyCharacterAppearance(player, character);
  } catch (error) {
    console.error("[JAIL] Appearance restore error:", error.message);
  }

  if (!exists(player)) return;
  if (player.jailData) {
    applyPrisonOutfit(player);
    return;
  }
  if (player.__lastReleasedJailGeneration !== expectedGeneration) {
    return;
  }

  try {
    await adminClothes.applySavedClothes(player);
  } catch (error) {
    console.error("[JAIL] Clothes restore error:", error.message);
  }

  if (!exists(player)) return;
  if (player.jailData) {
    applyPrisonOutfit(player);
    return;
  }
  if (player.__lastReleasedJailGeneration !== expectedGeneration) {
    return;
  }

  try {
    await inventory.restoreEquipment(player);
  } catch (error) {
    console.error("[JAIL] Equipment restore error:", error.message);
  }
}

function moveToReleasePosition(player) {
  if (!exists(player)) return;

  try {
    if (player.vehicle) player.removeFromVehicle();
  } catch {}

  try {
    if (player.isDead) {
      deathService.revivePlayer(
        player,
        new mp.Vector3(
          config.RELEASE_POSITION.x,
          config.RELEASE_POSITION.y,
          config.RELEASE_POSITION.z
        )
      );
    } else {
      player.position = new mp.Vector3(
        config.RELEASE_POSITION.x,
        config.RELEASE_POSITION.y,
        config.RELEASE_POSITION.z
      );
    }

    player.dimension = config.RELEASE_POSITION.dimension;
    player.heading = config.RELEASE_POSITION.heading;
  } catch (error) {
    console.error("[JAIL] Release teleport error:", error.message);
  }
}

function clearLocalSentence(player, { teleport = true, notify = true } = {}) {
  if (!player) return false;

  const state = player.jailData;
  if (!state) return false;

  activePlayers.delete(player);
  player.__lastReleasedJailGeneration = state.generation;
  player.jailData = null;
  player.isJailed = false;

  setSyncedState(player, false);
  syncClient(player);
  updateHud(player);

  if (teleport) moveToReleasePosition(player);

  if (notify && exists(player)) {
    chat.sendSuccess(player, "Вы освобождены из деморгана.");
  }

  restoreVisualState(player, state.generation).catch((error) => {
    console.error("[JAIL] Restore state error:", error);
  });

  return true;
}

async function attachSentence(player, row, { notify = true } = {}) {
  if (!exists(player)) return false;

  const uuid = getUuid(player);
  if (!uuid || uuid !== Number(row.character_uuid || row.uuid)) return false;

  if (player.jailData) activePlayers.delete(player);

  const remainingSeconds = Math.max(0, Math.trunc(Number(row.remaining_seconds || 0)));
  if (!remainingSeconds) return false;

  player.jailData = {
    uuid,
    adminUuid: Number(row.admin_uuid || 0),
    reason: core.sanitizeReason(row.reason) || "Нарушение правил сервера",
    remainingSeconds,
    totalSeconds: Math.max(remainingSeconds, Math.trunc(Number(row.total_seconds || remainingSeconds))),
    lastTickMs: Date.now(),
    lastPersistAtMs: Date.now(),
    lastOutfitApplyAt: 0,
    lastWeaponClearAt: 0,
    positionCorrections: 0,
    generation: ++sentenceGeneration,
  };
  player.isJailed = true;
  activePlayers.add(player);

  const wasDead = Boolean(player.isDead);
  deathService.clearDeathTimer(player);
  if (wasDead) {
    deathService.revivePlayer(
      player,
      new mp.Vector3(config.CELL_SPAWN.x, config.CELL_SPAWN.y, config.CELL_SPAWN.z)
    );
  }

  disableAdminEscapeState(player);
  teleportToCell(player, true);
  removePlayerWeapons(player);
  applyPrisonOutfit(player);
  setSyncedState(player, true);
  syncClient(player);
  updateHud(player);

  if (notify) {
    chat.sendError(
      player,
      `Вы помещены в деморган на ${core.formatDuration(remainingSeconds)}. Причина: ${player.jailData.reason}`
    );
  }

  return true;
}

async function saveProgress(player) {
  const state = player?.jailData;
  if (!state?.uuid) return false;

  const consumed = core.consumeElapsedTime(state, Date.now());
  state.remainingSeconds = consumed.remainingSeconds;
  state.lastTickMs = consumed.lastTickMs;

  await ensureSchema();

  return withSentenceLock(state.uuid, async () => {
    if (player.jailData !== state) return false;

    await db.query(
      `UPDATE jail_sentences
          SET remaining_seconds = ?, updated_at = CURRENT_TIMESTAMP
        WHERE character_uuid = ?`,
      [state.remainingSeconds, state.uuid]
    );

    state.lastPersistAtMs = Date.now();
    return true;
  });
}

async function issueSentence(admin, target, minutes, reason) {
  const uuid = getUuid(target);
  const durationMinutes = core.normalizeMinutes(minutes, config.MAX_JAIL_MINUTES);
  const normalizedReason = core.sanitizeReason(reason);

  if (!exists(target) || !uuid || !durationMinutes || !normalizedReason) {
    return { ok: false, reason: "invalid_arguments" };
  }

  const totalSeconds = durationMinutes * 60;
  const adminUuid = getUuid(admin) || null;

  await ensureSchema();

  await withSentenceLock(uuid, async () => {
    await db.query(
      `INSERT INTO jail_sentences
         (character_uuid, admin_uuid, reason, remaining_seconds, total_seconds)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         admin_uuid = VALUES(admin_uuid),
         reason = VALUES(reason),
         remaining_seconds = VALUES(remaining_seconds),
         total_seconds = VALUES(total_seconds),
         created_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [uuid, adminUuid, normalizedReason, totalSeconds, totalSeconds]
    );

    await attachSentence(target, {
      character_uuid: uuid,
      admin_uuid: adminUuid,
      reason: normalizedReason,
      remaining_seconds: totalSeconds,
      total_seconds: totalSeconds,
    });
  });

  return { ok: true, uuid, totalSeconds, reason: normalizedReason };
}

async function releaseCharacter(uuid, target = null, { notify = true, teleport = true } = {}) {
  const characterUuid = Number(uuid);
  if (!Number.isInteger(characterUuid) || characterUuid <= 0) return false;

  await ensureSchema();

  return withSentenceLock(characterUuid, async () => {
    const result = await db.query(
      "DELETE FROM jail_sentences WHERE character_uuid = ?",
      [characterUuid]
    );

    const onlineTarget = target || getPlayerByUuid(characterUuid);
    const hadLocalSentence = Boolean(
      onlineTarget?.jailData && Number(onlineTarget.jailData.uuid) === characterUuid
    );

    if (hadLocalSentence) {
      clearLocalSentence(onlineTarget, { notify, teleport });
    }

    return getAffectedRows(result) > 0 || hadLocalSentence;
  });
}

async function checkJailOnCharacterLoaded(player) {
  const uuid = getUuid(player);
  if (!uuid || !exists(player)) return false;

  await ensureSchema();

  return withSentenceLock(uuid, async () => {
    const rows = await db.query(
      `SELECT character_uuid, admin_uuid, reason, remaining_seconds, total_seconds
         FROM jail_sentences
        WHERE character_uuid = ?
        LIMIT 1`,
      [uuid]
    );

    if (!exists(player) || getUuid(player) !== uuid) return false;

    if (!rows.length || Number(rows[0].remaining_seconds || 0) <= 0) {
      if (rows.length) {
        await db.query("DELETE FROM jail_sentences WHERE character_uuid = ?", [uuid]);
      }
      if (player.jailData) clearLocalSentence(player, { notify: false, teleport: false });
      return false;
    }

    return attachSentence(player, rows[0], { notify: true });
  });
}

function isJailed(player) {
  return Boolean(player?.jailData && Number(player.jailData.remainingSeconds) > 0);
}

function parseCommandArgs(fullText) {
  return String(fullText || "").trim().split(/\s+/).filter(Boolean);
}

function deny(admin, message) {
  chat.sendError(admin, message);
}

mp.registerCommand("jail", async (admin, fullText) => {
  if (getAdminLevel(admin) < 1) return deny(admin, "Нет доступа к команде.");

  try {
    const args = parseCommandArgs(fullText);
    const targetId = Number(args.shift());
    const minutes = Number(args.shift());
    const reason = core.sanitizeReason(args.join(" "));
    const target = getPlayerById(targetId);

    if (!target || !Number.isInteger(minutes) || !reason) {
      return deny(admin, "Использование: /jail [ID] [минуты] [причина]");
    }

    if (!target.character || !getUuid(target)) {
      return deny(admin, "Персонаж игрока ещё не загружен.");
    }

    if (!core.normalizeMinutes(minutes, config.MAX_JAIL_MINUTES)) {
      return deny(admin, `Срок должен быть от 1 до ${config.MAX_JAIL_MINUTES} минут.`);
    }

    const result = await issueSentence(admin, target, minutes, reason);
    if (!result.ok) return deny(admin, "Не удалось выдать деморган.");

    chat.sendSuccess(
      admin,
      `${getPlayerName(target)} [ID ${target.id}] помещён в деморган на ${minutes} мин.`
    );
    chat.sendGlobal(
      `[JAIL] ${getPlayerName(admin)} поместил ${getPlayerName(target)} в деморган на ${minutes} мин. Причина: ${reason}`,
      "#ff6666"
    );
    adminLogs.logAdminAction(admin, `выдал JAIL на ${minutes} мин.`, target, reason);
  } catch (error) {
    console.error("[JAIL] /jail error:", error);
    deny(admin, "Ошибка выполнения /jail.");
  }
});

mp.registerCommand("unjail", async (admin, fullText) => {
  if (getAdminLevel(admin) < 1) return deny(admin, "Нет доступа к команде.");

  try {
    const args = parseCommandArgs(fullText);
    const reference = Number(args.shift());
    const reason = core.sanitizeReason(args.join(" ")) || "Снято администратором";

    if (!Number.isInteger(reference) || reference < 0) {
      return deny(admin, "Использование: /unjail [ID/UUID] [причина]");
    }

    const byServerId = getPlayerById(reference);
    const target = byServerId?.character ? byServerId : getPlayerByUuid(reference);
    const uuid = target ? getUuid(target) : reference;

    if (!Number.isInteger(uuid) || uuid <= 0) {
      return deny(admin, "Игрок или UUID не найден.");
    }

    const released = await releaseCharacter(uuid, target, { notify: true, teleport: true });
    if (!released) return deny(admin, `У персонажа #${uuid} нет активного деморгана.`);

    const targetName = target ? getPlayerName(target) : `UUID #${uuid}`;
    chat.sendSuccess(admin, `${targetName} освобождён из деморгана.`);
    chat.sendGlobal(
      `[UNJAIL] ${getPlayerName(admin)} освободил ${targetName}. Причина: ${reason}`,
      "#66cc66"
    );

    if (target) {
      adminLogs.logAdminAction(admin, "снял JAIL", target, reason);
    } else {
      adminLogs.sendAdminAction({
        type: adminLogs.ADMIN_ACTION_TYPES.STAFF,
        message: `${getPlayerName(admin)} #${getUuid(admin)} снял оффлайн JAIL персонажу #${uuid}. Причина: ${reason}`,
      });
    }
  } catch (error) {
    console.error("[JAIL] /unjail error:", error);
    deny(admin, "Ошибка выполнения /unjail.");
  }
});

mp.events.add("twinkle:character:loaded", (player) => {
  checkJailOnCharacterLoaded(player).catch((error) => {
    console.error("[JAIL] Character load check error:", error);
  });
});

mp.events.add("s:jail:requestSync", (player) => {
  const now = Date.now();
  if (now - Number(player?.__lastJailSyncRequestAt || 0) < 1000) return;
  player.__lastJailSyncRequestAt = now;

  if (!isJailed(player)) {
    syncClient(player);
    updateHud(player);
    return;
  }

  enforcePlayer(player);
  syncClient(player);
  updateHud(player);
});

mp.events.add("playerDeath", (player) => {
  if (!isJailed(player)) return;

  setTimeout(() => {
    if (!isJailed(player) || !exists(player)) return;

    deathService.revivePlayer(
      player,
      new mp.Vector3(config.CELL_SPAWN.x, config.CELL_SPAWN.y, config.CELL_SPAWN.z)
    );
    teleportToCell(player, true);
    applyPrisonOutfit(player);
  }, 150);
});

mp.events.add("playerQuit", (player) => {
  activePlayers.delete(player);

  if (player?.jailData) {
    saveProgress(player).catch((error) => {
      console.error("[JAIL] Quit save error:", error);
    });
  }
});

setInterval(() => {
  for (const player of Array.from(activePlayers)) {
    if (!isJailed(player) || !exists(player)) {
      activePlayers.delete(player);
      continue;
    }

    enforcePlayer(player);
  }
}, config.POSITION_CHECK_INTERVAL_MS);

setInterval(() => {
  for (const player of Array.from(activePlayers)) {
    const state = player?.jailData;
    if (!state || !exists(player) || player.__jailTickBusy) continue;

    player.__jailTickBusy = true;

    Promise.resolve().then(async () => {
      if (player.jailData !== state) return;

      const consumed = core.consumeElapsedTime(state, Date.now());
      state.remainingSeconds = consumed.remainingSeconds;
      state.lastTickMs = consumed.lastTickMs;

      if (state.remainingSeconds <= 0) {
        const released = await releaseCharacter(state.uuid, player, {
          notify: false,
          teleport: true,
        });

        if (released && exists(player)) {
          chat.sendSuccess(player, "Вы отбыли срок и освобождены из деморгана.");
        }
        return;
      }

      setSyncedState(player, true);
      syncClient(player);
      updateHud(player);

      if (
        Date.now() - Number(state.lastPersistAtMs || 0) >=
        config.PERSIST_INTERVAL_SECONDS * 1000
      ) {
        await saveProgress(player);
      }
    }).catch((error) => {
      console.error("[JAIL] Sentence tick error:", error);
    }).finally(() => {
      player.__jailTickBusy = false;
    });
  }
}, config.SENTENCE_TICK_INTERVAL_MS);

global.twinkleJail = {
  isJailed,
  ensureSchema,
  issueSentence,
  releaseCharacter,
  checkJailOnCharacterLoaded,
  buildHudTask,
  getClientPayload,
};

ensureSchema()
  .then(() => console.log("[JAIL] Main database schema ready"))
  .catch((error) => console.error("[JAIL] Schema error:", error));

module.exports = global.twinkleJail;
