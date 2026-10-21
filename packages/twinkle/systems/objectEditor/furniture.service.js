"use strict";

const crypto = require("crypto");
const db = require("../../database");
const authFlow = require("../../auth/authFlow.js");
const hud = require("../hud/hud.service.js");
const { getCondoDimension } = require("../condos/condos.config.js");

const PROPERTY_TYPES = new Set(["house", "apartment"]);

const FURNITURE_CATALOG = [
  { id: "sofa_basic", category: "Диваны", name: "Диван", model: "prop_couch_lg_02", price: 10000000 },
  { id: "sofa_modern", category: "Диваны", name: "Диван Modern", model: "prop_couch_03", price: 250000 },
  { id: "sofa_luxury", category: "Диваны", name: "Luxury", model: "prop_couch_lg_05", price: 420000 },
  { id: "sofa_classic", category: "Диваны", name: "Classic", model: "prop_couch_lg_06", price: 150000 },
  { id: "sofa_loft", category: "Диваны", name: "Loft", model: "prop_couch_lg_07", price: 190000 },
  { id: "sofa_premium", category: "Премиум-мебель", name: "Premium", model: "prop_couch_lg_08", price: 900000 },
  { id: "bed_basic", category: "Кровати", name: "Кровать", model: "v_res_msonbed", price: 180000 },
  { id: "table_round", category: "Столы", name: "Круглый стол", model: "prop_table_04", price: 70000 },
  { id: "chair_wood", category: "Стулья", name: "Стул", model: "prop_chair_04a", price: 35000 },
  { id: "wardrobe", category: "Шкафы", name: "Шкаф", model: "v_res_tre_wardrobe", price: 120000 },
  { id: "tv_flat", category: "Техника", name: "Телевизор", model: "prop_tv_flat_01", price: 210000 },
  { id: "lamp_floor", category: "Освещение", name: "Торшер", model: "v_res_m_lampstand", price: 45000 },
  { id: "plant_pot", category: "Растения", name: "Растение", model: "prop_plant_int_01a", price: 30000 },
  { id: "painting", category: "Картины", name: "Картина", model: "v_res_picture_frame", price: 55000 },
  { id: "storage_box", category: "Хранилища", name: "Ящик", model: "prop_boxpile_07d", price: 65000 },
];

const spawnedObjects = new Map();
const placementTickets = new Map();

const FURNITURE_LIMIT = 80;
const PLACEMENT_TICKET_TTL_MS = 120_000;
const MAX_PLACEMENT_DISTANCE = 40;

let schemaPromise = null;
let spawnerStarted = false;

function getCharacter(player) {
  return player?.character || player?.characterData || {};
}

function getCharacterUuid(player) {
  const character = getCharacter(player);
  return character.uuid || player?.characterUuid || player?.characterId || player?.uuid || 0;
}

function getCharacterName(player) {
  const character = getCharacter(player);
  const firstName = character.username || character.firstname || character.firstName || "";
  const lastName = character.lastname || character.lastName || "";

  return [firstName, lastName].filter(Boolean).join(" ") || player?.name || "";
}

function normalizePropertyKind(kind) {
  const value = String(kind || "").toLowerCase();

  if (!PROPERTY_TYPES.has(value)) {
    throw new Error("Неизвестный тип недвижимости.");
  }

  return value;
}

function normalizePropertyId(propertyId) {
  const id = Number(propertyId);

  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Некорректный объект недвижимости.");
  }

  return id;
}

