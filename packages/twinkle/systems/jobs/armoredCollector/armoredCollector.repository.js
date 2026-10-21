"use strict";

const db = require("../../../database/query.js");
const { rows } = require("../../../utils/player.js");
const economy = require("./armoredCollector.economy.js");

let schemaPromise = null;

function normalizeProfile(row) {
  const xp = Math.max(0, Number(row?.xp || 0));
  return {
    characterUuid: Number(row?.character_uuid || 0),
    ...economy.levelProgress(xp),
    completedRoutes: Math.max(0, Number(row?.completed_routes || 0)),
    fastRoutes: Math.max(0, Number(row?.fast_routes || 0)),
    totalEarned: Math.max(0, Number(row?.total_earned || 0)),
  };
}

function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = Promise.all([
    db.query(`
      CREATE TABLE IF NOT EXISTS armored_collector_profiles (
        character_uuid BIGINT UNSIGNED NOT NULL,
        xp INT UNSIGNED NOT NULL DEFAULT 0,
        level TINYINT UNSIGNED NOT NULL DEFAULT 1,
        completed_routes INT UNSIGNED NOT NULL DEFAULT 0,
        fast_routes INT UNSIGNED NOT NULL DEFAULT 0,
        total_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (character_uuid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
    db.query(`
      CREATE TABLE IF NOT EXISTS armored_collector_history (
        run_id VARCHAR(48) NOT NULL,
        character_uuid BIGINT UNSIGNED NOT NULL,
        route_id VARCHAR(32) NOT NULL,
        rotation_bucket BIGINT UNSIGNED NOT NULL,
        bags TINYINT UNSIGNED NOT NULL,
        distance_m INT UNSIGNED NOT NULL,
        elapsed_seconds INT UNSIGNED NOT NULL,
        target_seconds INT UNSIGNED NOT NULL,
        base_pay INT UNSIGNED NOT NULL,
        level_bonus INT UNSIGNED NOT NULL,
        veteran_bonus INT UNSIGNED NOT NULL,
        fast_bonus INT UNSIGNED NOT NULL,
        final_payout INT UNSIGNED NOT NULL,
        xp_earned INT UNSIGNED NOT NULL,
        suspicious TINYINT(1) UNSIGNED NOT NULL DEFAULT 0,
        result_status ENUM('completed','cancelled') NOT NULL DEFAULT 'completed',
        cancellation_fee INT UNSIGNED NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL,
        completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (run_id),
        UNIQUE KEY uq_armored_character_rotation_route (character_uuid, rotation_bucket, route_id),
        KEY idx_armored_history_character (character_uuid, completed_at),
        KEY idx_armored_history_rotation (rotation_bucket, route_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),
  ]).then(async () => {
    const columnResult = await db.query("SHOW COLUMNS FROM armored_collector_history");
    const columns = new Set((rows(columnResult) || []).map((row) => String(row.Field || "")));
    const additions = [];
    if (!columns.has("result_status")) {
      additions.push("ADD COLUMN result_status ENUM('completed','cancelled') NOT NULL DEFAULT 'completed' AFTER suspicious");
    }
    if (!columns.has("cancellation_fee")) {
      additions.push("ADD COLUMN cancellation_fee INT UNSIGNED NOT NULL DEFAULT 0 AFTER result_status");
    }
    if (additions.length) {
      await db.query(`ALTER TABLE armored_collector_history ${additions.join(", ")}`);
    }

    const indexResult = await db.query("SHOW INDEX FROM armored_collector_history");
    const indexRows = rows(indexResult) || [];
    const uniqueColumns = indexRows
      .filter((row) => String(row.Key_name || "") === "uq_armored_character_rotation_route")
      .sort((left, right) => Number(left.Seq_in_index || 0) - Number(right.Seq_in_index || 0));
    if (uniqueColumns.length) {
      const valid = uniqueColumns.length === 3 && uniqueColumns.every((row) => Number(row.Non_unique) === 0) &&
        uniqueColumns.map((row) => String(row.Column_name || "")).join(",") === "character_uuid,rotation_bucket,route_id";
      if (!valid) throw new Error("SQL contract mismatch in armored_collector_history route uniqueness.");
      return;
    }
    await db.query(
      `ALTER TABLE armored_collector_history
       ADD UNIQUE KEY uq_armored_character_rotation_route (character_uuid, rotation_bucket, route_id)`
    );
  }).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function getCompletedRouteIds(characterUuid, rotationBucket) {
  const uuid = Number(characterUuid || 0);
  const bucket = Math.max(0, Math.floor(Number(rotationBucket || 0)));
  if (!uuid) throw new Error("Персонаж не загружен.");
  await ensureSchema();
  const result = await db.query(
    `SELECT route_id FROM armored_collector_history
     WHERE character_uuid = ? AND rotation_bucket = ?`,
    [uuid, bucket]
  );
  return [...new Set((rows(result) || []).map((row) => String(row.route_id || "")).filter(Boolean))];
}

function alreadySettledResult(saved, profileRow, characterRow) {
  return {
    alreadySettled: true,
    resultStatus: String(saved?.result_status || "completed"),
    cashAfter: Number(characterRow?.cash || 0),
    profile: normalizeProfile(profileRow),
    payout: {
      basePay: Number(saved?.base_pay || 0),
      levelBonus: Number(saved?.level_bonus || 0),
      veteranBonus: Number(saved?.veteran_bonus || 0),
      fastBonus: Number(saved?.fast_bonus || 0),
      finalPayout: Number(saved?.final_payout || 0),
      xpEarned: Number(saved?.xp_earned || 0),
    },
  };
}

function savedCancellationResult(saved, characterRow) {
  const cash = Math.max(0, Number(characterRow?.cash || 0));
  return {
    alreadyCancelled: true,
    resultStatus: String(saved?.result_status || "completed"),
    requestedFee: Math.max(0, Number(saved?.cancellation_fee || 0)),
    chargedFee: Math.max(0, Number(saved?.cancellation_fee || 0)),
    cashBefore: cash,
    cashAfter: cash,
  };
}

async function getProfile(characterUuid) {
  const uuid = Number(characterUuid || 0);
  if (!uuid) throw new Error("Персонаж не загружен.");
  await ensureSchema();
  await db.query(
    "INSERT IGNORE INTO armored_collector_profiles (character_uuid) VALUES (?)",
    [uuid]
  );
  const result = await db.query(
    "SELECT * FROM armored_collector_profiles WHERE character_uuid = ? LIMIT 1",
    [uuid]
  );
  return normalizeProfile(rows(result)?.[0]);
}

async function cancelRun(characterUuid, run, requestedFeeValue) {
  const uuid = Number(characterUuid || 0);
  if (!uuid || !run?.runId) throw new Error("Некорректный рейс инкассации.");
  await ensureSchema();

  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [uuid]
      );
      if (!characterRows?.[0]) throw new Error("Профиль персонажа не найден.");

      const runId = String(run.runId).slice(0, 48);
      const routeId = String(run.routeId || "").slice(0, 32);
      const bucket = Math.max(0, Math.floor(Number(run.rotationBucket || 0)));
      const savedQuery = `SELECT * FROM armored_collector_history
        WHERE run_id = ? OR (character_uuid = ? AND rotation_bucket = ? AND route_id = ?)
        LIMIT 1 FOR UPDATE`;
      const savedParams = [runId, uuid, bucket, routeId];
      const [savedRows] = await connection.query(savedQuery, savedParams);
      if (savedRows?.[0]) {
        await connection.commit();
        return savedCancellationResult(savedRows[0], characterRows[0]);
      }

      const requestedFee = Math.max(0, Math.round(Number(requestedFeeValue || 0)));
      const cashBefore = Math.max(0, Number(characterRows[0].cash || 0));
      const chargedFee = Math.min(cashBefore, requestedFee);
      const cashAfter = cashBefore - chargedFee;
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - Number(run.startedAt || Date.now())) / 1000));

      try {
        await connection.query(
          `INSERT INTO armored_collector_history
            (run_id, character_uuid, route_id, rotation_bucket, bags, distance_m,
             elapsed_seconds, target_seconds, base_pay, level_bonus, veteran_bonus,
             fast_bonus, final_payout, xp_earned, suspicious, result_status,
             cancellation_fee, started_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 'cancelled', ?, ?)`,
          [
            runId, uuid, routeId, bucket,
            Math.max(0, Math.floor(Number(run.bagsLoaded || 0))),
            Math.max(0, Math.round(Number(run.distanceM || 0))),
            elapsedSeconds,
            Math.max(1, Math.round(Number(run.targetSeconds || 1))),
            Math.max(0, Math.round(Number(run.basePay || 0))),
            chargedFee,
            new Date(Number(run.startedAt || Date.now())),
          ]
        );
      } catch (error) {
        if (String(error?.code || "") !== "ER_DUP_ENTRY") throw error;
        const [duplicateRows] = await connection.query(savedQuery, savedParams);
        if (!duplicateRows?.[0]) throw error;
        await connection.commit();
        return savedCancellationResult(duplicateRows[0], characterRows[0]);
      }

      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, uuid]);
      await connection.commit();
      return {
        alreadyCancelled: false,
        resultStatus: "cancelled",
        requestedFee,
        chargedFee,
        cashBefore,
        cashAfter,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function settleRun(characterUuid, run) {
  const uuid = Number(characterUuid || 0);
  if (!uuid || !run?.runId) throw new Error("Некорректный рейс инкассации.");
  await ensureSchema();

  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query(
        "INSERT IGNORE INTO armored_collector_profiles (character_uuid) VALUES (?)",
        [uuid]
      );
      const [profileRows] = await connection.query(
        "SELECT * FROM armored_collector_profiles WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
        [uuid]
      );
      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [uuid]
      );
      if (!profileRows?.[0] || !characterRows?.[0]) throw new Error("Профиль персонажа не найден.");

      const runId = String(run.runId).slice(0, 48);
      const routeId = String(run.routeId || "").slice(0, 32);
      const bucket = Math.max(0, Math.floor(Number(run.rotationBucket || 0)));
      const [savedRows] = await connection.query(
        `SELECT * FROM armored_collector_history
         WHERE run_id = ? OR (character_uuid = ? AND rotation_bucket = ? AND route_id = ?)
         LIMIT 1 FOR UPDATE`,
        [runId, uuid, bucket, routeId]
      );
      if (savedRows?.[0]) {
        await connection.commit();
        return alreadySettledResult(savedRows[0], profileRows[0], characterRows[0]);
      }

      const before = normalizeProfile(profileRows[0]);
      const payout = economy.calculatePayout({
        distanceM: run.distanceM,
        bags: run.bags,
        targetSeconds: run.targetSeconds,
        elapsedSeconds: run.elapsedSeconds,
        level: before.level,
        suspicious: Boolean(run.suspicious),
      });
      const payoutMultiplier = Math.max(1, Math.min(3, Number(run.payoutMultiplier || 1)));
      payout.finalPayout = Math.max(0, Math.round(payout.finalPayout * payoutMultiplier));
      payout.payoutMultiplier = payoutMultiplier;
      const nextXp = before.xp + payout.xpEarned;
      const nextLevel = economy.levelForXp(nextXp);
      const cashBefore = Math.max(0, Number(characterRows[0].cash || 0));
      const cashAfter = cashBefore + payout.finalPayout;

      let historyResult;
      try {
        [historyResult] = await connection.query(
          `INSERT INTO armored_collector_history
            (run_id, character_uuid, route_id, rotation_bucket, bags, distance_m,
             elapsed_seconds, target_seconds, base_pay, level_bonus, veteran_bonus,
             fast_bonus, final_payout, xp_earned, suspicious, started_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            runId, uuid, routeId, bucket, Math.max(1, Number(run.bags || 1)),
            Math.max(0, Math.round(Number(run.distanceM || 0))),
            Math.max(0, Math.round(Number(run.elapsedSeconds || 0))),
            Math.max(1, Math.round(Number(run.targetSeconds || 1))),
            payout.basePay, payout.levelBonus, payout.veteranBonus, payout.fastBonus,
            payout.finalPayout, payout.xpEarned, run.suspicious ? 1 : 0,
            new Date(Number(run.startedAt || Date.now())),
          ]
        );
      } catch (error) {
        if (String(error?.code || "") !== "ER_DUP_ENTRY") throw error;
        const [duplicateRows] = await connection.query(
          `SELECT * FROM armored_collector_history
           WHERE run_id = ? OR (character_uuid = ? AND rotation_bucket = ? AND route_id = ?)
           LIMIT 1 FOR UPDATE`,
          [runId, uuid, bucket, routeId]
        );
        if (!duplicateRows?.[0]) throw error;
        await connection.commit();
        return alreadySettledResult(duplicateRows[0], profileRows[0], characterRows[0]);
      }
      if (Number(historyResult?.affectedRows || 0) !== 1) throw new Error("Результат рейса уже сохранён.");

      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, uuid]);
      await connection.query(
        `UPDATE armored_collector_profiles SET
           xp = ?, level = ?, completed_routes = completed_routes + 1,
           fast_routes = fast_routes + ?, total_earned = total_earned + ?
         WHERE character_uuid = ?`,
        [nextXp, nextLevel, payout.fastBonus > 0 ? 1 : 0, payout.finalPayout, uuid]
      );
      const [nextRows] = await connection.query(
        "SELECT * FROM armored_collector_profiles WHERE character_uuid = ? LIMIT 1",
        [uuid]
      );
      await connection.commit();
      return {
        alreadySettled: false,
        cashBefore,
        cashAfter,
        oldLevel: before.level,
        profile: normalizeProfile(nextRows?.[0]),
        payout,
      };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

module.exports = { cancelRun, ensureSchema, getCompletedRouteIds, getProfile, normalizeProfile, settleRun };
