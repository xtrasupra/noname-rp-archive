"use strict";

const {
  buildAnimationsPayload,
  getAnimationById,
} = require("./animations.catalog.js");

function sendAnimationsPayload(player) {
  if (!player) return;

  player.call("c:animations:set", [
    JSON.stringify(buildAnimationsPayload(player)),
  ]);
}

function buildPlayPayload(player, animation) {
  return {
    playerId: Number(player.id),
    id: animation.id,
    dict: animation.dict,
    name: animation.nameHash,
    duration: Number(animation.duration || -1),
    flags: Number(animation.flags || 49),
    speed: Number(animation.speed || 8),
    speedMultiplier: Number(animation.speedMultiplier || -8),
    startedAt: Date.now(),
  };
}

function syncAnimationVariable(player, payload) {
  try {
    player.setVariable("twinkleAnimation", payload ? JSON.stringify(payload) : "");
  } catch {}
}

function broadcastAnimation(eventName, payload) {
  try {
    mp.players.call(eventName, [JSON.stringify(payload || {})]);
  } catch {}
}

function playAnimation(player, animationId) {
  const animation = getAnimationById(animationId);

  if (!animation) {
    player.call("c:animations:error", ["Animation not found."]);
    return;
  }

  const payload = buildPlayPayload(player, animation);
  player.twinkleAnimation = payload;

  syncAnimationVariable(player, payload);
  broadcastAnimation("c:animations:play", payload);
}

function stopAnimation(player) {
  const payload = { playerId: Number(player.id) };

  player.twinkleAnimation = null;

  syncAnimationVariable(player, null);
  broadcastAnimation("c:animations:stop", payload);
}

mp.events.add("s:animations:request", (player) => {
  sendAnimationsPayload(player);
});

mp.events.add("s:animations:play", (player, animationId) => {
  playAnimation(player, animationId);
});

mp.events.add("s:animations:stop", (player) => {
  stopAnimation(player);
});

mp.events.add("s:animations:favorite", (player, animationId, enabledRaw = true) => {
  const animation = getAnimationById(animationId);
  if (!animation) return;

  const enabled = enabledRaw === true || enabledRaw === "true" || enabledRaw === 1 || enabledRaw === "1";
  const favorites = new Set(Array.isArray(player.animationFavoriteIds) ? player.animationFavoriteIds : []);

  if (enabled) {
    favorites.add(animation.id);
  } else {
    favorites.delete(animation.id);
  }

  player.animationFavoriteIds = Array.from(favorites);
  sendAnimationsPayload(player);
});

mp.events.add("twinkle:character:loaded", (player) => {
  sendAnimationsPayload(player);

  mp.players.forEach((target) => {
    if (!target || target === player || !target.twinkleAnimation) return;
    player.call("c:animations:play", [JSON.stringify(target.twinkleAnimation)]);
  });
});

mp.events.add("playerQuit", (player) => {
  if (!player) return;
  player.twinkleAnimation = null;
  syncAnimationVariable(player, null);
});

module.exports = {
  sendAnimationsPayload,
};
