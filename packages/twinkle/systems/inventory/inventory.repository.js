"use strict";

const db = require("../../database/query.js");
const { parseJson } = require("./inventory.utils.js");
const itemsConfig = require("./inventory.items.js");

async function query(sql, params = []) {
  if (typeof db.query === "function") {
    return await db.query(sql, params);
  }

  if (typeof db.withConn === "function") {
    return await db.withConn(async (conn) => {
      const [rows] = await conn.query(sql, params);
      return rows;
    });
  }

  throw new Error("Database adapter not found");
}

function createDefaultInventory() {
  return {
    slots: Array.from({ length: 40 }, () => null),
    quick: Array.from({ length: 5 }, () => null),
    equipment: {
      hat: null,
      mask: null,
      glasses: null,
      ears: null,
      top: null,
      undershirt: null,
      legs: null,
      shoes: null,
      armor: null,
      bag: null,
      accessory: null,
      gloves: null,
      decals: null,
      chain: null,
      watch: null,
      bracelet: null,
    },
    metadata: {},
    items: {},
  };
}

function normalizeInventory(inventory) {
  const fallback = createDefaultInventory();

  inventory = inventory && typeof inventory === "object" ? inventory : {};
  const items = inventory.items && typeof inventory.items === "object"
    ? Object.fromEntries(Object.entries(inventory.items).map(([uid, rawItem]) => {
        const item = rawItem && typeof rawItem === "object" ? rawItem : {};
        const itemId = String(item.itemId || item.id || "").trim();
        const config = itemsConfig[itemId] || {};
        return [uid, {
          ...config,
          ...item,
          uid: item.uid || uid,
          itemId: itemId || config.id || "",
        }];
      }))
    : {};

  const equipment = { ...fallback.equipment };
  const savedEquipment = inventory.equipment && typeof inventory.equipment === "object"
    ? inventory.equipment
    : {};

  for (const key of Object.keys(equipment)) {
    equipment[key] = savedEquipment[key] || null;
  }

  return {
    slots: Array.isArray(inventory.slots) ? inventory.slots : fallback.slots,
    quick: Array.isArray(inventory.quick) ? inventory.quick : fallback.quick,
    equipment: {
      ...fallback.equipment,
      ...(inventory.equipment || {}),
    },
    metadata: inventory.metadata && typeof inventory.metadata === "object"
      ? { ...inventory.metadata }
      : fallback.metadata,
    items,
  };
}

async function ensureInventory(staticId) {
  const rows = await query(
    "SELECT id FROM character_inventories WHERE static_id = ? LIMIT 1",
    [staticId]
  );

  if (rows?.[0]) return;

  await query(
    "INSERT INTO character_inventories (static_id, inventory) VALUES (?, ?)",
    [staticId, JSON.stringify(createDefaultInventory())]
  );
}

async function getInventory(staticId) {
  await ensureInventory(staticId);

  const rows = await query(
    "SELECT inventory FROM character_inventories WHERE static_id = ? LIMIT 1",
    [staticId]
  );

  return normalizeInventory(
    parseJson(rows?.[0]?.inventory, createDefaultInventory())
  );
}

async function saveInventory(staticId, inventory) {
  await query(
    "UPDATE character_inventories SET inventory = ? WHERE static_id = ?",
    [JSON.stringify(normalizeInventory(inventory)), staticId]
  );
}

module.exports = {
  query,
  createDefaultInventory,
  normalizeInventory,
  ensureInventory,
  getInventory,
  saveInventory,
};
