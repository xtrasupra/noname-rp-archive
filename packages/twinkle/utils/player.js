"use strict";

function rows(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parsePositiveAmount(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();
  const amount = Math.floor(Number(normalized));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

function playerUuid(player) {
  return Number(
    player?.uuid ||
      player?.characterId ||
      player?.characterUuid ||
      player?.character?.uuid ||
      player?.characterData?.uuid ||
      0
  ) || 0;
}

function playerAdminLevel(player) {
  return Number(
    player?.adminLevel ||
      player?.adminLvl ||
      player?.admin ||
      player?.admin_level ||
      player?.character?.admin_level ||
      player?.characterData?.admin_level ||
      0
  ) || 0;
}

function playerFractionId(player) {
  return Number(
    player?.fractionId ||
      player?.fraction ||
      player?.character?.fraction_id ||
      player?.characterData?.fraction_id ||
      0
  ) || 0;
}

function playerFractionRank(player) {
  return Number(player?.fractionRank || player?.character?.fraction_rank || player?.characterData?.fraction_rank || 0) || 0;
}

function playerFractionType(player) {
  return String(
    player?.fractionType ||
      player?.fractionProfile?.fraction_type ||
      player?.fractionProfile?.type ||
      player?.character?.fraction_type ||
      player?.character?.fractionProfile?.fraction_type ||
      player?.character?.fractionProfile?.type ||
      ""
  ).toLowerCase();
}

function playerStaticId(player) {
  return Number(
    player?.static_id ||
      player?.staticId ||
      player?.uuid ||
      player?.characterId ||
      player?.character?.static_id ||
      player?.character?.staticId ||
      player?.character?.uuid ||
      player?.characterData?.static_id ||
      player?.characterData?.staticId ||
      player?.characterData?.uuid ||
      0
  ) || 0;
}

function playerName(player) {
  const character = player?.character || player?.characterData || {};
  const firstName = character.username || character.firstname || character.firstName || "";
  const lastName = character.lastname || character.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return (
    player?.rpName ||
    fullName ||
    character.name ||
    player?.name ||
    `Player #${player?.id ?? "?"}`
  );
}

function displayName(row) {
  return `${row?.username || row?.firstname || ""} ${row?.lastname || ""}`.trim() ||
    `Персонаж #${row?.character_uuid || row?.uuid || row?.actor_uuid || "?"}`;
}

async function loadCharacterNames(uuids) {
  const ids = [...new Set((uuids || []).map((uuid) => Number(uuid || 0)).filter((uuid) => uuid > 0))];
  if (!ids.length) return new Map();

  const db = require("../database/query.js");
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.query(
    `SELECT uuid, username, lastname FROM characters WHERE uuid IN (${placeholders})`,
    ids
  );

  const map = new Map();
  for (const row of rows(result) || []) {
    map.set(Number(row.uuid), {
      username: row.username,
      lastname: row.lastname,
      uuid: Number(row.uuid),
    });
  }
  return map;
}

const api = {
  rows,
  parseJson,
  parsePositiveAmount,
  playerUuid,
  playerAdminLevel,
  playerFractionId,
  playerFractionRank,
  playerFractionType,
  playerStaticId,
  playerName,
  getUuid: playerUuid,
  getPlayerUuid: playerUuid,
  getAdminLevel: playerAdminLevel,
  getPlayerName: playerName,
  getStaticId: playerStaticId,
  displayName,
  loadCharacterNames,
};

global.twinklePlayer = api;

module.exports = api;
