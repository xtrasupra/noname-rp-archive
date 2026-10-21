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
const repository = require("../trucker.repository.js");

function assertBindings(sql, params = []) {
  assert.equal((String(sql).match(/\?/g) || []).length, params.length, String(sql).trim().slice(0, 120));
}

test("accept and complete transactions bind correctly and enforce the terminal stage", async () => {
  const originalQuery = db.query;
  const originalWithConn = db.withConn;
  let mode = "accept";
  let queryTrace = [];
  const orderRow = {
    order_id: "TR-CONTRACT-1",
    refresh_bucket: 1,
    status: "available",
    cargo: "Оборудование",
    company: "Contract Test",
    cargo_kind: "standard",
    vehicle_type: "pickup",
    required_license: "cdl_b",
    required_rank: 1,
    required_skill: null,
    trailer_model: null,
    trailer_livery: null,
    trailer_color1: null,
    trailer_color2: null,
    weight_kg: 500,
    origin_x: 1,
    origin_y: 2,
    origin_z: 3,
    origin_heading: -1,
    destination_x: 4,
    destination_y: 5,
    destination_z: 6,
    destination_heading: -1,
    route_distance_m: 1200,
    time_limit_seconds: 900,
    base_pay: 1000,
    expires_at: new Date(Date.now() + 60000),
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
    if (String(sql).includes("UPDATE trucker_rentals SET claimed_at")) return { affectedRows: 1 };
    return { affectedRows: 0 };
  };
  db.withConn = async (callback) => callback({
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    query: async (sql, params = []) => {
      assertBindings(sql, params);
      const statement = String(sql);
      queryTrace.push(statement);
      if (mode === "accept") {
        if (statement.includes("SELECT order_id FROM trucker_active_deliveries")) return [[], []];
        if (statement.includes("SELECT * FROM trucker_orders")) return [[orderRow], []];
        if (statement.includes("FROM trucker_rentals") && statement.includes("FOR UPDATE")) return [[{
          lease_id: "lease-contract",
          vehicle_config_id: "bison",
          vehicle_model: "bison",
          vehicle_type: "pickup",
          trailer_model: null,
          orders_remaining: 5,
        }], []];
        if (statement.includes("SELECT job_id FROM character_jobs")) return [[{ job_id: "trucker" }], []];
        if (statement.includes("SELECT xp FROM trucker_profiles")) return [[{ xp: 0 }], []];
        if (statement.includes("SELECT license_id FROM character_licenses")) return [[{ license_id: "cdl_b" }], []];
        if (statement.includes("SELECT id FROM character_documents")) return [[{ id: 1 }], []];
        if (statement.includes("SELECT inventory FROM character_inventories")) return [[{
          inventory: JSON.stringify({
            items: {
              passport: { itemId: "document_identity_card", amount: 1 },
              cdl: { itemId: "document_license_cdl_b", amount: 1 },
            },
          }),
        }], []];
        return [{ affectedRows: 1 }, []];
      }

      if (mode === "idempotent") {
        if (statement.includes("SELECT active.*, orders.cargo")) return [[], []];
        if (statement.includes("FROM trucker_delivery_history history")) return [[{
          actual_distance_m: 1250,
          accepted_at: new Date("2026-01-01T00:00:00Z"),
          delivered_at: new Date("2026-01-01T00:05:00Z"),
          early_seconds: 600,
          late_seconds: 0,
          cargo_validity: 98,
          fuel_used: 2,
          base_pay: 1000,
          early_bonus: 100,
          skill_bonus: 0,
          damage_penalty: 0,
          late_penalty: 0,
          final_payout: 1100,
          xp_earned: 50,
          skill_progress_earned: 12,
          skill_points_earned: 0,
          xp: 50,
          cash: 2100,
        }], []];
        return [{ affectedRows: 1 }, []];
      }

      if (mode === "refund") {
        if (statement.includes("SELECT cash FROM characters")) return [[{ cash: 900 }], []];
        if (statement.includes("SELECT rent_price, status, claimed_at")) return [[{
          rent_price: 100,
          status: "active",
          claimed_at: null,
          end_reason: null,
        }], []];
        return [{ affectedRows: 1 }, []];
      }

      if (mode === "cancel") {
        if (statement.includes("SELECT active.*, orders.cargo")) return [[{
          ...orderRow,
          character_uuid: 7,
          order_id: orderRow.order_id,
          lease_id: "lease-contract",
          vehicle_config_id: "bison",
          vehicle_model: "bison",
          vehicle_type: "pickup",
          stage: "to_dropoff",
          cargo_validity: 96,
          fuel_used: 3,
          actual_distance_m: 800,
          accepted_at: new Date(Date.now() - 120000),
          loaded_at: new Date(Date.now() - 60000),
          deadline_at: new Date(Date.now() + 600000),
        }], []];
        if (statement.includes("SELECT cash FROM characters")) return [[{ cash: 1000 }], []];
        if (statement.includes("SELECT lease_id, orders_remaining")) return [[{
          lease_id: "lease-contract",
          orders_remaining: 5,
        }], []];
        if (statement.includes("SELECT cancellation_debt FROM trucker_profiles")) return [[{
          cancellation_debt: 0,
        }], []];
        return [{ affectedRows: 1 }, []];
      }

      if (mode === "cancel_replay") {
        if (statement.includes("SELECT active.*, orders.cargo")) return [[], []];
        if (statement.includes("FROM trucker_delivery_history history")) return [[{
          cancellation_penalty: 1000,
          cash: 0,
          orders_remaining: 4,
          rental_status: "active",
          cancellation_debt: 0,
        }], []];
        return [{ affectedRows: 1 }, []];
      }

      if (mode === "cancel_low_cash") {
        if (statement.includes("SELECT active.*, orders.cargo")) return [[{
          ...orderRow,
          character_uuid: 7,
          order_id: orderRow.order_id,
          lease_id: "lease-contract",
          vehicle_config_id: "bison",
          vehicle_model: "bison",
          vehicle_type: "pickup",
          stage: "to_dropoff",
          cargo_validity: 96,
          fuel_used: 3,
          actual_distance_m: 800,
          accepted_at: new Date(Date.now() - 120000),
          loaded_at: new Date(Date.now() - 60000),
          deadline_at: new Date(Date.now() + 600000),
        }], []];
        if (statement.includes("SELECT cash FROM characters")) return [[{ cash: 200 }], []];
        if (statement.includes("SELECT lease_id, orders_remaining")) return [[{ lease_id: "lease-contract", orders_remaining: 5 }], []];
        if (statement.includes("SELECT cancellation_debt FROM trucker_profiles")) return [[{ cancellation_debt: 50 }], []];
        return [{ affectedRows: 1 }, []];
      }

      if (statement.includes("SELECT active.*, orders.cargo")) return [[{
        ...orderRow,
        character_uuid: 7,
        order_id: orderRow.order_id,
        lease_id: "lease-contract",
        vehicle_config_id: "bison",
        vehicle_model: "bison",
        vehicle_type: "pickup",
        stage: "unloading",
        cargo_validity: 100,
        fuel_used: 2,
        actual_distance_m: 1250,
        accepted_at: new Date(Date.now() - 300000),
        loaded_at: new Date(Date.now() - 240000),
        deadline_at: new Date(Date.now() + 600000),
        order_status: "accepted",
      }], []];
      if (statement.includes("SELECT * FROM trucker_profiles")) return [[{
        xp: 0,
        skill_points: 0,
        skill_progress: 0,
      }], []];
      if (statement.includes("SELECT cash FROM characters")) return [[{ cash: 1000 }], []];
      return [{ affectedRows: 1 }, []];
    },
  });

  try {
    const accepted = await repository.acceptOrder(7, orderRow.order_id, {
      leaseId: "lease-contract",
      runtimeId: 11,
      configId: "bison",
      model: "bison",
      type: "pickup",
      maxWeightKg: 900,
      trailerModel: null,
      fuelStart: 85,
    });
    assert.equal(accepted.order.orderId, orderRow.order_id);

    mode = "complete";
    const result = await repository.completeDelivery(7, {
      orderId: orderRow.order_id,
      deliveredAt: Date.now(),
      actualDistanceM: 1250,
      earlySeconds: 600,
      lateSeconds: 0,
      cargoValidity: 98,
      fuelUsed: 2,
      earlyBonus: 100,
      skillBonus: 0,
      damagePenalty: 0,
      latePenalty: 0,
      finalPayout: 1100,
      xpEarned: 50,
      skillProgressEarned: 12,
    });
    assert.equal(result.cashAfter, 2100);

    mode = "idempotent";
    const replay = await repository.completeDelivery(7, {
      orderId: orderRow.order_id,
      deliveredAt: Date.now(),
      actualDistanceM: 1,
      earlySeconds: 0,
      lateSeconds: 999,
      cargoValidity: 1,
      fuelUsed: 99,
      earlyBonus: 0,
      skillBonus: 0,
      damagePenalty: 999,
      latePenalty: 999,
      finalPayout: 1,
      xpEarned: 1,
      skillProgressEarned: 1,
    });
    assert.equal(replay.alreadyCompleted, true);
    assert.equal(replay.persistedMetrics.finalPayout, 1100);
    assert.equal(replay.persistedMetrics.durationSeconds, 300);

    mode = "purchase";
    const rental = await repository.purchaseRental(7, {
      leaseId: "lease-purchase",
      vehicleConfigId: "bison",
      vehicleModel: "bison",
      vehicleType: "pickup",
      trailerModel: null,
      rentPrice: 100,
      ordersRemaining: 5,
      expiresAt: Date.now() + 60000,
    });
    assert.equal(rental.cashBefore, 1000);
    assert.equal(rental.cashAfter, 900);
    await repository.claimRental(7, "lease-purchase");

    mode = "refund";
    queryTrace = [];
    const refund = await repository.cancelRentalAndRefund(7, "lease-purchase", "test_refund");
    assert.equal(refund.refunded, true);
    assert.equal(refund.cashAfter, 1000);
    const lockStatements = queryTrace.filter((statement) => statement.includes("FOR UPDATE"));
    assert.ok(lockStatements[0].includes("SELECT cash FROM characters"));
    assert.ok(lockStatements[1].includes("SELECT rent_price, status, claimed_at"));

    mode = "cancel";
    queryTrace = [];
    const cancelled = await repository.cancelActiveDelivery(
      7,
      orderRow.order_id,
      "lease-contract",
      "player_cancelled",
      { closeRental: false, metrics: { actualDistanceM: 800, fuelUsed: 3, cargoValidity: 96 } }
    );
    assert.equal(cancelled.alreadyCancelled, false);
    assert.equal(cancelled.penalty, 1000);
    assert.equal(cancelled.chargedPenalty, 1000);
    assert.equal(cancelled.cashAfter, 0);
    assert.ok(queryTrace.some((statement) => statement.includes("status = 'cancelled'")));

    mode = "cancel_replay";
    const replayedCancellation = await repository.cancelActiveDelivery(
      7,
      orderRow.order_id,
      "lease-contract",
      "player_cancelled",
      { closeRental: false }
    );
    assert.equal(replayedCancellation.alreadyCancelled, true);
    assert.equal(replayedCancellation.chargedPenalty, 0);
    assert.equal(replayedCancellation.cashAfter, 0);
    assert.equal(replayedCancellation.ordersRemaining, 4);
    assert.equal(replayedCancellation.rentalClosed, false);

    mode = "cancel_low_cash";
    const debtCancellation = await repository.cancelActiveDelivery(
      7,
      orderRow.order_id,
      "lease-contract",
      "player_disconnected",
      { closeRental: true }
    );
    assert.equal(debtCancellation.penalty, 1000);
    assert.equal(debtCancellation.chargedPenalty, 200);
    assert.equal(debtCancellation.debtAdded, 800);
    assert.equal(debtCancellation.cancellationDebt, 850);
  } finally {
    db.query = originalQuery;
    db.withConn = originalWithConn;
  }
});
