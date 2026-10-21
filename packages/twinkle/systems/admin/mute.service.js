"use strict";

const chat = require("../chat/chat.service.js");
const db = require("../../database/query.js");
const deathService = require("../../death/death.service.js");
const { getUuid } = require("../../utils/player.js");

async function sql(query, params = []) {
  if (typeof db.query === "function") {
    return db.query(query, params);
  }

  return db.withConn(async (conn) => {
    const [rows] = await conn.query(query, params);
    return rows;
  });
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

async function saveMuteProgress(player) {
  const uuid = getUuid(player);
  if (!uuid || !player.muteData) return;

  const passed = nowSec() - player.muteData.lastTick;
  const left = Math.max(0, player.muteData.remainingSeconds - passed);

  if (left <= 0) {
    await sql(`DELETE FROM twinkle_admin.mutes WHERE uuid = ?`, [uuid]);

    player.isMuted = false;
    player.muteData = null;

    player.setVariable("isMuted", false);
    return;
  }

  await sql(
    `UPDATE twinkle_admin.mutes
     SET remaining_seconds = ?, updated_at = ?
     WHERE uuid = ?`,
    [left, nowSec(), uuid]
  );

  player.muteData.remainingSeconds = left;
  player.muteData.lastTick = nowSec();
}

async function checkMuteOnJoin(player) {
  const uuid = getUuid(player);
  if (!uuid) return;

  player.isMuted = false;
  player.muteData = null;

  try {
    player.setVariable("isMuted", false);
  } catch {}

  const rows = await sql(
    `SELECT * FROM twinkle_admin.mutes WHERE uuid = ? LIMIT 1`,
    [uuid]
  );

  if (getUuid(player) !== uuid) return false;
  if (!rows.length) return true;

  const mute = rows[0];

  if (mute.remaining_seconds <= 0) {
    await sql(`DELETE FROM twinkle_admin.mutes WHERE uuid = ?`, [uuid]);
    return true;
  }

  player.isMuted = true;

  player.muteData = {
    reason: mute.reason,
    remainingSeconds: Number(mute.remaining_seconds),
    lastTick: nowSec(),
  };

  player.setVariable("isMuted", true);

  chat.sendToPlayer(
    player,
    `У вас мут ${Math.ceil(mute.remaining_seconds / 60)} мин. Причина: ${mute.reason}`,
    "#ff6666"
  );

  return true;
}

mp.events.add("playerQuit", (player) => {
  saveMuteProgress(player).catch(console.error);
});

setInterval(() => {
  mp.players.forEach(async (player) => {
    if (!player.isMuted || !player.muteData) return;

    const passed = nowSec() - player.muteData.lastTick;
    const left = Math.max(0, player.muteData.remainingSeconds - passed);

    if (left <= 0) {
      const uuid = getUuid(player);

      player.isMuted = false;
      player.muteData = null;

      player.setVariable("isMuted", false);

      await sql(`DELETE FROM twinkle_admin.mutes WHERE uuid = ?`, [uuid]);

      chat.sendToPlayer(player, "Мут снят.", "#66cc66");
      return;
    }

    player.muteData.remainingSeconds = left;
    player.muteData.lastTick = nowSec();
  });
}, 30000);

module.exports = {
  checkMuteOnJoin,
  saveMuteProgress,
};
