"use strict";

const database = require("../../database");
const chat = require("../chat/chat.service.js");
const inventory = require("../inventory/inventory.service.js");
const { getLicenseDocumentItemId } = require("../documents/document.items.js");
const { normalizeDocumentPhoto } = require("../documents/document.photo.js");

const LICENSE_TYPES = {
  hunting: {
    id: "hunting",
    label: "Лицензия: охота",
    shortLabel: "Охота",
    documentTitle: "ОХОТА",
    category: "Охота",
    price: 0,
    validityDays: 30,
    numberPrefix: 71,
    variant: "hunting",
    acquisitionChannel: "quest",
    vendorAvailable: true,
  },
  fishing: {
    id: "fishing",
    label: "Лицензия: рыболовство",
    shortLabel: "Рыболовство",
    documentTitle: "РЫБОЛОВСТВО",
    category: "Рыболовство",
    price: 0,
    validityDays: 30,
    numberPrefix: 72,
    variant: "fishing",
    acquisitionChannel: "quest",
    vendorAvailable: true,
  },
  vehicle_a: {
    id: "vehicle_a",
    label: "Лицензия категории A",
    shortLabel: "Кат. A",
    documentTitle: "ВОДИТЕЛЬСКАЯ ЛИЦЕНЗИЯ",
    category: "A",
    price: 0,
    validityDays: 30,
    numberPrefix: 81,
    variant: "transport",
    acquisitionChannel: "driving_exam",
    vendorAvailable: false,
  },
  vehicle_b: {
    id: "vehicle_b",
    label: "Лицензия категории B",
    shortLabel: "Кат. B",
    documentTitle: "ВОДИТЕЛЬСКАЯ ЛИЦЕНЗИЯ",
    category: "B",
    price: 0,
    validityDays: 30,
    numberPrefix: 82,
    variant: "transport",
    acquisitionChannel: "driving_exam",
    vendorAvailable: false,
  },
  vehicle_c: {
    id: "vehicle_c",
    label: "Лицензия категории C",
    shortLabel: "Кат. C",
    documentTitle: "ВОДИТЕЛЬСКАЯ ЛИЦЕНЗИЯ",
    category: "C",
    price: 0,
    validityDays: 30,
    numberPrefix: 83,
    variant: "transport",
    acquisitionChannel: "driving_exam",
    vendorAvailable: false,
  },
  cdl_b: {
    id: "cdl_b",
    label: "Коммерческие права CDL: B",
    shortLabel: "CDL: B",
    documentTitle: "COMMERCIAL DRIVER LICENSE",
    category: "CDL B",
    price: 7500,
    validityDays: 30,
    numberPrefix: 84,
    variant: "transport",
    acquisitionChannel: "trucker_vendor",
    vendorAvailable: false,
  },
  cdl_a: {
    id: "cdl_a",
    label: "Коммерческие права CDL: A",
    shortLabel: "CDL: A",
    documentTitle: "COMMERCIAL DRIVER LICENSE",
    category: "CDL A",
    price: 22500,
    validityDays: 30,
    numberPrefix: 85,
    variant: "transport",
    acquisitionChannel: "trucker_vendor",
    vendorAvailable: false,
  },
};

const PLAYER_RANGE = 3.2;
const LICENSE_CACHE_TTL_MS = 60000;
const playerLicenses = new Map();
const loadingLicenses = new Map();
const licenseLoadedAt = new Map();
const licenseLoadGeneration = new WeakMap();

let schemaPromise = null;

try {
  global.__twinkleLicenseRuntime?.shutdown?.();
} catch (error) {
  console.error("[LICENSES] Previous runtime shutdown failed:", error);
}

const licenseRuntime = { active: true, events: [], shutdown: null };
global.__twinkleLicenseRuntime = licenseRuntime;

function registerLicenseEvent(name, handler) {
  if (typeof mp === "undefined" || !mp?.events?.add) return null;

  const guarded = (...args) => licenseRuntime.active ? handler(...args) : undefined;
  mp.events.add(name, guarded);
  licenseRuntime.events.push({ name, handler: guarded });
  return guarded;
}

function getCharacter(player) {
  return player?.character || player?.characterData || {};
}