function ensureCharacter(player) {
  const characterUuid = getCharacterUuid(player);

  if (!player?.auth || authFlow.getPhase(player) !== authFlow.PHASE.IN_GAME) {
    throw new Error("Персонаж не авторизован.");
  }

  if (!characterUuid) {
    throw new Error("Персонаж не выбран.");
  }

  return characterUuid;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toVector(row, prefix = "") {
  return {
    x: toNumber(row?.[`${prefix}x`]),
    y: toNumber(row?.[`${prefix}y`]),
    z: toNumber(row?.[`${prefix}z`]),
  };
}

function sanitizeVector(value, label) {
  const vector = typeof value === "object" && value ? value : {};
  const next = {
    x: Number(vector.x),
    y: Number(vector.y),
    z: Number(vector.z),
  };

  if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || !Number.isFinite(next.z)) {
    throw new Error(`${label}: некорректные координаты.`);
  }

  if (Math.abs(next.x) > 100000 || Math.abs(next.y) > 100000 || Math.abs(next.z) > 100000) {
    throw new Error(`${label}: координаты вне допустимого диапазона.`);
  }

  return next;
}

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function categoryList() {
  return [...new Set(FURNITURE_CATALOG.map((item) => item.category))];
}

function getCatalogItem(id) {
  const itemId = String(id || "");
  return FURNITURE_CATALOG.find((item) => item.id === itemId) || null;
}

function getPlacedId(payload) {
  const parsed = parsePayload(payload);
  const rawId = parsed.objectId
    || parsed.placedId
    || parsed.item?.objectId
    || parsed.item?.placedId
    || parsed.furnitureId;

  if (typeof rawId === "string" && rawId.startsWith("placed:")) {
    return Number(rawId.slice("placed:".length));
  }

  const numericId = Number(rawId);
  return Number.isFinite(numericId) && numericId > 0 ? numericId : 0;
}

function getModelHash(model) {
  if (typeof model === "number") return model;

  try {
    if (typeof mp !== "undefined" && typeof mp.joaat === "function") {
      return mp.joaat(String(model));
    }
  } catch {}

  return model;
}

function destroySpawnedObject(id) {
  const object = spawnedObjects.get(Number(id));

  if (!object) return;

  try {
    if (typeof object.destroy === "function") {
      object.destroy();
    }
  } catch (err) {
    console.log("[FURNITURE] destroy object error:", err.message);
  }

  spawnedObjects.delete(Number(id));
}

function spawnFurnitureObject(row) {
  if (!row || typeof mp === "undefined" || !mp.objects || !mp.Vector3) {
    return null;
  }

  destroySpawnedObject(row.id);

  try {
    const position = new mp.Vector3(toNumber(row.x), toNumber(row.y), toNumber(row.z));
    const rotation = new mp.Vector3(toNumber(row.rot_x), toNumber(row.rot_y), toNumber(row.rot_z));
    const object = mp.objects.new(getModelHash(row.model), position, {
      dimension: toNumber(row.dimension),
      rotation,
    });

    try {
      object.rotation = rotation;
      object.dimension = toNumber(row.dimension);
    } catch {}

    spawnedObjects.set(Number(row.id), object);
    return object;
  } catch (err) {
    console.log("[FURNITURE] spawn object error:", err.message);
    return null;
  }
}

async function validateFurnitureSchema() {
  const [columnRows] = await db.pool.query(
    `
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'property_furniture'
    `
  );
  const columnNames = new Set((columnRows || []).map((column) => String(column.COLUMN_NAME)));
  const requiredColumns = [
    "id", "property_type", "property_id", "catalog_id", "model", "name", "category",
    "price", "x", "y", "z", "rot_x", "rot_y", "rot_z", "dimension", "owner_uuid",
    "active", "created_at", "updated_at",
  ];
  const missingColumns = requiredColumns.filter((column) => !columnNames.has(column));

  if (missingColumns.length) {
    throw new Error(
      `property_furniture schema is incomplete (${missingColumns.join(", ")}); ` +
      "apply db/twinkle_property_furniture_migration.sql during approved maintenance"
    );
  }

  const [indexRows] = await db.pool.query("SHOW INDEX FROM property_furniture");
  const indexNames = new Set((indexRows || []).map((index) => String(index.Key_name)));
  const missingIndexes = ["idx_property_furniture_property", "idx_property_furniture_owner"]
    .filter((index) => !indexNames.has(index));

  if (missingIndexes.length) {
    throw new Error(
      `property_furniture indexes are incomplete (${missingIndexes.join(", ")}); ` +
      "apply db/twinkle_property_furniture_migration.sql during approved maintenance"
    );
  }
}

