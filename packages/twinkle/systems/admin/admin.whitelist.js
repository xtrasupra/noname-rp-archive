"use strict";

const db = require("../../database/query.js");
const chat = require("../chat/chat.service.js");
const adminLogs = require("./admin.logs.js");
const { getAdminLevel } = require("../../utils/player.js");
const { ensureWhitelistSchema } = require("../../database/query.js");

const MIN_ADMIN_LEVEL = 7;

function notify(player, message, color = "#66ccff") {
  try {
    chat.sendToPlayer(player, message, color);
  } catch {
    try {
      player.outputChatBox(message);
    } catch {}
  }
}

function ok(player, message) {
  notify(player, message, "#66cc66");
}

function err(player, message) {
  notify(player, message, "#ff6666");
}

function hasAccess(player) {
  return getAdminLevel(player) >= MIN_ADMIN_LEVEL;
}

function deny(player) {
  return err(player, "Недостаточно прав.");
}

async function query(sql, params = []) {
  await ensureWhitelistSchema();

  if (typeof db.query === "function") {
    return await db.query(sql, params);
  }

  if (typeof db.withConn === "function") {
    return await db.withConn(async (conn) => {
      const [rows] = await conn.query(sql, params);
      return rows;
    });
  }

  throw new Error("Database adapter not found");
}

async function findAccount(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const id = Number(text);

  if (Number.isInteger(id) && id > 0) {
    const rows = await query(
      `
        SELECT id, login, email, RegHwid, LastHwid
        FROM accounts
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    );

    return rows?.[0] || null;
  }

  const rows = await query(
    `
      SELECT id, login, email, RegHwid, LastHwid
      FROM accounts
      WHERE login = ?
      LIMIT 1
    `,
    [text]
  );

  return rows?.[0] || null;
}

async function isWhitelisted(account) {
  const rows = await query(
    `
      SELECT id
      FROM twinkle_admin.admin_whitelist_entries
      WHERE is_active = 1
        AND (
          (login IS NOT NULL AND LOWER(TRIM(login)) = LOWER(?))
          OR (hwid IS NOT NULL AND UPPER(TRIM(hwid)) IN (UPPER(?), UPPER(?)))
        )
      LIMIT 1
    `,
    [account.login, account.RegHwid || "", account.LastHwid || ""]
  );

  return rows.length > 0;
}

async function addWhitelist(account, addedBy = "game-admin") {
  const login = String(account.login || "").trim();

  await query(
    `
      INSERT INTO twinkle_admin.admin_whitelist_entries
        (login, hwid, type, added_by)
      SELECT ?, NULL, 'login', ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM twinkle_admin.admin_whitelist_entries
        WHERE is_active = 1
          AND type IN ('login', 'both')
          AND login IS NOT NULL
          AND LOWER(TRIM(login)) = LOWER(?)
      )
    `,
    [login, addedBy, login]
  );
}

async function removeWhitelist(account) {
  await query(
    `
      UPDATE twinkle_admin.admin_whitelist_entries
         SET is_active = 0
      WHERE is_active = 1
        AND (
          (login IS NOT NULL AND LOWER(TRIM(login)) = LOWER(?))
          OR (hwid IS NOT NULL AND UPPER(TRIM(hwid)) IN (UPPER(?), UPPER(?)))
        )
    `,
    [account.login, account.RegHwid || "", account.LastHwid || ""]
  );
}

mp.registerCommand("addwl", async (player, fullText) => {
  try {
    if (!hasAccess(player)) return deny(player);

    const args = String(fullText || "").trim().split(/\s+/);
    const accountValue = args[0];

    if (!accountValue) {
      return err(player, "Использование: /addwl [account id/login]");
    }

    const account = await findAccount(accountValue);

    if (!account) {
      return err(player, "Аккаунт не найден.");
    }

    if (await isWhitelisted(account)) {
      return err(
        player,
        `Аккаунт ${account.login} [ID ${account.id}] уже находится в whitelist.`
      );
    }

    await addWhitelist(account, player.name || `Admin #${player.id}`);
    ok(player, `Whitelist выдан аккаунту ${account.login} [ID ${account.id}].`);

    adminLogs.sendAdminLog(
      `${player.name} #${player.id} выдал whitelist аккаунту ${account.login} [ID ${account.id}]`
    );
  } catch (e) {
    console.error("[ADDWL ERROR]", e);
    err(player, "Ошибка добавления в whitelist.");
  }
});

mp.registerCommand("delwl", async (player, fullText) => {
  try {
    if (!hasAccess(player)) return deny(player);

    const args = String(fullText || "").trim().split(/\s+/);
    const accountValue = args[0];

    if (!accountValue) {
      return err(player, "Использование: /delwl [account id/login]");
    }

    const account = await findAccount(accountValue);

    if (!account) {
      return err(player, "Аккаунт не найден.");
    }

    if (!(await isWhitelisted(account))) {
      return err(
        player,
        `Аккаунт ${account.login} не находится в whitelist.`
      );
    }

    await removeWhitelist(account);
    ok(player, `Whitelist удалён у аккаунта ${account.login} [ID ${account.id}].`);
    adminLogs.sendAdminLog(
      `${player.name} #${player.id} удалил whitelist аккаунту ${account.login} [ID ${account.id}]`
    );

  } catch (e) {
    console.error("[DELWL ERROR]", e);
    err(player, "Ошибка удаления из whitelist.");
  }
});

module.exports = {
  addWhitelist,
  removeWhitelist,
  isWhitelisted,
  findAccount,
};

console.log("[ADMIN WHITELIST] Loaded");