function getCharacterUuid(player) {
  const character = getCharacter(player);

  return Number(
    player?.uuid ||
    player?.staticId ||
    player?.characterId ||
    player?.characterUuid ||
    character.uuid ||
    player?.getVariable?.("uuid") ||
    player?.getVariable?.("staticId") ||
    0
  );
}

function getCharacterNameParts(player) {
  const character = getCharacter(player);
  const firstName =
    character.username ||
    character.firstname ||
    character.firstName ||
    player?.firstName ||
    "New";
  const lastName =
    character.lastname ||
    character.lastName ||
    player?.lastName ||
    "Player";

  return {
    firstName: String(firstName),
    lastName: String(lastName),
  };
}

function getGenderLabel(player) {
  const gender = String(getCharacter(player).gender || player?.gender || "").toLowerCase();

  return gender === "female" || gender === "woman" ? "Женский" : "Мужской";
}

function getBirthDate(player) {
  const character = getCharacter(player);
  const raw = character.birthDate || character.birthday || character.dateOfBirth;

  if (typeof raw === "string" && raw.trim()) {
    if (raw.includes(".")) return raw;

    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return formatDate(parsed);
  }

  const age = Number(character.age || player?.age || 18);
  const birthYear = new Date().getFullYear() - Math.max(18, Math.min(age || 18, 90));

  return `01.01.${birthYear}`;
}

function getCharacterPhoto(player) {
  const character = getCharacter(player);

  return normalizeDocumentPhoto(
    character.avatar ||
    character.photo ||
    character.image ||
    player?.avatar ||
    player?.photo ||
    ""
  );
}

function getCash(player) {
  const character = getCharacter(player);

  return Number(
    character.cash ??
    player?.cash ??
    player?.money ??
    player?.getVariable?.("cash") ??
    0
  );
}

function setCash(player, value) {
  const cash = Math.max(0, Number(value || 0));

  if (player?.character) player.character.cash = cash;
  if (player?.characterData) player.characterData.cash = cash;

  player.cash = cash;
  player.money = cash;

  try { player.setVariable("cash", cash); } catch {}
  try { player.call("client:money:update", [cash]); } catch {}
  try { player.call("c:hud:update", [JSON.stringify({ player: { cash } })]); } catch {}
}

function sendNotification(player, message, variant = "info", duration = 4500) {
  if (!player || !message) return;

  try {
    player.call("client:notification", [String(variant), String(message), Number(duration)]);
  } catch {}
}

function sendSuccess(player, message) {
  try { chat.sendSuccess(player, message); } catch {}
  sendNotification(player, message, "success", 4500);
}

function sendInfo(player, message) {
  try { chat.sendInfo(player, message); } catch {}
  sendNotification(player, message, "info", 4500);
}

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function parseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp || Date.now()));

  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatSqlDate(timestamp) {
  const date = new Date(Number(timestamp || Date.now()));

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");
}

function addDays(timestamp, days) {
  const date = new Date(Number(timestamp || Date.now()));

  date.setDate(date.getDate() + Number(days || 0));
  return date.getTime();
}

function buildDocumentNumber(player, licenseId, issuedAt) {
  const uuid = getCharacterUuid(player) || Number(player?.id || 0);
  const config = LICENSE_TYPES[licenseId] || {};
  const prefix = Number(config.numberPrefix || 70);
  const date = new Date(Number(issuedAt || Date.now()));

  return `${prefix}${pad(uuid, 6)}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}`;
}

function buildLicenseRecord(player, licenseId) {
  const config = LICENSE_TYPES[licenseId];
  const issuedAt = Date.now();
  const expiresAt = Number(config.validityDays || 0) > 0
    ? addDays(issuedAt, config.validityDays)
    : 0;

  return {
    contractVersion: 1,
    documentKind: "license",
    id: licenseId,
    title: config.label,
    label: config.label,
    shortLabel: config.shortLabel || config.label,
    documentTitle: config.documentTitle,
    category: config.category,
    issuedAt,
    expiresAt,
    issuedAtLabel: formatDate(issuedAt),
    expiresAtLabel: expiresAt ? formatDate(expiresAt) : "Бессрочно",
    number: buildDocumentNumber(player, licenseId, issuedAt),
    variant: config.variant || "default",
  };
}

