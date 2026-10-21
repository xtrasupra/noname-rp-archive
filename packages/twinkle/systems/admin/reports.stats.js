"use strict";

require("dotenv").config();

const db = require("../../database/query.js");
const discordBridge = require("../discord/discordBridge.js");
const Discord = require("discord.js");
const { getAdminLevel } = require("../../utils/player.js");

const REPORT_STATS_CHANNEL_ID = process.env.REPORT_STATS_CHANNEL_ID;

async function sql(query, params = []) {
  try {
    if (typeof db.query === "function") {
      return await db.query(query, params);
    }

    if (typeof db.withConn === "function") {
      return await db.withConn(async (conn) => {
        const [rows] = await conn.query(query, params);
        return rows;
      });
    }

    throw new Error("Database adapter not found");
  } catch (err) {
    console.error("[REPORT STATS SQL ERROR]", err);
    return [];
  }
}

function notify(player, message, color = "#66ccff") {
  try {
    player.call("chat:client:add", [
      JSON.stringify({
        message: String(message),
        color,
      }),
    ]);
  } catch {
    try {
      player.outputChatBox(String(message));
    } catch {}
  }
}

function formatSeconds(seconds) {
  seconds = Math.floor(Number(seconds || 0));

  const minutes = Math.floor(seconds / 60);
  const leftSeconds = seconds % 60;

  return `${minutes}м ${leftSeconds}с`;
}

function createEmbed() {
  if (Discord.EmbedBuilder) {
    return new Discord.EmbedBuilder();
  }

  return new Discord.MessageEmbed();
}

async function sendReportStatsEmbed(title, fromSql = null, toSql = null) {
  const params = [];
  let whereReports = "";
  let whereMessages = "";

  if (fromSql && toSql) {
    whereReports = `WHERE created_at >= ? AND created_at < ?`;
    whereMessages = `
      WHERE created_at >= ?
      AND created_at < ?
      AND role = 'admin'
      AND action_type = 'message'
    `;

    params.push(fromSql, toSql);
  }

  const reportsRows = await sql(
    `
    SELECT
      COUNT(*) AS totalReports,

      SUM(
        CASE
          WHEN status = 'Закрыто'
          THEN 1
          ELSE 0
        END
      ) AS closedReports,

      SUM(
        CASE
          WHEN status != 'Закрыто'
          THEN 1
          ELSE 0
        END
      ) AS activeReports

    FROM twinkle_admin.reports
    ${whereReports}
    `,
    params
  );

  const reportsStats = reportsRows?.[0] || {};

  const messageParams = fromSql && toSql
    ? [fromSql, toSql]
    : [];

  const messageRows = await sql(
    `
    SELECT
      COUNT(*) AS totalAnswers,
      AVG(answer_seconds) AS avgAnswerSeconds,

      SUM(
        CASE
          WHEN answer_seconds > 180
          THEN 1
          ELSE 0
        END
      ) AS overThreeMinutes

    FROM twinkle_admin.report_messages

    ${whereMessages}
    `,
    messageParams
  );

  const messageStats = messageRows?.[0] || {};

  const adminRows = await sql(
    `
    SELECT
      author_name,
      COUNT(*) AS answers,
      AVG(answer_seconds) AS avgAnswerSeconds,

      SUM(
        CASE
          WHEN answer_seconds > 180
          THEN 1
          ELSE 0
        END
      ) AS overThreeMinutes

    FROM twinkle_admin.report_messages

    ${whereMessages}

    GROUP BY admin_id, author_name
    ORDER BY answers DESC
    LIMIT 10
    `,
    messageParams
  );

  const adminStatsText = adminRows.length
    ? adminRows.map((row, index) => {
        return [
          `**${index + 1}. ${row.author_name}**`,
          `Ответов: **${Number(row.answers || 0)}**`,
          `Среднее время: **${formatSeconds(row.avgAnswerSeconds)}**`,
          `>3 минут: **${Number(row.overThreeMinutes || 0)}**`,
        ].join(" | ");
      }).join("\n")
    : "Нет данных.";

  const description = [
    `📨 Всего репортов: **${Number(reportsStats.totalReports || 0)}**`,
    `✅ Закрыто: **${Number(reportsStats.closedReports || 0)}**`,
    `🕓 Активных: **${Number(reportsStats.activeReports || 0)}**`,
    "",
    `💬 Ответов администрации: **${Number(messageStats.totalAnswers || 0)}**`,
    `⏱ Средний ответ: **${formatSeconds(messageStats.avgAnswerSeconds)}**`,
    `⚠ Ответов > 3 минут: **${Number(messageStats.overThreeMinutes || 0)}**`,
    "",
    "## Топ администрации",
    adminStatsText,
  ].join("\n");

  const embed = createEmbed()
    .setTitle(title || "📊 Статистика репортов")
    .setDescription(description.slice(0, 4000) || "Нет данных.")
    .setColor("#5865F2")
    .setTimestamp();

  const client = discordBridge.client;

  if (!client) {
    throw new Error("Discord bot client not found");
  }

  const channel = client.channels.cache.get(REPORT_STATS_CHANNEL_ID);

  if (!channel) {
    throw new Error(
      `Discord channel not found: ${REPORT_STATS_CHANNEL_ID}`
    );
  }

  if (Discord.EmbedBuilder) {
    await channel.send({
      embeds: [embed],
    });
  } else {
    await channel.send(embed);
  }
}