function getCanonicalPropertyDimension(kind, property) {
  return kind === "apartment"
    ? getCondoDimension(property.id)
    : toNumber(property.dimension);
}

function vectorDistance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const dx = toNumber(left.x) - toNumber(right.x);
  const dy = toNumber(left.y) - toNumber(right.y);
  const dz = toNumber(left.z) - toNumber(right.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function issuePlacementTicket(player, details) {
  const ticket = {
    ...details,
    token: crypto.randomBytes(24).toString("hex"),
    playerId: Number(player.id),
    characterUuid: String(ensureCharacter(player)),
    origin: sanitizeVector(player.position, "Позиция персонажа"),
    expiresAt: Date.now() + PLACEMENT_TICKET_TTL_MS,
  };
  placementTickets.set(Number(player.id), ticket);
  return ticket;
}

function consumePlacementTicket(player, rawToken) {
  const playerId = Number(player?.id);
  const ticket = placementTickets.get(playerId);
  placementTickets.delete(playerId);

  const token = String(rawToken || "");
  if (!ticket || !/^[a-f0-9]{48}$/.test(token) || ticket.token.length !== token.length) {
    throw new Error("Сессия размещения недействительна. Откройте редактор заново.");
  }

  const validToken = crypto.timingSafeEqual(Buffer.from(ticket.token), Buffer.from(token));
  if (!validToken || ticket.expiresAt < Date.now()) {
    throw new Error("Сессия размещения истекла. Откройте редактор заново.");
  }

  if (String(ensureCharacter(player)) !== ticket.characterUuid) {
    throw new Error("Персонаж сессии размещения изменился.");
  }

  return ticket;
}

function cancelPlacement(player) {
  if (player) placementTickets.delete(Number(player.id));
}

async function ensureFurnitureSchema() {
  if (!schemaPromise) {
    schemaPromise = validateFurnitureSchema().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }

  return schemaPromise;
}

async function getOwnedProperty(player, kind, propertyId) {
  await ensureFurnitureSchema();

  const propertyKind = normalizePropertyKind(kind);
  const id = normalizePropertyId(propertyId);
  const characterUuid = ensureCharacter(player);

  try {
    if (propertyKind === "house") {
      const rows = await db.query(
        `
        SELECT id, x, y, z, dimension, price, owner
        FROM houses
        WHERE id = ?
          AND (owner = ? OR owner = ?)
        LIMIT 1
        `,
        [id, String(characterUuid), Number(characterUuid) || 0]
      );

      if (rows?.[0]) return rows[0];
    } else {
      const rows = await db.query(
        `
        SELECT id, x, y, z, price, user_id, user_name, interior, is_lock, condo_big_id
        FROM condos
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        `,
        [id, Number(characterUuid)]
      );

      if (rows?.[0]) {
        return { ...rows[0], dimension: getCondoDimension(rows[0].id) };
      }
    }
  } catch (err) {
    console.log("[FURNITURE] get owned property error:", err.message);
  }

  throw new Error("Эта недвижимость вам не принадлежит.");
}

async function findFirstOwnedProperty(player, preferredKind = null) {
  const kinds = preferredKind ? [normalizePropertyKind(preferredKind)] : ["apartment", "house"];
  const characterUuid = ensureCharacter(player);

  for (const kind of kinds) {
    try {
      if (kind === "house") {
        const rows = await db.query(
          `
          SELECT id, x, y, z, dimension, price, owner
          FROM houses
          WHERE owner = ? OR owner = ?
          LIMIT 1
          `,
          [String(characterUuid), Number(characterUuid) || 0]
        );

        if (rows?.[0]) return { kind, property: rows[0] };
      } else {
        const rows = await db.query(
          `
          SELECT id, x, y, z, price, user_id, user_name, interior, is_lock, condo_big_id
          FROM condos
          WHERE user_id = ?
          LIMIT 1
          `,
          [Number(characterUuid)]
        );

        if (rows?.[0]) {
          return {
            kind,
            property: { ...rows[0], dimension: getCondoDimension(rows[0].id) },
          };
        }
      }
    } catch (err) {
      console.log(`[FURNITURE] find ${kind} property skipped:`, err.message);
    }
  }

  throw new Error("У персонажа нет доступной недвижимости.");
}

async function getInstalledFurniture(kind, propertyId) {
  await ensureFurnitureSchema();

  return db.query(
    `
    SELECT *
    FROM property_furniture
    WHERE property_type = ?
      AND property_id = ?
      AND active = 1
    ORDER BY id DESC
    `,
    [normalizePropertyKind(kind), normalizePropertyId(propertyId)]
  );
}

function mapPlacedEditorItem(row) {
  return {
    id: `placed:${row.id}`,
    objectId: row.id,
    category: row.category,
    name: row.name,
    price: Number(row.price || 0),
    inRoom: true,
    model: row.model,
    position: {
      x: toNumber(row.x),
      y: toNumber(row.y),
      z: toNumber(row.z),
    },
    rotation: {
      x: toNumber(row.rot_x),
      y: toNumber(row.rot_y),
      z: toNumber(row.rot_z),
    },
    canBuy: false,
    canDelete: true,
    canMove: true,
  };
}

function mapCatalogEditorItem(item) {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    price: Number(item.price || 0),
    inRoom: false,
    model: item.model,
    canBuy: true,
    canDelete: false,
    canMove: false,
  };
}

