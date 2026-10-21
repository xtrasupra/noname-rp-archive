"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

global.mp = global.mp || {
  Vector3: class Vector3 {
    constructor(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  },
};

const db = require("../../../../database/query.js");
const repositoryPath = require.resolve("../trucker.repository.js");

const canonicalStatus = () => ({
  Field: "status",
  Type: "enum('available','accepted','delivered','expired','failed','cancelled')",
  Null: "NO",
  Default: "available",
});
const legacyStatus = () => ({
  Field: "status",
  Type: "enum('available','accepted','delivered','expired','failed')",
  Null: "NO",
  Default: "available",
});
const unsignedCounter = (Field) => ({ Field, Type: "int(10) unsigned", Null: "NO", Default: "0" });

const baseColumns = {
  trucker_profiles: ["character_uuid", "xp", "skill_points", "skill_progress"],
  trucker_skill_unlocks: ["character_uuid", "skill_id", "spent_points"],
  trucker_rentals: ["lease_id", "character_uuid", "active_character_uuid", "orders_remaining", "last_consumed_order_id", "status", "claimed_at"],
  trucker_orders: ["order_id", "refresh_bucket", "slot_index", "trailer_livery", "trailer_color1", "trailer_color2"],
  trucker_active_deliveries: ["character_uuid", "order_id", "lease_id", "stage", "cargo_validity", "deadline_at"],
  trucker_delivery_history: ["id", "character_uuid", "order_id", "lease_id", "result_status", "final_payout"],
};

async function runSchemaScenario({ status, penalty, debt }) {
  const originalQuery = db.query;
  const originalWithConn = db.withConn;
  const alters = [];
  const state = { status, penalty, debt };

  db.query = async (sql, params = []) => {
    assert.equal((String(sql).match(/\?/g) || []).length, params.length);
    const statement = String(sql);
    if (statement.includes("ALTER TABLE trucker_orders")) {
      alters.push("orders");
      state.status = canonicalStatus();
      return { affectedRows: 0 };
    }
    if (statement.includes("ALTER TABLE trucker_delivery_history")) {
      alters.push("penalty");
      state.penalty = unsignedCounter("cancellation_penalty");
      return { affectedRows: 0 };
    }
    if (statement.includes("ALTER TABLE trucker_profiles")) {
      alters.push("debt");
      state.debt = unsignedCounter("cancellation_debt");
      return { affectedRows: 0 };
    }
    if (statement.includes("INFORMATION_SCHEMA.COLUMNS")) {
      return [{ EXTRA: "STORED GENERATED", GENERATION_EXPRESSION: "case when status = 'active' then character_uuid else null end" }];
    }
    if (statement.includes("SHOW INDEX FROM `trucker_rentals`")) {
      return [{ Key_name: "uq_trucker_rentals_one_active", Non_unique: 0, Seq_in_index: 1, Column_name: "active_character_uuid", Sub_part: null }];
    }
    const tableMatch = statement.match(/SHOW COLUMNS FROM `([^`]+)`/);
    if (tableMatch) {
      const table = tableMatch[1];
      const columns = (baseColumns[table] || []).map((Field) => ({ Field, Type: "int", Null: "NO", Default: null }));
      if (table === "trucker_orders") columns.push(state.status);
      if (table === "trucker_delivery_history" && state.penalty) columns.push(state.penalty);
      if (table === "trucker_profiles" && state.debt) columns.push(state.debt);
      const likeMatch = statement.match(/LIKE '([^']+)'/);
      return likeMatch ? columns.filter((column) => column.Field === likeMatch[1]) : columns;
    }
    return { affectedRows: 0 };
  };
  db.withConn = async (callback) => callback({ query: async () => [[], []] });
  delete require.cache[repositoryPath];
  const repository = require(repositoryPath);

  try {
    await repository.ensureSchema();
    return { resolved: true, alters };
  } catch (error) {
    return { resolved: false, alters, error };
  } finally {
    db.query = originalQuery;
    db.withConn = originalWithConn;
    delete require.cache[repositoryPath];
  }
}

test("schema upgrade is additive for exact legacy and preflights unsafe combinations", async () => {
  const canonical = await runSchemaScenario({
    status: canonicalStatus(),
    penalty: unsignedCounter("cancellation_penalty"),
    debt: unsignedCounter("cancellation_debt"),
  });
  assert.equal(canonical.resolved, true);
  assert.deepEqual(canonical.alters, []);

  const legacy = await runSchemaScenario({ status: legacyStatus(), penalty: null, debt: null });
  assert.equal(legacy.resolved, true);
  assert.deepEqual(legacy.alters, ["orders", "penalty", "debt"]);

  const wrongPenalty = await runSchemaScenario({
    status: legacyStatus(),
    penalty: { Field: "cancellation_penalty", Type: "varchar(32)", Null: "YES", Default: null },
    debt: null,
  });
  assert.equal(wrongPenalty.resolved, false);
  assert.deepEqual(wrongPenalty.alters, []);

  const wrongDebt = await runSchemaScenario({
    status: legacyStatus(),
    penalty: null,
    debt: { Field: "cancellation_debt", Type: "int(11)", Null: "YES", Default: null },
  });
  assert.equal(wrongDebt.resolved, false);
  assert.deepEqual(wrongDebt.alters, []);
});
