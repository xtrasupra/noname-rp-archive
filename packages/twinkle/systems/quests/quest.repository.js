"use strict";

const db = require("../../database/query.js");

const REQUIRED_TABLES = Object.freeze([
  "character_quests",
  "character_quest_steps",
  "character_quest_rewards",
  "character_quest_events",
  "character_vehicle_garage_slots",
]);

const REQUIRED_VEHICLE_COLUMNS = Object.freeze([
  "garage_status",
  "garage_id",
  "garage_slot",
  "purchase_source",
]);

const REQUIRED_VEHICLE_COLUMN_TYPES = Object.freeze({
  garage_status: /^varchar\(32\)$/i,
  garage_id: /^varchar\(64\)$/i,
  garage_slot: /^int(?:\(\d+\))?$/i,
  purchase_source: /^varchar\(64\)$/i,
});

const REQUIRED_QUEST_COLUMN_TYPES = Object.freeze({
  character_quests: {
    character_uuid: /^int(?:\(\d+\))?$/i,
  },
  character_quest_steps: {
    character_uuid: /^int(?:\(\d+\))?$/i,
  },
  character_quest_rewards: {
    character_uuid: /^int(?:\(\d+\))?$/i,
  },
  character_quest_events: {
    character_uuid: /^int(?:\(\d+\))?$/i,
  },
  character_vehicle_garage_slots: {
    character_uuid: /^int(?:\(\d+\))?$/i,
    vehicle_id: /^int(?:\(\d+\))?$/i,
  },
});

function parseJson(value, fallback = {}) {
  try {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value || {});
}

async function withTransaction(work) {
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function validateSchema() {
  return db.withConn(async (connection) => {
    const missingTables = [];
    for (const tableName of REQUIRED_TABLES) {
      const [rows] = await connection.query("SHOW TABLES LIKE ?", [tableName]);
      if (!rows?.length) missingTables.push(tableName);
    }

    const invalidQuestColumns = [];
    for (const [tableName, expectedColumns] of Object.entries(REQUIRED_QUEST_COLUMN_TYPES)) {
      if (missingTables.includes(tableName)) continue;
      const [columns] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const columnTypes = new Map((columns || []).map((column) => [
        String(column.Field),
        String(column.Type || ""),
      ]));

      for (const [columnName, matcher] of Object.entries(expectedColumns)) {
        const columnType = columnTypes.get(columnName) || "";
        if (!matcher.test(columnType)) invalidQuestColumns.push(`${tableName}.${columnName}`);
      }
    }

    const [vehicleColumns] = await connection.query("SHOW COLUMNS FROM vehicles");
    const vehicleColumnMap = new Map((vehicleColumns || []).map((column) => [
      String(column.Field),
      String(column.Type || ""),
    ]));
    const vehicleColumnNames = new Set(vehicleColumnMap.keys());
    const missingVehicleColumns = REQUIRED_VEHICLE_COLUMNS.filter((column) => !vehicleColumnNames.has(column));
    const invalidVehicleColumns = REQUIRED_VEHICLE_COLUMNS.filter((column) => {
      if (!vehicleColumnNames.has(column)) return false;
      const matcher = REQUIRED_VEHICLE_COLUMN_TYPES[column];
      return matcher ? !matcher.test(vehicleColumnMap.get(column) || "") : false;
    });

    return {
      ok: missingTables.length === 0 &&
        missingVehicleColumns.length === 0 &&
        invalidVehicleColumns.length === 0 &&
        invalidQuestColumns.length === 0,
      invalidQuestColumns,
      invalidVehicleColumns,
      missingTables,
      missingVehicleColumns,
    };
  });
}

async function getQuestForUpdate(connection, characterUuid, questId, questVersion) {
  const [rows] = await connection.query(
    `SELECT *
       FROM character_quests
      WHERE character_uuid = ?
        AND quest_id = ?
        AND quest_version = ?
      LIMIT 1
      FOR UPDATE`,
    [characterUuid, questId, questVersion]
  );
  return rows?.[0] || null;
}

async function getActiveQuestForUpdate(connection, characterUuid) {
  const [rows] = await connection.query(
    `SELECT *
       FROM character_quests
      WHERE character_uuid = ?
        AND state = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      FOR UPDATE`,
    [characterUuid]
  );
  return rows?.[0] || null;
}

async function assertNoOtherActiveQuest(connection, characterUuid, questInstanceId = null) {
  const params = [characterUuid];
  let excludeClause = "";

  if (questInstanceId) {
    excludeClause = " AND id <> ?";
    params.push(Number(questInstanceId));
  }

  const [rows] = await connection.query(
    `SELECT id, quest_id
       FROM character_quests
      WHERE character_uuid = ?
        AND state = 'active'${excludeClause}
      LIMIT 1
      FOR UPDATE`,
    params
  );

  if (rows?.[0]) {
    const error = new Error("Another quest is already active for this character.");
    error.questReason = "active_quest";
    throw error;
  }
}

async function getStepForUpdate(connection, questInstanceId, stepId) {
  const [rows] = await connection.query(
    `SELECT *
       FROM character_quest_steps
      WHERE quest_instance_id = ?
        AND step_id = ?
      LIMIT 1
      FOR UPDATE`,
    [questInstanceId, stepId]
  );
  return rows?.[0] || null;
}

async function insertQuest(connection, characterUuid, questId, questVersion, currentStepId, progress) {
  await assertNoOtherActiveQuest(connection, characterUuid);

  const [result] = await connection.query(
    `INSERT INTO character_quests
      (character_uuid, quest_id, quest_version, state, current_step_id, revision, progress_json)
     VALUES (?, ?, ?, 'active', ?, 1, ?)`,
    [characterUuid, questId, questVersion, currentStepId, stringifyJson(progress)]
  );
  return Number(result?.insertId || 0);
}

async function reactivateQuest(connection, characterUuid, questInstanceId, currentStepId, progress) {
  await assertNoOtherActiveQuest(connection, characterUuid, questInstanceId);

  await connection.query(
    `UPDATE character_quests
        SET state = 'active',
            current_step_id = ?,
            completed_at = NULL,
            revision = revision + 1,
            progress_json = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [currentStepId, stringifyJson(progress), questInstanceId]
  );
}

async function upsertStep(connection, quest, stepId, state, currentAmount, targetAmount, progress) {
  await connection.query(
    `INSERT INTO character_quest_steps
      (quest_instance_id, character_uuid, quest_id, quest_version, step_id, state, current_amount, target_amount, progress_json, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'completed', CURRENT_TIMESTAMP, NULL))
     ON DUPLICATE KEY UPDATE
       state = VALUES(state),
       current_amount = VALUES(current_amount),
       target_amount = VALUES(target_amount),
       progress_json = VALUES(progress_json),
       completed_at = IF(VALUES(state) = 'completed', COALESCE(completed_at, CURRENT_TIMESTAMP), NULL),
       updated_at = CURRENT_TIMESTAMP`,
    [
      Number(quest.id),
      Number(quest.character_uuid),
      String(quest.quest_id),
      Number(quest.quest_version),
      stepId,
      state,
      currentAmount,
      targetAmount,
      stringifyJson(progress),
      state,
    ]
  );
}

async function updateQuestProgress(connection, questInstanceId, currentStepId, state, progress) {
  await connection.query(
    `UPDATE character_quests
        SET current_step_id = ?,
            state = ?,
            revision = revision + 1,
            progress_json = ?,
            completed_at = IF(? = 'completed', COALESCE(completed_at, CURRENT_TIMESTAMP), completed_at),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [currentStepId, state, stringifyJson(progress), state, questInstanceId]
  );
}

