"use strict";

const db = require("../../database");
const { applyCharacterAppearance } = require("../../characters/appearance.js");
const nametags = require("../character/nametags.js");
const adminLogs = require("./admin.logs.js");
const {
  getAdminLevel,
  getUuid,
  parseJson,
} = require("../../utils/player.js");

const DEFAULT_MALE_OUTFIT = {
  components: {
    3: { drawable: 1, texture: 0, palette: 0 },
    4: { drawable: 35, texture: 0, palette: 0 },
    6: { drawable: 25, texture: 0, palette: 0 },
    8: { drawable: 15, texture: 0, palette: 0 },
    11: { drawable: 55, texture: 0, palette: 0 },
  },
  props: {},
};

const DEFAULT_FEMALE_OUTFIT = {
  components: {
    3: { drawable: 3, texture: 0, palette: 0 },
    4: { drawable: 34, texture: 0, palette: 0 },
    6: { drawable: 25, texture: 0, palette: 0 },
    8: { drawable: 15, texture: 0, palette: 0 },
    11: { drawable: 48, texture: 0, palette: 0 },
  },
  props: {},
};

let schemaPromise = null;

function notify(player, message) {
  try {
    player.outputChatBox(message);
  } catch {}
}

function safeJsonParse(value, fallback = {}) {
  const parsed = parseJson(value, fallback);
  return parsed && typeof parsed === "object" ? parsed : fallback;
}

function getGender(player) {
  return String(
    player?.character?.gender ||
      player?.characterData?.gender ||
      player?.getVariable?.("gender") ||
      "male"
  ).toLowerCase();
}

function normalizeOutfit(rawOutfit, gender) {
  const fallback = gender === "female" ? DEFAULT_FEMALE_OUTFIT : DEFAULT_MALE_OUTFIT;
  const outfit = safeJsonParse(rawOutfit, fallback);

  return {
    components: outfit.components || outfit || fallback.components,
    props: outfit.props || {},
  };
}

