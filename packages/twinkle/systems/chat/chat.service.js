"use strict";

const MAX_HISTORY = 200;
const histories = new Map();

function exists(player) {
  return player && mp.players.exists(player);
}

function getPlayerKey(player) {
  return Number(player?.id || 0);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeCall(player, eventName, args = []) {
  try {
    if (exists(player)) {
      player.call(eventName, args);
    }
  } catch (error) {
    console.log(`[CHAT SERVICE] call ${eventName}:`, error.message);
  }
}

function normalizeMessage(message = {}) {
  const payload = {
    id: message.id ?? `chat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    text: String(message.text ?? message.message ?? "").trim(),
    type: message.type ? String(message.type) : undefined,
    channelType: message.channelType ? String(message.channelType) : undefined,
    isSuccessfully:
      message.isSuccessfully === undefined ? undefined : Boolean(message.isSuccessfully),
    createdAt:
      message.createdAt !== undefined && message.createdAt !== null
        ? Number(message.createdAt)
        : Date.now(),
    author: message.author ? String(message.author) : undefined,
    channel: message.channel ? String(message.channel) : undefined,
    badge: message.badge ? String(message.badge) : undefined,
  };

  if (message.color && !payload.channelType) {
    payload.color = String(message.color);
  }

  return payload;
}

function getHistory(player) {
  return histories.get(getPlayerKey(player)) || [];
}

function setHistory(player, list) {
  histories.set(getPlayerKey(player), list.slice(-MAX_HISTORY));
}

function pushHistory(player, message) {
  const current = getHistory(player);
  current.push(normalizeMessage(message));
  setHistory(player, current);
}

function sendChatEvent(player, eventName, payload) {
  safeCall(player, eventName, [JSON.stringify(payload)]);
}

function sendToPlayer(player, message, color = "#ffffff", meta = {}) {
  if (!exists(player)) return;

  const payload = normalizeMessage({
    text: message,
    type: meta.type || "channel",
    channelType: meta.channelType || "server",
    author: meta.author || "Система",
    color,
  });

  pushHistory(player, payload);
  sendChatEvent(player, "chat:client:add", payload);
}

function sendError(player, message) {
  sendToPlayer(player, message, "#ff6666");
}

function sendInfo(player, message) {
  sendToPlayer(player, message, "#66ccff");
}

function sendSuccess(player, message) {
  sendToPlayer(player, message, "#66cc66");
}

function sendWarning(player, message) {
  sendToPlayer(player, message, "#ff9900");
}

function sendLocal(player, message, color = "#ffffff", range = 20, meta = {}) {
  if (!exists(player)) return;

  const payload = normalizeMessage({
    text: message,
    type: meta.type || "channel",
    channelType: meta.channelType || "global",
    author: meta.author || "Система",
    color,
    range,
  });

  mp.players.forEach((target) => {
    if (!exists(target)) return;

    pushHistory(target, payload);
    sendChatEvent(target, "chat:client:add", payload);
  });
}

function sendGlobal(message, color = "#66ccff", meta = {}) {
  mp.players.forEach((player) => {
    sendToPlayer(player, message, color, meta);
  });
}

function clearAllHistories() {
  histories.clear();

  mp.players.forEach((player) => {
    safeCall(player, "chat:client:clear");
  });
}

function syncHistory(player) {
  if (!exists(player)) return;

  sendChatEvent(player, "chat:client:history", getHistory(player));
}

mp.events.add("playerQuit", (player) => {
  histories.delete(getPlayerKey(player));
});

module.exports = {
  normalizeMessage,
  sendToPlayer,
  sendError,
  sendInfo,
  sendSuccess,
  sendWarning,
  sendLocal,
  sendGlobal,
  clearAllHistories,
  syncHistory,
  getHistory,
};
