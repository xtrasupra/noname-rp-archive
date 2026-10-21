"use strict";

const db = require("../../database/query.js");
const chat = require("../chat/chat.service.js");
const {
  rows,
  getUuid,
  getPlayerName,
} = require("../../utils/player.js");

const COLOR_FRACTION = "#66ccff";
const COLOR_DEP = "#ff9999";

async function sql(query, params = []) {
  const res = await db.query(query, params);
  return rows(res);
}

function normalizeText(text, maxLength = 300) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function getFractionData(player) {
  const uuid = getUuid(player);
  if (!uuid) return null;

  const rows = await sql(
    `
    SELECT
      fm.fraction_id,
      fm.rank_index,
      fm.division,
      fr.rank_name,
      f.short_name,
      f.name,
      f.type
    FROM fraction_members fm
    LEFT JOIN fraction_ranks fr
      ON fr.fraction_id = fm.fraction_id
      AND fr.rank_index = fm.rank_index
    LEFT JOIN fractions f
      ON f.fraction_id = fm.fraction_id
    WHERE fm.character_uuid = ?
    LIMIT 1
    `,
    [uuid]
  );

  return rows?.[0] || null;
}

function formatFactionPrefix(data) {
  const rank = data.rank_name || `Ранг ${data.rank_index}`;
  const division = data.division ? ` [${data.division}]` : "";

  return `[${rank}]${division}`;
}

function formatDepPrefix(data) {
  const rank = data.rank_name || `Ранг ${data.rank_index}`;
  const fraction = data.short_name || data.name || `F${data.fraction_id}`;
  const division = data.division ? ` [${data.division}]` : "";

  return `[${rank}]${division} [${fraction}]`;
}

async function sendFractionChat(player, text, ooc = false) {
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, `Использование: ${ooc ? "/fb" : "/f"} текст`);
  }

  const data = await getFractionData(player);

  if (!data) {
    return chat.sendError(player, "Вы не состоите во фракции.");
  }

  const name = getPlayerName(player);
  const prefix = formatFactionPrefix(data);

  const finalMessage = ooc
    ? `${prefix} ${name}: ((${message}))`
    : `${prefix} ${name}: ${message}`;

  const players = mp.players.toArray ? mp.players.toArray() : [];

  for (const target of players) {
    const targetData = await getFractionData(target);
    if (!targetData) continue;

    if (Number(targetData.fraction_id) === Number(data.fraction_id)) {
      chat.sendToPlayer(target, finalMessage, COLOR_FRACTION);
    }
  }
}

async function sendDepChat(player, text) {
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, "Использование: /dep текст");
  }

  const data = await getFractionData(player);

  if (!data) {
    return chat.sendError(player, "Вы не состоите во фракции.");
  }

  if (String(data.type) !== "state") {
    return chat.sendError(player, "DEP доступен только государственным фракциям.");
  }

  const name = getPlayerName(player);
  const prefix = formatDepPrefix(data);
  const finalMessage = `${prefix} ${name}: ${message}`;

  const players = mp.players.toArray ? mp.players.toArray() : [];

  for (const target of players) {
    const targetData = await getFractionData(target);
    if (!targetData) continue;

    if (String(targetData.type) === "state") {
      chat.sendToPlayer(target, finalMessage, COLOR_DEP);
    }
  }
}

mp.registerCommand("f", async (player, text) => {
  try {
    await sendFractionChat(player, text, false);
  } catch (err) {
    console.error("[FRACTION CHAT] /f error:", err);
    chat.sendError(player, "Ошибка фракционного чата.");
  }
});

mp.registerCommand("fb", async (player, text) => {
  try {
    await sendFractionChat(player, text, true);
  } catch (err) {
    console.error("[FRACTION CHAT] /fb error:", err);
    chat.sendError(player, "Ошибка фракционного OOC чата.");
  }
});

mp.registerCommand("dep", async (player, text) => {
  try {
    await sendDepChat(player, text);
  } catch (err) {
    console.error("[FRACTION CHAT] /dep error:", err);
    chat.sendError(player, "Ошибка DEP чата.");
  }
});

console.log("[FRACTION CHAT] Commands loaded");

