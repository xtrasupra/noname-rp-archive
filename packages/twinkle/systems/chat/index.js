"use strict";

const chat = require("./chat.service.js");
const {
  getAdminLevel,
  getPlayerName,
} = require("../../utils/player.js");

let fetch = null;

try {
  fetch = require("node-fetch");
} catch {
  fetch = global.fetch || null;
}

const LOCAL_RANGE = 20;

function normalizeText(text, maxLength = 220) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseChatPayload(rawMessage) {
  if (rawMessage && typeof rawMessage === "object") {
    return rawMessage;
  }

  const text = String(rawMessage || "").trim();

  if (!text) {
    return { message: "" };
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {}

  return { message: text };
}

function handleCommand(player, message) {
  const commandBody = String(message || "").slice(1).trim();

  if (!commandBody) {
    return chat.sendError(player, "Введите команду.");
  }

  const args = commandBody.split(/\s+/);
  const commandName = String(args.shift() || "").toLowerCase().trim();
  const fullText = args.join(" ").trim();

  if (!commandName) {
    return chat.sendError(player, "Введите команду.");
  }

  if (!mp.callCommand) {
    return chat.sendError(player, "Система команд не загружена.");
  }

  const executed = mp.callCommand(commandName, player, fullText, args);

  if (!executed) {
    return chat.sendError(player, `Команда /${commandName} не найдена.`);
  }

  return true;
}

mp.events.add("chat:server:send", (player, rawMessage) => {
  const payload = parseChatPayload(rawMessage);
  const message = normalizeText(payload.message ?? payload.text ?? rawMessage);

  if (!message) return;

  if (message.startsWith("/")) {
    handleCommand(player, message);
    return;
  }

  const name = getPlayerName(player);

  chat.sendLocal(player, message, "#ffffff", LOCAL_RANGE, {
    author: name,
    channelType: String(payload.channel || "ic").toLowerCase(),
    type: "channel",
  });
});

mp.events.add("chat:server:history:request", (player) => {
  chat.syncHistory(player);
});

mp.registerCommand("me", (player, text) => {
  const name = getPlayerName(player);
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, "Использование: /me действие");
  }

  chat.sendLocal(player, message, "#d44cff", LOCAL_RANGE, {
    author: name,
    type: "me",
    channelType: "global",
  });
});

mp.registerCommand("do", (player, text) => {
  const name = getPlayerName(player);
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, "Использование: /do описание");
  }

  chat.sendLocal(player, message, "#d44cff", LOCAL_RANGE, {
    author: name,
    type: "do",
    channelType: "global",
  });
});

mp.registerCommand("try", (player, text) => {
  const name = getPlayerName(player);
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, "Использование: /try действие");
  }

  const ok = Math.random() >= 0.5;

  chat.sendLocal(
    player,
    message,
    ok ? "#66cc66" : "#ff6666",
    LOCAL_RANGE,
    {
      author: name,
      type: "try",
      isSuccessfully: ok,
      channelType: "global",
    }
  );
});

mp.registerCommand("b", (player, text) => {
  const name = getPlayerName(player);
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, "Использование: /b текст");
  }

  chat.sendLocal(player, message, "#bfbfbf", LOCAL_RANGE, {
    author: name,
    type: "ooc",
    channelType: "global",
  });
});

mp.registerCommand("g", (player, text) => {
  const name = getPlayerName(player);
  const message = normalizeText(text);

  if (!message) {
    return chat.sendError(player, "Использование: /g текст");
  }

  chat.sendGlobal(message, "#66ccff", {
    author: name,
    type: "channel",
    channelType: "global",
  });
});

mp.registerCommand("global", (player, text, args) => {
  if (!mp.callCommand) return;

  mp.callCommand("g", player, text, args);
});

mp.registerCommand("help", (player) => {
  chat.sendInfo(
    player,
    "Команды: /me /do /try /b /g /a /aclear /help /aclothes /aprop /myclothes /myprop"
  );
});

mp.registerCommand("aclear", (player) => {
  if (getAdminLevel(player) < 1) {
    return chat.sendError(player, "Нет доступа к команде.");
  }

  chat.clearAllHistories();
});

mp.registerCommand("a", async (player, text) => {
  const name = getPlayerName(player);
  const message = normalizeText(text, 500);

  const adminLevel = getAdminLevel(player);

  if (adminLevel < 1) {
    return chat.sendError(player, "Нет доступа к команде.");
  }

  if (!message) {
    return chat.sendError(player, "Использование: /a текст");
  }

  mp.players.forEach((target) => {
    const targetAdminLevel = getAdminLevel(target);

    if (targetAdminLevel >= 1) {
      chat.sendToPlayer(target, message, "#5555ff", {
        author: name,
        type: "channel",
        channelType: "admin",
      });
    }
  });

  try {
    await sendAdminDiscord(player, message);
  } catch (err) {
    console.log("[ADMIN CHAT WEBHOOK ERROR]", err.message);
  }
});

async function sendAdminDiscord(player, text) {
  const webhookUrl = process.env.DISCORD_ADMIN_CHAT_WEBHOOK;

  if (!webhookUrl || !fetch) return;

  const avatarUrl = player.socialClub
    ? `https://sc.gtavsnapmatic.com/profile/${encodeURIComponent(player.socialClub)}/avatar`
    : undefined;

  const payload = {
    username: player.name || `Admin #${player.id}`,
    content: text,
  };

  if (avatarUrl) {
    payload.avatar_url = avatarUrl;
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

console.log("[CHAT] Custom chat commands loaded");

