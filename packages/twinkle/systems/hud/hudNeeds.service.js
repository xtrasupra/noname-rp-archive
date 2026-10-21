"use strict";

const db = require("../../database/query.js");
const hud = require("./hud.service.js");
const config = require("./hudNeeds.config.js");

let schemaReady = false;
let schemaPromise = null;
let tickCounter = 0;

function clamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function nextInventoryVitalsRevision(player) {
  const current = Math.max(0, Math.trunc(Number(player?.__inventoryVitalsRevision || 0)));
  const next = current + 1;
  player.__inventoryVitalsRevision = next;
  return next;
}

function getUuid(player) {
  return Number(
    player?.character?.uuid ||
    player?.characterData?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function ensureCharacterNeeds(player) {
  if (!player?.character) player.character = {};
  if (!player.characterData) player.characterData = player.character;

  const health = clamp(
    player.health ?? player.character.health ?? player.characterData.health ?? config.defaults.health
  );
  const water = clamp(player.character.water ?? player.characterData.water ?? config.defaults.water);
  const food = clamp(player.character.food ?? player.characterData.food ?? config.defaults.food);

  player.character.health = health;
  player.character.water = water;
  player.character.food = food;
  player.characterData.health = health;
  player.characterData.water = water;
  player.characterData.food = food;

  return { health, water, food };
}

async function query(sql, params = []) {
  if (typeof db.query === "function") return db.query(sql, params);

  if (typeof db.withConn === "function") {
    return db.withConn(async (conn) => {
      const [rows] = await conn.query(sql, params);
      return rows;
    });
  }

  throw new Error("HUD needs database adapter is unavailable");
}

async function ensureSchema() {
  if (schemaReady) return;

  if (schemaPromise) return schemaPromise;

  schemaPromise = initializeSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function initializeSchema() {

  const rows = await db.query(
    `
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'characters'
      AND COLUMN_NAME IN ('health', 'water', 'food')
    `
  );
  const columns = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      String(row.COLUMN_NAME || row.column_name),
      String(row.DATA_TYPE || row.data_type || "").toLowerCase(),
    ])
  );

  if (!columns.has("water")) {
    await db.query("ALTER TABLE characters ADD COLUMN water INT NOT NULL DEFAULT 100");
  } else if (columns.get("water") !== "int") {
    await db.query(`
      UPDATE characters
         SET water = CASE
           WHEN water REGEXP '^[0-9]+$' THEN LEAST(100, GREATEST(0, CAST(water AS UNSIGNED)))
           ELSE 100
         END
    `);
    await db.query("ALTER TABLE characters MODIFY COLUMN water INT NOT NULL DEFAULT 100");
  }

  if (!columns.has("health")) {
    await db.query("ALTER TABLE characters ADD COLUMN health INT NOT NULL DEFAULT 100");
  } else if (columns.get("health") !== "int") {
    await db.query(`
      UPDATE characters
         SET health = CASE
           WHEN health REGEXP '^[0-9]+$' THEN LEAST(100, GREATEST(0, CAST(health AS UNSIGNED)))
           ELSE 100
         END
    `);
    await db.query("ALTER TABLE characters MODIFY COLUMN health INT NOT NULL DEFAULT 100");
  }

  if (!columns.has("food")) {
    await db.query("ALTER TABLE characters ADD COLUMN food INT NOT NULL DEFAULT 100");
  } else if (columns.get("food") !== "int") {
    await db.query(`
      UPDATE characters
         SET food = CASE
           WHEN food REGEXP '^[0-9]+$' THEN LEAST(100, GREATEST(0, CAST(food AS UNSIGNED)))
           ELSE 100
         END
    `);
    await db.query("ALTER TABLE characters MODIFY COLUMN food INT NOT NULL DEFAULT 100");
  }

  schemaReady = true;
}

