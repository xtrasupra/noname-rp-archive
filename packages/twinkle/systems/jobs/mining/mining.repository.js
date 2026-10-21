"use strict";

const crypto = require("crypto");
const db = require("../../../database/query.js");
const { rows } = require("../../../utils/player.js");
const inventory = require("../../inventory/inventory.service.js");
const config = require("./mining.config.js");

let schemaPromise = null;
const LEASE_TOKEN_FIELD = "_leaseToken";

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function levelForXp(xp) {
  const amount = Math.max(0, Number(xp || 0));
  return [...config.levels].reverse().find((entry) => amount >= entry.xp) || config.levels[0];
}

function normalizeProfile(row = {}) {
  const xp = Math.max(0, Number(row.xp || 0));
  const level = levelForXp(xp);
  return {
    characterUuid: Number(row.character_uuid || 0),
    xp,
    level: level.level,
    levelName: level.name,
    kgMultiplier: level.kgMultiplier,
    stonesMined: Math.max(0, Number(row.stones_mined || 0)),
    kgSold: Math.max(0, Number(row.kg_sold || 0)),
    kgSpilled: Math.max(0, Number(row.kg_spilled || 0)),
    haulTrips: Math.max(0, Number(row.haul_trips || 0)),
    totalEarned: Math.max(0, Number(row.total_earned || 0)),
  };
}

function normalizeEntitlement(row = {}) {
  return {
    type: String(row.entitlement_type || row.type || ""),
    remainingMs: Math.max(0, Number(row.remaining_ms || row.remainingMs || 0)),
    itemUid: row.item_uid ? String(row.item_uid) : null,
    payload: parseJson(row.payload, {}),
    updatedAt: row.updated_at || null,
  };
}

function leaseTokenOf(payload) {
  return String(parseJson(payload, {})?.[LEASE_TOKEN_FIELD] || "");
}

function payloadWithLeaseToken(payload, token = crypto.randomBytes(12).toString("hex")) {
  return { ...parseJson(payload, {}), [LEASE_TOKEN_FIELD]: String(token) };
}

function boundDefinition(type) {
  const definition = config.entitlements?.[String(type || "")];
  return definition?.itemId ? definition : null;
}

function boundDescriptor(type, remainingMs, itemUid, payload) {
  const definition = boundDefinition(type);
  if (!definition) return null;
  const safeRemainingMs = Math.max(0, Math.round(Number(remainingMs || 0)));
  return {
    active: safeRemainingMs > 0,
    itemId: definition.itemId,
    documentKey: `mining:entitlement:${definition.id}`,
    expectedUid: itemUid,
    metadata: {
      entitlementType: definition.id,
      remainingMs: safeRemainingMs,
      leaseToken: leaseTokenOf(payload) || null,
    },
  };
}