function isRecordActive(record) {
  if (!record) return false;
  const expiresAt = normalizeTimestamp(record.expiresAt);
  if (!expiresAt) return true;

  return expiresAt > Date.now();
}

function normalizeRecord(row) {
  if (!row) return null;

  const licenseId = String(row.license_id || row.id || "");
  const config = LICENSE_TYPES[licenseId];

  if (!config) return null;

  const data = parseJson(row.data, {});
  const issuedAt = normalizeTimestamp(row.issued_at || data.issuedAt || data.issued_at);
  const expiresAt = normalizeTimestamp(row.expires_at || data.expiresAt || data.expires_at);

  return {
    id: licenseId,
    title: String(row.license_label || data.title || data.label || config.label),
    label: String(row.license_label || data.label || config.label),
    shortLabel: String(data.shortLabel || config.shortLabel || config.label),
    documentTitle: String(data.documentTitle || config.documentTitle),
    category: String(row.category || data.category || config.category),
    issuedAt,
    expiresAt,
    issuedAtLabel: data.issuedAtLabel || formatDate(issuedAt || Date.now()),
    expiresAtLabel: data.expiresAtLabel || (expiresAt ? formatDate(expiresAt) : "Бессрочно"),
    number: String(row.document_number || data.number || ""),
    variant: String(data.variant || config.variant || "default"),
  };
}

function normalizeLegacyStore(player) {
  const character = getCharacter(player);
  const raw = character.licenses || player?.licenses || player?.getVariable?.("licenses");
  const legacy = parseJson(raw, {});
  const store = {};

  Object.entries(legacy || {}).forEach(([licenseId, value]) => {
    const config = LICENSE_TYPES[licenseId];
    if (!config || !value) return;

    const record = {
      ...buildLicenseRecord(player, licenseId),
      ...(typeof value === "object" ? value : {}),
      id: licenseId,
      label: config.label,
      title: config.label,
      documentTitle: config.documentTitle,
      category: config.category,
      variant: config.variant,
    };

    record.issuedAt = normalizeTimestamp(record.issuedAt) || Date.now();
    record.expiresAt = normalizeTimestamp(record.expiresAt);
    record.issuedAtLabel = record.issuedAtLabel || formatDate(record.issuedAt);
    record.expiresAtLabel = record.expiresAtLabel || (record.expiresAt ? formatDate(record.expiresAt) : "Бессрочно");
    record.number = record.number || buildDocumentNumber(player, licenseId, record.issuedAt);

    if (isRecordActive(record)) {
      store[licenseId] = record;
    }
  });

  return store;
}

function ensureLicenseSchema() {
  if (!schemaPromise) {
    schemaPromise = Promise.resolve()
      .then(async () => {
        const [columns, indexes] = await Promise.all([
          database.query("SHOW COLUMNS FROM character_licenses"),
          database.query("SHOW INDEX FROM character_licenses"),
        ]);
        const requiredColumns = new Map([
          ["id", "bigint"], ["static_id", "bigint"], ["license_id", "varchar(64)"],
          ["license_label", "varchar(128)"], ["category", "varchar(64)"],
          ["issued_at", "datetime"], ["expires_at", "datetime"],
          ["document_number", "varchar(48)"], ["data", "longtext"],
          ["created_at", "timestamp"], ["updated_at", "timestamp"],
        ]);
        const columnMap = new Map((columns || []).map((row) => [String(row.Field), row]));
        const invalidColumns = [...requiredColumns].filter(([name, type]) => {
          const column = columnMap.get(name);
          return !column || !String(column.Type || "").toLowerCase().includes(type);
        }).map(([name]) => name);
        const uniqueRows = (indexes || [])
          .filter((row) => String(row.Key_name) === "uq_character_licenses_static_license")
          .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index));
        const uniqueColumns = uniqueRows.map((row) => String(row.Column_name)).join(",");
        const hasExpectedUniqueIndex = uniqueRows.length === 2 &&
          uniqueRows.every((row) => Number(row.Non_unique) === 0) &&
          uniqueColumns === "static_id,license_id";

        if (invalidColumns.length || !hasExpectedUniqueIndex) {
          throw new Error(
            `character_licenses schema is incompatible; import the current database/schema.sql (columns: ${invalidColumns.join(", ") || "ok"}, unique index: ${hasExpectedUniqueIndex ? "ok" : "invalid"}).`
          );
        }
      })
      .catch((error) => { throw error; });
  }

  return schemaPromise;
}

