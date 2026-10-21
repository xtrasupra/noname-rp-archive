"use strict";

const database = require("../../database");
const chat = require("../chat/chat.service.js");
const inventory = require("../inventory/inventory.service.js");
const radialMenuRegistry = require("../radialMenu/radialMenu.registry.js");
const { DOCUMENT_ITEM_IDS } = require("./document.items.js");
const { normalizeDocumentPhoto } = require("./document.photo.js");

const DOCUMENT_CONTRACT_VERSION = 1;
const PLAYER_RANGE = 3.2;
const IDENTITY_DOCUMENT_TYPE = "identity_card";
const MEDICAL_DOCUMENT_TYPE = "medical_certificate";
const MEDICAL_VALIDITY_DAYS = 14;
const DOCUMENT_CACHE_TTL_MS = 30000;
const DOCUMENT_CACHE_MAX_ENTRIES = 512;

let schemaPromise = null;
let lastAvailabilityErrorAt = 0;
const documentCache = new Map();
const documentLoads = new Map();
const documentCacheGeneration = new WeakMap();

function setDocumentCache(cacheKey, row) {
  const now = Date.now();

  for (const [key, entry] of documentCache) {
    if (now - entry.loadedAt >= DOCUMENT_CACHE_TTL_MS) documentCache.delete(key);
  }
  while (documentCache.size >= DOCUMENT_CACHE_MAX_ENTRIES) {
    const oldestKey = documentCache.keys().next().value;
    if (oldestKey === undefined) break;
    documentCache.delete(oldestKey);
  }

  documentCache.delete(cacheKey);
  documentCache.set(cacheKey, { loadedAt: now, row });
}

function clearPlayerDocumentCache(player) {
  const staticId = getStaticId(player);
  if (!staticId) return;

  documentCacheGeneration.set(player, Number(documentCacheGeneration.get(player) || 0) + 1);
  const prefix = `${staticId}:`;
  for (const key of documentCache.keys()) {
    if (key.startsWith(prefix)) documentCache.delete(key);
  }
}

function getCharacter(player) {
  return player?.character || player?.characterData || {};
}

