"use strict";

const mysql = require("mysql2/promise");
const config = require("./config");
const mainDb = require("./index.js");
const { ensureTableSchema } = require("./schemaMigration.js");
const {
  rows,
  playerUuid: resolvePlayerUuid,
  playerAdminLevel,
  playerName: resolvePlayerName,
} = require("../utils/player.js");

const dbConfig = config.logsDatabase || {
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "twinklelogs",
};

const logsPool = mysql.createPool({
  host: dbConfig.host || "127.0.0.1",
  user: dbConfig.user || "root",
  password: dbConfig.password || "",
  database: dbConfig.database || "twinklelogs",
  port: dbConfig.port || 3306,
  waitForConnections: true,
  connectionLimit: dbConfig.connectionLimit || 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

let ready = false;
let schemaPromise = null;

async function mainTableExists(tableName) {
  const result = await mainDb.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1
    `,
    [tableName]
  );

  return Array.isArray(result) && result.length > 0;
}

async function migrateLegacyLogTable(table, columns) {
  if (!(await mainTableExists(table))) return;

  const countRows = rows(await mainDb.query(`SELECT COUNT(*) AS count FROM ${table}`)) || [];
  if (Number(countRows[0]?.count || 0) === 0) return;

  const schemaRows = rows(await mainDb.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  )) || [];
  const availableColumns = new Set(schemaRows.map((entry) => String(entry.COLUMN_NAME)));
  const missingColumns = columns.filter((column) => !availableColumns.has(column));
  if (missingColumns.length) {
    console.warn(`[LOGS] Legacy migration skipped for ${table}: missing columns ${missingColumns.join(", ")}`);
    return;
  }

  const legacyRows = rows(await mainDb.query(`SELECT ${columns.join(", ")} FROM ${table} ORDER BY id ASC`)) || [];
  const placeholders = columns.map(() => "?").join(", ");
  for (const entry of legacyRows) {
    await logsPool.query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE id = id`,
      columns.map((column) => entry[column])
    );
  }
}
async function migrateLegacyLogs() {
  const migrations = [
    {
      table: "fraction_member_history",
      columns: ["id", "fraction_id", "character_uuid", "actor_uuid", "actor_rank", "action", "comment", "created_at"],
    },
    {
      table: "fraction_balance_logs",
      columns: ["id", "fraction_id", "actor_uuid", "actor_rank", "transaction_type", "comment", "amount", "created_at"],
    },
    {
      table: "fraction_storage_logs",
      columns: ["id", "fraction_id", "actor_uuid", "actor_rank", "action", "item_key", "item_name", "amount", "comment", "created_at"],
    },
    {
      table: "hwid_logs",
      columns: ["id", "account_id", "old_hwid", "new_hwid", "ip", "date"],
    },
    {
      table: "character_f2_case_logs",
      columns: ["id", "character_uuid", "case_id", "reward_id", "reward_type", "reward_name", "reward_rarity", "reward_amount", "created_at"],
    },
    {
      table: "ghetto_capture_kills",
      columns: ["id", "capture_id", "killer_uuid", "victim_uuid", "killer_fraction_id", "victim_fraction_id", "created_at"],
    },
  ];

  for (const migration of migrations) {
    await migrateLegacyLogTable(migration.table, migration.columns);
  }
}

