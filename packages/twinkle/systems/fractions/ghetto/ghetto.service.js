"use strict";

const db = require("../../../database/query.js");
const logsDb = require("../../../database/logs.js");
const fractionService = require("../fraction.service.js");
const chat = require("../../chat/chat.service.js");
const config = require("./ghetto.config.js");
const {
  rows,
  parseJson,
  playerFractionId,
  playerAdminLevel,
} = require("../../../utils/player.js");

const activeCaptures = new Map();
let zones = [];
let schemaPromise = null;
let tickTimer = null;

function isInside(zone, position) {
  if (!zone || !position) return false;
  return (
    Number(position.x) >= Number(zone.min_x) &&
    Number(position.x) <= Number(zone.max_x) &&
    Number(position.y) >= Number(zone.min_y) &&
    Number(position.y) <= Number(zone.max_y)
  );
}

function findZoneByPosition(position) {
  return zones.find((zone) => isInside(zone, position)) || null;
}

function isAllowedFactionType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return config.ALLOWED_FACTION_TYPES.some((allowed) => normalized.includes(allowed));
}

function normalizePosition(value) {
  if (!value || typeof value !== "object") return null;
  const source = value.position || value.coords || value.coordinates || value;
  const x = Number(source?.x);
  const y = Number(source?.y);
  const z = Number(source?.z || 0);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, z } : null;
}

function findPositionDeep(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const direct = normalizePosition(value);
  if (direct) return direct;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findPositionDeep(child, seen);
    if (found) return found;
  }
  return null;
}

function findFactionNpcPosition(fractionId) {
  try {
    const npcs = require("../../npcDialog/npcDialog.config.js");
    const list = Array.isArray(npcs) ? npcs : [];
    const npc = list.find(
      (item) =>
        Number(item?.fractionId || item?.factionId || item?.fraction_id || 0) ===
        Number(fractionId)
    );
    return findPositionDeep(npc);
  } catch {
    return null;
  }
}