function getStaticId(player) {
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

function getNameParts(player) {
  const character = getCharacter(player);
  const firstName = String(
    character.username || character.firstname || character.firstName || player?.firstName || "New"
  ).slice(0, 64);
  const lastName = String(
    character.lastname || character.lastName || player?.lastName || "Player"
  ).slice(0, 64);

  return { firstName, lastName, fullName: `${firstName} ${lastName}`.trim() };
}

function getGender(player) {
  const raw = String(getCharacter(player).gender || player?.gender || "").toLowerCase();
  return raw === "female" || raw === "woman" || raw === "f" ? "Женский" : "Мужской";
}

function getAge(player) {
  const age = Number(getCharacter(player).age || player?.age || 18);
  return Math.max(18, Math.min(100, Number.isFinite(age) ? Math.trunc(age) : 18));
}

function getPhoto(player) {
  const character = getCharacter(player);
  return normalizeDocumentPhoto(
    character.avatar || character.photo || character.image || player?.avatar || player?.photo || ""
  );
}

function getResidence(player) {
  const character = getCharacter(player);
  return String(
    character.residence ||
    character.registrationAddress ||
    character.address ||
    character.houseAddress ||
    "Нет прописки"
  ).slice(0, 128);
}

function getMaritalStatus(player) {
  const character = getCharacter(player);
  const partner = character.spouseName || character.partnerName || character.marriedToName;

  if (partner) return `В браке с ${String(partner).slice(0, 96)}`;
  if (character.married || character.isMarried) return "В браке";
  return "Не состоит в браке";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatDateTime(value = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toSqlDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Invalid document date.");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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

function ensureDocumentSchema() {
  if (!schemaPromise) {
    schemaPromise = Promise.resolve()
      .then(async () => {
        const [columns, indexes] = await Promise.all([
          database.query("SHOW COLUMNS FROM character_documents"),
          database.query("SHOW INDEX FROM character_documents"),
        ]);
        const requiredColumns = new Map([
          ["id", "bigint"], ["static_id", "bigint"], ["document_type", "varchar(64)"],
          ["document_number", "varchar(48)"], ["issuer_static_id", "bigint"],
          ["issuer_name", "varchar(128)"], ["payload", "longtext"], ["issued_at", "datetime"],
          ["expires_at", "datetime"], ["revoked_at", "datetime"], ["created_at", "timestamp"],
          ["updated_at", "timestamp"],
        ]);
        const columnMap = new Map((columns || []).map((row) => [String(row.Field), row]));
        const invalidColumns = [...requiredColumns].filter(([name, type]) => {
          const column = columnMap.get(name);
          return !column || !String(column.Type || "").toLowerCase().includes(type);
        }).map(([name]) => name);
        const uniqueRows = (indexes || [])
          .filter((row) => String(row.Key_name) === "uq_character_documents_active_slot")
          .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index));
        const uniqueColumns = uniqueRows.map((row) => String(row.Column_name)).join(",");
        const hasExpectedUniqueIndex = uniqueRows.length === 2 &&
          uniqueRows.every((row) => Number(row.Non_unique) === 0) &&
          uniqueColumns === "static_id,document_type";

        if (invalidColumns.length || !hasExpectedUniqueIndex) {
          throw new Error(
            `character_documents schema is incompatible; import the current db/twinkledb.sql (columns: ${invalidColumns.join(", ") || "ok"}, unique index: ${hasExpectedUniqueIndex ? "ok" : "invalid"}).`
          );
        }
      })
      .catch((error) => { throw error; });
  }

  return schemaPromise;
}

function getDistance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  const dx = Number(left.x || 0) - Number(right.x || 0);
  const dy = Number(left.y || 0) - Number(right.y || 0);
  const dz = Number(left.z || 0) - Number(right.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function buildIdentityDocument(player) {
  const character = getCharacter(player);
  const staticId = getStaticId(player);
  const { firstName, lastName, fullName } = getNameParts(player);
  const issuedAt = character.created_at || character.createdAt || Date.now();

  return {
    contractVersion: DOCUMENT_CONTRACT_VERSION,
    documentKind: "identity",
    id: "identity_card",
    type: "SAN ANDREAS IDENTIFICATION CARD",
    title: "Удостоверение личности",
    firstName,
    lastName,
    fullName,
    age: getAge(player),
    gender: getGender(player),
    residence: getResidence(player),
    maritalStatus: getMaritalStatus(player),
    issuedAt: formatDate(issuedAt),
    number: String(staticId || player?.id || 0).padStart(6, "0"),
    signature: `${firstName[0] || "N"}. ${lastName}`,
    photo: getPhoto(player),
    ownerStaticId: staticId,
  };
}

async function getStoredDocument(player, documentType, options = {}) {
  const staticId = getStaticId(player);
  if (!staticId) return null;

  const cacheKey = `${staticId}:${String(documentType)}`;
  const generation = Number(documentCacheGeneration.get(player) || 0);
  const cached = documentCache.get(cacheKey);
  if (options.force !== true && cached && Date.now() - cached.loadedAt < DOCUMENT_CACHE_TTL_MS) {
    const expiresAt = cached.row?.expires_at ? new Date(cached.row.expires_at).getTime() : Number.POSITIVE_INFINITY;
    if (expiresAt <= Date.now()) {
      documentCache.delete(cacheKey);
      return null;
    }
    return cached.row;
  }
  if (documentLoads.has(cacheKey)) return documentLoads.get(cacheKey);

  const load = Promise.resolve()
    .then(async () => {
      await ensureDocumentSchema();
      const rows = await database.query(
        `
        SELECT document_number, issuer_static_id, issuer_name, payload, issued_at, expires_at
        FROM character_documents
        WHERE static_id = ?
          AND document_type = ?
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
        `,
        [staticId, String(documentType)]
      );
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (
        Number(documentCacheGeneration.get(player) || 0) === generation &&
        mp.players.exists(player) &&
        getStaticId(player) === staticId
      ) {
        setDocumentCache(cacheKey, row);
      }
      return row;
    })
    .finally(() => documentLoads.delete(cacheKey));

  documentLoads.set(cacheKey, load);
  return load;
}

async function hasDocumentItem(player, itemId) {
  const staticId = getStaticId(player);
  if (!staticId) return false;
  const items = await inventory.getItemsById(player, itemId);
  return items.some((item) => (
    String(item.itemId || item.id) === String(itemId) &&
    Number(item.ownerStaticId || 0) === staticId &&
    item.bound === true
  ));
}

async function requireDocumentItem(player, itemId, label) {
  if (!await hasDocumentItem(player, itemId)) {
    throw new Error(`${label} отсутствует в инвентаре.`);
  }
}

async function getIdentityDocument(player) {
  const row = await getStoredDocument(player, IDENTITY_DOCUMENT_TYPE);
  if (!row) return null;

  const stored = parseJson(row.payload, {});
  return {
    ...buildIdentityDocument(player),
    ...stored,
    contractVersion: DOCUMENT_CONTRACT_VERSION,
    documentKind: "identity",
    id: IDENTITY_DOCUMENT_TYPE,
    issuedAt: formatDate(row.issued_at),
    number: String(row.document_number || stored.number || ""),
    ownerStaticId: getStaticId(player),
    photo: normalizeDocumentPhoto(stored.photo || getPhoto(player)),
  };
}

async function getMedicalDocument(player) {
  const row = await getStoredDocument(player, MEDICAL_DOCUMENT_TYPE);
  if (!row) return null;

  const data = parseJson(row.payload, {});
  const { firstName, lastName, fullName } = getNameParts(player);

  return {
    contractVersion: DOCUMENT_CONTRACT_VERSION,
    documentKind: "medical",
    id: MEDICAL_DOCUMENT_TYPE,
    type: "ДЕПАРТАМЕНТ ЗДРАВООХРАНЕНИЯ",
    title: "Врачебное свидетельство о здоровье",
    firstName,
    lastName,
    fullName,
    gender: getGender(player),
    issuedAt: formatDateTime(row.issued_at),
    expiresAt: row.expires_at ? formatDateTime(row.expires_at) : "Бессрочно",
    number: String(row.document_number || ""),
    ownerStaticId: getStaticId(player),
    issuerName: String(row.issuer_name || data.issuerName || "Департамент здравоохранения").slice(0, 128),
    physicalHealthy: data.physicalHealthy === true,
    mentalHealthy: data.mentalHealthy === true,
    notes: String(data.notes || "").slice(0, 500),
    validityDays: Math.max(1, Math.min(365, Number(data.validityDays || MEDICAL_VALIDITY_DAYS))),
  };
}

async function issueIdentityCardQuestReward(player, options = {}) {
  const staticId = getStaticId(player);
  if (!Number.isSafeInteger(staticId) || staticId <= 0) {
    throw new Error("Персонаж не загружен.");
  }

  await ensureDocumentSchema();
  const cacheKey = `${staticId}:${IDENTITY_DOCUMENT_TYPE}`;
  if (documentLoads.has(cacheKey)) await documentLoads.get(cacheKey);

  let staged = null;
  let documentNumber = "";
  let issuedAt = null;
  let created = false;

  await inventory.runExclusiveOrThrow(player, "identity_document_quest_reward", async () => {
    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [rows] = await connection.query(
          `SELECT document_number, payload, issued_at
           FROM character_documents
           WHERE static_id = ? AND document_type = ? AND revoked_at IS NULL
           LIMIT 1 FOR UPDATE`,
          [staticId, IDENTITY_DOCUMENT_TYPE]
        );
        const existing = rows?.[0] || null;
        const basePayload = buildIdentityDocument(player);
        documentNumber = String(existing?.document_number || basePayload.number);
        issuedAt = existing?.issued_at ? new Date(existing.issued_at) : new Date();
        const payload = existing
          ? { ...basePayload, ...parseJson(existing.payload, {}) }
          : basePayload;

        staged = await inventory.stageBoundItemInstance(
          connection,
          player,
          DOCUMENT_ITEM_IDS.identity,
          {
            documentKey: "identity",
            documentNumber,
            issuedAt: issuedAt.toISOString(),
          }
        );
        if (existing && staged.added !== true) {
          throw new Error("ID-карта уже получена и находится в инвентаре.");
        }

        if (!existing) {
          await connection.query(
            `INSERT INTO character_documents
              (static_id, document_type, document_number, issuer_static_id, issuer_name, payload, issued_at, expires_at, revoked_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL)`,
            [
              staticId,
              IDENTITY_DOCUMENT_TYPE,
              documentNumber,
              String(options.issuerName || "Мэрия Los Santos").slice(0, 128),
              JSON.stringify(payload),
              toSqlDate(issuedAt),
            ]
          );
          created = true;
        }

        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });
  });

  clearPlayerDocumentCache(player);
  if (staged?.inventory) await inventory.syncInventorySnapshot(player, staged.inventory);
  return { created, documentNumber, issuedAt, reissued: !created && staged?.added === true };
}