function mapTabletFurnitureItem(item) {
  if (item.inRoom) {
    return {
      id: item.id,
      title: item.name,
      category: item.category,
      model: item.model,
      position: item.position,
      rotation: item.rotation,
      installed: true,
      active: true,
      price: item.price,
      room: item.category,
      canInstall: false,
    };
  }

  return {
    id: item.id,
    title: item.name,
    category: item.category,
    model: item.model,
    installed: false,
    price: item.price,
    canInstall: true,
  };
}

async function buildFurnitureEditorPayload(player, kind, propertyId, selectedId = null) {
  const propertyKind = normalizePropertyKind(kind);
  const property = await getOwnedProperty(player, propertyKind, propertyId);
  const installed = await getInstalledFurniture(propertyKind, property.id);
  const placedItems = installed.map(mapPlacedEditorItem);
  const catalogItems = FURNITURE_CATALOG.map(mapCatalogEditorItem);
  const categories = [...new Set([...categoryList(), ...placedItems.map((item) => item.category)])];
  const selectedItem = selectedId || placedItems[0]?.id || null;
  const currentCategory = placedItems.find((item) => item.id === selectedItem)?.category
    || categories[0]
    || "Диваны";

  return {
    title: "Редактор мебели",
    visible: true,
    propertyKind,
    propertyId: property.id,
    categories,
    currentCategory,
    selectedId: selectedItem,
    items: [
      ...placedItems,
      ...catalogItems,
    ],
  };
}