async function loadLicenseStoreFromDatabase(staticId) {
  await ensureLicenseSchema();

  const rows = await database.query(
    `
    SELECT license_id, license_label, category, issued_at, expires_at, document_number, data
    FROM character_licenses
    WHERE static_id = ?
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY issued_at DESC
    `,
    [Number(staticId)]
  );

  const store = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const record = normalizeRecord(row);
    if (record && isRecordActive(record)) {
      store[record.id] = record;
    }
  });

  return store;
}

async function persistRecord(staticId, record, conn = null) {
  const run = async (connection) => {
    await connection.query(
      `
      INSERT INTO character_licenses
        (static_id, license_id, license_label, category, issued_at, expires_at, document_number, data)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        license_label = VALUES(license_label),
        category = VALUES(category),
        issued_at = VALUES(issued_at),
        expires_at = VALUES(expires_at),
        document_number = VALUES(document_number),
        data = VALUES(data)
      `,
      [
        Number(staticId),
        String(record.id),
        String(record.label || record.title || record.id),
        String(record.category || ""),
        formatSqlDate(record.issuedAt),
        record.expiresAt ? formatSqlDate(record.expiresAt) : null,
        String(record.number || ""),
        JSON.stringify(record),
      ]
    );
  };

  await ensureLicenseSchema();
  if (conn) return run(conn);
  return database.withConn(run);
}

async function importLegacyStore(player, staticId, store) {
  const legacy = normalizeLegacyStore(player);
  const missing = Object.entries(legacy).filter(([licenseId]) => !store[licenseId]);

  if (!missing.length) return store;

  await database.withConn(async (connection) => {
    for (const [, record] of missing) {
      await persistRecord(staticId, record, connection);
      store[record.id] = record;
    }
  });

  return store;
}

function setLicenseStore(player, store) {
  const staticId = getCharacterUuid(player);
  if (!staticId) return;

  playerLicenses.set(staticId, store || {});

  if (player?.character) player.character.licenses = store || {};
  if (player?.characterData) player.characterData.licenses = store || {};
  player.licenses = store || {};
  licenseLoadedAt.set(staticId, Date.now());

  try {
    player.setVariable("licenses", JSON.stringify(store || {}));
  } catch {}
}

function getCachedStore(player) {
  const staticId = getCharacterUuid(player);
  if (!staticId) return normalizeLegacyStore(player);

  if (!playerLicenses.has(staticId)) {
    const legacy = normalizeLegacyStore(player);
    playerLicenses.set(staticId, legacy);
    ensurePlayerLicenses(player).catch((error) => {
      console.error("[LICENSES] Async cache warmup failed:", error);
    });
  }

  return playerLicenses.get(staticId) || {};
}

async function ensurePlayerLicenses(player, options = {}) {
  const staticId = getCharacterUuid(player);
  if (!staticId) return {};

  const loadedAt = Number(licenseLoadedAt.get(staticId) || 0);
  if (
    options.force !== true &&
    playerLicenses.has(staticId) &&
    Date.now() - loadedAt < LICENSE_CACHE_TTL_MS
  ) {
    return playerLicenses.get(staticId) || {};
  }

  if (loadingLicenses.has(staticId)) {
    return loadingLicenses.get(staticId);
  }

  const generation = Number(licenseLoadGeneration.get(player) || 0);

  const promise = Promise.resolve()
    .then(async () => {
      const dbStore = await loadLicenseStoreFromDatabase(staticId);
      const store = await importLegacyStore(player, staticId, dbStore);

      if (
        Number(licenseLoadGeneration.get(player) || 0) === generation &&
        mp.players.exists(player) &&
        getCharacterUuid(player) === staticId
      ) {
        setLicenseStore(player, store);
      }
      return store;
    })
    .finally(() => {
      loadingLicenses.delete(staticId);
    });

  loadingLicenses.set(staticId, promise);
  return promise;
}