async function issueMedicalCertificate(options) {
  const staticId = Number(options?.staticId || getStaticId(options?.player));
  const issuerStaticId = Number(options?.issuerStaticId || getStaticId(options?.issuer));
  const inferredIssuerName = options?.issuer
    ? getNameParts(options.issuer).fullName
    : "Департамент здравоохранения";
  const issuerName = String(options?.issuerName || inferredIssuerName).slice(0, 128);
  const validityDays = Math.max(1, Math.min(365, Number(options?.validityDays || MEDICAL_VALIDITY_DAYS)));
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + validityDays * 86400000);

  if (!Number.isSafeInteger(staticId) || staticId <= 0) throw new TypeError("A valid character static ID is required.");

  const documentNumber = `MED-${staticId}-${issuedAt.getFullYear()}${pad(issuedAt.getMonth() + 1)}${pad(issuedAt.getDate())}`;
  const payload = {
    physicalHealthy: options?.physicalHealthy === true,
    mentalHealthy: options?.mentalHealthy === true,
    notes: String(options?.notes || "").slice(0, 500),
    validityDays,
  };

  const cacheKey = `${staticId}:${MEDICAL_DOCUMENT_TYPE}`;
  if (documentLoads.has(cacheKey)) await documentLoads.get(cacheKey);

  const ownerPlayer = options?.player || null;
  if (ownerPlayer && getStaticId(ownerPlayer) !== staticId) {
    throw new Error("Получатель медицинского документа не совпадает с персонажем.");
  }

  await ensureDocumentSchema();
  const lockOwner = ownerPlayer || { uuid: staticId, id: `document:${staticId}` };
  let staged = null;
  await inventory.runExclusiveOrThrow(lockOwner, "medical_document_issue", async () => {
    await database.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        await connection.query(
          `
          INSERT INTO character_documents
            (static_id, document_type, document_number, issuer_static_id, issuer_name, payload, issued_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
          ON DUPLICATE KEY UPDATE
            document_number = VALUES(document_number),
            issuer_static_id = VALUES(issuer_static_id),
            issuer_name = VALUES(issuer_name),
            payload = VALUES(payload),
            issued_at = VALUES(issued_at),
            expires_at = VALUES(expires_at),
            revoked_at = NULL
          `,
          [
            staticId,
            MEDICAL_DOCUMENT_TYPE,
            documentNumber,
            issuerStaticId > 0 ? issuerStaticId : null,
            issuerName,
            JSON.stringify(payload),
            toSqlDate(issuedAt),
            toSqlDate(expiresAt),
          ]
        );
        staged = await inventory.stageBoundItemInstance(
          connection,
          staticId,
          DOCUMENT_ITEM_IDS.medical,
          {
            documentKey: "medical",
            documentNumber,
            expiresAt: expiresAt.toISOString(),
            issuedAt: issuedAt.toISOString(),
          }
        );
        await connection.commit();
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });
  });

  if (ownerPlayer) clearPlayerDocumentCache(ownerPlayer);
  else documentCache.delete(cacheKey);

  if (ownerPlayer && staged?.inventory) {
    await inventory.syncInventorySnapshot(ownerPlayer, staged.inventory);
  }

  return { documentNumber, expiresAt, issuedAt };
}