async function syncTitleZonesFromFactionAnchors() {
  await ensureSchema();
  const factionRows = rows(
    await db.query(
      `SELECT fraction_id, spawn_points, settings
         FROM fractions
        WHERE is_active = 1 AND type = 'ghetto'
        ORDER BY fraction_id`
    )
  ) || [];
  const occupiedZoneIds = new Set();
  const changes = [];
  const touchedZoneIds = new Set();

  for (const faction of factionRows) {
    const factionId = Number(faction.fraction_id);
    const previousTitleZone = zones.find(
      (zone) => Number(zone.title_fraction_id) === factionId
    );
    const spawnPosition = findPositionDeep(parseJson(faction.spawn_points, []));
    const settings = parseJson(faction.settings, {});
    const settingsPosition =
      findPositionDeep(settings?.headquarters) ||
      findPositionDeep(settings?.hq) ||
      findPositionDeep(settings?.npc) ||
      findPositionDeep(settings?.titleNpc) ||
      findPositionDeep(settings?.spawn);
    const position = spawnPosition || settingsPosition || findFactionNpcPosition(factionId);
    if (!position) continue;

    const targetZone = findZoneByPosition(position);
    if (!targetZone || occupiedZoneIds.has(Number(targetZone.id))) continue;
    occupiedZoneIds.add(Number(targetZone.id));

    if (
      Number(targetZone.is_title) === 1 &&
      Number(targetZone.title_fraction_id) === factionId
    ) {
      continue;
    }

    await db.withConn(async (conn) => {
      await conn.beginTransaction();
      try {
        await conn.query(
          "UPDATE ghetto_zones SET is_title = 0, title_fraction_id = 0 WHERE title_fraction_id = ?",
          [factionId]
        );
        await conn.query(
          `UPDATE ghetto_zones
              SET is_title = 1, title_fraction_id = ?, owner_fraction_id = ?, captured_at = NOW()
            WHERE id = ?`,
          [factionId, factionId, Number(targetZone.id)]
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });
    if (previousTitleZone) touchedZoneIds.add(Number(previousTitleZone.id));
    touchedZoneIds.add(Number(targetZone.id));
    changes.push({ factionId, zoneId: Number(targetZone.id), code: targetZone.code });
  }

  if (changes.length) {
    await loadZones();
    syncZoneIds(touchedZoneIds);
    console.log("[GHETTO] Title zones synchronized:", changes);
  }
  return changes;
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await fractionService.ensureSchema();
    await db.query(`
      CREATE TABLE IF NOT EXISTS ghetto_zones (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(96) NOT NULL,
        min_x DECIMAL(10,3) NOT NULL,
        max_x DECIMAL(10,3) NOT NULL,
        min_y DECIMAL(10,3) NOT NULL,
        max_y DECIMAL(10,3) NOT NULL,
        z DECIMAL(10,3) NOT NULL DEFAULT 20,
        owner_fraction_id INT NOT NULL DEFAULT 0,
        is_title TINYINT(1) NOT NULL DEFAULT 0,
        title_fraction_id INT NOT NULL DEFAULT 0,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        captured_at DATETIME NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ghetto_zone_code (code),
        INDEX idx_ghetto_owner (owner_fraction_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ghetto_captures (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        zone_id INT NOT NULL,
        attacker_fraction_id INT NOT NULL,
        defender_fraction_id INT NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        attacker_score INT NOT NULL DEFAULT 0,
        defender_score INT NOT NULL DEFAULT 0,
        attacker_kills INT NOT NULL DEFAULT 0,
        defender_kills INT NOT NULL DEFAULT 0,
        winner_fraction_id INT NULL,
        started_by_uuid BIGINT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ends_at DATETIME NOT NULL,
        finished_at DATETIME NULL,
        INDEX idx_ghetto_capture_zone (zone_id, status),
        INDEX idx_ghetto_capture_started (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await logsDb.ensureLogsSchema();

    const existingColumns = await db.query("SHOW COLUMNS FROM ghetto_zones");
    const columnNames = new Set(rows(existingColumns).map((column) => column.Field));
    if (!columnNames.has("is_title")) {
      await db.query(
        "ALTER TABLE ghetto_zones ADD COLUMN is_title TINYINT(1) NOT NULL DEFAULT 0 AFTER owner_fraction_id"
      );
    }
    if (!columnNames.has("title_fraction_id")) {
      await db.query(
        "ALTER TABLE ghetto_zones ADD COLUMN title_fraction_id INT NOT NULL DEFAULT 0 AFTER is_title"
      );
    }

    for (const zone of config.ZONES) {
      await db.query(
        `INSERT INTO ghetto_zones
           (code, name, min_x, max_x, min_y, max_y, z, owner_fraction_id,
            is_title, title_fraction_id, enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           min_x = VALUES(min_x), max_x = VALUES(max_x),
           min_y = VALUES(min_y), max_y = VALUES(max_y),
           z = VALUES(z),
           owner_fraction_id = IF(
             VALUES(is_title) = 1,
             VALUES(title_fraction_id),
             owner_fraction_id
           ),
           is_title = VALUES(is_title),
           title_fraction_id = VALUES(title_fraction_id),
           enabled = 1,
           sort_order = VALUES(sort_order)`,
        [
          zone.code,
          zone.name,
          zone.minX,
          zone.maxX,
          zone.minY,
          zone.maxY,
          zone.z,
          zone.ownerFactionId,
          zone.isTitle ? 1 : 0,
          zone.titleFactionId,
          zone.sortOrder,
        ]
      );
    }
    await db.query(
      `DELETE FROM ghetto_zones
        WHERE code NOT IN (${config.ZONES.map(() => "?").join(",")})`,
      config.ZONES.map((zone) => zone.code)
    );

    await db.query(
      `UPDATE ghetto_captures
          SET status = 'cancelled', finished_at = NOW()
        WHERE status = 'active'`
    );
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function loadZones() {
  await ensureSchema();
  const result = await db.query(`
    SELECT z.*,
           f.name AS owner_name,
           f.short_name AS owner_short_name,
           f.type AS owner_type,
           f.color_hex AS owner_color_hex,
           f.rage_color AS owner_rage_color
      FROM ghetto_zones z
      LEFT JOIN fractions f ON f.fraction_id = z.owner_fraction_id
     WHERE z.enabled = 1
     ORDER BY z.sort_order ASC, z.id ASC
  `);
  zones = rows(result) || [];
  return zones;
}

function serializeCapture(capture) {
  if (!capture) return null;
  return {
    id: capture.id,
    zoneId: capture.zoneId,
    attackerFractionId: capture.attackerFractionId,
    defenderFractionId: capture.defenderFractionId,
    attackerName: capture.attackerName,
    defenderName: capture.defenderName,
    attackerScore: capture.attackerScore,
    defenderScore: capture.defenderScore,
    attackerKills: capture.attackerKills,
    defenderKills: capture.defenderKills,
    endsAt: capture.endsAt,
  };
}

function serializeZone(zone) {
  const minX = Number(zone.min_x);
  const maxX = Number(zone.max_x);
  const minY = Number(zone.min_y);
  const maxY = Number(zone.max_y);
  const ownerFractionId = Number(zone.owner_fraction_id || 0);
  const colorHex = /^#[0-9a-f]{6}$/i.test(String(zone.owner_color_hex || ""))
    ? String(zone.owner_color_hex).toLowerCase()
    : "#6f6878";
  const rageColor = Number.isInteger(Number(zone.owner_rage_color))
    ? Math.max(0, Math.min(255, Number(zone.owner_rage_color)))
    : 0;
  return {
    id: Number(zone.id),
    code: zone.code,
    name: zone.name,
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    radius: Math.min(Math.abs(maxX - minX), Math.abs(maxY - minY)) / 2,
    z: Number(zone.z),
    ownerFractionId,
    ownerName: zone.owner_short_name || zone.owner_name || "Нейтральная",
    isTitle: Number(zone.is_title || 0) === 1,
    titleFractionId: Number(zone.title_fraction_id || 0),
    color: colorHex,
    rageColor,
    capture: serializeCapture(activeCaptures.get(Number(zone.id))),
  };
}

function snapshot() {
  return zones.map(serializeZone);
}

function safeCall(player, eventName, args = []) {
  try {
    if (player && mp.players.exists(player)) player.call(eventName, args);
  } catch (error) {
    console.error(`[GHETTO] ${eventName}:`, error.message);
  }
}

function syncPlayer(player) {
  safeCall(player, "client:ghetto:sync", [
    JSON.stringify({
      zones: snapshot(),
      playerFractionId: playerFractionId(player),
    }),
  ]);
}

function syncZone(zoneId) {
  const zone = zones.find((item) => Number(item.id) === Number(zoneId));
  if (!zone) return;
  const payload = JSON.stringify(serializeZone(zone));
  mp.players.forEach((player) => {
    safeCall(player, "client:ghetto:update", [payload]);
  });
}

function syncZoneIds(zoneIds) {
  const uniqueIds = new Set(Array.from(zoneIds || []).map(Number).filter(Boolean));
  for (const zoneId of uniqueIds) syncZone(zoneId);
}

function factionPlayersInZone(fractionId, zone) {
  const result = [];
  mp.players.forEach((player) => {
    if (
      result.length < config.MAX_PARTICIPANTS_PER_SIDE &&
      player &&
      !player.isDead &&
      Number(player.health || 0) > 0 &&
      Number(player.dimension || 0) === 0 &&
      playerFractionId(player) === Number(fractionId) &&
      isInside(zone, player.position)
    ) {
      result.push(player);
    }
  });
  return result;
}

async function getFaction(fractionId) {
  const result = await db.query(
    "SELECT fraction_id, name, short_name, type, is_active FROM fractions WHERE fraction_id = ? LIMIT 1",
    [Number(fractionId)]
  );
  return rows(result)?.[0] || null;
}

async function startCapture(player) {
  await ensureSchema();
  if (!player || Number(player.dimension || 0) !== 0) {
    throw new Error("Начать захват можно только в основном мире.");
  }

  const zone = findZoneByPosition(player.position);
  if (!zone) throw new Error("Вы должны находиться внутри территории гетто.");
  if (Number(zone.is_title) === 1) {
    throw new Error("Титульную территорию банды захватывать нельзя.");
  }
  if (activeCaptures.has(Number(zone.id))) throw new Error("Эта территория уже захватывается.");

  const actor = await fractionService.getActor(player);
  fractionService.hasPermission(actor, "territoryWar") ||
    (() => {
      throw new Error("У вашего ранга нет права начинать захват.");
    })();

  if (!isAllowedFactionType(actor.type)) {
    throw new Error("Захватывать гетто могут только криминальные фракции.");
  }

  const attackerId = Number(actor.fraction_id);
  const defenderId = Number(zone.owner_fraction_id || 0);
  if (attackerId === defenderId) throw new Error("Эта территория уже принадлежит вашей фракции.");

  const attackers = factionPlayersInZone(attackerId, zone);
  if (attackers.length < config.MIN_ATTACKERS_TO_START && playerAdminLevel(player) < 7) {
    throw new Error(`Для начала захвата в зоне должно быть минимум ${config.MIN_ATTACKERS_TO_START} участника.`);
  }

  if (zone.captured_at) {
    const elapsedMinutes = (Date.now() - new Date(zone.captured_at).getTime()) / 60000;
    if (elapsedMinutes < config.CAPTURE_COOLDOWN_MINUTES && playerAdminLevel(player) < 7) {
      throw new Error(
        `Территория недавно захватывалась. Осталось ${Math.ceil(
          config.CAPTURE_COOLDOWN_MINUTES - elapsedMinutes
        )} мин.`
      );
    }
  }

  for (const capture of activeCaptures.values()) {
    if (
      capture.attackerFractionId === attackerId ||
      capture.defenderFractionId === attackerId ||
      (defenderId &&
        (capture.attackerFractionId === defenderId || capture.defenderFractionId === defenderId))
    ) {
      throw new Error("Одна из фракций уже участвует в другом захвате.");
    }
  }

  const attacker = await getFaction(attackerId);
  const defender = defenderId ? await getFaction(defenderId) : null;
  const endsAt = Date.now() + config.CAPTURE_DURATION_SECONDS * 1000;
  const result = await db.query(
    `INSERT INTO ghetto_captures
       (zone_id, attacker_fraction_id, defender_fraction_id, started_by_uuid, ends_at)
     VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))`,
    [zone.id, attackerId, defenderId, actor.uuid, Math.floor(endsAt / 1000)]
  );

  const capture = {
    id: Number(result.insertId),
    zoneId: Number(zone.id),
    attackerFractionId: attackerId,
    defenderFractionId: defenderId,
    attackerName: attacker?.short_name || attacker?.name || `Фракция #${attackerId}`,
    defenderName: defender?.short_name || defender?.name || "Нейтральная",
    attackerScore: 0,
    defenderScore: 0,
    attackerKills: 0,
    defenderKills: 0,
    endsAt,
    lastPersistAt: 0,
    lastBroadcastSignature: "0:0:0:0",
    finishing: false,
  };

  activeCaptures.set(Number(zone.id), capture);
  chat.sendGlobal(
    `[КАПТ] ${capture.attackerName} начали захват территории «${zone.name}» у ${capture.defenderName}.`,
    "#c392ff"
  );
  syncZone(zone.id);
  return capture;
}

async function persistCapture(capture) {
  capture.lastPersistAt = Date.now();
  await db.query(
    `UPDATE ghetto_captures
        SET attacker_score = ?, defender_score = ?,
            attacker_kills = ?, defender_kills = ?
      WHERE id = ? AND status = 'active'`,
    [
      Math.round(capture.attackerScore),
      Math.round(capture.defenderScore),
      capture.attackerKills,
      capture.defenderKills,
      capture.id,
    ]
  );
}

async function finishCapture(capture, winnerFractionId, reason = "time") {
  if (!capture || capture.finishing) return;
  capture.finishing = true;

  const zone = zones.find((item) => Number(item.id) === Number(capture.zoneId));
  const attackerWon = Number(winnerFractionId) === Number(capture.attackerFractionId);
  const winnerName = attackerWon ? capture.attackerName : capture.defenderName;

  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      await conn.query(
        `UPDATE ghetto_captures
            SET status = 'finished', attacker_score = ?, defender_score = ?,
                attacker_kills = ?, defender_kills = ?, winner_fraction_id = ?,
                finished_at = NOW()
          WHERE id = ?`,
        [
          Math.round(capture.attackerScore),
          Math.round(capture.defenderScore),
          capture.attackerKills,
          capture.defenderKills,
          Number(winnerFractionId || 0),
          capture.id,
        ]
      );
      if (zone && winnerFractionId) {
        await conn.query(
          "UPDATE ghetto_zones SET owner_fraction_id = ?, captured_at = NOW() WHERE id = ?",
          [Number(winnerFractionId), Number(zone.id)]
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });

  activeCaptures.delete(Number(capture.zoneId));
  await loadZones();
  chat.sendGlobal(
    `[КАПТ] ${winnerName || "Защитники"} удержали территорию «${zone?.name || capture.zoneId}» (${reason}).`,
    attackerWon ? "#72e6b1" : "#ff8da5"
  );
  syncZone(capture.zoneId);
}

async function captureTick() {
  for (const capture of activeCaptures.values()) {
    if (capture.finishing) continue;
    const zone = zones.find((item) => Number(item.id) === Number(capture.zoneId));
    if (!zone) continue;

    const attackers = factionPlayersInZone(capture.attackerFractionId, zone).length;
    const defenders = capture.defenderFractionId
      ? factionPlayersInZone(capture.defenderFractionId, zone).length
      : 0;
    const difference = Math.max(-3, Math.min(3, attackers - defenders));

    if (difference > 0) {
      capture.attackerScore = Math.min(
        config.SCORE_LIMIT,
        capture.attackerScore + difference * config.SCORE_PER_PLAYER_SECOND
      );
    } else if (difference < 0) {
      capture.defenderScore = Math.min(
        config.SCORE_LIMIT,
        capture.defenderScore + Math.abs(difference) * config.SCORE_PER_PLAYER_SECOND
      );
    }

    if (Date.now() - capture.lastPersistAt >= 5000) {
      persistCapture(capture).catch((error) => console.error("[GHETTO] persist:", error));
    }

    if (capture.attackerScore >= config.SCORE_LIMIT) {
      finishCapture(capture, capture.attackerFractionId, "100 очков").catch(console.error);
    } else if (capture.defenderScore >= config.SCORE_LIMIT) {
      finishCapture(capture, capture.defenderFractionId, "100 очков").catch(console.error);
    } else if (Date.now() >= capture.endsAt) {
      const winner =
        capture.attackerScore > capture.defenderScore
          ? capture.attackerFractionId
          : capture.defenderFractionId;
      finishCapture(capture, winner, "время вышло").catch(console.error);
    }
  }

  for (const capture of activeCaptures.values()) {
    if (capture.finishing) continue;
    const signature = [
      Math.round(capture.attackerScore),
      Math.round(capture.defenderScore),
      capture.attackerKills,
      capture.defenderKills,
    ].join(":");
    if (signature === capture.lastBroadcastSignature) continue;
    capture.lastBroadcastSignature = signature;
    syncZone(capture.zoneId);
  }
}

async function handleDeath(victim, reason, killer) {
  if (!victim || !killer || victim === killer) return;
  const victimFractionId = playerFractionId(victim);
  const killerFractionId = playerFractionId(killer);
  if (!victimFractionId || !killerFractionId || victimFractionId === killerFractionId) return;

  const zone = findZoneByPosition(victim.position);
  const capture = zone ? activeCaptures.get(Number(zone.id)) : null;
  if (!capture || capture.finishing) return;

  const sides = [capture.attackerFractionId, capture.defenderFractionId];
  if (!sides.includes(killerFractionId) || !sides.includes(victimFractionId)) return;

  if (killerFractionId === capture.attackerFractionId) {
    capture.attackerKills += 1;
    capture.attackerScore = Math.min(
      config.SCORE_LIMIT,
      capture.attackerScore + config.SCORE_PER_KILL
    );
  } else {
    capture.defenderKills += 1;
    capture.defenderScore = Math.min(
      config.SCORE_LIMIT,
      capture.defenderScore + config.SCORE_PER_KILL
    );
  }

  await logsDb.logQuery(
    `INSERT INTO ghetto_capture_kills
       (capture_id, killer_uuid, victim_uuid, killer_fraction_id, victim_fraction_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      capture.id,
      fractionService.playerUuid(killer) || null,
      fractionService.playerUuid(victim) || null,
      killerFractionId,
      victimFractionId,
    ]
  );
  capture.lastBroadcastSignature = [
    Math.round(capture.attackerScore),
    Math.round(capture.defenderScore),
    capture.attackerKills,
    capture.defenderKills,
  ].join(":");
  syncZone(capture.zoneId);
}

async function setZoneOwner(zoneId, fractionId) {
  await ensureSchema();
  const zoneResult = await db.query(
    "SELECT is_title, title_fraction_id FROM ghetto_zones WHERE id = ? LIMIT 1",
    [Number(zoneId)]
  );
  const zone = rows(zoneResult)?.[0];
  if (!zone) throw new Error("Территория не найдена.");
  if (
    Number(zone.is_title) === 1 &&
    Number(fractionId) !== Number(zone.title_fraction_id)
  ) {
    throw new Error("Владельца титульной территории изменить нельзя.");
  }
  await db.query(
    "UPDATE ghetto_zones SET owner_fraction_id = ?, captured_at = NOW() WHERE id = ?",
    [Math.max(0, Number(fractionId || 0)), Number(zoneId)]
  );
  await loadZones();
  syncZone(zoneId);
}

async function setZoneTitle(zoneId, fractionId) {
  await ensureSchema();
  const previousTitleZone = zones.find(
    (item) => Number(item.title_fraction_id) === Number(fractionId)
  );
  const zone = rows(
    await db.query("SELECT id FROM ghetto_zones WHERE id = ? LIMIT 1", [Number(zoneId)])
  )?.[0];
  if (!zone) throw new Error("Территория не найдена.");
  const faction = rows(
    await db.query(
      "SELECT fraction_id, type FROM fractions WHERE fraction_id = ? AND is_active = 1 LIMIT 1",
      [Number(fractionId)]
    )
  )?.[0];
  if (!faction || !isAllowedFactionType(faction.type)) {
    throw new Error("Укажите действующую гетто-фракцию.");
  }

  await db.withConn(async (conn) => {
    await conn.beginTransaction();
    try {
      await conn.query(
        `UPDATE ghetto_zones
            SET is_title = 0, title_fraction_id = 0
          WHERE title_fraction_id = ?`,
        [Number(fractionId)]
      );
      await conn.query(
        `UPDATE ghetto_zones
            SET is_title = 1, title_fraction_id = ?, owner_fraction_id = ?, captured_at = NOW()
          WHERE id = ?`,
        [Number(fractionId), Number(fractionId), Number(zoneId)]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
  await loadZones();
  syncZoneIds([previousTitleZone?.id, zoneId]);
}

async function initialize() {
  await loadZones();
  await syncTitleZonesFromFactionAnchors();
  if (!tickTimer) tickTimer = setInterval(captureTick, 1000);
  console.log(`[GHETTO] Loaded ${zones.length} territories`);
}

module.exports = {
  ensureSchema,
  initialize,
  loadZones,
  snapshot,
  syncPlayer,
  syncZone,
  syncZoneIds,
  startCapture,
  handleDeath,
  findZoneByPosition,
  setZoneOwner,
  setZoneTitle,
  syncTitleZonesFromFactionAnchors,
  playerFractionId,
  activeCaptures,
};