async function getTabletProperties(player, kind) {
  const propertyKind = normalizePropertyKind(kind);
  const characterUuid = ensureCharacter(player);
  let rows = [];

  try {
    if (propertyKind === "house") {
      rows = await db.query(
        `
        SELECT id, x, y, z, dimension, price, owner
        FROM houses
        WHERE owner = ? OR owner = ?
        ORDER BY id ASC
        `,
        [String(characterUuid), Number(characterUuid) || 0]
      );
    } else {
      rows = await db.query(
        `
        SELECT
          c.id, c.number, c.condo_big_id, c.address, c.street, c.x, c.y, c.z,
          c.price, c.user_id, c.user_name, c.interior, c.is_lock, c.tax_money,
          b.number AS building_number
        FROM condos c
        LEFT JOIN condos_big b ON b.id = c.condo_big_id
        WHERE c.user_id = ?
        ORDER BY c.id ASC
        `,
        [Number(characterUuid)]
      );
    }
  } catch (err) {
    console.log(`[FURNITURE] tablet ${propertyKind} list skipped:`, err.message);
    rows = [];
  }

  const result = [];

  for (const row of rows || []) {
    const editorPayload = await buildFurnitureEditorPayload(player, propertyKind, row.id, null);
    const installedCount = editorPayload.items.filter((item) => item.inRoom).length;
    const limit = 80;
    const isApartment = propertyKind === "apartment";
    const buildingLabel = isApartment && row.building_number
      ? `дом ${row.building_number}`
      : null;
    const address = isApartment
      ? [row.address, row.street, buildingLabel, `кв. ${row.number}`].filter(Boolean).join(", ")
      : `Дом #${row.id}`;
    const interiorId = isApartment ? Number(row.interior || 0) : "default";

    result.push({
      id: row.id,
      number: isApartment ? row.number : row.id,
      title: propertyKind === "house" ? `Дом #${row.id}` : `Квартира #${row.number}`,
      address,
      paidUntil: "-",
      locked: isApartment ? Boolean(Number(row.is_lock || 0)) : false,
      propertyType: propertyKind,
      saleStatus: "owned",
      price: Number(row.price || 0),
      buildingId: isApartment ? row.condo_big_id : undefined,
      buildingName: isApartment ? (buildingLabel || undefined) : undefined,
      owner: row.user_name || getCharacterName(player),
      doorStatus: isApartment && !Number(row.is_lock || 0) ? "open" : "closed",
      currentInteriorId: interiorId,
      residentLimit: 0,
      residents: [],
      features: [
        { label: "ID", value: row.id },
        { label: "Dimension", value: isApartment ? getCondoDimension(row.id) : Number(row.dimension || 0) },
        ...(isApartment ? [{ label: "Интерьер", value: Number(row.interior || 0) }] : []),
        { label: "Мебель", value: `${installedCount} / ${limit}` },
      ],
      actions: isApartment
        ? [
          { id: "enter", label: "Войти" },
          { id: "furniture:editor", label: "Редактор мебели" },
        ]
        : [],
      interiors: [
        {
          id: interiorId,
          title: "Текущий интерьер",
          price: 0,
          furnitureLimit: limit,
          current: true,
          available: true,
        },
      ],
      furniture: editorPayload.items.map(mapTabletFurnitureItem),
      garage: [],
      garageSlotsTotal: 0,
      garageSlotsUsed: 0,
      storage: [],
      storageWeight: 0,
      storageMaxWeight: 0,
      access: [],
      logs: [],
      settings: {
        canEnterClosed: true,
        canInstallFurniture: true,
        canUseGarage: false,
        canUseStorage: false,
      },
    });
  }

  return result;
}

async function resolveProperty(player, payload) {
  const parsed = parsePayload(payload);
  const propertyKind = parsed.propertyKind || parsed.kind || parsed.property_type;
  const propertyId = parsed.propertyId || parsed.property_id;

  if (propertyKind && propertyId) {
    return {
      kind: normalizePropertyKind(propertyKind),
      property: await getOwnedProperty(player, propertyKind, propertyId),
    };
  }

  return findFirstOwnedProperty(player, propertyKind || null);
}

function getStartPlacementPosition(player, property) {
  const basePosition = player?.position || property || {};
  const heading = toNumber(player?.heading);
  const radians = heading * Math.PI / 180;

  return {
    x: toNumber(basePosition.x) - Math.sin(radians) * 1.8,
    y: toNumber(basePosition.y) + Math.cos(radians) * 1.8,
    z: toNumber(basePosition.z),
  };
}

