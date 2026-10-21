"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const { getUuid } = require("../../utils/player.js");

function syncCash(player, cash) {
  const normalizedCash = Math.max(0, Number(cash || 0));
  if (player?.character) player.character.cash = normalizedCash;
  if (player?.characterData) player.characterData.cash = normalizedCash;

  try {
    player?.call("c:hud:update", [JSON.stringify({ player: { cash: normalizedCash } })]);
  } catch {}
}

async function adjustCash(player, delta, metadata) {
  const characterUuid = Number(getUuid(player));
  const normalizedDelta = Number(delta);
  if (!Number.isInteger(characterUuid) || characterUuid <= 0 || !Number.isInteger(normalizedDelta) || !normalizedDelta) {
    return { ok: false, reason: "invalid" };
  }

  const result = await db.withConn(async (connection) => {
    let transactionOpen = false;

    try {
      await connection.beginTransaction();
      transactionOpen = true;

      const [rows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const before = Number(rows?.[0]?.cash);
      if (!Number.isFinite(before)) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "character_missing" };
      }

      const after = before + normalizedDelta;
      if (!Number.isFinite(after) || after < 0) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "insufficient" };
      }

      const [update] = await connection.query(
        "UPDATE characters SET cash = ? WHERE uuid = ?",
        [after, characterUuid]
      );
      if (Number(update.affectedRows) !== 1) {
        throw new Error("Rental cash update did not affect the expected character");
      }

      await connection.commit();
      transactionOpen = false;
      return { ok: true, before, after };
    } catch (error) {
      if (transactionOpen) {
        try { await connection.rollback(); } catch {}
      }
      throw error;
    }
  });

  if (!result.ok) return result;
  syncCash(player, result.after);

  logsDb.writeMoneyLog({
    source: String(metadata?.source || "job_rental"),
    action: normalizedDelta < 0 ? "spend" : "refund",
    currency: "cash",
    amount: normalizedDelta,
    balanceBefore: result.before,
    balanceAfter: result.after,
    target: player || null,
    targetUuid: characterUuid,
    comment: String(metadata?.comment || "Job vehicle rental"),
  }).catch((error) => {
    console.error("[JOB RENTAL] Money log failed:", error?.message || error);
  });

  return result;
}

function chargeCash(player, amount, metadata) {
  const normalizedAmount = Math.abs(Number(amount));
  if (!Number.isInteger(normalizedAmount) || normalizedAmount <= 0) {
    return Promise.resolve({ ok: false, reason: "invalid" });
  }
  return adjustCash(player, -normalizedAmount, metadata);
}

function refundCash(player, amount, metadata) {
  const normalizedAmount = Math.abs(Number(amount));
  if (!Number.isInteger(normalizedAmount) || normalizedAmount <= 0) {
    return Promise.resolve({ ok: false, reason: "invalid" });
  }
  return adjustCash(player, normalizedAmount, metadata);
}

module.exports = {
  chargeCash,
  refundCash,
};
