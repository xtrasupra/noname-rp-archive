"use strict";

const chat = require("../systems/chat/chat.service.js");
const hudNeeds = require("../systems/hud/hudNeeds.service.js");
const DEATH_RESPAWN_DELAY = 60 * 1000;

const HOSPITAL_RESPAWN_ZONE = {
  minX: 274.0,
  maxX: 310.0,
  minY: -610.0,
  maxY: -570.0,
  z: 43.3,
  heading: 70.0,
  dimension: 0,
};

const deathTimers = new Map();

function send(player, message, color = "#ff7777") {
  try {
    chat.sendToPlayer(player, message, color);
  } catch {
    try {
      player.outputChatBox(message);
    } catch {}
  }
}

function getRandomHospitalPosition() {
  const x =
    HOSPITAL_RESPAWN_ZONE.minX +
    Math.random() * (HOSPITAL_RESPAWN_ZONE.maxX - HOSPITAL_RESPAWN_ZONE.minX);

  const y =
    HOSPITAL_RESPAWN_ZONE.minY +
    Math.random() * (HOSPITAL_RESPAWN_ZONE.maxY - HOSPITAL_RESPAWN_ZONE.minY);

  return new mp.Vector3(x, y, HOSPITAL_RESPAWN_ZONE.z);
}

function clearDeathTimer(player) {
  if (!player) return;

  const timer = deathTimers.get(player.id);
  if (timer) {
    clearTimeout(timer);
    deathTimers.delete(player.id);
  }

  player.isDead = false;
}

function respawnAtHospital(player) {
  if (!player || !mp.players.exists(player)) return;

  deathTimers.delete(player.id);

  const pos = getRandomHospitalPosition();

  player.spawn(pos);
  hudNeeds.setHealth(player, 100).catch((error) => {
    console.error("[DEATH] Hospital respawn health save failed:", error?.message || error);
  });
  player.armour = 0;
  player.dimension = HOSPITAL_RESPAWN_ZONE.dimension;
  player.heading = HOSPITAL_RESPAWN_ZONE.heading;

  player.isDead = false;

  send(player, "Вы были доставлены в больницу.", "#66ccff");

  try {
    player.call("client:death:respawned");
  } catch {}
}

function startDeathTimer(player) {
  if (!player || !mp.players.exists(player)) return;

  clearDeathTimer(player);

  player.isDead = true;

  send(player, "Вы потеряли сознание. Через 60 секунд вас доставят в больницу.");

  try {
    player.call("client:death:startTimer", [60]);
  } catch {}

  const timer = setTimeout(() => {
    if (!player || !mp.players.exists(player)) return;

    if (!player.isDead) {
      deathTimers.delete(player.id);
      return;
    }

    respawnAtHospital(player);
  }, DEATH_RESPAWN_DELAY);

  deathTimers.set(player.id, timer);
}

mp.events.add("playerDeath", (player) => {
  startDeathTimer(player);
});

mp.events.add("playerQuit", (player) => {
  clearDeathTimer(player);
});

mp.events.add("playerReady", (player) => {
  player.isDead = false;
});

function revivePlayer(player, position = null) {
  if (!player || !mp.players.exists(player)) return false;

  clearDeathTimer(player);

  const spawnPos = position || player.position;

  player.spawn(spawnPos);
  hudNeeds.setHealth(player, 100).catch((error) => {
    console.error("[DEATH] Revive health save failed:", error?.message || error);
  });
  player.armour = 0;
  player.isDead = false;

  send(player, "Вы были реанимированы.", "#66ff99");

  try {
    player.call("client:death:respawned");
  } catch {}

  return true;
}

module.exports = {
  startDeathTimer,
  clearDeathTimer,
  respawnAtHospital,
  revivePlayer,
};
