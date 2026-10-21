"use strict";

const db = require("../../database/query.js");

let schemaPromise = null;

async function getColumns(table) {
  return new Map(
    (await db.query(`SHOW FULL COLUMNS FROM \`${table}\``))
      .map((row) => [String(row.Field), row])
  );
}

async function getIndexes(table) {
  return new Set(
    (await db.query(`SHOW INDEX FROM \`${table}\``))
      .map((row) => String(row.Key_name))
  );
}

function needsType(columns, name, expectedType) {
  const column = columns.get(name);
  if (!column) return false;
  return !String(column.Type || "").toLowerCase().includes(expectedType);
}

async function assertNoDuplicateKey(table, column) {
  const rows = await db.query(
    `SELECT \`${column}\`, COUNT(*) AS row_count
       FROM \`${table}\`
      GROUP BY \`${column}\`
     HAVING COUNT(*) > 1
      LIMIT 1`
  );

  if (Array.isArray(rows) && rows.length) {
    throw new Error(`[FISHING] Cannot add unique index: duplicate ${table}.${column}`);
  }
}

async function migrateFishingProfiles() {
  const columns = await getColumns("fishing_profiles");
  const changes = [];

  if (!columns.has("static_id")) {
    changes.push("ADD COLUMN static_id BIGINT NOT NULL DEFAULT 0");
  } else if (needsType(columns, "static_id", "bigint")) {
    changes.push("MODIFY COLUMN static_id BIGINT NOT NULL");
  }

  if (!columns.has("profile")) {
    changes.push("ADD COLUMN profile LONGTEXT NOT NULL");
  } else if (needsType(columns, "profile", "longtext")) {
    changes.push("MODIFY COLUMN profile LONGTEXT NOT NULL");
  }

  if (!columns.has("updated_at")) {
    changes.push("ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  }

  if (changes.length) {
    await db.query(`ALTER TABLE fishing_profiles ${changes.join(", ")}`);
  }

  const indexes = await getIndexes("fishing_profiles");
  if (!indexes.has("uq_fishing_profiles_static_id") && !Array.from(indexes).includes("PRIMARY")) {
    await assertNoDuplicateKey("fishing_profiles", "static_id");
    await db.query("ALTER TABLE fishing_profiles ADD UNIQUE KEY uq_fishing_profiles_static_id (static_id)");
    return;
  }

  const uniqueStaticId = await db.query(`
    SHOW INDEX FROM fishing_profiles
    WHERE Column_name = 'static_id' AND Non_unique = 0
  `);
  if (!Array.isArray(uniqueStaticId) || uniqueStaticId.length === 0) {
    await assertNoDuplicateKey("fishing_profiles", "static_id");
    await db.query("ALTER TABLE fishing_profiles ADD UNIQUE KEY uq_fishing_profiles_static_id (static_id)");
  }
}

async function migrateFishingCatchLedger() {
  const columns = await getColumns("fishing_catch_ledger");
  const definitions = {
    uid: "VARCHAR(96) NOT NULL",
    owner_static_id: "BIGINT NOT NULL",
    species_id: "VARCHAR(64) NOT NULL",
    species_name: "VARCHAR(96) NOT NULL",
    point_id: "VARCHAR(64) NOT NULL",
    weight_kg: "DECIMAL(8,2) NOT NULL DEFAULT 0",
    length_cm: "DECIMAL(8,2) NOT NULL DEFAULT 0",
    quality: "VARCHAR(32) NOT NULL DEFAULT 'normal'",
    rarity: "VARCHAR(32) NOT NULL DEFAULT 'common'",
    price: "INT NOT NULL DEFAULT 0",
    payload: "LONGTEXT NOT NULL",
    caught_at: "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
    sold_at: "TIMESTAMP NULL DEFAULT NULL",
  };
  const expectedTypes = {
    uid: "varchar(96)",
    owner_static_id: "bigint",
    species_id: "varchar(64)",
    species_name: "varchar(96)",
    point_id: "varchar(64)",
    weight_kg: "decimal(8,2)",
    length_cm: "decimal(8,2)",
    quality: "varchar(32)",
    rarity: "varchar(32)",
    price: "int",
    payload: "longtext",
    caught_at: "timestamp",
    sold_at: "timestamp",
  };
  const changes = [];

  for (const [name, definition] of Object.entries(definitions)) {
    if (!columns.has(name)) {
      changes.push(`ADD COLUMN ${name} ${definition}`);
    } else if (needsType(columns, name, expectedTypes[name])) {
      changes.push(`MODIFY COLUMN ${name} ${definition}`);
    }
  }

  if (changes.length) {
    await db.query(`ALTER TABLE fishing_catch_ledger ${changes.join(", ")}`);
  }

  const indexes = await getIndexes("fishing_catch_ledger");
  const uniqueUid = await db.query(`
    SHOW INDEX FROM fishing_catch_ledger
    WHERE Column_name = 'uid' AND Non_unique = 0
  `);
  if (!Array.isArray(uniqueUid) || uniqueUid.length === 0) {
    await assertNoDuplicateKey("fishing_catch_ledger", "uid");
    await db.query("ALTER TABLE fishing_catch_ledger ADD UNIQUE KEY uq_fishing_catch_uid (uid)");
  }
  if (!indexes.has("idx_fishing_owner")) {
    await db.query("ALTER TABLE fishing_catch_ledger ADD KEY idx_fishing_owner (owner_static_id)");
  }
  if (!indexes.has("idx_fishing_species")) {
    await db.query("ALTER TABLE fishing_catch_ledger ADD KEY idx_fishing_species (species_id)");
  }
  if (!indexes.has("idx_fishing_point")) {
    await db.query("ALTER TABLE fishing_catch_ledger ADD KEY idx_fishing_point (point_id)");
  }
}

function createDefaultProfile() {
  return {
    schemaVersion: 1,
    active: false,
    mode: null,
    xp: 0,
    level: 1,
    journal: {},
    records: {},
    unlockedPoints: ["del_perro_pier", "alamo_sea"],
    currentQuest: null,
    issuedQuestIds: [],
    completedQuestIds: [],
    stats: {
      casts: 0,
      bites: 0,
      caught: 0,
      escaped: 0,
      sold: 0,
      earned: 0,
    },
    pity: {
      rareMisses: 0,
    },
    cooldowns: {},
    lastSeenAt: Date.now(),
  };
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProfile(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = createDefaultProfile();
  const level = Math.max(1, Math.floor(normalizeNumber(source.level, base.level)));
  const xp = Math.max(0, Math.floor(normalizeNumber(source.xp, base.xp)));

  return {
    ...base,
    ...source,
    schemaVersion: Math.max(1, Math.floor(normalizeNumber(source.schemaVersion, 1))),
    active: Boolean(source.active),
    mode: source.active ? String(source.mode || "free") : null,
    xp,
    level,
    journal: source.journal && typeof source.journal === "object" ? source.journal : {},
    records: source.records && typeof source.records === "object" ? source.records : {},
    unlockedPoints: Array.isArray(source.unlockedPoints)
      ? [...new Set(source.unlockedPoints.map(String).filter(Boolean))]
      : base.unlockedPoints,
    currentQuest: source.currentQuest && typeof source.currentQuest === "object"
      ? {
          ...source.currentQuest,
          id: String(source.currentQuest.id || ""),
          progress: Math.max(0, Math.floor(normalizeNumber(source.currentQuest.progress, 0))),
          target: Math.max(1, Math.floor(normalizeNumber(source.currentQuest.target, 1))),
        }
      : null,
    issuedQuestIds: Array.isArray(source.issuedQuestIds)
      ? source.issuedQuestIds.map(String).slice(-120)
      : [],
    completedQuestIds: Array.isArray(source.completedQuestIds)
      ? source.completedQuestIds.map(String).slice(-120)
      : [],
    stats: {
      ...base.stats,
      ...(source.stats && typeof source.stats === "object" ? source.stats : {}),
    },
    pity: {
      ...base.pity,
      ...(source.pity && typeof source.pity === "object" ? source.pity : {}),
    },
    cooldowns: source.cooldowns && typeof source.cooldowns === "object" ? source.cooldowns : {},
    lastSeenAt: Math.max(0, normalizeNumber(source.lastSeenAt, Date.now())),
  };
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS fishing_profiles (
          static_id BIGINT NOT NULL PRIMARY KEY,
          profile LONGTEXT NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await migrateFishingProfiles();

      await db.query(`
        CREATE TABLE IF NOT EXISTS fishing_catch_ledger (
          uid VARCHAR(96) NOT NULL PRIMARY KEY,
          owner_static_id BIGINT NOT NULL,
          species_id VARCHAR(64) NOT NULL,
          species_name VARCHAR(96) NOT NULL,
          point_id VARCHAR(64) NOT NULL,
          weight_kg DECIMAL(8,2) NOT NULL DEFAULT 0,
          length_cm DECIMAL(8,2) NOT NULL DEFAULT 0,
          quality VARCHAR(32) NOT NULL DEFAULT 'normal',
          rarity VARCHAR(32) NOT NULL DEFAULT 'common',
          price INT NOT NULL DEFAULT 0,
          payload LONGTEXT NOT NULL,
          caught_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sold_at TIMESTAMP NULL DEFAULT NULL,
          KEY idx_fishing_owner (owner_static_id),
          KEY idx_fishing_species (species_id),
          KEY idx_fishing_point (point_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await migrateFishingCatchLedger();
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
}

async function loadProfile(staticId) {
  await ensureSchema();
  const id = Number(staticId);
  if (!id) return createDefaultProfile();

  const rows = await db.query(
    "SELECT profile FROM fishing_profiles WHERE static_id = ? ORDER BY updated_at DESC LIMIT 1",
    [id]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.profile) return createDefaultProfile();

  try {
    return normalizeProfile(JSON.parse(row.profile));
  } catch {
    return createDefaultProfile();
  }
}

async function saveProfile(staticId, profile, connection = null) {
  await ensureSchema();
  const id = Number(staticId);
  if (!id) return false;

  const normalized = normalizeProfile(profile);
  const executor = connection && typeof connection.query === "function" ? connection : db;
  await executor.query(
    `INSERT INTO fishing_profiles (static_id, profile)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
    [id, JSON.stringify(normalized)]
  );
  return true;
}

async function insertCatch(record) {
  await ensureSchema();
  const payload = record && typeof record === "object" ? record : {};
  const uid = String(payload.uid || "");
  if (!uid) return false;

  await db.query(
    `INSERT INTO fishing_catch_ledger
      (uid, owner_static_id, species_id, species_name, point_id, weight_kg, length_cm, quality, rarity, price, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid,
      Number(payload.ownerStaticId || 0),
      String(payload.speciesId || ""),
      String(payload.speciesName || ""),
      String(payload.pointId || ""),
      Number(payload.weightKg || 0),
      Number(payload.lengthCm || 0),
      String(payload.quality || "normal"),
      String(payload.rarity || "common"),
      Math.max(0, Math.round(Number(payload.price || 0))),
      JSON.stringify(payload),
    ]
  );
  return true;
}

async function markCatchSold(uid, connection = null) {
  await ensureSchema();
  const normalizedUid = String(uid || "");
  if (!normalizedUid) return false;

  const executor = connection && typeof connection.query === "function" ? connection : db;
  await executor.query(
    "UPDATE fishing_catch_ledger SET sold_at = CURRENT_TIMESTAMP WHERE uid = ? AND sold_at IS NULL",
    [normalizedUid]
  );
  return true;
}

module.exports = {
  createDefaultProfile,
  normalizeProfile,
  ensureSchema,
  loadProfile,
  saveProfile,
  insertCatch,
  markCatchSold,
};
