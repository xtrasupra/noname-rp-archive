"use strict";

const chat = require("../chat/chat.service.js");
const { getAdminLevel } = require("../../utils/player.js");

function isAdmin(player) {
  return getAdminLevel(player) >= 1;
}

function rejectJailedAdminAction(player) {
  if (!player?.jailData) return false;

  if (player.adminFlyEnabled) {
    player.adminFlyEnabled = false;

    try {
      player.setVariable("adminFlyEnabled", false);
      player.call("admin:fly:set", [false]);
    } catch {}

    mp.players.forEach((target) => {
      try {
        target.call("admin:fly:ghostPlayer", [player.id, false]);
      } catch {}
    });
  }

  if (Date.now() - Number(player.__lastJailAdminActionWarningAt || 0) >= 2000) {
    player.__lastJailAdminActionWarningAt = Date.now();
    chat.sendError(player, "Админские телепорты и FreeCam недоступны в деморгане.");
  }

  return true;
}

function getSafePosition(x, y, z) {
  const position = {
    x: Number(x),
    y: Number(y),
    z: Number(z),
  };

  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    return null;
  }

  if (
    Math.abs(position.x) > 10000 ||
    Math.abs(position.y) > 10000 ||
    position.z < -500 ||
    position.z > 2500
  ) {
    return null;
  }

  return new mp.Vector3(position.x, position.y, position.z);
}

mp.events.add("admin:fly:toggle", (player) => {
  if (!isAdmin(player)) {
    return;
  }

  if (rejectJailedAdminAction(player)) return;

  const enabled = !player.adminFlyEnabled;

  player.adminFlyEnabled = enabled;
  player.setVariable("adminFlyEnabled", enabled);

  player.call("admin:fly:set", [enabled]);

  mp.players.forEach((target) => {
    target.call("admin:fly:ghostPlayer", [player.id, enabled]);
  });
});

mp.events.add("admin:fly:syncPosition", (player, x, y, z) => {
  if (rejectJailedAdminAction(player)) return;
  if (!isAdmin(player) || !player.adminFlyEnabled) return;

  const position = getSafePosition(x, y, z);
  if (!position) return;

  player.position = position;
});

mp.events.add("admin:fly:finish", (player, x, y, z) => {
  if (rejectJailedAdminAction(player)) return;
  if (!isAdmin(player)) return;

  const position = getSafePosition(x, y, z);
  if (!position) return;

  player.position = position;
});

mp.events.add("admin:waypoint:teleport", (player, x, y, z) => {
  if (rejectJailedAdminAction(player)) return;
  if (!isAdmin(player)) return;

  const position = getSafePosition(x, y, z);
  if (!position) return;

  const entity = player.vehicle || player;
  entity.position = position;
});

mp.events.add("playerQuit", (player) => {
  if (!player.adminFlyEnabled) return;

  mp.players.forEach((target) => {
    target.call("admin:fly:ghostPlayer", [player.id, false]);
  });
});