async function getPlacedFurniture(player, kind, propertyId, placedId) {
  await getOwnedProperty(player, kind, propertyId);

  const rows = await db.query(
    `
    SELECT *
    FROM property_furniture
    WHERE id = ?
      AND property_type = ?
      AND property_id = ?
      AND active = 1
    LIMIT 1
    `,
    [Number(placedId), normalizePropertyKind(kind), normalizePropertyId(propertyId)]
  );

  if (!rows?.[0]) {
    throw new Error("Предмет мебели не найден.");
  }

  return rows[0];
}

async function createPlacementPayload(player, rawPayload, mode) {
  const parsed = parsePayload(rawPayload);
  const { kind, property } = await resolveProperty(player, parsed);
  const propertyId = Number(property.id);
  const dimension = getCanonicalPropertyDimension(kind, property);

  if (!dimension || Number(player?.dimension || 0) !== dimension) {
    throw new Error("Редактор мебели доступен только внутри выбранной недвижимости.");
  }

  if (mode === "move") {
    const placedId = getPlacedId(parsed);
    const placed = await getPlacedFurniture(player, kind, propertyId, placedId);

    const ticket = issuePlacementTicket(player, {
      mode: "move",
      propertyKind: kind,
      propertyId,
      placedId: Number(placed.id),
      catalogId: placed.catalog_id,
      dimension,
    });

    return {
      mode: "move",
      placedId: placed.id,
      propertyKind: kind,
      propertyId,
      catalogId: placed.catalog_id,
      model: placed.model,
      name: placed.name,
      price: Number(placed.price || 0),
      dimension,
      placementToken: ticket.token,
      position: {
        x: toNumber(placed.x),
        y: toNumber(placed.y),
        z: toNumber(placed.z),
      },
      rotation: {
        x: toNumber(placed.rot_x),
        y: toNumber(placed.rot_y),
        z: toNumber(placed.rot_z),
      },
    };
  }

  const catalogItem = getCatalogItem(parsed.furnitureId || parsed.item?.id || parsed.catalogId);

  if (!catalogItem) {
    throw new Error("Предмет мебели не найден в каталоге.");
  }

  const ticket = issuePlacementTicket(player, {
    mode: "buy",
    propertyKind: kind,
    propertyId,
    catalogId: catalogItem.id,
    dimension,
  });

  return {
    mode: "buy",
    propertyKind: kind,
    propertyId,
    catalogId: catalogItem.id,
    model: catalogItem.model,
    name: catalogItem.name,
    price: Number(catalogItem.price || 0),
    dimension,
    placementToken: ticket.token,
    position: getStartPlacementPosition(player, property),
    rotation: {
      x: 0,
      y: 0,
      z: toNumber(player?.heading),
    },
  };
}