async function load(player) {
  const uuid = getUuid(player);
  ensureCharacterNeeds(player);

  if (!uuid) return;

  await ensureSchema();
  const rows = await query("SELECT health, water, food FROM characters WHERE uuid = ? LIMIT 1", [uuid]);
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) return;

  const health = clamp(row.health ?? config.defaults.health);
  player.health = Math.max(1, health);
  player.character.health = player.health;
  player.characterData.health = player.health;
  player.character.water = clamp(row.water ?? config.defaults.water);
  player.character.food = clamp(row.food ?? config.defaults.food);
  player.characterData.water = player.character.water;
  player.characterData.food = player.character.food;
}

async function save(player) {
  const uuid = getUuid(player);
  if (!uuid) return;

  const needs = ensureCharacterNeeds(player);
  await ensureSchema();
  await query("UPDATE characters SET health = ?, water = ?, food = ? WHERE uuid = ?", [
    needs.health,
    needs.water,
    needs.food,
    uuid,
  ]);
}

function push(player) {
  const needs = ensureCharacterNeeds(player);
  const revision = nextInventoryVitalsRevision(player);

  hud.update(player, {
    player: {
      needs: {
        water: needs.water,
        eat: needs.food,
        id: getUuid(player),
      },
    },
  });

  try {
    player.call("inventory:client:vitals", [JSON.stringify({
      contractVersion: 1,
      revision,
      vitals: {
        health: needs.health,
        food: needs.food,
        water: needs.water,
      },
    })]);
  } catch (error) {
    console.error("[HUD NEEDS] Inventory vitals sync failed:", error?.message || error);
  }
}

function setHealth(player, value, options = {}) {
  if (!player) return Promise.resolve(null);

  const health = clamp(value);
  player.health = health;
  if (!player.character) player.character = {};
  if (!player.characterData) player.characterData = player.character;
  player.character.health = health;
  player.characterData.health = health;
  push(player);

  if (options.persist === false || !getUuid(player)) {
    return Promise.resolve(health);
  }

  return save(player).then(() => health);
}

async function add(player, patch = {}) {
  const current = ensureCharacterNeeds(player);
  const water = clamp(current.water + Number(patch.water || 0));
  const food = clamp(current.food + Number(patch.food || 0));

  player.character.water = water;
  player.character.food = food;
  player.characterData.water = water;
  player.characterData.food = food;

  push(player);
  await save(player);

  return { water, food };
}

async function tickPlayer(player, shouldSave) {
  if (!player?.character || !getUuid(player)) return;

  const current = ensureCharacterNeeds(player);
  const water = clamp(current.water - Number(config.waterLossPerTick || 0));
  const food = clamp(current.food - Number(config.foodLossPerTick || 0));

  player.character.water = water;
  player.character.food = food;
  player.characterData.water = water;
  player.characterData.food = food;

  push(player);

  if (shouldSave) {
    await save(player);
  }
}

async function tick() {
  if (!config.enabled) return;

  tickCounter += 1;
  const shouldSave = tickCounter % Math.max(1, Number(config.saveEveryTicks || 1)) === 0;

  mp.players.forEach((player) => {
    tickPlayer(player, shouldSave).catch((error) => {
      console.error("[HUD NEEDS TICK]", error?.message || error);
    });
  });
}

mp.events.add("playerReady", (player) => {
  if (!player?.character || !getUuid(player)) return;

  load(player).then(() => push(player)).catch((error) => {
    console.error("[HUD NEEDS LOAD]", error?.message || error);
  });
});

mp.events.add("playerQuit", (player) => {
  save(player).catch(() => {});
});

mp.events.add("playerDamage", (player) => {
  if (!player?.character || !getUuid(player)) return;
  push(player);
});

mp.events.add("playerDeath", (player) => {
  if (!player?.character || !getUuid(player)) return;
  push(player);
});

setInterval(tick, Math.max(5_000, Number(config.tickMs || 60_000)));

ensureSchema()
  .then(() => console.log("[HUD NEEDS] Database schema ready"))
  .catch((error) => console.error("[HUD NEEDS] Database schema initialization failed:", error));

module.exports = {
  ensureCharacterNeeds,
  add,
  setHealth,
  load,
  save,
  push,
};