async function reconcileBasicTool(characterUuid, active, expectedUid = "") {
  const uuid = Number(characterUuid || 0);
  if (!uuid) throw new Error("Персонаж не загружен.");
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const reconciled = await inventory.reconcileBoundItemInstances(connection, uuid, [{
        active: Boolean(active),
        itemId: config.basicTool.itemId,
        documentKey: config.basicTool.documentKey,
        expectedUid: String(expectedUid || ""),
        metadata: { miningJobTool: config.basicTool.id },
      }]);
      await connection.commit();
      return {
        inventory: reconciled.inventory || null,
        item: reconciled.entries?.[0]?.item || null,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

function normalizeCargo(row = {}) {
  return {
    id: Number(row.id || 0),
    cargoKey: String(row.cargo_key || ""),
    characterUuid: Number(row.character_uuid || 0),
    kind: String(row.kind || "ore"),
    resourceId: String(row.resource_id || ""),
    resourceName: String(row.resource_name || ""),
    sourceStoneId: row.source_stone_id ? String(row.source_stone_id) : null,
    kg: Math.max(0, Number(row.kg || 0)),
    unitPrice: Math.max(0, Number(row.unit_price || 0)),
    payout: Math.max(0, Number(row.payout || 0)),
    xpReward: Math.max(0, Number(row.xp_reward || 0)),
    status: String(row.status || ""),
    destination: parseJson(row.destination, null),
    metrics: parseJson(row.metrics, {}),
    createdAt: row.created_at || null,
    settledAt: row.settled_at || null,
  };
}

function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = Promise.all([
    db.query(`
      CREATE TABLE IF NOT EXISTS mining_profiles (
        character_uuid BIGINT UNSIGNED NOT NULL,
        xp INT UNSIGNED NOT NULL DEFAULT 0,
        level TINYINT UNSIGNED NOT NULL DEFAULT 1,
        stones_mined INT UNSIGNED NOT NULL DEFAULT 0,
        kg_sold DECIMAL(14,2) UNSIGNED NOT NULL DEFAULT 0,
        kg_spilled DECIMAL(14,2) UNSIGNED NOT NULL DEFAULT 0,
        haul_trips INT UNSIGNED NOT NULL DEFAULT 0,
        total_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (character_uuid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS mining_entitlements (
        character_uuid BIGINT UNSIGNED NOT NULL,
        entitlement_type VARCHAR(32) NOT NULL,
        remaining_ms INT UNSIGNED NOT NULL DEFAULT 0,
        item_uid VARCHAR(128) NULL,
        payload LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (character_uuid, entitlement_type),
        KEY idx_mining_entitlements_active (entitlement_type, remaining_ms)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS mining_cargo (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        cargo_key VARCHAR(160) NOT NULL,
        character_uuid BIGINT UNSIGNED NOT NULL,
        kind ENUM('ore','haul','settlement') NOT NULL,
        resource_id VARCHAR(32) NOT NULL,
        resource_name VARCHAR(96) NOT NULL,
        source_stone_id VARCHAR(96) NULL,
        kg DECIMAL(12,2) UNSIGNED NOT NULL DEFAULT 0,
        unit_price INT UNSIGNED NOT NULL DEFAULT 0,
        payout INT UNSIGNED NOT NULL DEFAULT 0,
        xp_reward INT UNSIGNED NOT NULL DEFAULT 0,
        status ENUM('settled','carried','sold','spilled','loaded','delivered','cancelled') NOT NULL,
        destination LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        metrics LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        active_character_uuid BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status IN ('carried','loaded') THEN character_uuid ELSE NULL END) STORED,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        settled_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_mining_cargo_key (cargo_key),
        UNIQUE KEY uq_mining_one_active_cargo (active_character_uuid),
        KEY idx_mining_cargo_character (character_uuid, status, created_at),
        KEY idx_mining_cargo_stone (source_stone_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
  ]).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function ensureProfile(connection, characterUuid) {
  await connection.query(
    "INSERT INTO mining_profiles (character_uuid) VALUES (?) ON DUPLICATE KEY UPDATE character_uuid = VALUES(character_uuid)",
    [characterUuid]
  );
}

const WAREHOUSE_TOTAL_KEY = "warehouse:total";
const WAREHOUSE_COAL_KEY = "warehouse:coal";

async function ensureWarehouseRows(connection) {
  await connection.query(
    `INSERT IGNORE INTO mining_cargo
      (cargo_key, character_uuid, kind, resource_id, resource_name, kg, status, metrics)
     VALUES
      (?, 0, 'settlement', 'all', 'Общий склад шахты', 0, 'settled', ?),
      (?, 0, 'settlement', 'coal', 'Уголь на складе', 0, 'settled', ?)`,
    [
      WAREHOUSE_TOTAL_KEY, JSON.stringify({ warehouse: true, aggregate: true }),
      WAREHOUSE_COAL_KEY, JSON.stringify({ warehouse: true, aggregate: false }),
    ]
  );
}

function normalizeStockRows(stockRows = []) {
  const byKey = new Map((stockRows || []).map((row) => [String(row.cargo_key || ""), Math.max(0, Number(row.kg || 0))]));
  return {
    totalKg: byKey.get(WAREHOUSE_TOTAL_KEY) || 0,
    coalKg: byKey.get(WAREHOUSE_COAL_KEY) || 0,
  };
}

async function getStock() {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await ensureWarehouseRows(connection);
    const [stockRows] = await connection.query(
      "SELECT cargo_key, kg FROM mining_cargo WHERE cargo_key IN (?, ?)",
      [WAREHOUSE_TOTAL_KEY, WAREHOUSE_COAL_KEY]
    );
    return normalizeStockRows(stockRows);
  });
}

async function getProfile(characterUuid) {
  const uuid = Number(characterUuid || 0);
  if (!uuid) return normalizeProfile();
  await ensureSchema();
  await db.query("INSERT INTO mining_profiles (character_uuid) VALUES (?) ON DUPLICATE KEY UPDATE character_uuid = VALUES(character_uuid)", [uuid]);
  const result = await db.query("SELECT * FROM mining_profiles WHERE character_uuid = ? LIMIT 1", [uuid]);
  return normalizeProfile(rows(result)?.[0]);
}

async function getEntitlements(characterUuid) {
  const uuid = Number(characterUuid || 0);
  if (!uuid) return [];
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [rawRows] = await connection.query(
        `SELECT entitlement_type, remaining_ms, item_uid, payload, updated_at
           FROM mining_entitlements
          WHERE character_uuid = ?
          FOR UPDATE`,
        [uuid]
      );
      const rowByType = new Map((rawRows || []).map((row) => [String(row.entitlement_type), row]));

      for (const row of rawRows || []) {
        if (Number(row.remaining_ms || 0) <= 0) continue;
        if (!boundDefinition(row.entitlement_type)) continue;
        const parsedPayload = parseJson(row.payload, {});
        if (leaseTokenOf(parsedPayload)) continue;
        row.payload = payloadWithLeaseToken(parsedPayload);
        await connection.query(
          "UPDATE mining_entitlements SET payload = ? WHERE character_uuid = ? AND entitlement_type = ?",
          [JSON.stringify(row.payload), uuid, row.entitlement_type]
        );
      }

      const descriptors = Object.values(config.entitlements || {}).map((definition) => {
        const row = rowByType.get(definition.id);
        return boundDescriptor(
          definition.id,
          row?.remaining_ms || 0,
          row?.item_uid || null,
          row?.payload || {}
        );
      }).filter(Boolean);
      const reconciled = await inventory.reconcileBoundItemInstances(connection, uuid, descriptors);
      const inventoryEntryByKey = new Map((reconciled.entries || []).map((entry) => [entry.documentKey, entry]));

      for (const definition of Object.values(config.entitlements || {})) {
        const row = rowByType.get(definition.id);
        if (!row) continue;
        const entry = inventoryEntryByKey.get(`mining:entitlement:${definition.id}`);
        const nextItemUid = Number(row.remaining_ms || 0) > 0 ? String(entry?.item?.uid || "") || null : null;
        row.item_uid = nextItemUid;
        await connection.query(
          "UPDATE mining_entitlements SET item_uid = ? WHERE character_uuid = ? AND entitlement_type = ?",
          [nextItemUid, uuid, definition.id]
        );
      }

      await connection.commit();
      return (rawRows || [])
        .filter((row) => Number(row.remaining_ms || 0) > 0 && !String(row.entitlement_type || "").startsWith("voucher:"))
        .map(normalizeEntitlement);
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function saveEntitlement(characterUuid, type, remainingMs, payload = undefined, options = {}) {
  const uuid = Number(characterUuid || 0);
  const safeType = String(type || "").slice(0, 32);
  if (!uuid || !safeType) return false;
  await ensureSchema();
  const safeRemainingMs = Math.max(0, Math.round(Number(remainingMs || 0)));
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [existingRows] = await connection.query(
        `SELECT remaining_ms, item_uid, payload
           FROM mining_entitlements
          WHERE character_uuid = ? AND entitlement_type = ?
          LIMIT 1 FOR UPDATE`,
        [uuid, safeType]
      );
      const existing = existingRows?.[0];
      if (!existing) {
        await connection.rollback();
        return { ok: false, reason: "missing", inventory: null, remainingMs: 0, itemUid: null };
      }

      const currentPayload = parseJson(existing.payload, {});
      const nextPayload = payload === undefined ? currentPayload : parseJson(payload, {});
      const currentLeaseToken = leaseTokenOf(currentPayload);
      const expectedLeaseToken = leaseTokenOf(nextPayload);
      if (!options.force && currentLeaseToken && currentLeaseToken !== expectedLeaseToken) {
        await connection.rollback();
        return {
          ok: false,
          reason: "stale_generation",
          inventory: null,
          remainingMs: Math.max(0, Math.round(Number(existing.remaining_ms || 0))),
          itemUid: existing.item_uid ? String(existing.item_uid) : null,
        };
      }

      // A running session may finish an older autosave after a newer one. Within
      // one lease generation remaining time is monotonic; only purchase/activate
      // is allowed to reset it back to the full duration.
      const currentRemainingMs = Math.max(0, Math.round(Number(existing.remaining_ms || 0)));
      const persistedRemainingMs = options.force
        ? safeRemainingMs
        : Math.min(currentRemainingMs, safeRemainingMs);
      let nextItemUid = existing.item_uid ? String(existing.item_uid) : null;
      const descriptor = boundDescriptor(safeType, persistedRemainingMs, nextItemUid, nextPayload);
      let reconciledInventory = null;
      if (descriptor) {
        const reconciled = await inventory.reconcileBoundItemInstances(connection, uuid, [descriptor]);
        reconciledInventory = reconciled.inventory || null;
        nextItemUid = persistedRemainingMs > 0 ? String(reconciled.entries?.[0]?.item?.uid || "") || null : null;
      }
      await connection.query(
        `UPDATE mining_entitlements
            SET remaining_ms = ?, item_uid = ?, payload = ?, updated_at = NOW()
          WHERE character_uuid = ? AND entitlement_type = ?`,
        [persistedRemainingMs, nextItemUid, JSON.stringify(nextPayload), uuid, safeType]
      );
      await connection.commit();
      return {
        ok: true,
        inventory: reconciledInventory,
        remainingMs: persistedRemainingMs,
        itemUid: nextItemUid,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function expireEntitlement(characterUuid, type, payload = undefined, options = {}) {
  return saveEntitlement(characterUuid, type, 0, payload, { force: Boolean(options.force) });
}

async function releaseEntitlementToVoucher(characterUuid, type, expectedItemUid, expectedLeaseToken = "") {
  const uuid = Number(characterUuid || 0);
  const safeType = String(type || "");
  const definition = boundDefinition(safeType);
  if (!uuid || !definition?.voucherItemId) throw new Error("Эту аренду нельзя передать.");
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [entitlementRows] = await connection.query(
        `SELECT remaining_ms, item_uid, payload FROM mining_entitlements
          WHERE character_uuid = ? AND entitlement_type = ? LIMIT 1 FOR UPDATE`,
        [uuid, safeType]
      );
      const entitlement = entitlementRows?.[0];
      const remainingMs = Math.max(0, Math.round(Number(entitlement?.remaining_ms || 0)));
      const storedItemUid = String(entitlement?.item_uid || "");
      const storedPayload = parseJson(entitlement?.payload, {});
      if (!entitlement || remainingMs <= 0 || !storedItemUid || storedItemUid !== String(expectedItemUid || "")) {
        throw new Error("Аренда уже недоступна или предмет изменился.");
      }
      if (expectedLeaseToken && leaseTokenOf(storedPayload) !== String(expectedLeaseToken)) {
        throw new Error("Устаревший экземпляр аренды отклонён.");
      }

      await inventory.reconcileBoundItemInstances(connection, uuid, [{
        active: false,
        documentKey: `mining:entitlement:${safeType}`,
      }]);
      const claimType = `voucher:${crypto.randomBytes(10).toString("hex")}`;
      const claimToken = crypto.randomBytes(16).toString("hex");
      const staged = await inventory.stageInternalItemInstance(connection, uuid, definition.voucherItemId, {
        rentalType: safeType,
        claimType,
        claimToken,
        remainingMs,
      }, storedItemUid);
      await connection.query(
        `UPDATE mining_entitlements
            SET remaining_ms = 0, item_uid = NULL, updated_at = NOW()
          WHERE character_uuid = ? AND entitlement_type = ?`,
        [uuid, safeType]
      );
      await connection.query(
        `INSERT INTO mining_entitlements
          (character_uuid, entitlement_type, remaining_ms, item_uid, payload)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid, claimType, remainingMs, staged.item.uid, JSON.stringify({
          rentalType: safeType,
          claimToken,
          sourceLeaseToken: leaseTokenOf(storedPayload) || null,
        })]
      );
      await connection.commit();
      return { ok: true, inventory: staged.inventory, voucher: staged.item, type: safeType, remainingMs };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function redeemRentalVoucher(characterUuid, item) {
  const uuid = Number(characterUuid || 0);
  const claimType = String(item?.claimType || "");
  const claimToken = String(item?.claimToken || "");
  const rentalType = String(item?.rentalType || "");
  const itemUid = String(item?.uid || "");
  const definition = boundDefinition(rentalType);
  if (!uuid || !claimType.startsWith("voucher:") || !claimToken || !itemUid || !definition) {
    throw new Error("Некорректный ваучер аренды.");
  }
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [claimRows] = await connection.query(
        `SELECT remaining_ms, item_uid, payload FROM mining_entitlements
          WHERE entitlement_type = ? LIMIT 1 FOR UPDATE`,
        [claimType]
      );
      const claim = claimRows?.[0];
      const claimPayload = parseJson(claim?.payload, {});
      const remainingMs = Math.max(0, Math.round(Number(claim?.remaining_ms || 0)));
      if (!claim || remainingMs <= 0 || String(claim.item_uid || "") !== itemUid
        || String(claimPayload.claimToken || "") !== claimToken || String(claimPayload.rentalType || "") !== rentalType) {
        throw new Error("Этот ваучер уже использован или недействителен.");
      }

      await connection.query(
        `INSERT INTO mining_entitlements (character_uuid, entitlement_type, remaining_ms, payload)
         VALUES (?, ?, 0, NULL)
         ON DUPLICATE KEY UPDATE character_uuid = VALUES(character_uuid)`,
        [uuid, rentalType]
      );
      const [currentRows] = await connection.query(
        `SELECT remaining_ms FROM mining_entitlements
          WHERE character_uuid = ? AND entitlement_type = ? LIMIT 1 FOR UPDATE`,
        [uuid, rentalType]
      );
      if (Number(currentRows?.[0]?.remaining_ms || 0) > 0) throw new Error("Такая аренда уже активна.");
      if (definition.tool) {
        const [toolRows] = await connection.query(
          `SELECT entitlement_type FROM mining_entitlements
            WHERE character_uuid = ? AND entitlement_type IN ('drill','golden_pickaxe') AND remaining_ms > 0 LIMIT 1 FOR UPDATE`,
          [uuid]
        );
        if (toolRows?.length) throw new Error("Сначала завершите текущую аренду инструмента.");
      }

      await inventory.stageConsumeItemByUid(connection, uuid, itemUid, item.itemId || item.id, 1);
      const payload = payloadWithLeaseToken({ source: "rental_voucher" });
      const staged = await inventory.stageBoundItemInstance(connection, uuid, definition.itemId, {
        documentKey: `mining:entitlement:${rentalType}`,
        entitlementType: rentalType,
        remainingMs,
        leaseToken: leaseTokenOf(payload),
      });
      await connection.query(
        `UPDATE mining_entitlements
            SET remaining_ms = 0, item_uid = NULL, updated_at = NOW()
          WHERE entitlement_type = ? AND item_uid = ?`,
        [claimType, itemUid]
      );
      await connection.query(
        `UPDATE mining_entitlements
            SET remaining_ms = ?, item_uid = ?, payload = ?, updated_at = NOW()
          WHERE character_uuid = ? AND entitlement_type = ?`,
        [remainingMs, staged.item.uid, JSON.stringify(payload), uuid, rentalType]
      );
      await connection.commit();
      return { ok: true, inventory: staged.inventory, item: staged.item, type: rentalType, remainingMs, payload };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function purchaseEntitlement(characterUuid, definition, payload = {}, options = {}) {
  const uuid = Number(characterUuid || 0);
  if (!uuid || !definition?.id || !definition?.price || !definition?.durationMs) throw new Error("Некорректная аренда.");
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      await ensureProfile(connection, uuid);
      const [cashRows] = await connection.query("SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [uuid]);
      if (!cashRows?.[0]) throw new Error("Персонаж не найден.");
      const cashBefore = Math.max(0, Number(cashRows[0].cash || 0));
      if (cashBefore < Number(definition.price)) throw new Error("Недостаточно наличных.");

      const [existingRows] = await connection.query(
        "SELECT remaining_ms, item_uid FROM mining_entitlements WHERE character_uuid = ? AND entitlement_type = ? LIMIT 1 FOR UPDATE",
        [uuid, definition.id]
      );
      if (Number(existingRows?.[0]?.remaining_ms || 0) > 0) throw new Error("Эта аренда уже активна.");

      if (definition.tool) {
        const [toolRows] = await connection.query(
          "SELECT entitlement_type FROM mining_entitlements WHERE character_uuid = ? AND entitlement_type IN ('drill','golden_pickaxe') AND remaining_ms > 0 LIMIT 1 FOR UPDATE",
          [uuid]
        );
        if (toolRows?.length) throw new Error("Сначала дождитесь окончания текущего инструмента.");
      }

      const leasePayload = payloadWithLeaseToken(payload);
      let staged = null;
      if (definition.itemId) {
        staged = await inventory.stageBoundItemInstance(connection, uuid, definition.itemId, {
          documentKey: `mining:entitlement:${definition.id}`,
          entitlementType: definition.id,
          remainingMs: Number(definition.durationMs),
          leaseToken: leaseTokenOf(leasePayload),
        });
      }
      const itemUid = staged?.item?.uid || null;
      await connection.query(
        `INSERT INTO mining_entitlements (character_uuid, entitlement_type, remaining_ms, item_uid, payload)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE remaining_ms = VALUES(remaining_ms), item_uid = VALUES(item_uid), payload = VALUES(payload), updated_at = NOW()`,
        [uuid, definition.id, Number(definition.durationMs), itemUid, JSON.stringify(leasePayload)]
      );
      const cashAfter = cashBefore - Number(definition.price);
      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, uuid]);
      await connection.commit();
      return { cashBefore, cashAfter, itemUid, inventory: staged?.inventory || null, payload: leasePayload };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function activateEffect(characterUuid, type, durationMs, payload = {}) {
  const uuid = Number(characterUuid || 0);
  const safeType = String(type || "").slice(0, 32);
  const safeDurationMs = Math.min(3600000, Math.max(0, Math.round(Number(durationMs || 0))));
  if (!uuid) throw new Error("Персонаж не загружен.");
  if (!safeType || !safeDurationMs) throw new Error("Некорректный эффект.");
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      // Materialize the unique entitlement row first. Concurrent activations then
      // serialize on the same primary-key record instead of both extending it.
      await connection.query(
        `INSERT INTO mining_entitlements (character_uuid, entitlement_type, remaining_ms, payload)
         VALUES (?, ?, 0, NULL)
         ON DUPLICATE KEY UPDATE character_uuid = VALUES(character_uuid)`,
        [uuid, safeType]
      );
      const [existingRows] = await connection.query(
        `SELECT remaining_ms
           FROM mining_entitlements
          WHERE character_uuid = ? AND entitlement_type = ?
          LIMIT 1 FOR UPDATE`,
        [uuid, safeType]
      );
      if (Number(existingRows?.[0]?.remaining_ms || 0) > 0) {
        throw new Error("Этот эффект уже активен.");
      }
      const effectPayload = payloadWithLeaseToken(payload);
      await connection.query(
        `UPDATE mining_entitlements
            SET remaining_ms = ?, payload = ?, updated_at = NOW()
          WHERE character_uuid = ? AND entitlement_type = ?`,
        [safeDurationMs, JSON.stringify(effectPayload), uuid, safeType]
      );
      await connection.commit();
      return { ok: true, payload: effectPayload, remainingMs: safeDurationMs };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function activateEffectFromInventory(characterUuid, type, durationMs, payload, itemUid, itemId) {
  const uuid = Number(characterUuid || 0);
  const safeType = String(type || "").slice(0, 32);
  const safeDurationMs = Math.min(3600000, Math.max(0, Math.round(Number(durationMs || 0))));
  if (!uuid || !safeType || !safeDurationMs || !itemUid || !itemId) throw new Error("Некорректный эффект.");
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query(
        `INSERT INTO mining_entitlements (character_uuid, entitlement_type, remaining_ms, payload)
         VALUES (?, ?, 0, NULL)
         ON DUPLICATE KEY UPDATE character_uuid = VALUES(character_uuid)`,
        [uuid, safeType]
      );
      const [existingRows] = await connection.query(
        `SELECT remaining_ms FROM mining_entitlements
          WHERE character_uuid = ? AND entitlement_type = ? LIMIT 1 FOR UPDATE`,
        [uuid, safeType]
      );
      if (Number(existingRows?.[0]?.remaining_ms || 0) > 0) throw new Error("Этот эффект уже активен.");
      const staged = await inventory.stageConsumeItemByUid(connection, uuid, itemUid, itemId, 1);
      const effectPayload = payloadWithLeaseToken(payload);
      await connection.query(
        `UPDATE mining_entitlements
            SET remaining_ms = ?, item_uid = NULL, payload = ?, updated_at = NOW()
          WHERE character_uuid = ? AND entitlement_type = ?`,
        [safeDurationMs, JSON.stringify(effectPayload), uuid, safeType]
      );
      await connection.commit();
      return { ok: true, payload: effectPayload, remainingMs: safeDurationMs, inventory: staged.inventory };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function getActiveCargo(characterUuid) {
  const uuid = Number(characterUuid || 0);
  if (!uuid) return null;
  await ensureSchema();
  const result = await db.query(
    "SELECT * FROM mining_cargo WHERE character_uuid = ? AND status IN ('carried','loaded') ORDER BY id DESC LIMIT 1",
    [uuid]
  );
  return rows(result)?.[0] ? normalizeCargo(rows(result)[0]) : null;
}

async function getSettledStoneIds(cyclePrefix) {
  await ensureSchema();
  const result = await db.query(
    "SELECT source_stone_id FROM mining_cargo WHERE kind = 'settlement' AND source_stone_id LIKE ?",
    [`${String(cyclePrefix || "")}%`]
  );
  return new Set((rows(result) || []).map((row) => String(row.source_stone_id || "")));
}

async function settleRock(stone, allocations) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [sentinel] = await connection.query(
        `INSERT IGNORE INTO mining_cargo
          (cargo_key, character_uuid, kind, resource_id, resource_name, source_stone_id, status, metrics)
         VALUES (?, 0, 'settlement', ?, ?, ?, 'settled', ?)`,
        [`stone:${stone.id}`, stone.resource.id, stone.resource.name, stone.id, JSON.stringify({ cycle: stone.cycle, slot: stone.slot })]
      );
      if (Number(sentinel.affectedRows || 0) !== 1) {
        const [existingCargoRows] = await connection.query(
          "SELECT * FROM mining_cargo WHERE source_stone_id = ? AND kind = 'ore' ORDER BY id ASC",
          [stone.id]
        );
        await connection.rollback();
        return { settled: false, duplicate: true, cargo: (existingCargoRows || []).map(normalizeCargo) };
      }

      const cargo = [];
      for (const allocation of allocations) {
        const uuid = Number(allocation.characterUuid || 0);
        if (!uuid) continue;
        await ensureProfile(connection, uuid);
        const [activeRows] = await connection.query(
          "SELECT id FROM mining_cargo WHERE character_uuid = ? AND status IN ('carried','loaded') LIMIT 1 FOR UPDATE",
          [uuid]
        );
        if (activeRows?.length) continue;
        const cargoKey = `ore:${stone.id}:${uuid}`;
        const oreMetrics = {
          share: allocation.share,
          accuracy: allocation.accuracy,
          yieldMultiplier: allocation.yieldMultiplier,
          origin: {
            x: Number(stone.position?.x || 0),
            y: Number(stone.position?.y || 0),
            z: Number(stone.position?.z || 0),
          },
        };
        const [insert] = await connection.query(
          `INSERT IGNORE INTO mining_cargo
            (cargo_key, character_uuid, kind, resource_id, resource_name, source_stone_id, kg, unit_price, payout, xp_reward, status, metrics)
           VALUES (?, ?, 'ore', ?, ?, ?, ?, ?, ?, ?, 'carried', ?)`,
          [
            cargoKey,
            uuid,
            stone.resource.id,
            stone.resource.name,
            stone.id,
            Number(allocation.kg).toFixed(2),
            Number(stone.resource.pricePerKg),
            Math.max(0, Math.round(allocation.payout)),
            Math.max(1, Math.round(allocation.xp)),
            JSON.stringify(oreMetrics),
          ]
        );
        if (Number(insert.affectedRows || 0) === 1) {
          cargo.push(normalizeCargo({
            id: insert.insertId,
            cargo_key: cargoKey,
            character_uuid: uuid,
            kind: "ore",
            resource_id: stone.resource.id,
            resource_name: stone.resource.name,
            source_stone_id: stone.id,
            kg: allocation.kg,
            unit_price: stone.resource.pricePerKg,
            payout: allocation.payout,
            xp_reward: allocation.xp,
            status: "carried",
            metrics: oreMetrics,
          }));
        }
      }
      await connection.commit();
      return { settled: true, duplicate: false, cargo };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function settleCargo(characterUuid, cargoId, expectedStatus, finalStatus, profileFields, payoutOverride = null) {
  const uuid = Number(characterUuid || 0);
  const id = Number(cargoId || 0);
  if (!uuid || !id) throw new Error("Груз не найден.");
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      await ensureProfile(connection, uuid);
      const [cargoRows] = await connection.query("SELECT * FROM mining_cargo WHERE id = ? AND character_uuid = ? LIMIT 1 FOR UPDATE", [id, uuid]);
      const cargo = cargoRows?.[0];
      if (!cargo) throw new Error("Груз не найден.");
      if (cargo.status === finalStatus) {
        const [currentProfileRows] = await connection.query("SELECT * FROM mining_profiles WHERE character_uuid = ? LIMIT 1", [uuid]);
        const [currentCashRows] = await connection.query("SELECT cash FROM characters WHERE uuid = ? LIMIT 1", [uuid]);
        await connection.commit();
        const currentCash = Math.max(0, Number(currentCashRows?.[0]?.cash || 0));
        return { alreadySettled: true, cargo: normalizeCargo(cargo), cashBefore: currentCash, cashAfter: currentCash, profile: normalizeProfile(currentProfileRows?.[0]), oldLevel: normalizeProfile(currentProfileRows?.[0]).level, newLevel: normalizeProfile(currentProfileRows?.[0]).level };
      }
      if (cargo.status !== expectedStatus) throw new Error("Этот груз уже недоступен.");

      const [cashRows] = await connection.query("SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [uuid]);
      if (!cashRows?.[0]) throw new Error("Персонаж не найден.");
      const [profileRows] = await connection.query("SELECT * FROM mining_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE", [uuid]);
      const profile = normalizeProfile(profileRows?.[0]);
      const cashBefore = Math.max(0, Number(cashRows[0].cash || 0));
      const payout = payoutOverride === null
        ? Math.max(0, Number(cargo.payout || 0))
        : Math.max(0, Math.round(Number(payoutOverride || 0)));
      const xpReward = Math.max(0, Number(cargo.xp_reward || 0));
      const kgIncrement = profileFields.useCargoKg ? Math.max(0, Number(cargo.kg || 0)) : Math.max(0, Number(profileFields.kg || 0));
      const nextXp = profile.xp + xpReward;
      const nextLevel = levelForXp(nextXp).level;
      const cashAfter = cashBefore + payout;

      const [updated] = await connection.query(
        "UPDATE mining_cargo SET status = ?, settled_at = NOW(), updated_at = NOW() WHERE id = ? AND character_uuid = ? AND status = ?",
        [finalStatus, id, uuid, expectedStatus]
      );
      if (Number(updated.affectedRows || 0) !== 1) throw new Error("Груз уже обработан.");
      if (cargo.kind === "ore" && finalStatus === "sold") {
        const depositedKg = Math.max(0, Number(cargo.kg || 0));
        await ensureWarehouseRows(connection);
        await connection.query("UPDATE mining_cargo SET kg = kg + ? WHERE cargo_key = ?", [depositedKg, WAREHOUSE_TOTAL_KEY]);
        if (String(cargo.resource_id || "") === "coal") {
          await connection.query("UPDATE mining_cargo SET kg = kg + ? WHERE cargo_key = ?", [depositedKg, WAREHOUSE_COAL_KEY]);
        }
      }
      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, uuid]);
      await connection.query(
        `UPDATE mining_profiles SET
           xp = ?, level = ?, total_earned = total_earned + ?,
           stones_mined = stones_mined + ?, kg_sold = kg_sold + ?, haul_trips = haul_trips + ?
         WHERE character_uuid = ?`,
        [nextXp, nextLevel, payout, profileFields.stones || 0, kgIncrement, profileFields.hauls || 0, uuid]
      );
      const [nextProfileRows] = await connection.query("SELECT * FROM mining_profiles WHERE character_uuid = ? LIMIT 1", [uuid]);
      await connection.commit();
      return { alreadySettled: false, cargo: normalizeCargo({ ...cargo, payout, status: finalStatus }), cashBefore, cashAfter, profile: normalizeProfile(nextProfileRows?.[0]), oldLevel: profile.level, newLevel: nextLevel };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

function sellOre(characterUuid, cargoId, payoutOverride = null) {
  return settleCargo(characterUuid, cargoId, "carried", "sold", { stones: 1, useCargoKg: true, hauls: 0 }, payoutOverride);
}

async function spillOre(characterUuid, cargoId) {
  const uuid = Number(characterUuid || 0);
  const id = Number(cargoId || 0);
  if (!uuid || !id) return { spilled: false };
  await ensureSchema();
  const result = await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [cargoRows] = await connection.query("SELECT * FROM mining_cargo WHERE id = ? AND character_uuid = ? LIMIT 1 FOR UPDATE", [id, uuid]);
      const cargo = cargoRows?.[0];
      if (!cargo || cargo.status !== "carried") {
        await connection.commit();
        return { spilled: false, already: true };
      }
      const [update] = await connection.query("UPDATE mining_cargo SET status = 'spilled', settled_at = NOW() WHERE id = ? AND character_uuid = ? AND status = 'carried'", [id, uuid]);
      if (Number(update.affectedRows || 0) !== 1) throw new Error("Не удалось рассыпать груз.");
      await ensureProfile(connection, uuid);
      await connection.query("UPDATE mining_profiles SET kg_spilled = kg_spilled + ? WHERE character_uuid = ?", [Number(cargo.kg || 0), uuid]);
      await connection.commit();
      return { spilled: true, cargo: normalizeCargo({ ...cargo, status: "spilled" }) };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
  return result;
}

async function createHaul(characterUuid, vehicleId, destination, weightKg, payout, xpReward, metrics = {}) {
  const uuid = Number(characterUuid || 0);
  const reservedKg = Math.max(0, Number(weightKg || 0));
  if (!uuid) throw new Error("Персонаж не загружен.");
  if (reservedKg < Number(config.haul.minimumStockKg || 1)) throw new Error("На общем складе пока недостаточно породы для рейса.");
  await ensureSchema();
  const cargoKey = `haul:${uuid}:${Date.now()}:${crypto.randomBytes(5).toString("hex")}`;
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        "SELECT * FROM mining_cargo WHERE character_uuid = ? AND status IN ('carried','loaded') ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [uuid]
      );
      if (activeRows?.[0]) {
        if (activeRows[0].kind === "haul" && activeRows[0].status === "loaded") {
          await connection.commit();
          return normalizeCargo(activeRows[0]);
        }
        throw new Error("Сначала завершите текущую доставку.");
      }

      await ensureWarehouseRows(connection);
      const [stockRows] = await connection.query(
        "SELECT cargo_key, kg FROM mining_cargo WHERE cargo_key = ? FOR UPDATE",
        [WAREHOUSE_TOTAL_KEY]
      );
      const stock = normalizeStockRows(stockRows);
      if (stock.totalKg + 0.001 < reservedKg) {
        throw new Error(`На общем складе только ${stock.totalKg.toFixed(1)} кг породы. Дождитесь работы шахтёров.`);
      }
      const [totalDebit] = await connection.query(
        "UPDATE mining_cargo SET kg = kg - ? WHERE cargo_key = ? AND kg >= ?",
        [reservedKg, WAREHOUSE_TOTAL_KEY, reservedKg]
      );
      if (Number(totalDebit.affectedRows || 0) !== 1) {
        throw new Error("Породу уже забрал другой водитель. Дождитесь новой сдачи.");
      }
      const [insert] = await connection.query(
        `INSERT INTO mining_cargo
          (cargo_key, character_uuid, kind, resource_id, resource_name, kg, payout, xp_reward, status, destination, metrics)
         VALUES (?, ?, 'haul', 'mixed_ore', 'Сборный груз породы', ?, ?, ?, 'loaded', ?, ?)`,
        [cargoKey, uuid, reservedKg.toFixed(2), Math.round(payout), Math.round(xpReward), JSON.stringify(destination), JSON.stringify({ vehicleId, ...metrics })]
      );
      await connection.commit();
      return normalizeCargo({ id: insert.insertId, cargo_key: cargoKey, character_uuid: uuid, kind: "haul", resource_id: "mixed_ore", resource_name: "Сборный груз породы", kg: reservedKg, payout, xp_reward: xpReward, status: "loaded", destination, metrics: { vehicleId, ...metrics } });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

function deliverHaul(characterUuid, cargoId, payoutOverride = null) {
  return settleCargo(characterUuid, cargoId, "loaded", "delivered", { stones: 0, kg: 0, hauls: 1 }, payoutOverride);
}

async function cancelActiveHaul(characterUuid, reason) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [cargoRows] = await connection.query(
        "SELECT id, kg FROM mining_cargo WHERE character_uuid = ? AND kind = 'haul' AND status = 'loaded' LIMIT 1 FOR UPDATE",
        [Number(characterUuid || 0)]
      );
      const cargo = cargoRows?.[0];
      if (!cargo) { await connection.commit(); return 0; }
      const [updated] = await connection.query(
        `UPDATE mining_cargo SET status = 'cancelled', settled_at = NOW(), metrics = JSON_SET(COALESCE(metrics, '{}'), '$.cancelReason', ?)
          WHERE id = ? AND status = 'loaded'`,
        [String(reason || "cancelled").slice(0, 96), Number(cargo.id)]
      );
      if (Number(updated.affectedRows || 0) === 1) {
        const returnedKg = Math.max(0, Number(cargo.kg || 0));
        await ensureWarehouseRows(connection);
        await connection.query("UPDATE mining_cargo SET kg = kg + ? WHERE cargo_key = ?", [returnedKg, WAREHOUSE_TOTAL_KEY]);
      }
      await connection.commit();
      return Number(updated.affectedRows || 0);
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

module.exports = {
  activateEffect,
  activateEffectFromInventory,
  cancelActiveHaul,
  createHaul,
  deliverHaul,
  ensureSchema,
  expireEntitlement,
  getActiveCargo,
  getEntitlements,
  getProfile,
  getStock,
  getSettledStoneIds,
  levelForXp,
  purchaseEntitlement,
  reconcileBasicTool,
  redeemRentalVoucher,
  releaseEntitlementToVoucher,
  saveEntitlement,
  sellOre,
  settleRock,
  spillOre,
};