async function ensureDefaultOutfit(gender, outfit) {
  const rows = await db.query(
    `SELECT id
       FROM twinkle_admin.admin_duty_outfits
      WHERE gender = ? AND min_admin_level = 5
      LIMIT 1`,
    [gender]
  );
  if (rows?.length) return;

  await db.query(
    `INSERT INTO twinkle_admin.admin_duty_outfits
       (gender, min_admin_level, outfit_json, is_active)
     VALUES (?, 5, ?, 1)`,
    [gender, JSON.stringify(outfit)]
  );
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = db.query(`
    CREATE TABLE IF NOT EXISTS twinkle_admin.admin_duty_outfits (
      id INT NOT NULL AUTO_INCREMENT,
      gender ENUM('male', 'female') NOT NULL DEFAULT 'male',
      min_admin_level INT NOT NULL DEFAULT 1,
      outfit_json LONGTEXT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_admin_duty_outfits_lookup (gender, min_admin_level, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).then(async () => {
    await ensureDefaultOutfit("male", DEFAULT_MALE_OUTFIT);
    await ensureDefaultOutfit("female", DEFAULT_FEMALE_OUTFIT);
  }).catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function getDutyOutfit(player) {
  await ensureSchema();

  const adminLevel = getAdminLevel(player);
  const gender = getGender(player) === "female" ? "female" : "male";

  if (adminLevel <= 4) {
    return gender === "female" ? DEFAULT_FEMALE_OUTFIT : DEFAULT_MALE_OUTFIT;
  }

  const rows = await db.query(
    `SELECT outfit_json
     FROM twinkle_admin.admin_duty_outfits
     WHERE gender = ?
       AND is_active = 1
       AND min_admin_level >= 5
       AND min_admin_level <= ?
     ORDER BY min_admin_level DESC, id DESC
     LIMIT 1`,
    [gender, adminLevel]
  );

  return normalizeOutfit(rows?.[0]?.outfit_json, gender);
}

function applyOutfit(player, outfit) {
  const components = outfit.components || {};
  const props = outfit.props || {};

  for (const [component, item] of Object.entries(components)) {
    if (!item) continue;

    try {
      player.setClothes(
        Number(component),
        Number(item.drawable ?? item.drawableId ?? item.id ?? 0),
        Number(item.texture ?? item.textureId ?? 0),
        Number(item.palette ?? 0)
      );
    } catch (error) {
      console.log(`[ADMIN DUTY] setClothes ${component}:`, error.message);
    }
  }

  for (const [prop, item] of Object.entries(props)) {
    if (!item) continue;

    try {
      const drawable = Number(item.drawable ?? item.drawableId ?? item.id ?? -1);

      if (drawable < 0) {
        player.clearProp(Number(prop));
      } else {
        player.setProp(
          Number(prop),
          drawable,
          Number(item.texture ?? item.textureId ?? 0)
        );
      }
    } catch (error) {
      console.log(`[ADMIN DUTY] setProp ${prop}:`, error.message);
    }
  }
}

async function reloadCharacter(player) {
  const uuid = getUuid(player);

  if (!uuid) return false;

  const rows = await db.query(
    "SELECT * FROM characters WHERE uuid = ? LIMIT 1",
    [uuid]
  );

  if (!rows?.[0]) return false;

  player.character = {
    ...player.character,
    ...rows[0],
  };

  applyCharacterAppearance(player, rows[0]);

  return true;
}

function setDutyState(player, state) {
  player.adminDuty = Boolean(state);

  try {
    player.setVariable("adminDuty", Boolean(state));
    player.setVariable(
      "adminDutyLabel",
      state ? "Администратор проекта" : ""
    );
  } catch {}

  try {
    nametags.setSyncedNametagData(player);
  } catch {}
}

async function enableDuty(player) {
  if (getAdminLevel(player) <= 0) {
    notify(player, "!{#ff5555}Недостаточно прав.");
    return;
  }

  if (player.adminDuty) {
    notify(player, "!{#ffcc66}Вы уже в admin duty.");
    return;
  }

  const outfit = await getDutyOutfit(player);

  setDutyState(player, true);
  applyOutfit(player, outfit);

  notify(player, "!{#ff5555}Admin duty включён. Над ником отображается: Администратор проекта.");

  try {
    adminLogs.sendAdminLog(`${player.name} #${player.id} включил admin duty (/alog)`);
  } catch {}
}

async function disableDuty(player) {
  if (getAdminLevel(player) <= 0) {
    notify(player, "!{#ff5555}Недостаточно прав.");
    return;
  }

  if (!player.adminDuty) {
    notify(player, "!{#ffcc66}Вы не в admin duty.");
    return;
  }

  setDutyState(player, false);

  const restored = await reloadCharacter(player);

  notify(
    player,
    restored
      ? "!{#66ff99}Admin duty выключен. Обычная одежда восстановлена."
      : "!{#ffcc66}Admin duty выключен, но обычную одежду не удалось загрузить из базы."
  );

  try {
    adminLogs.sendAdminLog(`${player.name} #${player.id} выключил admin duty (/aexit)`);
  } catch {}
}

mp.registerCommand("alog", async (player) => {
  try {
    await enableDuty(player);
  } catch (error) {
    console.log("[ADMIN DUTY] /alog:", error);
    notify(player, "!{#ff5555}Ошибка включения admin duty.");
  }
});

mp.registerCommand("aexit", async (player) => {
  try {
    await disableDuty(player);
  } catch (error) {
    console.log("[ADMIN DUTY] /aexit:", error);
    notify(player, "!{#ff5555}Ошибка выключения admin duty.");
  }
});

mp.events.add("playerQuit", (player) => {
  if (!player?.adminDuty) return;
  setDutyState(player, false);
});

ensureSchema()
  .then(() => console.log("[ADMIN DUTY] Schema ready"))
  .catch((error) => console.log("[ADMIN DUTY] Schema error:", error.message));

module.exports = {
  ensureSchema,
  enableDuty,
  disableDuty,
  applyOutfit,
};

