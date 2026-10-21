"use strict";

const db = require("../../database/query.js");

let schemaPromise = null;

function createDefaultProfile() {
  return {
    active: false,
    mode: null,
    currentQuest: null,
    issuedQuestIds: [],
    completedQuestIds: [],
    completedCount: 0,
    rareUnlocked: false,
    vehicleBags: {},
    tent: null,
    pendingTentReturn: null,
    pendingStimulants: 0,
    pendingCash: 0,
    lastSeenAt: Date.now(),
  };
}

function normalizeStoredSpecies(item) {
  if (!item || typeof item !== "object") return item;
  if (String(item.speciesId || "") !== "lion") return { ...item };
  return {
    ...item,
    speciesName: "Белый тигр",
    ...(String(item.itemId || item.id) === "hunting_spoiled_carcass"
      ? { name: "Испорченная туша «Белый тигр»" }
      : {}),
  };
}

function normalizeStoredBags(items) {
  return Array.isArray(items) ? items.map(normalizeStoredSpecies) : [];
}

function normalizeProfile(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = createDefaultProfile();
  const currentQuest = source.currentQuest && typeof source.currentQuest === "object"
    ? normalizeStoredSpecies(source.currentQuest)
    : null;
  let active = Boolean(source.active);
  let mode = source.mode ? String(source.mode) : null;

  if (currentQuest) {
    active = true;
    mode = "quest";
  } else if (mode === "quest") {
    // Ремонт старого профиля: активный quest без данных задания блокировал все
    // действия у Jeremy, хотя показывать игроку было нечего.
    active = false;
    mode = null;
  } else if (active) {
    mode = "free";
  } else {
    mode = null;
  }

  return {
    ...base,
    ...source,
    active,
    mode,
    currentQuest,
    issuedQuestIds: Array.isArray(source.issuedQuestIds)
      ? source.issuedQuestIds.map(String).slice(-250)
      : [],
    completedQuestIds: Array.isArray(source.completedQuestIds)
      ? source.completedQuestIds.map(String).slice(-250)
      : [],
    completedCount: Math.max(0, Number(source.completedCount || 0)),
    rareUnlocked: Boolean(source.rareUnlocked || Number(source.completedCount || 0) >= 5),
    vehicleBags: source.vehicleBags && typeof source.vehicleBags === "object"
      ? Object.fromEntries(
          Object.entries(source.vehicleBags).map(([key, items]) => [key, normalizeStoredBags(items)])
        )
      : {},
    tent: source.tent && typeof source.tent === "object"
      ? { ...source.tent, bags: normalizeStoredBags(source.tent.bags) }
      : null,
    pendingStimulants: Math.max(0, Number(source.pendingStimulants || 0)),
    pendingCash: Math.max(0, Number(source.pendingCash || 0)),
    lastSeenAt: Math.max(0, Number(source.lastSeenAt || Date.now())),
  };
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS hunting_profiles (
          static_id BIGINT NOT NULL PRIMARY KEY,
          profile LONGTEXT NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // CREATE TABLE IF NOT EXISTS does not repair an older VARCHAR/TEXT schema.
      // Hunting profiles contain quests, tent storage and vehicle bags, so the
      // column must remain large enough as the profile grows.
      await db.query(`
        ALTER TABLE hunting_profiles
        MODIFY COLUMN profile LONGTEXT NOT NULL
      `);

      // Старые сборки могли создать таблицу без PRIMARY/UNIQUE по static_id.
      // В таком случае каждый INSERT ... ON DUPLICATE создавал ещё одну строку,
      // а палатка читалась из случайной старой копии профиля. Чиним данные один
      // раз при запуске и только затем добавляем уникальный индекс.
      const uniqueIndexes = await db.query(`
        SHOW INDEX FROM hunting_profiles
        WHERE Column_name = 'static_id' AND Non_unique = 0
      `);
      if (!Array.isArray(uniqueIndexes) || uniqueIndexes.length === 0) {
        const duplicates = await db.query(`
          SELECT static_id, COUNT(*) AS row_count
          FROM hunting_profiles
          GROUP BY static_id
          HAVING COUNT(*) > 1
        `);

        for (const duplicate of Array.isArray(duplicates) ? duplicates : []) {
          const staticId = Math.max(0, Number(duplicate?.static_id || 0));
          if (!staticId) continue;
          await db.withConn(async (connection) => {
            await connection.beginTransaction();
            try {
              const [rows] = await connection.query(
                `SELECT profile
                 FROM hunting_profiles
                 WHERE static_id = ?
                 ORDER BY updated_at DESC
                 LIMIT 1
                 FOR UPDATE`,
                [staticId]
              );
              const latestProfile = rows?.[0]?.profile;
              if (latestProfile) {
                await connection.query("DELETE FROM hunting_profiles WHERE static_id = ?", [staticId]);
                await connection.query(
                  "INSERT INTO hunting_profiles (static_id, profile) VALUES (?, ?)",
                  [staticId, latestProfile]
                );
              }
              await connection.commit();
            } catch (error) {
              try { await connection.rollback(); } catch {}
              throw error;
            }
          });
        }

        await db.query(`
          ALTER TABLE hunting_profiles
          ADD UNIQUE KEY uq_hunting_profiles_static_id (static_id)
        `);
      }
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
    "SELECT profile FROM hunting_profiles WHERE static_id = ? ORDER BY updated_at DESC LIMIT 1",
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

async function loadAllProfiles() {
  await ensureSchema();
  const rows = await db.query(
    "SELECT static_id, profile FROM hunting_profiles ORDER BY updated_at DESC"
  );
  const seenStaticIds = new Set();

  return (Array.isArray(rows) ? rows : []).map((row) => {
    let parsed = null;
    try {
      parsed = JSON.parse(row?.profile || "{}");
    } catch {}

    return {
      staticId: Math.max(0, Number(row?.static_id || 0)),
      profile: normalizeProfile(parsed),
    };
  }).filter((entry) => {
    if (entry.staticId <= 0 || seenStaticIds.has(entry.staticId)) return false;
    seenStaticIds.add(entry.staticId);
    return true;
  });
}

async function saveProfile(staticId, profile, connection = null) {
  await ensureSchema();
  const id = Number(staticId);
  if (!id) return false;

  const normalized = normalizeProfile(profile);
  const executor = connection && typeof connection.query === "function" ? connection : db;
  await executor.query(
    `INSERT INTO hunting_profiles (static_id, profile)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE profile = VALUES(profile), updated_at = CURRENT_TIMESTAMP`,
    [id, JSON.stringify(normalized)]
  );
  return true;
}

async function assertAndRemoveEmptyVehicleStorage(connection, staticId, storageKey) {
  if (!connection || typeof connection.query !== "function") {
    throw new Error("A database transaction is required to verify vehicle storage.");
  }

  const id = Math.max(0, Number(staticId || 0));
  const key = String(storageKey || "").trim();
  if (!id || !key) {
    throw new Error("Vehicle storage identity is invalid.");
  }

  const [rows] = await connection.query(
    "SELECT profile FROM hunting_profiles WHERE static_id = ? LIMIT 1 FOR UPDATE",
    [id]
  );
  if (!rows?.[0]) return { empty: true, removed: false };

  let rawProfile = null;
  try {
    rawProfile = JSON.parse(rows[0].profile || "{}");
  } catch {
    throw new Error("The hunting profile is damaged; vehicle sale was cancelled.");
  }

  const rawStorage = rawProfile?.vehicleBags?.[key];
  if (rawStorage !== undefined && !Array.isArray(rawStorage)) {
    throw new Error("Vehicle hunting storage is damaged; vehicle sale was cancelled.");
  }
  if (Array.isArray(rawStorage) && rawStorage.length > 0) {
    const error = new Error("Remove all items from the vehicle trunk before selling it.");
    error.vehicleStorageNotEmpty = true;
    error.itemCount = rawStorage.length;
    throw error;
  }

  if (!Object.prototype.hasOwnProperty.call(rawProfile?.vehicleBags || {}, key)) {
    return { empty: true, removed: false };
  }

  const profile = normalizeProfile(rawProfile);
  delete profile.vehicleBags[key];
  await connection.query(
    "UPDATE hunting_profiles SET profile = ?, updated_at = CURRENT_TIMESTAMP WHERE static_id = ?",
    [JSON.stringify(profile), id]
  );
  return { empty: true, removed: true };
}

module.exports = {
  createDefaultProfile,
  normalizeProfile,
  ensureSchema,
  loadProfile,
  loadAllProfiles,
  saveProfile,
  assertAndRemoveEmptyVehicleStorage,
};
