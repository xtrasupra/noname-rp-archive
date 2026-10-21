"use strict";

const db = require("../../../database/query.js");

let schemaPromise = null;

async function validateSchema() {
  const columnResult = await db.query("SHOW COLUMNS FROM cargo_loader_deliveries");
  const indexResult = await db.query("SHOW INDEX FROM cargo_loader_deliveries");
  const columns = Array.isArray(columnResult?.[0]) ? columnResult[0] : columnResult;
  const indexes = Array.isArray(indexResult?.[0]) ? indexResult[0] : indexResult;
  const names = new Set((Array.isArray(columns) ? columns : []).map((column) => String(column.Field || "")));
  const required = [
    "cargo_id", "character_uuid", "job_id", "site_id", "source_id", "destination_id",
    "distance_m", "payout", "started_at", "completed_at",
  ];
  const missing = required.filter((name) => !names.has(name));
  const hasCargoPrimaryKey = (Array.isArray(indexes) ? indexes : []).some((index) => (
    String(index.Key_name || "").toUpperCase() === "PRIMARY"
    && String(index.Column_name || "") === "cargo_id"
    && Number(index.Non_unique || 0) === 0
  ));
  if (missing.length || !hasCargoPrimaryKey) {
    throw new Error(`cargo_loader_deliveries schema mismatch: missing=${missing.join(",") || "none"}, cargoPrimaryKey=${hasCargoPrimaryKey}`);
  }
}

function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS cargo_loader_deliveries (
        cargo_id VARCHAR(64) NOT NULL,
        character_uuid BIGINT NOT NULL,
        job_id VARCHAR(32) NOT NULL,
        site_id VARCHAR(32) NOT NULL,
        source_id VARCHAR(48) NOT NULL,
        destination_id VARCHAR(48) NOT NULL,
        distance_m INT UNSIGNED NOT NULL DEFAULT 0,
        payout INT UNSIGNED NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL,
        completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (cargo_id),
        INDEX idx_cargo_loader_character (character_uuid, completed_at),
        INDEX idx_cargo_loader_job (job_id, completed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await validateSchema();
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function settleDelivery(characterUuid, delivery) {
  const uuid = Number(characterUuid || 0);
  const cargoId = String(delivery?.cargoId || "").slice(0, 64);
  const payout = Math.max(0, Math.round(Number(delivery?.payout || 0)));
  if (!uuid || !cargoId || !payout) throw new Error("Некорректная выплата грузчика.");
  await ensureSchema();

  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [uuid]
      );
      if (!characterRows?.[0]) throw new Error("Персонаж не найден.");

      const [existingRows] = await connection.query(
        "SELECT payout FROM cargo_loader_deliveries WHERE cargo_id = ? LIMIT 1 FOR UPDATE",
        [cargoId]
      );
      const cashBefore = Math.max(0, Number(characterRows[0].cash || 0));
      if (existingRows?.[0]) {
        await connection.commit();
        return { alreadySettled: true, cashBefore, cashAfter: cashBefore, payout: Number(existingRows[0].payout || 0) };
      }

      await connection.query(
        `INSERT INTO cargo_loader_deliveries
          (cargo_id, character_uuid, job_id, site_id, source_id, destination_id, distance_m, payout, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cargoId,
          uuid,
          String(delivery.jobId || "").slice(0, 32),
          String(delivery.siteId || "").slice(0, 32),
          String(delivery.sourceId || "").slice(0, 48),
          String(delivery.destinationId || "").slice(0, 48),
          Math.max(0, Math.round(Number(delivery.distanceM || 0))),
          payout,
          new Date(Number(delivery.startedAt || Date.now())),
        ]
      );
      const cashAfter = cashBefore + payout;
      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, uuid]);
      await connection.commit();
      return { alreadySettled: false, cashBefore, cashAfter, payout };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      if (String(error?.code || "") === "ER_DUP_ENTRY") {
        const [existingRows] = await connection.query(
          "SELECT payout FROM cargo_loader_deliveries WHERE cargo_id = ? LIMIT 1",
          [cargoId]
        );
        const [characterRows] = await connection.query(
          "SELECT cash FROM characters WHERE uuid = ? LIMIT 1",
          [uuid]
        );
        if (existingRows?.[0] && characterRows?.[0]) {
          const cash = Math.max(0, Number(characterRows[0].cash || 0));
          return { alreadySettled: true, cashBefore: cash, cashAfter: cash, payout: Number(existingRows[0].payout || 0) };
        }
      }
      throw error;
    }
  });
}

module.exports = { ensureSchema, settleDelivery };