async function loadPlayerLicenses(player, options = {}) {
  return ensurePlayerLicenses(player, options);
}

function clearPlayerLicenses(player) {
  const staticId = getCharacterUuid(player);
  if (staticId) {
    licenseLoadGeneration.set(player, Number(licenseLoadGeneration.get(player) || 0) + 1);
    playerLicenses.delete(staticId);
    loadingLicenses.delete(staticId);
    licenseLoadedAt.delete(staticId);
  }
}

function hasLicenseCached(player, licenseId) {
  const record = getCachedStore(player)?.[licenseId];

  return isRecordActive(record);
}

async function hasLicense(player, licenseId) {
  const store = await ensurePlayerLicenses(player);
  const record = store?.[licenseId];

  return isRecordActive(record);
}

async function hasLicenseDocumentItem(player, licenseId) {
  const itemId = getLicenseDocumentItemId(licenseId);
  const staticId = getCharacterUuid(player);
  if (!itemId || !staticId) return false;
  const items = await inventory.getItemsById(player, itemId);
  return items.some((item) => (
    String(item.itemId || item.id) === itemId &&
    String(item.licenseId || "") === String(licenseId) &&
    String(item.documentKey || "") === `license:${licenseId}` &&
    Number(item.ownerStaticId || 0) === staticId &&
    item.bound === true
  ));
}

async function requireLicenseDocumentItem(player, licenseId) {
  if (!await hasLicenseDocumentItem(player, licenseId)) {
    const config = LICENSE_TYPES[licenseId];
    throw new Error(`Документ отсутствует в инвентаре: ${config?.shortLabel || config?.label || licenseId}.`);
  }
}

