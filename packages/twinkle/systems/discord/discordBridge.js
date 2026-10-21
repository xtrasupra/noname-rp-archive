"use strict";

const Discord = require("discord.js");
// RAGE MP embeds an older Node.js runtime that does not resolve the `node:` prefix.
const crypto = require("crypto");
const chat = require("../chat/chat.service.js");
const db = require("../../database/query.js");
const {
  rows,
  parseJson,
  playerUuid,
  playerAdminLevel,
} = require("../../utils/player.js");

const client = new Discord.Client();

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ADMIN_CHANNEL_ID = process.env.DISCORD_ADMIN_CHANNEL_ID;
const ENV_JOIN_CHANNEL_ID = process.env.DISCORD_JOIN_CHANNEL_ID;

let onlineAdmins = [];
let settings = {
  enabled: true,
  channelId: ENV_JOIN_CHANNEL_ID || "",
  zeroAdminAlertEnabled: false,
  zeroAdminRoleId: "",
};

const TOKEN_KEY = crypto
  .createHash("sha256")
  .update(
    process.env.DISCORD_TOKEN_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "TWINKLE_LOCAL_DISCORD_TOKEN_KEY"
  )
  .digest();

function decryptToken(value) {
  const [ivText, tagText, payloadText] = String(value || "").split(".");
  if (!ivText || !tagText || !payloadText) return "";
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    TOKEN_KEY,
    Buffer.from(ivText, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function ensureSettings() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_runtime_settings (
      setting_key VARCHAR(96) NOT NULL PRIMARY KEY,
      setting_value JSON NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const result = await db.query(
    "SELECT setting_value FROM system_runtime_settings WHERE setting_key = 'discord.adminOnline' LIMIT 1"
  );
  const stored = parseJson(rows(result)?.[0]?.setting_value, {});
  settings = {
    enabled: stored.enabled !== false,
    channelId: String(stored.channelId || ENV_JOIN_CHANNEL_ID || "").trim(),
    zeroAdminAlertEnabled: stored.zeroAdminAlertEnabled === true,
    zeroAdminRoleId: String(stored.zeroAdminRoleId || "").replace(/\D/g, "").trim(),
  };
}

function renderTemplate(template, payload) {
  return String(template || "{{message}}").replace(
    /\{\{([a-zA-Z0-9_]+)\}\}/g,
    (_match, key) => String(payload?.[key] ?? "")
  );
}

async function sendConfiguredEvent(eventKey, payload = {}) {
  return 0;
}

async function recordPresence(adminData, type) {
  return null;
}

function getAdminData(player) {
  return {
    id: player.id,
    name: player.name || `Player #${player.id}`,
    uuid: playerUuid(player),
    adminLevel: playerAdminLevel(player),
  };
}

function formatAdminsList(admins) {
  if (!admins.length) return "- (никого нет)";

  return admins
    .map((admin) => `- ${admin.name} #${admin.uuid} [${admin.adminLevel}]`)
    .join("\n");
}

function sendDiscordToAdmins(authorName, content) {
  const text = `[DISCORD] ${authorName}: ${content}`;

  mp.players.forEach((player) => {
    if (Number(player.adminLevel || 0) >= 1) {
      chat.sendToPlayer(player, text, "#5555ff");
    }
  });
}

async function sendZeroAdminAlert(adminData) {
  const routed = await sendConfiguredEvent("admin.zero_online", {
    message: "На сервере не осталось администраторов в игре.",
    name: adminData.name,
    uuid: adminData.uuid,
    level: adminData.adminLevel,
    online: onlineAdmins.length,
  });
  if (routed > 0) return;

  if (!settings.enabled) return;
  const channelId = settings.channelId || ENV_JOIN_CHANNEL_ID;
  if (!channelId) {
    console.log("[DISCORD] Admin online channel is not configured");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel) {
      console.log("[DISCORD] Join/leave channel not found");
      return;
    }

    if (onlineAdmins.length === 0 && settings.zeroAdminAlertEnabled) {
      const mention = settings.zeroAdminRoleId ? `<@&${settings.zeroAdminRoleId}> ` : "";
      await channel.send(
        `${mention}⚠️ **На сервере не осталось администраторов в игре.**\n` +
        `Последним вышел: **${adminData.name} #${adminData.uuid} [${adminData.adminLevel}]**`
      );
    }
  } catch (err) {
    console.log("[DISCORD JOIN CHANNEL ERROR]", err.message);
  }
}

function adminJoin(player) {
  if (!player) return;

  const adminData = getAdminData(player);

  if (adminData.adminLevel < 1 || !adminData.uuid) return;

  const exists = onlineAdmins.some((admin) => admin.uuid === adminData.uuid);

  if (!exists) {
    onlineAdmins.push(adminData);
  }

  recordPresence(adminData, "join").catch((error) =>
    console.log("[ADMIN PRESENCE]", error.message)
  );
  sendConfiguredEvent("admin.join", {
    message: "Администратор вошёл в игру.",
    name: adminData.name,
    uuid: adminData.uuid,
    level: adminData.adminLevel,
    online: onlineAdmins.length,
  });
}

function adminLeave(player) {
  if (!player) return;

  const adminData = getAdminData(player);

  if (adminData.adminLevel < 1 || !adminData.uuid) return;

  onlineAdmins = onlineAdmins.filter((admin) => admin.uuid !== adminData.uuid);

  recordPresence(adminData, "leave").catch((error) =>
    console.log("[ADMIN PRESENCE]", error.message)
  );
  sendConfiguredEvent("admin.leave", {
    message: "Администратор вышел из игры.",
    name: adminData.name,
    uuid: adminData.uuid,
    level: adminData.adminLevel,
    online: onlineAdmins.length,
  });
  if (onlineAdmins.length === 0) {
    sendZeroAdminAlert(adminData);
  }
}

client.once("ready", () => {
  console.log(`[DISCORD] Bot logged in as ${client.user.tag}`);
  ensureSettings().catch((error) => console.log("[DISCORD SETTINGS]", error.message));
});

client.on("message", (message) => {
  if (message.author.bot) return;
  if (!ADMIN_CHANNEL_ID) return;
  if (message.channel.id !== ADMIN_CHANNEL_ID) return;

  sendDiscordToAdmins(message.author.username, message.content);
});

mp.events.add("playerQuit", (player) => {
  adminLeave(player);
});

if (BOT_TOKEN) {
  client.login(BOT_TOKEN).catch((err) => {
    console.log("[DISCORD] Login error:", err.message);
  });
} else {
  console.log("[DISCORD] DISCORD_BOT_TOKEN not set");
}

ensureSettings()
  .then(async () => {
    console.log("[DISCORD] Website settings loaded");
  })
  .catch((error) => console.log("[DISCORD SETTINGS]", error.message));

module.exports = {
  client,
  adminJoin,
  adminLeave,
  reloadSettings: ensureSettings,
  sendConfiguredEvent,
};