async function showToViewer(owner, payload, label, requestedViewer = owner) {
  if (!owner || !mp.players.exists(owner)) {
    throw new Error("Игрок уже отключился.");
  }

  const viewer = requestedViewer || owner;
  if (!mp.players.exists(viewer)) {
    throw new Error("Получатель документа уже отключился.");
  }
  if (viewer !== owner) {
    if (Number(viewer.dimension || 0) !== Number(owner.dimension || 0)) {
      throw new Error("Получатель документа находится в другом измерении.");
    }
    if (getDistance(owner.position, viewer.position) > PLAYER_RANGE) {
      throw new Error("Получатель документа отошел слишком далеко.");
    }
  }

  try {
    viewer.call("c:document:show", [JSON.stringify(payload)]);
  } catch (error) {
    throw new Error(`Не удалось показать документ: ${error.message || "ошибка доставки"}`);
  }

  if (viewer === owner) {
    chat.sendInfo(owner, "Документ открыт для личного просмотра.");
  } else {
    chat.sendSuccess(owner, `Вы показали ${getNameParts(viewer).fullName}: ${label}.`);
    chat.sendInfo(viewer, `${getNameParts(owner).fullName} показал вам: ${label}.`);
  }
}

async function showIdentityCard(player, viewer = player) {
  await requireDocumentItem(player, DOCUMENT_ITEM_IDS.identity, "ID-карта");
  const document = await getIdentityDocument(player);
  if (!document) throw new Error("ID-карта не оформлена. Получите её через квест в мэрии.");
  return showToViewer(player, document, "ID-карта", viewer);
}

