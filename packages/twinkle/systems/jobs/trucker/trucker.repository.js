"use strict";

const db = require("../../../database/query.js");
const { rows } = require("../../../utils/player.js");
const config = require("./trucker.config.js");
const { DOCUMENT_ITEM_IDS, LICENSE_DOCUMENT_ITEM_IDS } = require("../../documents/document.items.js");

let schemaPromise = null;
let lastRotationBucket = null;
let rotationPromise = null;

function sqlDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function inventoryContains(rawInventory, requiredItemIds) {
  let inventory = rawInventory;
  if (typeof inventory === "string") {
    try { inventory = JSON.parse(inventory); } catch { return false; }
  }
  const required = new Set((requiredItemIds || []).map(String));
  if (!required.size || !inventory || typeof inventory !== "object") return false;
  return Object.values(inventory.items || {}).some((item) => {
    const id = String(item?.itemId || item?.id || "");
    return required.has(id) && Number(item?.amount ?? item?.count ?? 1) > 0;
  });
}

function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = Promise.all([
    db.query(`
      CREATE TABLE IF NOT EXISTS trucker_profiles (
        character_uuid BIGINT UNSIGNED NOT NULL,
        xp INT UNSIGNED NOT NULL DEFAULT 0,
        rank_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
        skill_points INT UNSIGNED NOT NULL DEFAULT 0,
        skill_progress INT UNSIGNED NOT NULL DEFAULT 0,
        completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
        failed_orders INT UNSIGNED NOT NULL DEFAULT 0,
        cancellation_debt INT UNSIGNED NOT NULL DEFAULT 0,
        on_time_orders INT UNSIGNED NOT NULL DEFAULT 0,
        late_orders INT UNSIGNED NOT NULL DEFAULT 0,
        total_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
        total_distance_m BIGINT UNSIGNED NOT NULL DEFAULT 0,
        total_fuel_used DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (character_uuid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS trucker_skill_unlocks (
        character_uuid BIGINT UNSIGNED NOT NULL,
        skill_id VARCHAR(64) NOT NULL,
        spent_points INT UNSIGNED NOT NULL,
        unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (character_uuid, skill_id),
        KEY idx_trucker_skill_id (skill_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS trucker_rentals (
        lease_id VARCHAR(48) NOT NULL,
        character_uuid BIGINT UNSIGNED NOT NULL,
        vehicle_config_id VARCHAR(64) NOT NULL,
        vehicle_model VARCHAR(64) NOT NULL,
        vehicle_type ENUM('pickup','van','truck') NOT NULL,
        trailer_model VARCHAR(64) NULL,
        rent_price INT UNSIGNED NOT NULL,
        orders_remaining TINYINT UNSIGNED NOT NULL,
        last_consumed_order_id VARCHAR(64) NULL,
        status ENUM('active','ended','expired','destroyed') NOT NULL DEFAULT 'active',
        claimed_at DATETIME NULL,
        active_character_uuid BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN character_uuid ELSE NULL END) STORED,
        end_reason VARCHAR(96) NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        ended_at DATETIME NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (lease_id),
        UNIQUE KEY uq_trucker_rentals_one_active (active_character_uuid),
        KEY idx_trucker_rentals_character (character_uuid, status, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS trucker_orders (
        order_id VARCHAR(64) NOT NULL,
        refresh_bucket BIGINT UNSIGNED NOT NULL,
        slot_index TINYINT UNSIGNED NOT NULL,
        template_id VARCHAR(32) NOT NULL,
        status ENUM('available','accepted','delivered','expired','failed','cancelled') NOT NULL DEFAULT 'available',
        cargo VARCHAR(128) NOT NULL,
        company VARCHAR(128) NOT NULL,
        cargo_kind VARCHAR(32) NOT NULL,
        vehicle_type ENUM('pickup','van','truck') NOT NULL,
        required_license VARCHAR(32) NOT NULL,
        required_rank TINYINT UNSIGNED NOT NULL,
        required_skill VARCHAR(64) NULL,
        trailer_model VARCHAR(64) NULL,
        trailer_livery INT NULL,
        trailer_color1 INT NULL,
        trailer_color2 INT NULL,
        weight_kg INT UNSIGNED NOT NULL,
        origin_x DOUBLE NOT NULL,
        origin_y DOUBLE NOT NULL,
        origin_z DOUBLE NOT NULL,
        origin_heading FLOAT NOT NULL DEFAULT 0,
        destination_x DOUBLE NOT NULL,
        destination_y DOUBLE NOT NULL,
        destination_z DOUBLE NOT NULL,
        destination_heading FLOAT NOT NULL DEFAULT 0,
        route_distance_m INT UNSIGNED NOT NULL,
        time_limit_seconds INT UNSIGNED NOT NULL,
        base_pay INT UNSIGNED NOT NULL,
        accepted_by BIGINT UNSIGNED NULL,
        accepted_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (order_id),
        UNIQUE KEY uq_trucker_rotation_slot (refresh_bucket, slot_index),
        KEY idx_trucker_orders_pool (refresh_bucket, status, expires_at),
        KEY idx_trucker_orders_acceptor (accepted_by, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS trucker_active_deliveries (
        character_uuid BIGINT UNSIGNED NOT NULL,
        order_id VARCHAR(64) NOT NULL,
        lease_id VARCHAR(48) NOT NULL,
        vehicle_runtime_id INT NULL,
        vehicle_config_id VARCHAR(64) NOT NULL,
        vehicle_model VARCHAR(64) NOT NULL,
        vehicle_type ENUM('pickup','van','truck') NOT NULL,
        trailer_model VARCHAR(64) NULL,
        stage ENUM('to_pickup','loading','to_dropoff','unloading') NOT NULL DEFAULT 'to_pickup',
        cargo_validity DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 100,
        accepted_at DATETIME NOT NULL,
        loaded_at DATETIME NULL,
        deadline_at DATETIME NOT NULL,
        fuel_start DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
        fuel_used DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
        actual_distance_m BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (character_uuid),
        UNIQUE KEY uq_trucker_active_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS trucker_delivery_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        character_uuid BIGINT UNSIGNED NOT NULL,
        order_id VARCHAR(64) NOT NULL,
        lease_id VARCHAR(48) NOT NULL,
        cargo VARCHAR(128) NOT NULL,
        company VARCHAR(128) NOT NULL,
        cargo_kind VARCHAR(32) NOT NULL,
        vehicle_type VARCHAR(16) NOT NULL,
        vehicle_model VARCHAR(64) NOT NULL,
        weight_kg INT UNSIGNED NOT NULL,
        planned_distance_m INT UNSIGNED NOT NULL,
        actual_distance_m BIGINT UNSIGNED NOT NULL DEFAULT 0,
        accepted_at DATETIME NOT NULL,
        loaded_at DATETIME NULL,
        delivered_at DATETIME NULL,
        deadline_at DATETIME NOT NULL,
        early_seconds INT UNSIGNED NOT NULL DEFAULT 0,
        late_seconds INT UNSIGNED NOT NULL DEFAULT 0,
        cargo_validity DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 100,
        fuel_used DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
        base_pay INT UNSIGNED NOT NULL DEFAULT 0,
        early_bonus INT UNSIGNED NOT NULL DEFAULT 0,
        skill_bonus INT UNSIGNED NOT NULL DEFAULT 0,
        damage_penalty INT UNSIGNED NOT NULL DEFAULT 0,
        late_penalty INT UNSIGNED NOT NULL DEFAULT 0,
        final_payout INT UNSIGNED NOT NULL DEFAULT 0,
        cancellation_penalty INT UNSIGNED NOT NULL DEFAULT 0,
        xp_earned INT UNSIGNED NOT NULL DEFAULT 0,
        skill_progress_earned INT UNSIGNED NOT NULL DEFAULT 0,
        skill_points_earned INT UNSIGNED NOT NULL DEFAULT 0,
        result_status ENUM('delivered','failed','cancelled') NOT NULL,
        failure_reason VARCHAR(96) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_trucker_history_order (order_id),
        KEY idx_trucker_history_character (character_uuid, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
  ]).then(async () => {
    // Keep an already-running twinkledb installation compatible without a
    // destructive dump re-import or a separate migration database/file.
    const currentOrderColumns = await db.query("SHOW COLUMNS FROM `trucker_orders`");
    const currentHistoryColumns = await db.query("SHOW COLUMNS FROM `trucker_delivery_history`");
    const currentProfileColumns = await db.query("SHOW COLUMNS FROM `trucker_profiles`");
    const currentOrderStatus = (currentOrderColumns || []).find((column) => String(column.Field) === "status");
    const currentPenalty = (currentHistoryColumns || []).find((column) => String(column.Field) === "cancellation_penalty");
    const currentDebt = (currentProfileColumns || []).find((column) => String(column.Field) === "cancellation_debt");
    const currentStatusType = String(currentOrderStatus?.Type || "").toLowerCase().replace(/\s+/g, "");
    const legacyStatusType = "enum('available','accepted','delivered','expired','failed')";
    const expectedStatusType = "enum('available','accepted','delivered','expired','failed','cancelled')";
    const statusShapeValid = String(currentOrderStatus?.Null || "").toUpperCase() === "NO" &&
      currentOrderStatus?.Default != null && String(currentOrderStatus.Default) === "available";
    const shouldUpgradeStatus = currentStatusType === legacyStatusType && statusShapeValid;
    if (currentStatusType !== expectedStatusType && !shouldUpgradeStatus) {
      throw new Error(`SQL contract mismatch in trucker_orders.status: unsafe type ${currentOrderStatus?.Type || "missing"}.`);
    }
    if (currentStatusType === expectedStatusType && !statusShapeValid) {
      throw new Error("SQL contract mismatch in trucker_orders.status: nullable or invalid default.");
    }

    const validateOptionalUnsignedCounter = (column, label) => {
      if (!column) return;
      const type = String(column.Type || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (
        !/^int(?:\(\d+\))? unsigned$/.test(type) ||
        String(column.Null || "").toUpperCase() !== "NO" ||
        column.Default == null ||
        Number(column.Default) !== 0
      ) {
        throw new Error(`SQL contract mismatch in ${label}.`);
      }
    };
    validateOptionalUnsignedCounter(currentPenalty, "trucker_delivery_history.cancellation_penalty");
    validateOptionalUnsignedCounter(currentDebt, "trucker_profiles.cancellation_debt");

    if (shouldUpgradeStatus) {
      await db.query(
        `ALTER TABLE trucker_orders
         MODIFY COLUMN status ENUM('available','accepted','delivered','expired','failed','cancelled')
         NOT NULL DEFAULT 'available'`
      );
    }
    if (!currentPenalty) {
      await db.query(
        `ALTER TABLE trucker_delivery_history
         ADD COLUMN cancellation_penalty INT UNSIGNED NOT NULL DEFAULT 0 AFTER final_payout`
      );
    }
    if (!currentDebt) {
      await db.query(
        `ALTER TABLE trucker_profiles
         ADD COLUMN cancellation_debt INT UNSIGNED NOT NULL DEFAULT 0 AFTER failed_orders`
      );
    }

    const requiredColumns = {
      trucker_profiles: ["character_uuid", "xp", "skill_points", "skill_progress", "cancellation_debt"],
      trucker_skill_unlocks: ["character_uuid", "skill_id", "spent_points"],
      trucker_rentals: ["lease_id", "character_uuid", "active_character_uuid", "orders_remaining", "last_consumed_order_id", "status", "claimed_at"],
      trucker_orders: ["order_id", "refresh_bucket", "slot_index", "status", "trailer_livery", "trailer_color1", "trailer_color2"],
      trucker_active_deliveries: ["character_uuid", "order_id", "lease_id", "stage", "cargo_validity", "deadline_at"],
      trucker_delivery_history: ["id", "character_uuid", "order_id", "lease_id", "result_status", "final_payout", "cancellation_penalty"],
    };
    for (const [table, expected] of Object.entries(requiredColumns)) {
      const columns = await db.query(`SHOW COLUMNS FROM \`${table}\``);
      const available = new Set((columns || []).map((column) => String(column.Field)));
      const missing = expected.filter((column) => !available.has(column));
      if (missing.length) {
        throw new Error(`SQL contract mismatch in ${table}: missing ${missing.join(", ")}. Import the current database/schema.sql.`);
      }
    }
    const statusColumns = await db.query("SHOW COLUMNS FROM `trucker_orders` LIKE 'status'");
    const statusColumn = (statusColumns || []).find((column) => String(column.Field) === "status") || statusColumns?.[0];
    const statusType = String(statusColumn?.Type || "").toLowerCase().replace(/\s+/g, "");
    if (
      statusType !== expectedStatusType ||
      String(statusColumn?.Null || "").toUpperCase() !== "NO" ||
      statusColumn?.Default == null ||
      String(statusColumn.Default) !== "available"
    ) {
      throw new Error("SQL contract mismatch in trucker_orders: status must support cancelled.");
    }
    const penaltyColumns = await db.query("SHOW COLUMNS FROM `trucker_delivery_history` LIKE 'cancellation_penalty'");
    const penaltyColumn = (penaltyColumns || []).find((column) => String(column.Field) === "cancellation_penalty") || penaltyColumns?.[0];
    const penaltyType = String(penaltyColumn?.Type || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (
      !/^int(?:\(\d+\))? unsigned$/.test(penaltyType) ||
      String(penaltyColumn?.Null || "").toUpperCase() !== "NO" ||
      penaltyColumn?.Default == null ||
      Number(penaltyColumn.Default) !== 0
    ) {
      throw new Error("SQL contract mismatch in trucker_delivery_history.cancellation_penalty.");
    }
    const debtColumns = await db.query("SHOW COLUMNS FROM `trucker_profiles` LIKE 'cancellation_debt'");
    const debtColumn = (debtColumns || []).find((column) => String(column.Field) === "cancellation_debt") || debtColumns?.[0];
    const debtType = String(debtColumn?.Type || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (
      !/^int(?:\(\d+\))? unsigned$/.test(debtType) ||
      String(debtColumn?.Null || "").toUpperCase() !== "NO" ||
      debtColumn?.Default == null ||
      Number(debtColumn.Default) !== 0
    ) {
      throw new Error("SQL contract mismatch in trucker_profiles.cancellation_debt.");
    }
    const generatedColumns = await db.query(
      `SELECT EXTRA, GENERATION_EXPRESSION
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trucker_rentals'
         AND COLUMN_NAME = 'active_character_uuid'`
    );
    const generated = generatedColumns?.[0] || {};
    const expression = String(generated.GENERATION_EXPRESSION || "")
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/_[a-z0-9]+(?=')/g, "")
      .replace(/[\s()]/g, "");
    const expectedExpression = "casewhenstatus='active'thencharacter_uuidelsenullend";
    if (
      !String(generated.EXTRA || "").toUpperCase().includes("STORED GENERATED") ||
      expression !== expectedExpression
    ) {
      throw new Error("SQL contract mismatch in trucker_rentals: active_character_uuid must be the expected STORED GENERATED column. Import the current database/schema.sql.");
    }
    const rentalIndexes = await db.query("SHOW INDEX FROM `trucker_rentals` WHERE Key_name = 'uq_trucker_rentals_one_active'");
    const activeUniqueIndex = rentalIndexes?.[0];
    if (
      !Array.isArray(rentalIndexes) || rentalIndexes.length !== 1 ||
      Number(activeUniqueIndex?.Non_unique) !== 0 || Number(activeUniqueIndex?.Seq_in_index) !== 1 ||
      String(activeUniqueIndex?.Column_name) !== "active_character_uuid" || activeUniqueIndex?.Sub_part != null
    ) {
      throw new Error("SQL contract mismatch in trucker_rentals: uq_trucker_rentals_one_active is missing or invalid. Import the current database/schema.sql.");
    }
  }).catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function getRankForXp(xp) {
  const value = Math.max(0, Number(xp || 0));
  return config.ranks.reduce((rank, entry) => value >= entry.xp ? entry.rank : rank, 1);
}

function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function distance(left, right) {
  const dx = Number(left.x) - Number(right.x);
  const dy = Number(left.y) - Number(right.y);
  const dz = Number(left.z) - Number(right.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function buildRotation(bucket) {
  const random = seededRandom(bucket);
  const quotas = { pickup: 7, van: 7, truck: 6 };
  const selected = [];

  for (const vehicleType of Object.keys(quotas)) {
    const pool = shuffled(config.orderTemplates.filter((item) => item.vehicleType === vehicleType), random);
    selected.push(...pool.slice(0, quotas[vehicleType]));
  }

  const kindMultiplier = config.economy.cargoMultiplier;
  const typeRate = config.economy.payPerKm;
  const weightRanges = config.economy.weightRanges;
  const averageSpeed = config.economy.averageSpeed;

  return shuffled(selected, random).map((template, slotIndex) => {
    const [minimumWeight, maximumWeight] = weightRanges[template.vehicleType];
    const compatibleVehicles = config.vehicles.filter((vehicle) =>
      vehicle.type === template.vehicleType &&
      (template.vehicleType !== "truck" || String(vehicle.trailerModel || "") === String(template.trailerModel || ""))
    );
    const compatibleMaximum = Math.max(...compatibleVehicles.map((vehicle) => Number(vehicle.maxWeightKg || 0)));
    if (!compatibleVehicles.length || compatibleMaximum < minimumWeight) {
      throw new Error(`No compatible rental vehicle for route template ${template.id}.`);
    }
    const cappedMaximumWeight = Math.min(maximumWeight, compatibleMaximum);
    const weightKg = Math.round((minimumWeight + random() * (cappedMaximumWeight - minimumWeight)) / 50) * 50;
    const requiredVehicleRank = Math.min(...compatibleVehicles
      .filter((vehicle) => Number(vehicle.maxWeightKg) >= weightKg)
      .map((vehicle) => Number(vehicle.minRank || 1)));
    const routeDistanceM = Math.max(500, Math.round(distance(template.origin, template.destination) * 1.24));
    const routeKm = routeDistanceM / 1000;
    const multiplier = kindMultiplier[template.kind] || 1;
    const weightComponent = weightKg * (template.vehicleType === "truck" ? 0.16 : template.vehicleType === "van" ? 0.24 : 0.34);
    const basePay = Math.max(500, Math.round((routeKm * typeRate[template.vehicleType] + weightComponent + 250) * multiplier / 10) * 10);
    const timeLimitSeconds = Math.max(8 * 60, Math.round(routeDistanceM / averageSpeed[template.vehicleType] * 1.65 + 5 * 60));

    return {
      orderId: `TR-${Number(bucket).toString(36).toUpperCase()}-${template.id.toUpperCase()}-${slotIndex + 1}`,
      refreshBucket: bucket,
      slotIndex: slotIndex + 1,
      templateId: template.id,
      cargo: template.cargo,
      company: template.company,
      cargoKind: template.kind,
      vehicleType: template.vehicleType,
      requiredLicense: template.vehicleType === "truck" || template.kind === "hazmat" ? "cdl_a" : "cdl_b",
      requiredRank: Math.max(Number(template.minRank || 1), requiredVehicleRank),
      requiredSkill: template.skill || null,
      trailerModel: template.trailerModel || null,
      trailerLivery: Number.isFinite(Number(template.trailerLivery)) ? Number(template.trailerLivery) : null,
      trailerColors: Array.isArray(template.trailerColors) ? template.trailerColors.map(Number).slice(0, 2) : null,
      weightKg,
      origin: template.origin,
      destination: template.destination,
      routeDistanceM,
      timeLimitSeconds,
      basePay,
    };
  });
}

async function rotateOrders(force = false) {
  await ensureSchema();
  const bucket = Math.floor(Date.now() / config.refreshMs);
  if (!force && lastRotationBucket === bucket) return bucket;
  if (rotationPromise) return rotationPromise;

  rotationPromise = db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query(
        "UPDATE trucker_orders SET status = 'expired' WHERE status = 'available' AND refresh_bucket < ?",
        [bucket]
      );

      const [existingRows] = await connection.query(
        "SELECT COUNT(*) AS total FROM trucker_orders WHERE refresh_bucket = ?",
        [bucket]
      );
      if (Number(existingRows?.[0]?.total || 0) < config.orderCount) {
        const expiresAtEpoch = Math.floor(((bucket + 1) * config.refreshMs + 30000) / 1000);
        for (const order of buildRotation(bucket)) {
          await connection.query(
            `INSERT INTO trucker_orders
              (order_id, refresh_bucket, slot_index, template_id, status, cargo, company, cargo_kind,
               vehicle_type, required_license, required_rank, required_skill, trailer_model,
               trailer_livery, trailer_color1, trailer_color2, weight_kg,
               origin_x, origin_y, origin_z, origin_heading, destination_x, destination_y, destination_z,
               destination_heading, route_distance_m, time_limit_seconds, base_pay, expires_at)
             VALUES (?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))
             ON DUPLICATE KEY UPDATE order_id = VALUES(order_id)`,
            [
              order.orderId, order.refreshBucket, order.slotIndex, order.templateId, order.cargo, order.company,
              order.cargoKind, order.vehicleType, order.requiredLicense, order.requiredRank, order.requiredSkill,
              order.trailerModel, order.trailerLivery, order.trailerColors?.[0] ?? null, order.trailerColors?.[1] ?? null,
              order.weightKg, order.origin.x, order.origin.y, order.origin.z,
              order.origin.heading || 0, order.destination.x, order.destination.y, order.destination.z,
              order.destination.heading || 0, order.routeDistanceM, order.timeLimitSeconds, order.basePay, expiresAtEpoch,
            ]
          );
        }
      }
      await connection.commit();
      lastRotationBucket = bucket;
      return bucket;
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  }).finally(() => { rotationPromise = null; });

  return rotationPromise;
}

function normalizeOrder(row) {
  if (!row) return null;
  return {
    orderId: String(row.order_id),
    refreshBucket: Number(row.refresh_bucket),
    cargo: String(row.cargo),
    company: String(row.company),
    cargoKind: String(row.cargo_kind),
    vehicleType: String(row.vehicle_type),
    requiredLicense: String(row.required_license),
    requiredRank: Number(row.required_rank),
    requiredSkill: row.required_skill ? String(row.required_skill) : null,
    trailerModel: row.trailer_model ? String(row.trailer_model) : null,
    trailerLivery: row.trailer_livery == null ? null : Number(row.trailer_livery),
    trailerColors: row.trailer_color1 == null || row.trailer_color2 == null ? null : [Number(row.trailer_color1), Number(row.trailer_color2)],
    weightKg: Number(row.weight_kg),
    origin: { x: Number(row.origin_x), y: Number(row.origin_y), z: Number(row.origin_z), heading: Number(row.origin_heading || 0) },
    destination: { x: Number(row.destination_x), y: Number(row.destination_y), z: Number(row.destination_z), heading: Number(row.destination_heading || 0) },
    routeDistanceM: Number(row.route_distance_m),
    timeLimitSeconds: Number(row.time_limit_seconds),
    basePay: Number(row.base_pay),
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : 0,
    status: String(row.status),
  };
}

async function listAvailableOrders() {
  const bucket = await rotateOrders();
  const result = await db.query(
    `SELECT * FROM trucker_orders
     WHERE refresh_bucket = ? AND status = 'available' AND expires_at > NOW()
     ORDER BY slot_index ASC LIMIT ?`,
    [bucket, config.orderCount]
  );
  return (rows(result) || []).map(normalizeOrder);
}

async function listRotationOrders() {
  const bucket = await rotateOrders();
  const result = await db.query(
    `SELECT * FROM trucker_orders
     WHERE refresh_bucket = ?
     ORDER BY slot_index ASC LIMIT ?`,
    [bucket, config.orderCount]
  );
  return (rows(result) || []).map(normalizeOrder);
}

async function getProfile(characterUuid) {
  await ensureSchema();
  await db.query("INSERT IGNORE INTO trucker_profiles (character_uuid) VALUES (?)", [characterUuid]);
  const result = await db.query("SELECT * FROM trucker_profiles WHERE character_uuid = ? LIMIT 1", [characterUuid]);
  return rows(result)?.[0] || null;
}

async function getUnlockedSkills(characterUuid) {
  await ensureSchema();
  const result = await db.query(
    "SELECT skill_id FROM trucker_skill_unlocks WHERE character_uuid = ? ORDER BY unlocked_at ASC",
    [characterUuid]
  );
  return (rows(result) || []).map((row) => String(row.skill_id));
}

async function unlockSkill(characterUuid, skill) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const canonicalSkill = config.skills.find((entry) => entry.id === String(skill?.id || ""));
      if (!canonicalSkill) throw new Error("Навык не найден.");
      const [profiles] = await connection.query(
        "SELECT xp, skill_points FROM trucker_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (!profiles?.[0]) throw new Error("Профиль дальнобойщика не найден.");
      const [existing] = await connection.query(
        "SELECT skill_id FROM trucker_skill_unlocks WHERE character_uuid = ? AND skill_id = ? LIMIT 1",
        [characterUuid, skill.id]
      );
      if (existing?.[0]) throw new Error("Этот навык уже изучен.");
      const points = Number(profiles[0].skill_points || 0);
      if (getRankForXp(profiles[0].xp) < canonicalSkill.minRank) throw new Error(`Навык откроется на ранге ${canonicalSkill.minRank}.`);
      const [ownedRows] = await connection.query(
        "SELECT skill_id FROM trucker_skill_unlocks WHERE character_uuid = ? FOR UPDATE",
        [characterUuid]
      );
      const owned = new Set((ownedRows || []).map((row) => String(row.skill_id)));
      if (canonicalSkill.prerequisite && !owned.has(canonicalSkill.prerequisite)) throw new Error("Сначала изучите предыдущий навык ветки.");
      if (points < canonicalSkill.cost) throw new Error("Недостаточно очков умения.");

      await connection.query(
        "UPDATE trucker_profiles SET skill_points = skill_points - ? WHERE character_uuid = ?",
        [canonicalSkill.cost, characterUuid]
      );
      await connection.query(
        "INSERT INTO trucker_skill_unlocks (character_uuid, skill_id, spent_points) VALUES (?, ?, ?)",
        [characterUuid, canonicalSkill.id, canonicalSkill.cost]
      );
      await connection.commit();
      return true;
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function purchaseRental(characterUuid, rental) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        "SELECT order_id FROM trucker_active_deliveries WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (activeRows?.[0]) throw new Error("Нельзя менять арендованный транспорт во время активного заказа.");
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const cashBefore = Number(characterRows?.[0]?.cash);
      if (!Number.isFinite(cashBefore)) throw new Error("Персонаж не найден.");
      if (cashBefore < Number(rental.rentPrice || 0)) {
        const error = new Error("Недостаточно наличных.");
        error.code = "TRUCKER_RENT_INSUFFICIENT";
        throw error;
      }
      await connection.query(
        `UPDATE trucker_rentals
         SET status = IF(expires_at <= NOW(), 'expired', 'ended'),
             end_reason = IF(expires_at <= NOW(), 'lease_expired', 'replaced'), ended_at = NOW()
         WHERE character_uuid = ? AND status = 'active'`,
        [characterUuid]
      );
      await connection.query(
        `INSERT INTO trucker_rentals
          (lease_id, character_uuid, vehicle_config_id, vehicle_model, vehicle_type, trailer_model,
           rent_price, orders_remaining, status, started_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), FROM_UNIXTIME(?))`,
        [
          rental.leaseId, characterUuid, rental.vehicleConfigId, rental.vehicleModel,
          rental.vehicleType, rental.trailerModel || null, rental.rentPrice,
          rental.ordersRemaining, Math.floor(Number(rental.expiresAt) / 1000),
        ]
      );
      const cashAfter = cashBefore - Number(rental.rentPrice || 0);
      const [cashResult] = await connection.query(
        "UPDATE characters SET cash = ? WHERE uuid = ?",
        [cashAfter, characterUuid]
      );
      if (Number(cashResult?.affectedRows || 0) !== 1) throw new Error("Не удалось списать оплату аренды.");
      await connection.commit();
      return { cashBefore, cashAfter };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function cancelRentalAndRefund(characterUuid, leaseId, reason = "vehicle_issue_failed") {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const cashBefore = Number(characterRows?.[0]?.cash);
      if (!Number.isFinite(cashBefore)) throw new Error("Персонаж не найден для возврата аренды.");
      const normalizedLeaseId = String(leaseId || "").slice(0, 48);
      const [rentalRows] = await connection.query(
        `SELECT rent_price, status, claimed_at, end_reason FROM trucker_rentals
         WHERE character_uuid = ? AND lease_id = ? LIMIT 1 FOR UPDATE`,
        [characterUuid, normalizedLeaseId]
      );
      const rental = rentalRows?.[0];
      const recoverableEnded = rental && rental.status === "ended" &&
        ["session_restored_without_vehicle", "resource_reloaded"].includes(String(rental.end_reason || ""));
      if (!rental || (rental.status !== "active" && !recoverableEnded)) {
        await connection.commit();
        return { refunded: false, cashBefore, cashAfter: cashBefore };
      }
      const amount = Math.max(0, Number(rental.rent_price || 0));
      const cashAfter = cashBefore + amount;
      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, characterUuid]);
      await connection.query(
        `UPDATE trucker_rentals SET status = 'ended', end_reason = ?, ended_at = NOW()
         WHERE character_uuid = ? AND lease_id = ?`,
        [String(reason || "vehicle_issue_failed").slice(0, 96), characterUuid, normalizedLeaseId]
      );
      await connection.commit();
      return { refunded: true, amount, cashBefore, cashAfter };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function claimRental(characterUuid, leaseId) {
  await ensureSchema();
  const result = await db.query(
    `UPDATE trucker_rentals SET claimed_at = COALESCE(claimed_at, NOW())
     WHERE character_uuid = ? AND lease_id = ? AND status = 'active'`,
    [characterUuid, String(leaseId || "").slice(0, 48)]
  );
  if (Number(result?.affectedRows ?? result?.[0]?.affectedRows ?? 0) !== 1) {
    throw new Error("Не удалось подтвердить выдачу аренды.");
  }
  return true;
}

async function finishRental(characterUuid, leaseId, reason = "ended") {
  await ensureSchema();
  const normalizedReason = String(reason || "ended").slice(0, 96);
  const status = normalizedReason.includes("destroy") || normalizedReason.includes("missing") ? "destroyed" : "ended";
  return db.query(
    `UPDATE trucker_rentals SET status = ?, end_reason = ?, ended_at = NOW()
     WHERE character_uuid = ? AND lease_id = ? AND status = 'active'`,
    [status, normalizedReason, characterUuid, String(leaseId || "" ).slice(0, 48)]
  );
}

async function finishStaleRentals(characterUuid, reason = "session_restored_without_vehicle") {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const cashBefore = Number(characterRows?.[0]?.cash);
      if (!Number.isFinite(cashBefore)) throw new Error("Персонаж не найден при сверке аренды.");
      const [unclaimedRows] = await connection.query(
        `SELECT lease_id, rent_price FROM trucker_rentals
         WHERE character_uuid = ? AND status = 'active' AND claimed_at IS NULL FOR UPDATE`,
        [characterUuid]
      );
      const refundAmount = (unclaimedRows || []).reduce((sum, rental) => sum + Math.max(0, Number(rental.rent_price || 0)), 0);
      if (refundAmount > 0) {
        await connection.query("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [refundAmount, characterUuid]);
        await connection.query(
          `UPDATE trucker_rentals SET status = 'ended', end_reason = 'unclaimed_refund', ended_at = NOW()
           WHERE character_uuid = ? AND status = 'active' AND claimed_at IS NULL`,
          [characterUuid]
        );
      }
      await connection.query(
        `UPDATE trucker_rentals SET status = IF(expires_at <= NOW(), 'expired', 'ended'),
           end_reason = ?, ended_at = NOW()
         WHERE character_uuid = ? AND status = 'active' AND claimed_at IS NOT NULL`,
        [String(reason || "stale").slice(0, 96), characterUuid]
      );
      await connection.commit();
      return { refundAmount, cashBefore, cashAfter: cashBefore + refundAmount };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function consumeRentalOrder(characterUuid, leaseId, orderId) {
  await ensureSchema();
  const result = await db.query(
    `UPDATE trucker_rentals
     SET orders_remaining = GREATEST(orders_remaining - 1, 0), last_consumed_order_id = ?
     WHERE character_uuid = ? AND lease_id = ? AND status = 'active'
       AND (last_consumed_order_id IS NULL OR last_consumed_order_id <> ?)`,
    [orderId, characterUuid, leaseId, orderId]
  );
  return Number(result?.affectedRows || 0) === 1;
}

async function acceptOrder(characterUuid, orderId, lease) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        "SELECT order_id FROM trucker_active_deliveries WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (activeRows?.[0]) throw new Error("У вас уже есть активный заказ.");

      const [orderRows] = await connection.query(
        "SELECT * FROM trucker_orders WHERE order_id = ? LIMIT 1 FOR UPDATE",
        [orderId]
      );
      const order = normalizeOrder(orderRows?.[0]);
      if (!order || order.status !== "available" || order.expiresAt <= Date.now()) {
        throw new Error("Заказ уже недоступен или был обновлён.");
      }
      if (String(lease?.type || "") !== order.vehicleType) throw new Error("Неверный тип транспорта.");
      if (Number(lease?.maxWeightKg || 0) < order.weightKg) throw new Error("Транспорт не выдерживает вес заказа.");
      if (order.vehicleType === "truck" && order.trailerModel && String(lease?.trailerModel || "") !== order.trailerModel) {
        throw new Error("К заказу подсоединён несовместимый прицеп.");
      }
      const [rentalRows] = await connection.query(
        `SELECT lease_id, vehicle_config_id, vehicle_model, vehicle_type, trailer_model, orders_remaining
         FROM trucker_rentals
         WHERE character_uuid = ? AND lease_id = ? AND status = 'active' AND expires_at > NOW()
         LIMIT 1 FOR UPDATE`,
        [characterUuid, String(lease?.leaseId || "")]
      );
      const rental = rentalRows?.[0];
      if (!rental || Number(rental.orders_remaining || 0) <= 0) throw new Error("Аренда недействительна или лимит рейсов исчерпан.");
      if (String(rental.vehicle_config_id) !== String(lease.configId) || String(rental.vehicle_model) !== String(lease.model) || String(rental.vehicle_type) !== String(lease.type)) {
        throw new Error("Данные арендованного транспорта не совпадают.");
      }
      if (order.vehicleType === "truck" && String(rental.trailer_model || "") !== String(lease.trailerModel || "")) {
        throw new Error("Данные арендованного прицепа не совпадают.");
      }
      const [jobRows] = await connection.query(
        "SELECT job_id FROM character_jobs WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (String(jobRows?.[0]?.job_id || "") !== "trucker") throw new Error("Смена дальнобойщика не активна.");
      const [profileRows] = await connection.query(
        "SELECT xp FROM trucker_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (getRankForXp(profileRows?.[0]?.xp || 0) < order.requiredRank) throw new Error("Недостаточный ранг.");
      if (order.requiredSkill) {
        const [skillRows] = await connection.query(
          "SELECT skill_id FROM trucker_skill_unlocks WHERE character_uuid = ? AND skill_id = ? LIMIT 1 FOR UPDATE",
          [characterUuid, order.requiredSkill]
        );
        if (!skillRows?.[0]) throw new Error("Не изучен обязательный навык.");
      }
      const requiredLicenses = order.requiredLicense === "cdl_b" ? ["cdl_b", "cdl_a"] : ["cdl_a"];
      const [licenseRows] = await connection.query(
        `SELECT license_id FROM character_licenses
         WHERE static_id = ? AND license_id IN (${requiredLicenses.map(() => "?").join(",")})
           AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE`,
        [characterUuid, ...requiredLicenses]
      );
      if (!licenseRows?.length) throw new Error("Требуемая CDL недействительна.");
      const [documentRows] = await connection.query(
        `SELECT id FROM character_documents
         WHERE static_id = ? AND document_type = 'identity_card' AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1 FOR UPDATE`,
        [characterUuid]
      );
      if (!documentRows?.[0]) throw new Error("Действующая ID-карта не найдена.");
      const [inventoryRows] = await connection.query(
        "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const inventory = inventoryRows?.[0]?.inventory;
      if (!inventoryContains(inventory, [DOCUMENT_ITEM_IDS.identity])) {
        throw new Error("Физическая ID-карта отсутствует в инвентаре.");
      }
      const activeLicenseIds = new Set(licenseRows.map((row) => String(row.license_id)));
      const physicalCdlIds = [];
      if (activeLicenseIds.has("cdl_b")) physicalCdlIds.push(LICENSE_DOCUMENT_ITEM_IDS.cdl_b);
      if (activeLicenseIds.has("cdl_a")) physicalCdlIds.push(LICENSE_DOCUMENT_ITEM_IDS.cdl_a);
      if (!inventoryContains(inventory, physicalCdlIds)) {
        throw new Error("Физическое удостоверение CDL отсутствует в инвентаре.");
      }

      const acceptedAt = new Date();
      const deadlineAt = new Date(acceptedAt.getTime() + order.timeLimitSeconds * 1000);
      const [updateResult] = await connection.query(
        `UPDATE trucker_orders
         SET status = 'accepted', accepted_by = ?, accepted_at = NOW()
         WHERE order_id = ? AND status = 'available' AND expires_at > NOW()`,
        [characterUuid, orderId]
      );
      if (Number(updateResult?.affectedRows || 0) !== 1) throw new Error("Этот заказ уже принял другой водитель.");

      await connection.query(
        `INSERT INTO trucker_active_deliveries
          (character_uuid, order_id, lease_id, vehicle_runtime_id, vehicle_config_id, vehicle_model, vehicle_type,
           trailer_model, stage, cargo_validity, accepted_at, deadline_at, fuel_start)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'to_pickup', 100, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), ?)`,
        [
          characterUuid, orderId, lease.leaseId, lease.runtimeId, lease.configId, lease.model, lease.type,
          lease.trailerModel || null, order.timeLimitSeconds, lease.fuelStart,
        ]
      );
      await connection.commit();
      return { order, acceptedAt: acceptedAt.getTime(), deadlineAt: deadlineAt.getTime() };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function updateActive(characterUuid, patch) {
  await ensureSchema();
  const allowed = {
    stage: "stage",
    cargoValidity: "cargo_validity",
    loadedAt: "loaded_at",
    fuelUsed: "fuel_used",
    actualDistanceM: "actual_distance_m",
  };
  const assignments = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (key === "stage" && !["to_pickup", "loading", "to_dropoff", "unloading"].includes(String(patch[key]))) {
      throw new Error("Недопустимая стадия доставки.");
    }
    if (key === "cargoValidity") {
      const value = Number(patch[key]);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Некорректная сохранность груза.");
      patch[key] = value;
    }
    if (key === "fuelUsed" || key === "actualDistanceM") {
      const value = Number(patch[key]);
      const maximum = key === "fuelUsed" ? 10000 : 10000000;
      if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error("Некорректная метрика доставки.");
      patch[key] = value;
    }
    assignments.push(`${column} = ?`);
    values.push(key === "loadedAt" && patch[key] ? new Date(patch[key]) : patch[key]);
  }
  if (!assignments.length) return;
  if (!Object.prototype.hasOwnProperty.call(patch, "stage")) {
    values.push(characterUuid);
    const result = await db.query(`UPDATE trucker_active_deliveries SET ${assignments.join(", ")} WHERE character_uuid = ?`, values);
    if (Number(result?.affectedRows ?? result?.[0]?.affectedRows ?? 0) !== 1) throw new Error("Активный заказ не найден.");
    return;
  }

  await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        "SELECT stage FROM trucker_active_deliveries WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const currentStage = String(activeRows?.[0]?.stage || "");
      const nextStage = String(patch.stage);
      const allowedTransitions = {
        to_pickup: new Set(["loading"]),
        loading: new Set(["to_pickup", "to_dropoff"]),
        to_dropoff: new Set(["unloading"]),
        unloading: new Set(["to_dropoff"]),
      };
      if (!allowedTransitions[currentStage]?.has(nextStage)) {
        throw new Error(`Недопустимый переход доставки: ${currentStage || "missing"} -> ${nextStage}.`);
      }
      const stageValues = [...values, characterUuid, currentStage];
      const [updateResult] = await connection.query(
        `UPDATE trucker_active_deliveries SET ${assignments.join(", ")} WHERE character_uuid = ? AND stage = ?`,
        stageValues
      );
      if (Number(updateResult?.affectedRows || 0) !== 1) throw new Error("Стадия заказа уже изменилась.");
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function completeDelivery(characterUuid, metrics) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        `SELECT active.*, orders.cargo, orders.company, orders.cargo_kind, orders.weight_kg,
                orders.route_distance_m, orders.base_pay, orders.status AS order_status
         FROM trucker_active_deliveries active
         JOIN trucker_orders orders ON orders.order_id = active.order_id
         WHERE active.character_uuid = ? LIMIT 1 FOR UPDATE`,
        [characterUuid]
      );
      const active = activeRows?.[0];
      if (!active) {
        const [historyRows] = await connection.query(
          `SELECT history.actual_distance_m, history.accepted_at, history.delivered_at,
                  history.early_seconds, history.late_seconds, history.cargo_validity,
                  history.fuel_used, history.base_pay, history.early_bonus, history.skill_bonus,
                  history.damage_penalty, history.late_penalty, history.final_payout,
                  history.xp_earned, history.skill_progress_earned, history.skill_points_earned,
                  profile.xp, characters.cash
           FROM trucker_delivery_history history
           JOIN trucker_profiles profile ON profile.character_uuid = history.character_uuid
           JOIN characters ON characters.uuid = history.character_uuid
           WHERE history.character_uuid = ? AND history.order_id = ? AND history.result_status = 'delivered'
           LIMIT 1`,
          [characterUuid, metrics.orderId]
        );
        const saved = historyRows?.[0];
        if (!saved) throw new Error("Активный заказ не найден.");
        const newRank = getRankForXp(saved.xp);
        const oldRank = getRankForXp(Math.max(0, Number(saved.xp || 0) - Number(saved.xp_earned || 0)));
        await connection.commit();
        return {
          cashBefore: Number(saved.cash || 0) - Number(saved.final_payout || 0),
          cashAfter: Number(saved.cash || 0),
          oldRank,
          newRank,
          skillPointsEarned: Number(saved.skill_points_earned || 0),
          alreadyCompleted: true,
          persistedMetrics: {
            actualDistanceM: Number(saved.actual_distance_m || 0),
            durationSeconds: Math.max(0, Math.round((new Date(saved.delivered_at).getTime() - new Date(saved.accepted_at).getTime()) / 1000)),
            earlySeconds: Number(saved.early_seconds || 0),
            lateSeconds: Number(saved.late_seconds || 0),
            cargoValidity: Number(saved.cargo_validity || 0),
            fuelUsed: Number(saved.fuel_used || 0),
            basePay: Number(saved.base_pay || 0),
            earlyBonus: Number(saved.early_bonus || 0),
            skillBonus: Number(saved.skill_bonus || 0),
            damagePenalty: Number(saved.damage_penalty || 0),
            latePenalty: Number(saved.late_penalty || 0),
            finalPayout: Number(saved.final_payout || 0),
            xpEarned: Number(saved.xp_earned || 0),
            skillProgressEarned: Number(saved.skill_progress_earned || 0),
          },
        };
      }
      if (String(active.order_id) !== String(metrics.orderId)) throw new Error("Активный заказ не найден.");
      if (String(active.stage) !== "unloading" || String(active.order_status) !== "accepted") {
        throw new Error("Заказ нельзя завершить на текущей стадии.");
      }

      const finite = (name, value, minimum, maximum, integer = false) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number < minimum || number > maximum) {
          throw new Error(`Некорректная итоговая метрика: ${name}.`);
        }
        return integer ? Math.round(number) : number;
      };
      metrics = {
        ...metrics,
        deliveredAt: finite("deliveredAt", metrics.deliveredAt, 1, Date.now() + 60000, true),
        actualDistanceM: finite("actualDistanceM", metrics.actualDistanceM, 0, 10000000, true),
        earlySeconds: finite("earlySeconds", metrics.earlySeconds, 0, 86400, true),
        lateSeconds: finite("lateSeconds", metrics.lateSeconds, 0, 86400, true),
        cargoValidity: finite("cargoValidity", metrics.cargoValidity, 0, 100),
        fuelUsed: finite("fuelUsed", metrics.fuelUsed, 0, 10000),
        earlyBonus: finite("earlyBonus", metrics.earlyBonus, 0, Number(active.base_pay) * 0.5, true),
        skillBonus: finite("skillBonus", metrics.skillBonus, 0, Number(active.base_pay) * 0.5, true),
        damagePenalty: finite("damagePenalty", metrics.damagePenalty, 0, Number(active.base_pay) * 3, true),
        latePenalty: finite("latePenalty", metrics.latePenalty, 0, Number(active.base_pay), true),
        trophyMultiplier: finite("trophyMultiplier", metrics.trophyMultiplier ?? 1, 1, 3),
        finalPayout: finite("finalPayout", metrics.finalPayout, 0, Number(active.base_pay) * 9, true),
        xpEarned: finite("xpEarned", metrics.xpEarned, 0, 1000, true),
        skillProgressEarned: finite("skillProgressEarned", metrics.skillProgressEarned, 0, 50, true),
      };
      if (metrics.finalPayout > (Number(active.base_pay) + metrics.earlyBonus + metrics.skillBonus) * metrics.trophyMultiplier) {
        throw new Error("Итоговая выплата превышает допустимую сумму.");
      }

      const [profileRows] = await connection.query(
        "SELECT * FROM trucker_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const profile = profileRows?.[0];
      if (!profile) throw new Error("Профиль дальнобойщика не найден.");
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (!characterRows?.[0]) throw new Error("Персонаж не найден.");

      const oldXp = Number(profile.xp || 0);
      const oldRank = getRankForXp(oldXp);
      const newXp = oldXp + metrics.xpEarned;
      const newRank = getRankForXp(newXp);
      const progressTotal = Number(profile.skill_progress || 0) + metrics.skillProgressEarned;
      const progressPoints = Math.floor(progressTotal / 100);
      const rankPoints = Math.max(0, newRank - oldRank) * Number(config.economy.skillPointsPerRank || 1);
      const skillPointsEarned = progressPoints + rankPoints;
      const nextProgress = progressTotal % 100;

      const [historyResult] = await connection.query(
        `INSERT INTO trucker_delivery_history
          (character_uuid, order_id, lease_id, cargo, company, cargo_kind, vehicle_type, vehicle_model, weight_kg,
           planned_distance_m, actual_distance_m, accepted_at, loaded_at, delivered_at, deadline_at,
           early_seconds, late_seconds, cargo_validity, fuel_used, base_pay, early_bonus, skill_bonus,
           damage_penalty, late_penalty, final_payout, xp_earned, skill_progress_earned,
           skill_points_earned, result_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered')`,
        [
          characterUuid, active.order_id, active.lease_id, active.cargo, active.company, active.cargo_kind,
          active.vehicle_type, active.vehicle_model, active.weight_kg, active.route_distance_m,
          metrics.actualDistanceM, active.accepted_at, active.loaded_at, new Date(metrics.deliveredAt),
          active.deadline_at, metrics.earlySeconds, metrics.lateSeconds, metrics.cargoValidity,
          metrics.fuelUsed, active.base_pay, metrics.earlyBonus, metrics.skillBonus,
          metrics.damagePenalty, metrics.latePenalty, metrics.finalPayout, metrics.xpEarned,
          metrics.skillProgressEarned, skillPointsEarned,
        ]
      );
      if (Number(historyResult?.affectedRows || 0) !== 1) throw new Error("Результат заказа уже сохранён.");

      await connection.query(
        `UPDATE trucker_profiles SET
           xp = ?, rank_level = ?, skill_points = skill_points + ?, skill_progress = ?,
           completed_orders = completed_orders + 1,
           on_time_orders = on_time_orders + ?, late_orders = late_orders + ?,
           total_earned = total_earned + ?, total_distance_m = total_distance_m + ?,
           total_fuel_used = total_fuel_used + ?
         WHERE character_uuid = ?`,
        [
          newXp, newRank, skillPointsEarned, nextProgress, metrics.lateSeconds > 0 ? 0 : 1,
          metrics.lateSeconds > 0 ? 1 : 0, metrics.finalPayout, metrics.actualDistanceM,
          metrics.fuelUsed, characterUuid,
        ]
      );
      await connection.query("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [metrics.finalPayout, characterUuid]);
      await connection.query(
        `UPDATE trucker_rentals
         SET orders_remaining = GREATEST(orders_remaining - 1, 0), last_consumed_order_id = ?
         WHERE character_uuid = ? AND lease_id = ? AND status = 'active'
           AND (last_consumed_order_id IS NULL OR last_consumed_order_id <> ?)`,
        [active.order_id, characterUuid, active.lease_id, active.order_id]
      );
      await connection.query("UPDATE trucker_orders SET status = 'delivered' WHERE order_id = ?", [active.order_id]);
      await connection.query("DELETE FROM trucker_active_deliveries WHERE character_uuid = ?", [characterUuid]);
      await connection.commit();

      return {
        cashBefore: Number(characterRows[0].cash || 0),
        cashAfter: Number(characterRows[0].cash || 0) + metrics.finalPayout,
        oldRank,
        newRank,
        skillPointsEarned,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function failActiveDelivery(characterUuid, reason, metrics = {}) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        `SELECT active.*, orders.cargo, orders.company, orders.cargo_kind, orders.weight_kg,
                orders.route_distance_m, orders.base_pay
         FROM trucker_active_deliveries active
         JOIN trucker_orders orders ON orders.order_id = active.order_id
         WHERE active.character_uuid = ? LIMIT 1 FOR UPDATE`,
        [characterUuid]
      );
      const active = activeRows?.[0];
      if (!active) {
        await connection.commit();
        return false;
      }

      await connection.query(
        `INSERT INTO trucker_delivery_history
          (character_uuid, order_id, lease_id, cargo, company, cargo_kind, vehicle_type, vehicle_model, weight_kg,
           planned_distance_m, actual_distance_m, accepted_at, loaded_at, deadline_at, cargo_validity,
           fuel_used, base_pay, result_status, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          characterUuid, active.order_id, active.lease_id, active.cargo, active.company, active.cargo_kind,
          active.vehicle_type, active.vehicle_model, active.weight_kg, active.route_distance_m,
          Math.max(0, Math.round(Number(metrics.actualDistanceM ?? active.actual_distance_m ?? 0))),
          active.accepted_at, active.loaded_at, active.deadline_at,
          Math.max(0, Math.min(100, Number(metrics.cargoValidity ?? active.cargo_validity ?? 100))),
          Math.max(0, Number(metrics.fuelUsed ?? active.fuel_used ?? 0)), active.base_pay,
          reason === "player_cancelled" ? "cancelled" : "failed", String(reason || "unknown").slice(0, 96),
        ]
      );
      if (reason !== "player_cancelled") {
        await connection.query("UPDATE trucker_profiles SET failed_orders = failed_orders + 1 WHERE character_uuid = ?", [characterUuid]);
      }
      await connection.query("UPDATE trucker_orders SET status = 'failed' WHERE order_id = ?", [active.order_id]);
      await connection.query("DELETE FROM trucker_active_deliveries WHERE character_uuid = ?", [characterUuid]);
      await connection.commit();
      return true;
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

function getCancellationPenalty(basePay, stage) {
  const pay = Math.max(0, Math.round(Number(basePay || 0)));
  const afterLoading = stage === "to_dropoff" || stage === "unloading";
  const rate = afterLoading ? config.cancellation.afterLoadingRate : config.cancellation.beforePickupRate;
  const minimum = afterLoading ? config.cancellation.afterLoadingMinimum : config.cancellation.beforePickupMinimum;
  return Math.min(pay, Math.max(minimum, Math.round(pay * rate)));
}

async function cancelActiveDelivery(characterUuid, expectedOrderId, expectedLeaseId, reason, options = {}) {
  await ensureSchema();
  const orderId = String(expectedOrderId || "").slice(0, 64);
  const leaseId = String(expectedLeaseId || "").slice(0, 48);
  const failureReason = String(reason || "player_cancelled").slice(0, 96);
  if (!characterUuid || !orderId || !leaseId) throw new Error("Некорректные данные активного заказа.");

  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [activeRows] = await connection.query(
        `SELECT active.*, orders.cargo, orders.company, orders.cargo_kind, orders.weight_kg,
                orders.route_distance_m, orders.base_pay
         FROM trucker_active_deliveries active
         JOIN trucker_orders orders ON orders.order_id = active.order_id
         WHERE active.character_uuid = ? AND active.order_id = ? AND active.lease_id = ?
           AND orders.status = 'accepted' AND orders.accepted_by = ?
         LIMIT 1 FOR UPDATE`,
        [characterUuid, orderId, leaseId, characterUuid]
      );
      const active = activeRows?.[0];
      if (!active) {
        const [historyRows] = await connection.query(
          `SELECT history.cancellation_penalty, characters.cash,
                  rentals.orders_remaining, rentals.status AS rental_status,
                  profiles.cancellation_debt
           FROM trucker_delivery_history history
           JOIN characters ON characters.uuid = history.character_uuid
           JOIN trucker_profiles profiles ON profiles.character_uuid = history.character_uuid
           LEFT JOIN trucker_rentals rentals ON rentals.lease_id = history.lease_id
             AND rentals.character_uuid = history.character_uuid
           WHERE history.character_uuid = ? AND history.order_id = ? AND history.result_status = 'cancelled'
           LIMIT 1`,
          [characterUuid, orderId]
        );
        await connection.commit();
        if (historyRows?.[0]) {
          return {
            alreadyCancelled: true,
            orderId,
            leaseId,
            penalty: Number(historyRows[0].cancellation_penalty || 0),
            chargedPenalty: 0,
            cashAfter: Number(historyRows[0].cash || 0),
            ordersRemaining: Math.max(0, Number(historyRows[0].orders_remaining || 0)),
            rentalClosed: String(historyRows[0].rental_status || "") !== "active",
            cancellationDebt: Math.max(0, Number(historyRows[0].cancellation_debt || 0)),
          };
        }
        throw new Error("Активный заказ не найден или уже изменён.");
      }

      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const [rentalRows] = await connection.query(
        `SELECT lease_id, orders_remaining
         FROM trucker_rentals
         WHERE character_uuid = ? AND lease_id = ? AND status = 'active'
         LIMIT 1 FOR UPDATE`,
        [characterUuid, leaseId]
      );
      const [profileRows] = await connection.query(
        "SELECT cancellation_debt FROM trucker_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const characterRow = characterRows?.[0];
      const rental = rentalRows?.[0];
      const profile = profileRows?.[0];
      if (!characterRow || !rental || !profile) throw new Error("Персонаж, профиль или аренда активного заказа не найдены.");

      const penalty = options.waivePenalty === true ? 0 : getCancellationPenalty(active.base_pay, active.stage);
      const cashBefore = Math.max(0, Number(characterRow.cash || 0));
      const chargedPenalty = Math.min(cashBefore, penalty);
      const debtAdded = Math.max(0, penalty - chargedPenalty);
      const cancellationDebt = Math.max(0, Number(profile.cancellation_debt || 0)) + debtAdded;
      const cashAfter = cashBefore - chargedPenalty;
      const metrics = options.metrics || {};

      const [historyResult] = await connection.query(
        `INSERT INTO trucker_delivery_history
          (character_uuid, order_id, lease_id, cargo, company, cargo_kind, vehicle_type, vehicle_model, weight_kg,
           planned_distance_m, actual_distance_m, accepted_at, loaded_at, deadline_at, cargo_validity,
           fuel_used, base_pay, cancellation_penalty, result_status, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cancelled', ?)`,
        [
          characterUuid, active.order_id, active.lease_id, active.cargo, active.company, active.cargo_kind,
          active.vehicle_type, active.vehicle_model, active.weight_kg, active.route_distance_m,
          Math.max(0, Math.round(Number(metrics.actualDistanceM ?? active.actual_distance_m ?? 0))),
          active.accepted_at, active.loaded_at, active.deadline_at,
          Math.max(0, Math.min(100, Number(metrics.cargoValidity ?? active.cargo_validity ?? 100))),
          Math.max(0, Number(metrics.fuelUsed ?? active.fuel_used ?? 0)), active.base_pay,
          penalty, failureReason,
        ]
      );
      if (Number(historyResult?.affectedRows || 0) !== 1) throw new Error("Отмена заказа уже была сохранена.");

      if (chargedPenalty > 0) {
        const [cashResult] = await connection.query(
          "UPDATE characters SET cash = ? WHERE uuid = ? AND cash = ?",
          [cashAfter, characterUuid, cashBefore]
        );
        if (Number(cashResult?.affectedRows || 0) !== 1) throw new Error("Баланс персонажа изменился во время отмены.");
      }

      const [profileResult] = await connection.query(
        `UPDATE trucker_profiles
         SET failed_orders = failed_orders + 1, cancellation_debt = cancellation_debt + ?
         WHERE character_uuid = ?`,
        [debtAdded, characterUuid]
      );
      if (Number(profileResult?.affectedRows || 0) !== 1) throw new Error("Профиль дальнобойщика не найден.");

      const closeRental = options.closeRental === true;
      const rentalSql = closeRental
        ? `UPDATE trucker_rentals
           SET orders_remaining = GREATEST(orders_remaining - 1, 0), last_consumed_order_id = ?,
               status = 'ended', end_reason = ?, ended_at = NOW()
           WHERE character_uuid = ? AND lease_id = ? AND status = 'active'`
        : `UPDATE trucker_rentals
           SET orders_remaining = GREATEST(orders_remaining - 1, 0), last_consumed_order_id = ?
           WHERE character_uuid = ? AND lease_id = ? AND status = 'active'
             AND (last_consumed_order_id IS NULL OR last_consumed_order_id <> ?)`;
      const rentalParams = closeRental
        ? [active.order_id, failureReason, characterUuid, leaseId]
        : [active.order_id, characterUuid, leaseId, active.order_id];
      const [rentalResult] = await connection.query(rentalSql, rentalParams);
      if (Number(rentalResult?.affectedRows || 0) !== 1) throw new Error("Аренда уже была изменена.");

      const [orderResult] = await connection.query(
        `UPDATE trucker_orders SET status = 'cancelled'
         WHERE order_id = ? AND status = 'accepted' AND accepted_by = ?`,
        [active.order_id, characterUuid]
      );
      if (Number(orderResult?.affectedRows || 0) !== 1) throw new Error("Заказ уже был изменён.");

      const [deleteResult] = await connection.query(
        "DELETE FROM trucker_active_deliveries WHERE character_uuid = ? AND order_id = ? AND lease_id = ?",
        [characterUuid, active.order_id, active.lease_id]
      );
      if (Number(deleteResult?.affectedRows || 0) !== 1) throw new Error("Активный заказ уже был изменён.");

      await connection.commit();
      return {
        alreadyCancelled: false,
        orderId: active.order_id,
        leaseId: active.lease_id,
        penalty,
        chargedPenalty,
        cashBefore,
        cashAfter,
        debtAdded,
        cancellationDebt,
        ordersRemaining: Math.max(0, Number(rental.orders_remaining || 0) - 1),
        rentalClosed: closeRental,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function cancelStaleActiveDelivery(characterUuid, reason = "session_restored_without_vehicle") {
  await ensureSchema();
  const activeRows = await db.query(
    "SELECT order_id, lease_id FROM trucker_active_deliveries WHERE character_uuid = ? LIMIT 1",
    [characterUuid]
  );
  const active = activeRows?.[0];
  if (!active) return null;
  return cancelActiveDelivery(
    characterUuid,
    active.order_id,
    active.lease_id,
    reason,
    { closeRental: true }
  );
}

async function settleCancellationDebt(characterUuid) {
  await ensureSchema();
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const [profileRows] = await connection.query(
        "SELECT cancellation_debt FROM trucker_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const character = characterRows?.[0];
      const profile = profileRows?.[0];
      if (!character || !profile) throw new Error("Персонаж или профиль дальнобойщика не найдены.");
      const cashBefore = Math.max(0, Number(character.cash || 0));
      const debtBefore = Math.max(0, Number(profile.cancellation_debt || 0));
      const paid = Math.min(cashBefore, debtBefore);
      const cashAfter = cashBefore - paid;
      const debtAfter = debtBefore - paid;
      if (paid > 0) {
        const [cashResult] = await connection.query(
          "UPDATE characters SET cash = ? WHERE uuid = ? AND cash = ?",
          [cashAfter, characterUuid, cashBefore]
        );
        const [debtResult] = await connection.query(
          "UPDATE trucker_profiles SET cancellation_debt = ? WHERE character_uuid = ? AND cancellation_debt = ?",
          [debtAfter, characterUuid, debtBefore]
        );
        if (Number(cashResult?.affectedRows || 0) !== 1 || Number(debtResult?.affectedRows || 0) !== 1) {
          throw new Error("Баланс или долг изменился во время погашения.");
        }
      }
      await connection.commit();
      return { cashBefore, cashAfter, debtBefore, debtAfter, paid };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

module.exports = {
  cancelActiveDelivery,
  cancelStaleActiveDelivery,
  settleCancellationDebt,
  cancelRentalAndRefund,
  claimRental,
  buildRotation,
  completeDelivery,
  consumeRentalOrder,
  ensureSchema,
  failActiveDelivery,
  finishRental,
  finishStaleRentals,
  getProfile,
  getCancellationPenalty,
  getRankForXp,
  getUnlockedSkills,
  listAvailableOrders,
  listRotationOrders,
  purchaseRental,
  rotateOrders,
  unlockSkill,
  updateActive,
  acceptOrder,
};
