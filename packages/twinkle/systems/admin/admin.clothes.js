"use strict";

const db = require("../../database/query.js");
const adminLogs = require("./admin.logs.js");
const {
  getAdminLevel,
  getUuid,
  parseJson,
} = require("../../utils/player.js");

const MIN_ADMIN_LEVEL = 7;

function notify(player, message) {
  try {
    player.outputChatBox(message);
  } catch {}
}

function hasAccess(player) {
  return getAdminLevel(player) >= MIN_ADMIN_LEVEL;
}

function getPlayerByIdOrUuid(value) {
  const id = Number(value);
  if (!id) return null;

  let found = null;

  mp.players.forEach((player) => {
    if (found) return;

    const playerId = Number(player.id);
    const uuid = getUuid(player);

    if (playerId === id || uuid === id) {
      found = player;
    }
  });

  return found;
}

function safeJsonParse(value, fallback = {}) {
  const parsed = parseJson(value, fallback);
  return parsed && typeof parsed === "object" ? parsed : fallback;
}

async function getCharacterClothes(uuid) {
  const rows = await db.query(
    "SELECT clothes FROM characters WHERE uuid = ? LIMIT 1",
    [uuid]
  );

  if (!rows || !rows[0]) return {};

  return safeJsonParse(rows[0].clothes, {});
}

async function saveCharacterClothes(uuid, clothes) {
  await db.query(
    "UPDATE characters SET clothes = ? WHERE uuid = ?",
    [JSON.stringify(clothes), uuid]
  );
}

async function setAndSaveClothes(
  target,
  component,
  drawable,
  texture = 0,
  palette = 0
) {
  const uuid = getUuid(target);

  if (!uuid) {
    return {
      success: false,
      message: "UUID персонажа не найден.",
    };
  }

  component = Number(component);
  drawable = Number(drawable);
  texture = Number(texture);
  palette = Number(palette);

  if (
    Number.isNaN(component) ||
    Number.isNaN(drawable) ||
    Number.isNaN(texture) ||
    Number.isNaN(palette)
  ) {
    return {
      success: false,
      message: "Неверные аргументы.",
    };
  }

  try {
    target.setClothes(component, drawable, texture, palette);

    const clothes = await getCharacterClothes(uuid);

    if (!clothes.components) clothes.components = {};
    if (!clothes.props) clothes.props = {};

    clothes.components[String(component)] = {
      drawable,
      texture,
      palette,
    };

    await saveCharacterClothes(uuid, clothes);

    return {
      success: true,
      message: `Одежда сохранена: component ${component}, drawable ${drawable}, texture ${texture}, palette ${palette}`,
    };
  } catch (e) {
    console.log("[ADMIN_CLOTHES] setAndSaveClothes error:", e);

    return {
      success: false,
      message: "Ошибка установки одежды.",
    };
  }
}

async function setAndSaveProp(target, prop, drawable, texture = 0) {
  const uuid = getUuid(target);

  if (!uuid) {
    return {
      success: false,
      message: "UUID персонажа не найден.",
    };
  }

  prop = Number(prop);
  drawable = Number(drawable);
  texture = Number(texture);

  if (
    Number.isNaN(prop) ||
    Number.isNaN(drawable) ||
    Number.isNaN(texture)
  ) {
    return {
      success: false,
      message: "Неверные аргументы.",
    };
  }

  try {
    if (drawable < 0) {
      target.clearProp(prop);
    } else {
      target.setProp(prop, drawable, texture);
    }

    const clothes = await getCharacterClothes(uuid);

    if (!clothes.components) clothes.components = {};
    if (!clothes.props) clothes.props = {};

    clothes.props[String(prop)] = {
      drawable,
      texture,
    };

    await saveCharacterClothes(uuid, clothes);

    return {
      success: true,
      message: `Prop сохранён: prop ${prop}, drawable ${drawable}, texture ${texture}`,
    };
  } catch (e) {
    console.log("[ADMIN_CLOTHES] setAndSaveProp error:", e);

    return {
      success: false,
      message: "Ошибка установки prop.",
    };
  }
}

async function applySavedClothes(player) {
  const uuid = getUuid(player);

  if (!uuid) return;

  try {
    const clothes = await getCharacterClothes(uuid);

    const components = clothes.components || {};
    const props = clothes.props || {};

    for (const [component, item] of Object.entries(components)) {
      player.setClothes(
        Number(component),
        Number(item.drawable || 0),
        Number(item.texture || 0),
        Number(item.palette || 0)
      );
    }

    for (const [prop, item] of Object.entries(props)) {
      const drawable = Number(item.drawable);

      if (drawable < 0) {
        player.clearProp(Number(prop));
      } else {
        player.setProp(
          Number(prop),
          drawable,
          Number(item.texture || 0)
        );
      }
    }
  } catch (e) {
    console.log("[ADMIN_CLOTHES] applySavedClothes error:", e);
  }
}

mp.registerCommand("aclothes", async (player, fullText) => {
  if (!hasAccess(player)) {
    return notify(player, "!{#ff5555}Недостаточно прав.");
  }

  const args = String(fullText || "").trim().split(/\s+/);

  const target = getPlayerByIdOrUuid(args[0]);
  const component = args[1];
  const drawable = args[2];
  const texture = args[3] || 0;
  const palette = args[4] || 0;

  if (!target || component === undefined || drawable === undefined) {
    return notify(
      player,
      "!{#ffcc66}Использование: /aclothes [playerId/uuid] [component] [drawable] [texture] [palette]"
    );
  }

  const result = await setAndSaveClothes(
    target,
    component,
    drawable,
    texture,
    palette
  );

  if (result.success) {
    adminLogs.sendAdminLog(
      `${player.name} #${player.id} изменил одежду игроку ${target.name} #${target.id} | component: ${component}, drawable: ${drawable}, texture: ${texture}, palette: ${palette}`
    );
  }

  notify(
    player,
    result.success
      ? `!{#66ff99}${result.message}`
      : `!{#ff5555}${result.message}`
  );
});

mp.registerCommand("aprop", async (player, fullText) => {
  if (!hasAccess(player)) {
    return notify(player, "!{#ff5555}Недостаточно прав.");
  }

  const args = String(fullText || "").trim().split(/\s+/);

  const target = getPlayerByIdOrUuid(args[0]);
  const prop = args[1];
  const drawable = args[2];
  const texture = args[3] || 0;

  if (!target || prop === undefined || drawable === undefined) {
    return notify(
      player,
      "!{#ffcc66}Использование: /aprop [playerId/uuid] [prop] [drawable] [texture]"
    );
  }

  const result = await setAndSaveProp(
    target,
    prop,
    drawable,
    texture
  );

  if (result.success) {
    adminLogs.sendAdminLog(
      `${player.name} #${player.id} изменил prop игроку ${target.name} #${target.id} | prop: ${prop}, drawable: ${drawable}, texture: ${texture}`
    );
  }

  notify(
    player,
    result.success
      ? `!{#66ff99}${result.message}`
      : `!{#ff5555}${result.message}`
  );
});

module.exports = {
  setAndSaveClothes,
  setAndSaveProp,
  applySavedClothes,
};