async function showMedicalCertificate(player, viewer = player) {
  await requireDocumentItem(player, DOCUMENT_ITEM_IDS.medical, "Медицинское свидетельство");
  const document = await getMedicalDocument(player);
  if (!document) throw new Error("Действующее медицинское свидетельство не найдено.");
  return showToViewer(player, document, "медицинское свидетельство", viewer);
}

radialMenuRegistry.registerAction({
  owner: "documents",
  groupId: "documents",
  id: "docs:identity-card",
  label: "ID-карта",
  icon: "id-card",
  description: "Открыть удостоверение личности.",
  order: -200,
  targetKinds: ["self", "player"],
  resolve: async (player, context) => {
    const [stored, itemAvailable] = await Promise.all([
      getStoredDocument(player, IDENTITY_DOCUMENT_TYPE),
      hasDocumentItem(player, DOCUMENT_ITEM_IDS.identity),
    ]);
    const available = Boolean(stored && itemAvailable);
    return {
      description: context?.target?.kind === "player"
        ? "Показать удостоверение выбранному игроку."
        : "Открыть удостоверение для личного просмотра.",
      hidden: !available,
      disabledReason: available ? "" : "ID-карта отсутствует в инвентаре.",
    };
  },
  handler: (player, context) => showIdentityCard(player, context?.target?.entity || player),
});

mp.events.add("playerQuit", (player) => {
  clearPlayerDocumentCache(player);
});

radialMenuRegistry.registerAction({
  owner: "documents",
  groupId: "documents",
  id: "docs:medical-certificate",
  label: "Мед. свидетельство",
  shortLabel: "Мед. справка",
  icon: "badge-check",
  description: "Показать действующее врачебное свидетельство.",
  order: -190,
  targetKinds: ["self", "player"],
  resolve: async (player, context) => {
    try {
      const [stored, itemAvailable] = await Promise.all([
        getStoredDocument(player, MEDICAL_DOCUMENT_TYPE),
        hasDocumentItem(player, DOCUMENT_ITEM_IDS.medical),
      ]);
      const available = Boolean(stored && itemAvailable);
      return {
        description: context?.target?.kind === "player"
          ? "Показать свидетельство выбранному игроку."
          : "Открыть свидетельство для личного просмотра.",
        hidden: !available,
        disabledReason: available ? "" : "Медицинское свидетельство отсутствует в инвентаре.",
      };
    } catch (error) {
      if (Date.now() - lastAvailabilityErrorAt > 30000) {
        lastAvailabilityErrorAt = Date.now();
        console.error("[DOCUMENTS] Medical document availability failed:", error);
      }
      return { disabled: true, disabledReason: "Сервис документов временно недоступен." };
    }
  },
  handler: (player, context) => showMedicalCertificate(player, context?.target?.entity || player),
});

ensureDocumentSchema()
  .then(() => console.log("[DOCUMENTS] Database schema ready"))
  .catch((error) => console.error("[DOCUMENTS] Database schema unavailable; medical documents are disabled:", error));

module.exports = {
  DOCUMENT_CONTRACT_VERSION,
  IDENTITY_DOCUMENT_TYPE,
  MEDICAL_DOCUMENT_TYPE,
  buildIdentityDocument,
  clearPlayerDocumentCache,
  ensureDocumentSchema,
  getIdentityDocument,
  getMedicalDocument,
  hasDocumentItem,
  issueIdentityCardQuestReward,
  issueMedicalCertificate,
  showIdentityCard,
  showMedicalCertificate,
};