async function lockOwnedProperty(connection, kind, propertyId, characterUuid) {
  if (kind === "house") {
    const [rows] = await connection.query(
      `SELECT id, dimension, owner FROM houses
       WHERE id = ? AND (owner = ? OR owner = ?) LIMIT 1 FOR UPDATE`,
      [propertyId, String(characterUuid), Number(characterUuid) || 0]
    );
    if (rows?.[0]) return rows[0];
  } else {
    const [rows] = await connection.query(
      `SELECT id, user_id, interior FROM condos
       WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [propertyId, Number(characterUuid)]
    );
    if (rows?.[0]) return rows[0];
  }

  throw new Error("Недвижимость не принадлежит персонажу.");
}

function syncCash(player, cash) {
  const nextCash = Math.max(0, Number(cash || 0));
  if (player.character) player.character.cash = nextCash;
  if (player.characterData) player.characterData.cash = nextCash;
  try { player.setVariable("cash", nextCash); } catch {}
  try {
    hud.update(player, {
      player: {
        finance: {
          cash: nextCash,
          bank: Number(player.character?.bank || player.characterData?.bank || 0),
        },
      },
    });
  } catch (error) {
    console.error("[FURNITURE] HUD balance sync failed:", error);
  }
}

async function savePlacement(player, rawPayload) {
  await ensureFurnitureSchema();

  const parsed = parsePayload(rawPayload);
  const ticket = consumePlacementTicket(player, parsed.placementToken);
  const characterUuid = ensureCharacter(player);
  const propertyKind = normalizePropertyKind(ticket.propertyKind);
  const propertyId = normalizePropertyId(ticket.propertyId);
  const position = sanitizeVector(parsed.position, "Позиция");
  const rotation = sanitizeVector(parsed.rotation || {}, "Поворот");

  if (
    vectorDistance(position, ticket.origin) > MAX_PLACEMENT_DISTANCE ||
    vectorDistance(position, player.position) > MAX_PLACEMENT_DISTANCE
  ) {
    throw new Error("Предмет нельзя разместить за пределами интерьера.");
  }

  if (Number(player.dimension || 0) !== Number(ticket.dimension)) {
    throw new Error("Измерение персонажа изменилось. Откройте редактор заново.");
  }

  const transactionResult = await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (!characterRows?.[0]) throw new Error("Персонаж не найден.");

      const property = await lockOwnedProperty(connection, propertyKind, propertyId, characterUuid);
      const dimension = getCanonicalPropertyDimension(propertyKind, property);
      if (!dimension || dimension !== Number(ticket.dimension)) {
        throw new Error("Измерение недвижимости изменилось.");
      }

      let placedId;
      let cash = null;

      if (ticket.mode === "move") {
        const [placedRows] = await connection.query(
          `SELECT id FROM property_furniture
           WHERE id = ? AND property_type = ? AND property_id = ? AND active = 1
           LIMIT 1 FOR UPDATE`,
          [Number(ticket.placedId), propertyKind, propertyId]
        );
        if (!placedRows?.[0]) throw new Error("Предмет мебели не найден.");

        placedId = Number(placedRows[0].id);
        await connection.query(
          `UPDATE property_furniture
           SET x = ?, y = ?, z = ?, rot_x = ?, rot_y = ?, rot_z = ?, dimension = ?, owner_uuid = ?
           WHERE id = ?`,
          [
            position.x, position.y, position.z,
            rotation.x, rotation.y, rotation.z,
            dimension, String(characterUuid), placedId,
          ]
        );
      } else if (ticket.mode === "buy") {
        const catalogItem = getCatalogItem(ticket.catalogId);
        if (!catalogItem) throw new Error("Предмет мебели не найден в каталоге.");

        const currentCash = Number(characterRows?.[0]?.cash || 0);
        const price = Math.max(0, Number(catalogItem.price || 0));
        if (currentCash < price) {
          throw new Error(`Недостаточно наличных. Нужно $${price}.`);
        }

        const [installedRows] = await connection.query(
          `SELECT id FROM property_furniture
           WHERE property_type = ? AND property_id = ? AND active = 1 FOR UPDATE`,
          [propertyKind, propertyId]
        );
        if ((installedRows || []).length >= FURNITURE_LIMIT) {
          throw new Error(`Достигнут лимит мебели: ${FURNITURE_LIMIT}.`);
        }

        const [debitResult] = await connection.query(
          "UPDATE characters SET cash = cash - ? WHERE uuid = ? AND cash >= ?",
          [price, characterUuid, price]
        );
        if (Number(debitResult?.affectedRows || 0) !== 1) {
          throw new Error("Не удалось оплатить мебель.");
        }

        const [insertResult] = await connection.query(
          `INSERT INTO property_furniture
            (property_type, property_id, catalog_id, model, name, category, price, x, y, z, rot_x, rot_y, rot_z, dimension, owner_uuid, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            propertyKind, propertyId, catalogItem.id, catalogItem.model, catalogItem.name,
            catalogItem.category, price, position.x, position.y, position.z,
            rotation.x, rotation.y, rotation.z, dimension, String(characterUuid),
          ]
        );
        placedId = Number(insertResult?.insertId);
        cash = currentCash - price;
      } else {
        throw new Error("Некорректный режим размещения.");
      }

      await connection.commit();
      return { placedId, cash };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });

  const rows = await db.query(
    "SELECT * FROM property_furniture WHERE id = ? AND active = 1 LIMIT 1",
    [transactionResult.placedId]
  );
  spawnFurnitureObject(rows?.[0]);
  if (transactionResult.cash !== null) syncCash(player, transactionResult.cash);

  return buildFurnitureEditorPayload(
    player,
    propertyKind,
    propertyId,
    `placed:${transactionResult.placedId}`
  );
}

