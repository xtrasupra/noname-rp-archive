"use strict";

const db = require("../../database/query.js");
const { rows, getUuid } = require("../../utils/player.js");

const JOBS = Object.freeze({
  taxi: Object.freeze({ id: "taxi", name: "Таксист" }),
  delivery: Object.freeze({ id: "delivery", name: "Доставщик" }),
  trucker: Object.freeze({ id: "trucker", name: "Дальнобойщик" }),
  mining: Object.freeze({ id: "mining", name: "Шахтёр" }),
  forestry: Object.freeze({ id: "forestry", name: "Лесоруб" }),
  armored_collector: Object.freeze({ id: "armored_collector", name: "Инкассатор" }),
  port_loader: Object.freeze({ id: "port_loader", name: "Портовый грузчик" }),
  construction_loader: Object.freeze({ id: "construction_loader", name: "Грузчик на стройке" }),
});

const runtimeCleanupHandlers = new Map();
const operationTails = new Map();
let schemaPromise = null;

function normalizeJobId(value) {
  const jobId = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(JOBS, jobId) ? jobId : null;
}

function getJobDefinition(value) {
  const jobId = normalizeJobId(value);
  return jobId ? JOBS[jobId] : null;
}

function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = db.query(`
    CREATE TABLE IF NOT EXISTS character_jobs (
      character_uuid BIGINT NOT NULL,
      job_id VARCHAR(32) NOT NULL,
      hired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (character_uuid),
      INDEX idx_character_jobs_job (job_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function serialize(characterUuid, operation) {
  const key = Number(characterUuid);
  const previous = operationTails.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);

  operationTails.set(key, current);
  return current.finally(() => {
    if (operationTails.get(key) === current) operationTails.delete(key);
  });
}

function applyPlayerEmployment(player, jobId) {
  const definition = getJobDefinition(jobId);
  const normalizedJobId = definition?.id || null;
  const jobName = definition?.name || null;

  player.__activeJob = normalizedJobId;
  player.isWorking = Boolean(normalizedJobId);

  for (const character of [player.character, player.characterData]) {
    if (!character) continue;
    character.current_job_id = normalizedJobId;
    character.job_id = normalizedJobId;
    character.jobName = jobName;
    character.job_name = jobName;
  }
}

async function refreshF2(player) {
  try {
    const f2Cache = require("../f2menu/f2menu.cache.js");
    await f2Cache.refresh(player, { push: true });
  } catch (error) {
    console.error("[JOB EMPLOYMENT] F2 refresh failed:", error?.message || error);
  }
}

async function getEmploymentByUuid(characterUuid) {
  const uuid = Number(characterUuid || 0);
  if (!uuid) return null;

  await ensureSchema();
  const result = await db.query(
    "SELECT job_id, hired_at, updated_at FROM character_jobs WHERE character_uuid = ? LIMIT 1",
    [uuid]
  );
  const row = rows(result)?.[0] || null;
  const definition = getJobDefinition(row?.job_id);

  if (!definition) return null;
  return {
    ...definition,
    hiredAt: row.hired_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function restorePlayer(player) {
  const uuid = getUuid(player);
  if (!uuid) {
    applyPlayerEmployment(player, null);
    return null;
  }

  const employment = await getEmploymentByUuid(uuid);
  applyPlayerEmployment(player, employment?.id || null);
  return employment;
}

function registerRuntimeCleanup(jobId, handler, options = {}) {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId) throw new Error(`Unknown job id: ${String(jobId)}`);
  if (typeof handler !== "function") throw new TypeError("Runtime cleanup handler must be a function.");
  if (runtimeCleanupHandlers.has(normalizedJobId) && !options.replace) {
    throw new Error(`Runtime cleanup already registered for job ${normalizedJobId}.`);
  }
  runtimeCleanupHandlers.set(normalizedJobId, handler);
}

async function cleanupRuntime(player, jobId, reason) {
  const handler = runtimeCleanupHandlers.get(normalizeJobId(jobId));
  if (!handler) return true;

  try {
    return await handler(player, { reason: String(reason || "employment-change") });
  } catch (error) {
    console.error(`[JOB EMPLOYMENT] ${jobId} runtime cleanup failed:`, error?.message || error);
    return false;
  }
}

async function assignJob(player, requestedJobId) {
  const uuid = getUuid(player);
  const job = getJobDefinition(requestedJobId);
  if (!uuid) throw new Error("Персонаж не загружен.");
  if (!job) throw new Error("Неизвестная работа.");

  await ensureSchema();
  return serialize(uuid, async () => {
    const result = await db.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [existingRows] = await connection.query(
          "SELECT job_id FROM character_jobs WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
          [uuid]
        );
        const previousJobId = normalizeJobId(existingRows?.[0]?.job_id);

        await connection.query(
          `INSERT INTO character_jobs (character_uuid, job_id, hired_at, updated_at)
           VALUES (?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             hired_at = IF(job_id <> VALUES(job_id), NOW(), hired_at),
             job_id = VALUES(job_id),
             updated_at = NOW()`,
          [uuid, job.id]
        );
        await connection.commit();
        return { previousJobId, changed: previousJobId !== job.id };
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    if (result.previousJobId && result.previousJobId !== job.id) {
      const cleaned = await cleanupRuntime(player, result.previousJobId, "job-switch");
      if (cleaned === false) {
        await db.query(
          `INSERT INTO character_jobs (character_uuid, job_id, hired_at, updated_at)
           VALUES (?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE job_id = VALUES(job_id), updated_at = NOW()`,
          [uuid, result.previousJobId]
        );
        applyPlayerEmployment(player, result.previousJobId);
        await refreshF2(player);
        throw new Error("Не удалось безопасно завершить активную рабочую смену. Смена работы отменена.");
      }
    }
    applyPlayerEmployment(player, job.id);
    await refreshF2(player);

    return {
      ...result,
      job,
      previousJob: getJobDefinition(result.previousJobId),
    };
  });
}

async function clearJob(player, expectedJobId = null, options = {}) {
  const uuid = getUuid(player);
  const expected = expectedJobId ? normalizeJobId(expectedJobId) : null;
  if (!uuid) throw new Error("Персонаж не загружен.");
  if (expectedJobId && !expected) throw new Error("Неизвестная работа.");

  await ensureSchema();
  return serialize(uuid, async () => {
    const result = await db.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const [existingRows] = await connection.query(
          "SELECT job_id FROM character_jobs WHERE character_uuid = ? LIMIT 1 FOR UPDATE",
          [uuid]
        );
        const currentJobId = normalizeJobId(existingRows?.[0]?.job_id);
        if (!currentJobId || (expected && currentJobId !== expected)) {
          await connection.commit();
          return { cleared: false, currentJobId };
        }

        await connection.query("DELETE FROM character_jobs WHERE character_uuid = ?", [uuid]);
        await connection.commit();
        return { cleared: true, currentJobId };
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    if (result.cleared) {
      const cleaned = await cleanupRuntime(
        player,
        result.currentJobId,
        options.reason || "job-leave"
      );
      if (cleaned === false) {
        await db.query(
          `INSERT INTO character_jobs (character_uuid, job_id, hired_at, updated_at)
           VALUES (?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE job_id = VALUES(job_id), updated_at = NOW()`,
          [uuid, result.currentJobId]
        );
        applyPlayerEmployment(player, result.currentJobId);
        await refreshF2(player);
        throw new Error("Не удалось безопасно завершить рабочую смену. Попробуйте ещё раз.");
      }
      applyPlayerEmployment(player, null);
      await refreshF2(player);
    }

    return result;
  });
}

module.exports = {
  JOBS,
  assignJob,
  clearJob,
  ensureSchema,
  getEmploymentByUuid,
  getJobDefinition,
  registerRuntimeCleanup,
  restorePlayer,
};