async function insertProgressEvent(connection, quest, event) {
  const [result] = await connection.query(
    `INSERT IGNORE INTO character_quest_events
      (character_uuid, quest_id, quest_version, event_type, subject_id, idempotency_key, amount, metadata_json, accepted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(quest.character_uuid),
      String(quest.quest_id),
      Number(quest.quest_version),
      String(event.type),
      event.subjectId ? String(event.subjectId).slice(0, 96) : null,
      String(event.idempotencyKey).slice(0, 160),
      Math.max(0, Math.floor(Number(event.amount || 1))),
      stringifyJson(event.metadata),
      event.accepted ? 1 : 0,
    ]
  );
  return Number(result?.affectedRows || 0) === 1;
}

async function insertRewardLedger(connection, characterUuid, questId, questVersion, reward) {
  const [result] = await connection.query(
    `INSERT IGNORE INTO character_quest_rewards
      (character_uuid, quest_id, quest_version, reward_key, reward_type, amount, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      characterUuid,
      questId,
      questVersion,
      String(reward.key).slice(0, 96),
      String(reward.type).slice(0, 32),
      Math.floor(Number(reward.amount || 0)),
      stringifyJson(reward.payload),
    ]
  );
  return Number(result?.affectedRows || 0) === 1;
}

async function getSnapshotRows(characterUuid) {
  const [quests] = await db.withConn((connection) => connection.query(
    `SELECT *
       FROM character_quests
      WHERE character_uuid = ?
      ORDER BY FIELD(state, 'active', 'completed', 'cancelled'), updated_at DESC, id DESC`,
    [characterUuid]
  ));

  const questIds = (quests || []).map((row) => Number(row.id)).filter(Boolean);
  if (!questIds.length) return { quests: [], steps: [] };

  const placeholders = questIds.map(() => "?").join(",");
  const [steps] = await db.withConn((connection) => connection.query(
    `SELECT *
       FROM character_quest_steps
      WHERE quest_instance_id IN (${placeholders})
      ORDER BY id ASC`,
    questIds
  ));

  return { quests: quests || [], steps: steps || [] };
}

async function cancelQuest(connection, questInstanceId) {
  await connection.query(
    `UPDATE character_quests
        SET state = 'cancelled',
            revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND state = 'active'`,
    [questInstanceId]
  );
}

module.exports = {
  assertNoOtherActiveQuest,
  cancelQuest,
  getActiveQuestForUpdate,
  getQuestForUpdate,
  getSnapshotRows,
  getStepForUpdate,
  insertProgressEvent,
  insertQuest,
  insertRewardLedger,
  parseJson,
  reactivateQuest,
  stringifyJson,
  updateQuestProgress,
  upsertStep,
  validateSchema,
  withTransaction,
};
