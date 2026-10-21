"use strict";

const {
  parseJson,
  getStaticId,
  getPlayerName,
} = require("../../utils/player.js");
const { sanitizeText } = require("../../utils/text.js");

function safeCall(player, eventName, args = []) {
  try {
    player.call(eventName, args);
  } catch {}
}

function notify(player, message, color = "#66ccff") {
  safeCall(player, "chat:client:add", [
    JSON.stringify({
      message: sanitizeText(String(message)),
      color,
      createdAt: Date.now(),
    }),
  ]);
}

function createUid(itemId) {
  return `${itemId}_${Date.now()}_${Math.floor(Math.random() * 999999)}`;
}

module.exports = {
  parseJson,
  getStaticId,
  getPlayerName,
  safeCall,
  notify,
  createUid,
};
