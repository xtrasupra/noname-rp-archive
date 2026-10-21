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

const config = require("../trucker.config.js");
const repository = require("../trucker.repository.js");

test("imports every supplied ground route without duplicate IDs", () => {
  const counts = config.orderTemplates.reduce((result, template) => {
    result[template.vehicleType] += 1;
    return result;
  }, { pickup: 0, van: 0, truck: 0 });

  assert.deepEqual(counts, { pickup: 468, van: 592, truck: 219 });
  assert.equal(config.orderTemplates.length, 1279);
  assert.equal(new Set(config.orderTemplates.map((template) => template.id)).size, 1279);
  assert.ok(config.orderTemplates.every((template) =>
    [template.origin, template.destination].every((point) =>
      [point.x, point.y, point.z, point.heading].every(Number.isFinite)
    )
  ));
});

test("rental fleet covers every exact trailer model in the catalog", () => {
  const routeModels = new Set(config.orderTemplates
    .filter((template) => template.vehicleType === "truck")
    .map((template) => template.trailerModel));
  const rentalModels = new Set(config.vehicles
    .filter((vehicle) => vehicle.type === "truck")
    .map((vehicle) => vehicle.trailerModel));

  assert.deepEqual([...routeModels].sort(), ["tanker", "tanker2", "tr4", "trailers", "trailers2", "trailers3", "trailers4"]);
  for (const model of routeModels) assert.ok(rentalModels.has(model), `missing rental trailer ${model}`);
});

test("five-minute rotation is deterministic, balanced and always compatible", () => {
  for (const bucket of [1, 98765, 3456789]) {
    const first = repository.buildRotation(bucket);
    const second = repository.buildRotation(bucket);
    assert.deepEqual(first, second);
    assert.equal(first.length, 20);
    assert.equal(new Set(first.map((order) => order.orderId)).size, 20);

    const counts = first.reduce((result, order) => {
      result[order.vehicleType] += 1;
      return result;
    }, { pickup: 0, van: 0, truck: 0 });
    assert.deepEqual(counts, { pickup: 7, van: 7, truck: 6 });

    for (const order of first) {
      const compatible = config.vehicles.filter((vehicle) =>
        vehicle.type === order.vehicleType &&
        vehicle.maxWeightKg >= order.weightKg &&
        vehicle.minRank <= order.requiredRank &&
        (order.vehicleType !== "truck" || vehicle.trailerModel === order.trailerModel)
      );
      assert.ok(compatible.length > 0, `${order.orderId} cannot be accepted by any rental`);
      assert.ok(order.routeDistanceM >= 500);
      assert.ok(order.basePay >= 500);
      assert.ok(order.timeLimitSeconds >= 480);
    }
  }
});

test("progression exposes exactly ten increasing ranks and a reachable skill tree", () => {
  assert.equal(config.ranks.length, 10);
  for (let index = 1; index < config.ranks.length; index += 1) {
    assert.equal(config.ranks[index].rank, index + 1);
    assert.ok(config.ranks[index].xp > config.ranks[index - 1].xp);
  }
  const skillIds = new Set(config.skills.map((skill) => skill.id));
  assert.equal(skillIds.size, config.skills.length);
  for (const skill of config.skills) {
    assert.ok(skill.cost > 0);
    assert.ok(skill.minRank >= 1 && skill.minRank <= 10);
    if (skill.prerequisite) assert.ok(skillIds.has(skill.prerequisite));
  }
  assert.ok(config.vehicles.filter((vehicle) => vehicle.type === "pickup").every((vehicle) => vehicle.minRank >= 1 && vehicle.minRank <= 3));
  assert.ok(config.vehicles.filter((vehicle) => vehicle.type === "van").every((vehicle) => vehicle.minRank >= 4 && vehicle.minRank <= 6));
  assert.ok(config.vehicles.filter((vehicle) => vehicle.type === "truck").every((vehicle) => vehicle.minRank >= 7 && vehicle.minRank <= 10));
  assert.ok(config.orderTemplates.some((template) => template.skill === "master_logistics"));
});

test("rotation SQL binds every placeholder after route metadata expansion", async () => {
  const db = require("../../../../database/query.js");
  const originalQuery = db.query;
  const originalWithConn = db.withConn;
  const assertBindings = (sql, params = []) => {
    const placeholders = (String(sql).match(/\?/g) || []).length;
    assert.equal(placeholders, params.length, `binding mismatch for ${String(sql).trim().slice(0, 80)}`);
  };

  db.query = async (sql, params = []) => {
    assertBindings(sql, params);
    if (String(sql).includes("INFORMATION_SCHEMA.COLUMNS")) {
      return [{ EXTRA: "STORED GENERATED", GENERATION_EXPRESSION: "case when status = 'active' then character_uuid else null end" }];
    }
    if (String(sql).includes("SHOW INDEX FROM `trucker_rentals`")) {
      return [{ Key_name: "uq_trucker_rentals_one_active", Non_unique: 0, Seq_in_index: 1, Column_name: "active_character_uuid", Sub_part: null }];
    }
    if (String(sql).includes("SHOW COLUMNS")) {
      return ["character_uuid", "xp", "skill_points", "skill_progress", "cancellation_debt", "skill_id", "spent_points",
        "lease_id", "active_character_uuid", "orders_remaining", "last_consumed_order_id", "status", "claimed_at",
        "order_id", "refresh_bucket", "slot_index", "trailer_livery", "trailer_color1", "trailer_color2",
        "stage", "cargo_validity", "deadline_at", "id", "result_status", "final_payout", "cancellation_penalty"].map((Field) => ({
          Field,
          Type: Field === "status"
            ? "enum('available','accepted','delivered','expired','failed','cancelled')"
            : ["cancellation_penalty", "cancellation_debt"].includes(Field) ? "int(10) unsigned" : "int",
          Null: "NO",
          Default: Field === "status" ? "available" : ["cancellation_penalty", "cancellation_debt"].includes(Field) ? "0" : null,
        }));
    }
    return { affectedRows: 0 };
  };
  db.withConn = async (callback) => callback({
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    query: async (sql, params = []) => {
      assertBindings(sql, params);
      if (String(sql).includes("SELECT COUNT(*) AS total")) return [[{ total: 0 }], []];
      return [{ affectedRows: 1 }, []];
    },
  });

  try {
    await repository.rotateOrders(true);
  } finally {
    db.query = originalQuery;
    db.withConn = originalWithConn;
  }
});
