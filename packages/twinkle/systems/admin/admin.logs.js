"use strict";

const chat = require("../chat/chat.service.js");
const discordBridge = require("../discord/discordBridge.js");
const {
  getAdminLevel,
  getUuid,
} = require("../../utils/player.js");

const ADMIN_ACTION_TYPES = {
  STAFF: "staff",
  MANAGEMENT: "management",
};

const DISCORD_CHANNELS = {
  [ADMIN_ACTION_TYPES.STAFF]:
    "1456711365069897738",

  [ADMIN_ACTION_TYPES.MANAGEMENT]:
    "1515077783498264637",
};

const LOG_CONFIG = {
  [ADMIN_ACTION_TYPES.STAFF]: {
    prefix: "ADM",
    color: "#ff7a1a",
    minLevel: 1,
    discordColor: 0xff7a1a,
  },

  [ADMIN_ACTION_TYPES.MANAGEMENT]: {
    prefix: "MGMT",
    color: "#ff4d4d",
    minLevel: 7,
    discordColor: 0xff4d4d,
  },
};

function isAdmin(player) {
  return getAdminLevel(player) > 0;
}

function getName(player) {
  return (
    player?.rpName ||
    player?.name ||
    player?.login ||
    `Player ${player?.id ?? "unknown"}`
  );
}

function safeSendChat(player, message, color) {
  try {
    chat.sendToPlayer(
      player,
      message,
      color
    );
  }
  catch (err) {
    console.error(
      "[ADMIN CHAT LOG ERROR]",
      err
    );
  }
}

function safeSendAdminChat(message, minLevel = 1, color = "#ff7a1a") {
  mp.players.forEach((admin) => {
    if (!admin) return;
    if (!isAdmin(admin)) return;
    if (getAdminLevel(admin) < minLevel) return;

    safeSendChat(admin, message, color);
  });
}

async function sendDiscordLog(type, message) {
  try {
    const client = discordBridge.client;

    if (!client) return;

    const channelId = DISCORD_CHANNELS[type];
    if (!channelId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || typeof channel.send !== "function") {
      return;
    }

    const config = LOG_CONFIG[type] || LOG_CONFIG[ADMIN_ACTION_TYPES.STAFF];

    const Discord = require("discord.js");

    const embed = new Discord.MessageEmbed()
      .setDescription(String(message).slice(0, 4000) || "Без описания")
      .setColor(config.discordColor)
      .setFooter("ArchiveLogs")
      .setTimestamp();

    await channel.send(embed);
  } catch (err) {
    console.error("[ADMIN DISCORD LOG ERROR]", err);
  }
}

function sendAdminLog(
  message,
  minLevel = 1
) {
  if (!message) return;

  safeSendAdminChat(`ADM: ${message}`, minLevel, "#ff7a1a");
}

function sendAdminAction({
  type = ADMIN_ACTION_TYPES.STAFF,
  message = "",
  sendGameLog = true,
  sendDiscord = true,
} = {}) {
  if (!message) {
    return;
  }

  const config =
    LOG_CONFIG[type] ||
    LOG_CONFIG[
      ADMIN_ACTION_TYPES.STAFF
    ];

  const finalMessage =
    `${config.prefix}: ${message}`;

  if (sendGameLog) {
    safeSendAdminChat(finalMessage, config.minLevel, config.color);
  }

  if (sendDiscord) {
    sendDiscordLog(
      type,
      message
    );
  }

  console.log(
    `[ADMIN ACTION][${
      type.toUpperCase()
    }] ${message}`
  );
}

function logCommand(
  admin,
  action,
  target = null,
  reason = null,
  minLevel = 1
) {
  const adminName =
    getName(admin);

  const adminUuid =
    getUuid(admin);

  let text =
    `${adminName} #${adminUuid} ${action}`;

  if (target) {
    const targetName =
      getName(target);

    const targetUuid =
      getUuid(target);

    text +=
      ` игроку ${targetName} #${targetUuid}`;
  }

  if (reason) {
    text +=
      `. Причина: ${reason}`;
  }

  sendAdminLog(
    text,
    minLevel
  );
}

function logAdminAction(
  admin,
  action,
  target = null,
  reason = null,
  type = ADMIN_ACTION_TYPES.STAFF
) {
  const adminName =
    getName(admin);

  const adminUuid =
    getUuid(admin);

  let text =
    `${adminName} #${adminUuid} ${action}`;

  if (target) {
    const targetName =
      getName(target);

    const targetUuid =
      getUuid(target);

    text +=
      ` игроку ${targetName} #${targetUuid}`;
  }

  if (reason) {
    text +=
      `. Причина: ${reason}`;
  }

  sendAdminAction({
    type,
    message: text,
  });
}

module.exports = {
  ADMIN_ACTION_TYPES,

  sendAdminLog,
  sendAdminAction,

  logCommand,
  logAdminAction,

  isAdmin,
  getAdminLevel,
  getName,
  getUuid,
};