function toSqlDate(date) {
  return date
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function getPreviousHourRange() {
  const now = new Date();

  const to = new Date(now);
  to.setMinutes(0, 0, 0);

  const from = new Date(to);
  from.setHours(from.getHours() - 1);

  const fromHour = String(from.getHours()).padStart(2, "0");
  const toHour = String(to.getHours()).padStart(2, "0");

  return {
    fromSql: toSqlDate(from),
    toSql: toSqlDate(to),
    title: `📊 Статистика репортов ${fromHour}:00 - ${toHour}:00`,
  };
}

function getTodayRange() {
  const now = new Date();

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  return {
    fromSql: toSqlDate(from),
    toSql: toSqlDate(to),
    title: `📊 Дневная статистика ${day}.${month}.${year}`,
  };
}

function startReportStatsScheduler() {
  setInterval(async () => {
    const now = new Date();

    try {
      if (now.getMinutes() === 0) {
        const range = getPreviousHourRange();

        await sendReportStatsEmbed(
          range.title,
          range.fromSql,
          range.toSql
        );

        console.log("[REPORT STATS] Hour stats sent");
      }

      if (
        now.getHours() === 23 &&
        now.getMinutes() === 59
      ) {
        const range = getTodayRange();

        await sendReportStatsEmbed(
          range.title,
          range.fromSql,
          range.toSql
        );

        console.log("[REPORT STATS] Day stats sent");
      }
    } catch (err) {
      console.error("[REPORT STATS SCHEDULER ERROR]", err);
    }
  }, 60000);
}

mp.registerCommand("testreportstats", async (player) => {
  try {
    if (getAdminLevel(player) < 7) {
      return;
    }

    await sendReportStatsEmbed(
      "📊 Тестовая статистика репортов"
    );

    notify(
      player,
      "Тестовая статистика отправлена в Discord.",
      "#66cc66"
    );
  } catch (err) {
    console.error("[TEST REPORT STATS ERROR]", err);

    notify(
      player,
      "Ошибка отправки статистики.",
      "#ff6666"
    );
  }
});

mp.registerCommand("testreporthour", async (player) => {
  try {
    if (getAdminLevel(player) < 7) {
      return;
    }

    const range = getPreviousHourRange();

    await sendReportStatsEmbed(
      range.title,
      range.fromSql,
      range.toSql
    );

    notify(
      player,
      "Часовая статистика отправлена.",
      "#66cc66"
    );
  } catch (err) {
    console.error("[TEST REPORT HOUR STATS ERROR]", err);

    notify(
      player,
      "Ошибка отправки часовой статистики.",
      "#ff6666"
    );
  }
});

mp.registerCommand("testreportday", async (player) => {
  try {
    if (getAdminLevel(player) < 7) {
      return;
    }

    const range = getTodayRange();

    await sendReportStatsEmbed(
      range.title,
      range.fromSql,
      range.toSql
    );

    notify(
      player,
      "Дневная статистика отправлена.",
      "#66cc66"
    );
  } catch (err) {
    console.error("[TEST REPORT DAY STATS ERROR]", err);

    notify(
      player,
      "Ошибка отправки дневной статистики.",
      "#ff6666"
    );
  }
});

startReportStatsScheduler();

module.exports = {
  sendReportStatsEmbed,
  startReportStatsScheduler,
};

console.log("[REPORT STATS] Loaded");