async function buyLicenseUnlocked(player, licenseId, options = {}) {
  const config = LICENSE_TYPES[licenseId];

  if (!config) {
    throw new Error("Лицензия не найдена.");
  }

  const staticId = getCharacterUuid(player);
  if (!staticId) {
    throw new Error("Персонаж не загружен.");
  }

  await ensureLicenseSchema();
  await ensurePlayerLicenses(player);

  let record = buildLicenseRecord(player, licenseId);
  let remainingCash = getCash(player);
  let staged = null;
  let reissued = false;

  await database.withConn(async (connection) => {
    await connection.beginTransaction();

    try {
      const [characters] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [staticId]
      );

      if (!characters?.[0]) {
        throw new Error("Персонаж не найден в базе.");
      }

      const currentCash = Math.max(0, Number(characters[0].cash || 0));

      const [existingRows] = await connection.query(
        `
        SELECT license_id, expires_at
        FROM character_licenses
        WHERE static_id = ? AND license_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [staticId, licenseId]
      );

      const existing = existingRows?.[0];
      const existingExpiresAt = normalizeTimestamp(existing?.expires_at);
      const existingActive = existing && (!existingExpiresAt || existingExpiresAt > Date.now());
      if (existingActive) {
        record = getCachedStore(player)?.[licenseId] || record;
        remainingCash = currentCash;
        reissued = true;
      } else {
        if (currentCash < Number(config.price || 0)) {
          throw new Error(`Недостаточно наличных. Нужно $${config.price}.`);
        }

        remainingCash = currentCash - Number(config.price || 0);
        await persistRecord(staticId, record, connection);

        if (Number(config.price || 0) > 0) {
          await connection.query(
            "UPDATE characters SET cash = ? WHERE uuid = ?",
            [remainingCash, staticId]
          );
        }
      }

      staged = await inventory.stageBoundItemInstance(
        connection,
        player,
        getLicenseDocumentItemId(licenseId),
        {
          documentKey: `license:${licenseId}`,
          documentNumber: String(record.number || ""),
          expiresAt: record.expiresAt ? new Date(record.expiresAt).toISOString() : null,
          issuedAt: new Date(record.issuedAt || Date.now()).toISOString(),
          licenseId,
          name: config.label,
        }
      );
      if (existingActive && staged.added !== true) {
        throw new Error("У вас уже есть эта лицензия и её документ находится в инвентаре.");
      }

      if (typeof options.transactionWork === "function") {
        await options.transactionWork(connection, {
          licenseId,
          record: { ...record },
          stagedItem: { ...staged.item },
          reissued,
        });
      }

      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });

  const store = {
    ...getCachedStore(player),
    [licenseId]: record,
  };

  licenseLoadGeneration.set(player, Number(licenseLoadGeneration.get(player) || 0) + 1);
  try {
    setCash(player, remainingCash);
  } catch (error) {
    console.error(`[LICENSES] Cash sync failed after commit for ${licenseId}:`, error);
  }
  try {
    setLicenseStore(player, store);
  } catch (error) {
    console.error(`[LICENSES] License cache sync failed after commit for ${licenseId}:`, error);
  }
  if (staged?.inventory) {
    try {
      await inventory.syncInventorySnapshot(player, staged.inventory);
    } catch (error) {
      console.error(`[LICENSES] Inventory sync failed after commit for ${licenseId}:`, error);
    }
  }

  sendSuccess(
    player,
    reissued
      ? `Документ лицензии восстановлен: ${config.shortLabel || config.label}.`
      : `Лицензия получена: ${config.shortLabel || config.label}. Документ добавлен в инвентарь.`
  );

  return record;
}

async function issueLicenseForChannel(player, licenseId, acquisitionChannel, options = {}) {
  const config = LICENSE_TYPES[licenseId];
  if (!config || config.acquisitionChannel !== acquisitionChannel) {
    throw new Error("Эта лицензия выдаётся только после соответствующего задания или экзамена.");
  }

  return inventory.runExclusiveOrThrow(
    player,
    `license_issue:${String(acquisitionChannel)}:${String(licenseId || "unknown")}`,
    () => buyLicenseUnlocked(player, licenseId, options)
  );
}

async function issueQuestLicense(player, licenseId, options = {}) {
  return issueLicenseForChannel(player, licenseId, "quest", options);
}

async function issueDrivingExamLicense(player, licenseId) {
  return issueLicenseForChannel(player, licenseId, "driving_exam");
}

async function issueTruckerLicense(player, licenseId, options = {}) {
  return issueLicenseForChannel(player, licenseId, "trucker_vendor", options);
}

async function issueVendorLicense(player, licenseId, options = {}) {
  const config = LICENSE_TYPES[licenseId];

  if (!config || config.vendorAvailable !== true) {
    throw new Error("Эта лицензия не оформляется в отделе лицензирования.");
  }

  return inventory.runExclusiveOrThrow(
    player,
    `license_issue:vendor:${String(licenseId || "unknown")}`,
    () => buyLicenseUnlocked(player, licenseId, options)
  );
}

async function getLicenseDocument(player, licenseId) {
  const config = LICENSE_TYPES[licenseId];

  if (!config) {
    throw new Error("Лицензия не найдена.");
  }

  const store = await ensurePlayerLicenses(player);
  const record = store?.[licenseId];

  if (!record || !isRecordActive(record)) {
    throw new Error(`У вас нет лицензии: ${config.shortLabel || config.label}.`);
  }

  const { firstName, lastName } = getCharacterNameParts(player);
  const staticId = getCharacterUuid(player);

  return {
    id: licenseId,
    type: config.documentTitle,
    title: config.label,
    category: record.category || config.category,
    variant: record.variant || config.variant || "default",
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    gender: getGenderLabel(player),
    birthDate: getBirthDate(player),
    issuedAt: record.issuedAtLabel || formatDate(record.issuedAt),
    expiresAt: record.expiresAtLabel || (record.expiresAt ? formatDate(record.expiresAt) : "Бессрочно"),
    number: record.number || buildDocumentNumber(player, licenseId, record.issuedAt || Date.now()),
    signature: `${firstName[0] || "N"}. ${lastName}`,
    photo: getCharacterPhoto(player),
    ownerStaticId: staticId,
  };
}

function getDistance(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;

  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getNearestPlayer(player, range = PLAYER_RANGE) {
  if (typeof mp === "undefined" || !player || !mp.players.exists(player)) return null;

  let nearest = null;
  let nearestDistance = Number(range);
  const dimension = Number(player.dimension || 0);

  mp.players.forEach((target) => {
    if (!target || target === player || !mp.players.exists(target)) return;
    if (Number(target.dimension || 0) !== dimension) return;

    const distance = getDistance(player.position, target.position);

    if (distance <= nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function getDisplayName(player) {
  const { firstName, lastName } = getCharacterNameParts(player);
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || String(player?.name || `Player #${player?.id ?? "?"}`).replace("_", " ");
}

async function showLicense(player, licenseId, viewer = player, options = {}) {
  await requireLicenseDocumentItem(player, licenseId);
  const payload = await getLicenseDocument(player, licenseId);

  if (!player || !mp.players.exists(player) || !viewer || !mp.players.exists(viewer)) {
    throw new Error("Владелец или получатель лицензии уже отключился.");
  }
  if (viewer !== player && Number.isFinite(Number(options.maxRange))) {
    if (Number(viewer.dimension || 0) !== Number(player.dimension || 0)) {
      throw new Error("Получатель лицензии находится в другом измерении.");
    }
    if (getDistance(player.position, viewer.position) > Number(options.maxRange)) {
      throw new Error("Получатель лицензии отошел слишком далеко.");
    }
  }

  try {
    viewer.call("c:licenseDocument:show", [JSON.stringify(payload)]);
  } catch (error) {
    throw new Error(`Не удалось показать лицензию: ${error.message || "ошибка доставки"}`);
  }

  return payload;
}

async function showLicenseToViewer(player, licenseId, viewer = player, range = PLAYER_RANGE) {
  const config = LICENSE_TYPES[licenseId];
  const target = viewer || player;

  if (target !== player) {
    if (Number(target.dimension || 0) !== Number(player.dimension || 0)) {
      throw new Error("Получатель лицензии находится в другом измерении.");
    }
    if (getDistance(player.position, target.position) > Number(range)) {
      throw new Error("Получатель лицензии отошел слишком далеко.");
    }
  }

  const payload = await showLicense(player, licenseId, target, { maxRange: range });

  if (target !== player) {
    sendSuccess(player, `Вы показали ${getDisplayName(target)}: ${config?.shortLabel || payload.title}.`);
    sendInfo(target, `${getDisplayName(player)} показал вам лицензию: ${config?.shortLabel || payload.title}.`);
  } else {
    sendInfo(player, "Лицензия открыта для личного просмотра.");
  }

  return payload;
}

async function showLicenseToNearest(player, licenseId, range = PLAYER_RANGE) {
  return showLicenseToViewer(player, licenseId, getNearestPlayer(player, range) || player, range);
}

function getLicenseRadialState(player, licenseId) {
  const config = LICENSE_TYPES[licenseId];
  const available = hasLicenseCached(player, licenseId);

  return {
    available,
    disabledReason: available ? "" : `Нет лицензии: ${config?.shortLabel || config?.label || licenseId}.`,
  };
}

function getOwnedLicenseIds(player) {
  const store = getCachedStore(player);

  return Object.keys(store || {}).filter((licenseId) => hasLicenseCached(player, licenseId));
}

function getLicenseDefinition(licenseId) {
  return LICENSE_TYPES[licenseId] || null;
}

registerLicenseEvent("licenses:characterReady", (player) => {
  ensurePlayerLicenses(player).catch((error) => {
    console.error("[LICENSES] Character licenses load failed:", error);
  });
});

registerLicenseEvent("playerQuit", (player) => {
  clearPlayerLicenses(player);
});

ensureLicenseSchema()
  .then(() => console.log("[LICENSES] Database schema ready"))
  .catch((error) => console.error("[LICENSES] Database schema unavailable; licences are disabled:", error));

licenseRuntime.shutdown = () => {
  licenseRuntime.active = false;
  for (const entry of licenseRuntime.events.splice(0)) {
    try { mp.events.remove?.(entry.name, entry.handler); } catch {}
  }
};

module.exports = {
  LICENSE_TYPES,
  clearPlayerLicenses,
  getLicenseDefinition,
  getLicenseDocument,
  getLicenseRadialState,
  hasLicenseDocumentItem,
  getOwnedLicenseIds,
  hasLicense,
  hasLicenseCached,
  issueDrivingExamLicense,
  issueQuestLicense,
  issueTruckerLicense,
  issueVendorLicense,
  requireLicenseDocumentItem,
  loadPlayerLicenses,
  showLicense,
  showLicenseToNearest,
  showLicenseToViewer,
};