async function migrateLegacyAdminPresence() {
  if (!(await mainTableExists("admin_presence_events"))) return;

  const legacyRows = rows(await mainDb.query(
    `SELECT id, character_uuid, character_name, event_type, created_at
       FROM admin_presence_events
      ORDER BY id ASC`
  )) || [];
  const connection = await logsPool.getConnection();

  try {
    await connection.beginTransaction();
    const [claimResult] = await connection.query(
      `INSERT IGNORE INTO schema_migrations (migration_key)
       VALUES (?)`,
      ["legacy_admin_presence_v1"]
    );

    if (Number(claimResult.affectedRows || 0) !== 1) {
      await connection.rollback();
      return;
    }

    for (const entry of legacyRows) {
      const eventType = entry.event_type === "leave" ? "leave" : "join";
      const characterUuid = Number(entry.character_uuid || 0) || null;
      const playerName = entry.character_name || null;
      const reason = entry.event_type === "leave"
        ? "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440 \u0432\u044b\u0448\u0435\u043b \u0438\u0437 \u0438\u0433\u0440\u044b"
        : "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440 \u0432\u043e\u0448\u0435\u043b \u0432 \u0438\u0433\u0440\u0443";

      await connection.query(
        `INSERT INTO player_session_logs
           (event_type, character_uuid, player_name, is_admin, reason, created_at)
         SELECT ?, ?, ?, 1, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
              FROM player_session_logs
             WHERE event_type = ?
               AND character_uuid <=> ?
               AND player_name <=> ?
               AND is_admin = 1
               AND reason <=> ?
               AND created_at = ?
          )`,
        [
          eventType,
          characterUuid,
          playerName,
          reason,
          entry.created_at,
          eventType,
          characterUuid,
          playerName,
          reason,
          entry.created_at,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureLogsSchema() {
  if (ready) return;

  if (schemaPromise) return schemaPromise;

  schemaPromise = initializeLogsSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function initializeLogsSchema() {

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS server_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      type VARCHAR(64) NOT NULL DEFAULT 'system',
      level VARCHAR(32) NOT NULL DEFAULT 'info',
      player_uuid BIGINT NULL,
      player_name VARCHAR(128) NULL,
      message TEXT NOT NULL,
      data JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_type (type),
      INDEX idx_level (level),
      INDEX idx_player_uuid (player_uuid),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS fraction_member_history (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      fraction_id INT NOT NULL,
      character_uuid BIGINT NOT NULL,
      actor_uuid BIGINT NULL,
      actor_rank INT NULL,
      action VARCHAR(64) NOT NULL,
      comment VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fraction_member (fraction_id, character_uuid),
      INDEX idx_fraction_history_created (fraction_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS fraction_balance_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      fraction_id INT NOT NULL,
      actor_uuid BIGINT NULL,
      actor_rank INT NULL,
      transaction_type VARCHAR(64) NOT NULL,
      comment VARCHAR(255) NULL,
      amount DECIMAL(15,2) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fraction_balance_created (fraction_id, created_at),
      INDEX idx_fraction_balance_actor (fraction_id, actor_uuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS fraction_storage_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      fraction_id INT NOT NULL,
      actor_uuid BIGINT NULL,
      actor_rank INT NULL,
      action VARCHAR(64) NOT NULL,
      item_key VARCHAR(64) NULL,
      item_name VARCHAR(128) NOT NULL,
      amount INT NOT NULL DEFAULT 0,
      comment VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fraction_storage_logs_created (fraction_id, created_at),
      INDEX idx_fraction_storage_logs_actor (fraction_id, actor_uuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS hwid_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id INT NOT NULL,
      old_hwid VARCHAR(128) NULL,
      new_hwid VARCHAR(128) NULL,
      ip VARCHAR(64) NULL,
      date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_hwid_logs_account (account_id),
      INDEX idx_hwid_logs_date (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS character_f2_case_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      character_uuid BIGINT NOT NULL,
      case_id VARCHAR(64) NOT NULL,
      reward_id VARCHAR(64) NOT NULL,
      reward_type VARCHAR(32) NOT NULL,
      reward_name VARCHAR(128) NOT NULL,
      reward_rarity VARCHAR(32) NOT NULL,
      reward_amount INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_f2_case_logs_character (character_uuid),
      INDEX idx_f2_case_logs_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS ghetto_capture_kills (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      capture_id BIGINT NOT NULL,
      killer_uuid BIGINT NULL,
      victim_uuid BIGINT NULL,
      killer_fraction_id INT NOT NULL,
      victim_fraction_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ghetto_kills_capture (capture_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS player_session_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_type ENUM('join','leave') NOT NULL,
      account_id BIGINT NULL,
      character_uuid BIGINT NULL,
      player_name VARCHAR(128) NULL,
      social_club VARCHAR(64) NULL,
      ip VARCHAR(64) NULL,
      hwid VARCHAR(128) NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      reason VARCHAR(255) NULL,
      actor_uuid BIGINT NULL,
      actor_name VARCHAR(128) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_player_session_created (created_at),
      INDEX idx_player_session_character (character_uuid, created_at),
      INDEX idx_player_session_event (event_type, created_at),
      INDEX idx_player_session_admin (is_admin, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_key VARCHAR(128) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (migration_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS money_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source VARCHAR(64) NOT NULL DEFAULT 'system',
      action VARCHAR(64) NOT NULL DEFAULT 'change',
      currency ENUM('cash','bank','fraction_balance','other') NOT NULL DEFAULT 'cash',
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      balance_before DECIMAL(15,2) NULL,
      balance_after DECIMAL(15,2) NULL,
      actor_uuid BIGINT NULL,
      actor_name VARCHAR(128) NULL,
      target_uuid BIGINT NULL,
      target_name VARCHAR(128) NULL,
      account_id BIGINT NULL,
      fraction_id INT NULL,
      comment VARCHAR(255) NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_money_logs_created (created_at),
      INDEX idx_money_logs_target (target_uuid, created_at),
      INDEX idx_money_logs_actor (actor_uuid, created_at),
      INDEX idx_money_logs_source (source, created_at),
      INDEX idx_money_logs_currency (currency, created_at),
      INDEX idx_money_logs_fraction (fraction_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureTableSchema(logsPool, `
    CREATE TABLE IF NOT EXISTS donate_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      source VARCHAR(64) NOT NULL DEFAULT 'system',
      action VARCHAR(64) NOT NULL DEFAULT 'change',
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      balance_before DECIMAL(15,2) NULL,
      balance_after DECIMAL(15,2) NULL,
      actor_uuid BIGINT NULL,
      actor_name VARCHAR(128) NULL,
      target_uuid BIGINT NULL,
      target_name VARCHAR(128) NULL,
      account_id BIGINT NULL,
      comment VARCHAR(255) NULL,
      metadata JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_donate_logs_created (created_at),
      INDEX idx_donate_logs_target (target_uuid, created_at),
      INDEX idx_donate_logs_actor (actor_uuid, created_at),
      INDEX idx_donate_logs_account (account_id, created_at),
      INDEX idx_donate_logs_source (source, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await migrateLegacyAdminPresence();
  await migrateLegacyLogs();

  ready = true;
}

async function logQuery(sql, params = []) {
  await ensureLogsSchema();
  const [rows] = await logsPool.query(sql, params);
  return rows;
}

async function writeLog({
  type = "system",
  level = "info",
  player = null,
  message = "",
  data = null,
} = {}) {
  await ensureLogsSchema();

  const playerUuid = resolvePlayerUuid(player) || null;
  const playerName = player ? resolvePlayerName(player) : null;

  await logsPool.query(
    `
    INSERT INTO server_logs 
    (type, level, player_uuid, player_name, message, data)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      String(type),
      String(level),
      playerUuid ? Number(playerUuid) : null,
      playerName,
      String(message || ""),
      data ? JSON.stringify(data) : null,
    ]
  );
}

function getPlayerLogData(player) {
  const uuid = resolvePlayerUuid(player);
  const adminLevel = playerAdminLevel(player);
  const name = player ? resolvePlayerName(player) : (uuid ? `Player #${uuid}` : null);
  const character = player?.character || player?.characterData || {};

  return {
    accountId: Number(player?.accountId || player?.account?.id || character?.account_id || 0) || null,
    uuid: uuid || null,
    name,
    socialClub: player?.socialClub == null ? null : String(player.socialClub),
    ip: player?.ip == null ? null : String(player.ip),
    hwid: player?.serial == null ? null : String(player.serial),
    adminLevel,
    isAdmin: adminLevel > 0,
  };
}

function setPlayerQuitReason(player, reasonType, reason = "", actor = null) {
  if (!player) return;
  player.twinkleQuitReason = {
    reason: String(reason || "").slice(0, 255),
    actorUuid: actor ? getPlayerLogData(actor).uuid : null,
    actorName: actor ? getPlayerLogData(actor).name : null,
  };
}

async function writePlayerSessionLog(player, eventType, options = {}) {
  // Capture volatile RAGE:MP player fields synchronously. After the first await
  // a playerQuit object may already be expired and its native getters can throw.
  const data = getPlayerLogData(player);
  const quitReason = eventType === "leave" ? (player?.twinkleQuitReason || {}) : {};
  const reason = options.reason || quitReason.reason || (eventType === "leave" ? "\u0421\u0430\u043c \u0432\u044b\u0448\u0435\u043b" : "\u0412\u0445\u043e\u0434 \u0432 \u0438\u0433\u0440\u0443");
  const actorUuid = options.actorUuid ?? quitReason.actorUuid ?? null;
  const actorName = options.actorName ?? quitReason.actorName ?? null;

  if (eventType === "leave" && player?.twinkleQuitReason) {
    player.twinkleQuitReason = null;
  }

  await ensureLogsSchema();

  await logsPool.query(
    `INSERT INTO player_session_logs
       (event_type, account_id, character_uuid, player_name, social_club, ip, hwid,
         is_admin, reason, actor_uuid, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(eventType) === "leave" ? "leave" : "join",
      data.accountId,
      data.uuid,
      data.name,
      data.socialClub,
      data.ip,
      data.hwid,
      data.isAdmin ? 1 : 0,
      String(reason || "").slice(0, 255) || null,
      actorUuid ? Number(actorUuid) : null,
      actorName ? String(actorName).slice(0, 128) : null,
    ]
  );

}

function normalizeCurrency(currency) {
  const value = String(currency || "cash").toLowerCase();
  return ["cash", "bank", "fraction_balance", "other"].includes(value)
    ? value
    : "other";
}

async function writeMoneyLog({
  source = "system",
  action = "change",
  currency = "cash",
  amount = 0,
  balanceBefore = null,
  balanceAfter = null,
  actor = null,
  actorUuid = null,
  actorName = null,
  target = null,
  targetUuid = null,
  targetName = null,
  accountId = null,
  fractionId = null,
  comment = "",
  metadata = null,
} = {}) {
  await ensureLogsSchema();

  const actorData = actor ? getPlayerLogData(actor) : {};
  const targetData = target ? getPlayerLogData(target) : {};

  await logsPool.query(
    `INSERT INTO money_logs
       (source, action, currency, amount, balance_before, balance_after,
        actor_uuid, actor_name, target_uuid, target_name, account_id, fraction_id,
        comment, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(source || "system").slice(0, 64),
      String(action || "change").slice(0, 64),
      normalizeCurrency(currency),
      Number(amount || 0),
      balanceBefore == null ? null : Number(balanceBefore),
      balanceAfter == null ? null : Number(balanceAfter),
      actorUuid ?? actorData.uuid ?? null,
      actorName ?? actorData.name ?? null,
      targetUuid ?? targetData.uuid ?? null,
      targetName ?? targetData.name ?? null,
      accountId ?? targetData.accountId ?? null,
      fractionId == null ? null : Number(fractionId),
      String(comment || "").slice(0, 255) || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

async function writeDonateLog({
  source = "system",
  action = "change",
  amount = 0,
  balanceBefore = null,
  balanceAfter = null,
  actor = null,
  actorUuid = null,
  actorName = null,
  target = null,
  targetUuid = null,
  targetName = null,
  accountId = null,
  comment = "",
  metadata = null,
} = {}) {
  await ensureLogsSchema();

  const actorData = actor ? getPlayerLogData(actor) : {};
  const targetData = target ? getPlayerLogData(target) : {};

  await logsPool.query(
    `INSERT INTO donate_logs
       (source, action, amount, balance_before, balance_after,
        actor_uuid, actor_name, target_uuid, target_name, account_id,
        comment, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(source || "system").slice(0, 64),
      String(action || "change").slice(0, 64),
      Number(amount || 0),
      balanceBefore == null ? null : Number(balanceBefore),
      balanceAfter == null ? null : Number(balanceAfter),
      actorUuid ?? actorData.uuid ?? null,
      actorName ?? actorData.name ?? null,
      targetUuid ?? targetData.uuid ?? null,
      targetName ?? targetData.name ?? null,
      accountId ?? targetData.accountId ?? null,
      String(comment || "").slice(0, 255) || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

async function initLogsDatabase() {
  await ensureLogsSchema();
  console.log("\x1b[36m[TWINKLE LOGS]\x1b[0m Logs database ready");
}

module.exports = {
  logsPool,
  logQuery,
  writeLog,
  writeMoneyLog,
  writeDonateLog,
  setPlayerQuitReason,
  writePlayerSessionLog,
  ensureLogsSchema,
  initLogsDatabase,
};