async function deleteFurniture(player, rawPayload) {
  const parsed = parsePayload(rawPayload);
  const propertyKind = normalizePropertyKind(parsed.propertyKind);
  const propertyId = normalizePropertyId(parsed.propertyId);
  const placedId = getPlacedId(parsed);

  if (!placedId) {
    throw new Error("Предмет мебели не выбран.");
  }

  const placed = await getPlacedFurniture(player, propertyKind, propertyId, placedId);

  await db.query("UPDATE property_furniture SET active = 0 WHERE id = ?", [placed.id]);
  destroySpawnedObject(placed.id);

  return buildFurnitureEditorPayload(player, propertyKind, propertyId, null);
}

async function deleteAllFurniture(player, rawPayload) {
  const parsed = parsePayload(rawPayload);
  const propertyKind = normalizePropertyKind(parsed.propertyKind);
  const property = await getOwnedProperty(player, propertyKind, parsed.propertyId);
  const rows = await getInstalledFurniture(propertyKind, property.id);

  await db.query(
    `
    UPDATE property_furniture
    SET active = 0
    WHERE property_type = ?
      AND property_id = ?
      AND active = 1
    `,
    [propertyKind, property.id]
  );

  for (const row of rows || []) {
    destroySpawnedObject(row.id);
  }

  return buildFurnitureEditorPayload(player, propertyKind, property.id, null);
}

async function findFurniture(player, rawPayload) {
  const parsed = parsePayload(rawPayload);
  const propertyKind = normalizePropertyKind(parsed.propertyKind);
  const propertyId = normalizePropertyId(parsed.propertyId);
  const placedId = getPlacedId(parsed);

  if (!placedId) {
    throw new Error("Предмет мебели не выбран.");
  }

  return getPlacedFurniture(player, propertyKind, propertyId, placedId);
}

async function spawnAllActiveFurniture() {
  await ensureFurnitureSchema();

  const rows = await db.query(
    `
    SELECT *
    FROM property_furniture
    WHERE active = 1
    `
  );

  for (const row of rows || []) {
    spawnFurnitureObject(row);
  }

  console.log(`[FURNITURE] Spawned ${rows?.length || 0} objects`);
}

async function startFurnitureSpawner() {
  if (spawnerStarted) return;

  spawnerStarted = true;

  try {
    await spawnAllActiveFurniture();
  } catch (err) {
    spawnerStarted = false;
    console.log("[FURNITURE] initial spawn skipped:", err.message);
  }
}

module.exports = {
  FURNITURE_CATALOG,
  buildFurnitureEditorPayload,
  cancelPlacement,
  createPlacementPayload,
  deleteAllFurniture,
  deleteFurniture,
  findFirstOwnedProperty,
  findFurniture,
  getCatalogItem,
  ensureFurnitureSchema,
  getInstalledFurniture,
  getOwnedProperty,
  getTabletProperties,
  savePlacement,
  startFurnitureSpawner,
};
