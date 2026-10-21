"use strict";

const { buildF2Payload } = require("./f2menu.payload.js");

const payloadCache = new Map();
const pendingBuilds = new Map();

function safeExists(player) {
  try {
    return Boolean(player && mp.players.exists(player));
  } catch {
    return Boolean(player);
  }
}

function getPlayerKey(playerOrKey) {
  if (typeof playerOrKey === "string" || typeof playerOrKey === "number") {
    return String(playerOrKey);
  }

  const character = playerOrKey?.character || playerOrKey?.characterData || {};
  const key =
    character.uuid ||
    character.id ||
    playerOrKey?.characterId ||
    playerOrKey?.uuid ||
    playerOrKey?.id ||
    null;

  return key ? String(key) : null;
}

function get(player) {
  const key = getPlayerKey(player);
  if (!key) return null;

  return payloadCache.get(key)?.payload || null;
}

function set(player, payload) {
  const key = getPlayerKey(player);
  if (!key || !payload) return null;

  payloadCache.set(key, {
    payload,
    updatedAt: Date.now(),
  });

  return payload;
}

function sendUpdate(player, payload) {
  if (!safeExists(player) || !payload) return;
  player.call("c:f2menu:update", [JSON.stringify(payload)]);
}

async function refresh(player, options = {}) {
  const key = getPlayerKey(player);
  if (!key || !safeExists(player) || !player.character) return null;

  if (pendingBuilds.has(key)) {
    const pendingPayload = await pendingBuilds.get(key);
    if (options.push) sendUpdate(player, pendingPayload);
    return pendingPayload;
  }

  const buildPromise = buildF2Payload(player)
    .then((payload) => set(player, payload))
    .finally(() => pendingBuilds.delete(key));

  pendingBuilds.set(key, buildPromise);

  const payload = await buildPromise;
  if (options.push) sendUpdate(player, payload);

  return payload;
}

async function getOrBuild(player) {
  return get(player) || refresh(player);
}

function prime(player) {
  refresh(player).catch((error) => {
    console.error("[F2 CACHE PRIME ERROR]", error?.message || error);
  });
}

function patch(player, partialPayload, options = {}) {
  const current = get(player) || {};
  const next = {
    ...current,
    ...(partialPayload || {}),
  };

  const payload = set(player, next);
  if (options.push !== false) sendUpdate(player, payload);

  return payload;
}

function invalidate(playerOrKey) {
  const key = getPlayerKey(playerOrKey);
  if (!key) return;

  payloadCache.delete(key);
  pendingBuilds.delete(key);
}

mp.events.add("playerQuit", (player) => {
  invalidate(player);
});

mp.events.add("s:f2menu:cache:refresh", (player) => {
  refresh(player, { push: true }).catch((error) => {
    console.error("[F2 CACHE REFRESH ERROR]", error?.message || error);
  });
});

module.exports = {
  get,
  getOrBuild,
  refresh,
  prime,
  patch,
  invalidate,
};
