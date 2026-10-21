"use strict";

const db = require("../../database/query.js");
const { ensureTableSchema } = require("../../database/schemaMigration.js");

const CREATE_SETTLEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS f2_roulette_settlements (
    account_id BIGINT UNSIGNED NOT NULL,
    request_id VARCHAR(64) NOT NULL,
    character_uuid BIGINT UNSIGNED NOT NULL,
    bet_amount INT UNSIGNED NOT NULL,
    selected_multiplier TINYINT UNSIGNED NOT NULL,
    segment_id VARCHAR(64) NOT NULL,
    result_multiplier TINYINT UNSIGNED NOT NULL,
    win TINYINT(1) NOT NULL,
    win_amount INT UNSIGNED NOT NULL,
    balance_before BIGINT UNSIGNED NOT NULL,
    balance_after BIGINT UNSIGNED NOT NULL,
    acknowledged_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, request_id),
    INDEX idx_f2_roulette_character_created (character_uuid, created_at),
    INDEX idx_f2_roulette_account_ack_created (account_id, acknowledged_at, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

let schemaPromise = null;

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = db.withConn((conn) => ensureTableSchema(conn, CREATE_SETTLEMENTS_TABLE_SQL))
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  return schemaPromise;
}

function mapSettlementResult(row) {
  if (!row) return null;

  const resultMultiplier = Number(row.result_multiplier);
  const bet = Math.max(0, Number(row.bet_amount || 0));
  const winAmount = Math.max(0, Number(row.win_amount || 0));
  const win = Boolean(Number(row.win));

  return {
    requestId: String(row.request_id || ""),
    success: true,
    win,
    selectedMultiplier: Number(row.selected_multiplier),
    resultMultiplier,
    segmentId: String(row.segment_id || ""),
    multiplier: resultMultiplier,
    bet,
    winAmount,
    donate: Math.max(0, Number(row.current_donate ?? row.balance_after ?? 0)),
    replayed: true,
    resultText: `x${resultMultiplier}`,
    message: win
      ? `Вы выиграли ${winAmount} NoName Coin.`
      : `Выпало x${resultMultiplier}. Вы проиграли ${bet} NoName Coin.`,
  };
}

async function getLatestUnacknowledged(accountId) {
  await ensureSchema();
  const rows = await db.query(
    `SELECT s.request_id, s.bet_amount, s.selected_multiplier, s.segment_id,
            s.result_multiplier, s.win, s.win_amount, s.balance_after,
            a.donate AS current_donate
       FROM f2_roulette_settlements s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.account_id = ?
        AND s.acknowledged_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [accountId]
  );

  return mapSettlementResult(rows?.[0]);
}

async function acknowledge(accountId, requestId) {
  await ensureSchema();
  const result = await db.query(
    `UPDATE f2_roulette_settlements
        SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP)
      WHERE account_id = ? AND request_id = ?`,
    [accountId, requestId]
  );

  return Number(result?.affectedRows || 0) > 0;
}

module.exports = {
  acknowledge,
  ensureSchema,
  getLatestUnacknowledged,
  mapSettlementResult,
};
