"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const inventoryRepository = require("../../../inventory/inventory.repository.js");
const inventoryService = require("../../../inventory/inventory.service.js");

class InventoryConnection {
  constructor(inventory) {
    this.inventory = inventory;
  }

  async query(sql, params = []) {
    if (sql.includes("INSERT INTO character_inventories")) return [{ affectedRows: 0 }, []];
    if (sql.includes("SELECT inventory FROM character_inventories")) {
      return [[{ inventory: JSON.stringify(this.inventory) }], []];
    }
    if (sql.includes("UPDATE character_inventories SET inventory")) {
      this.inventory = JSON.parse(params[0]);
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Unexpected SQL in inventory lifecycle test: ${sql}`);
  }
}

test("mining rental reconciliation keeps one current bound item and removes it on expiry", async () => {
  const inventory = inventoryRepository.createDefaultInventory();
  const documentKey = "mining:entitlement:drill";
  inventory.items.old = {
    uid: "old",
    id: "mining_drill_rental",
    itemId: "mining_drill_rental",
    bound: true,
    documentKey,
    remainingMs: 3600000,
    weight: 7.5,
  };
  inventory.items.current = {
    ...inventory.items.old,
    uid: "current",
    remainingMs: 2500000,
  };
  inventory.slots[0] = "old";
  inventory.slots[1] = "current";
  const connection = new InventoryConnection(inventory);

  const active = await inventoryService.reconcileBoundItemInstances(connection, 42, [{
    active: true,
    itemId: "mining_drill_rental",
    documentKey,
    expectedUid: "current",
    metadata: { entitlementType: "drill", remainingMs: 123456, leaseToken: "lease-b" },
  }]);

  assert.equal(active.entries[0].item.uid, "current");
  assert.equal(active.entries[0].item.remainingMs, 123456);
  assert.equal(active.entries[0].item.leaseToken, "lease-b");
  assert.equal(connection.inventory.items.old, undefined);
  assert.equal(connection.inventory.slots[0], null);
  assert.equal(connection.inventory.slots[1], "current");
  assert.deepEqual(
    Object.values(connection.inventory.items).filter((item) => item.documentKey === documentKey).map((item) => item.uid),
    ["current"]
  );

  await inventoryService.reconcileBoundItemInstances(connection, 42, [{
    active: false,
    itemId: "mining_drill_rental",
    documentKey,
    expectedUid: "current",
    metadata: { entitlementType: "drill", remainingMs: 0 },
  }]);

  assert.equal(connection.inventory.items.current, undefined);
  assert.equal(connection.inventory.slots[1], null);
});

test("the shift pickaxe is a real bound inventory item and is removed after work", async () => {
  const inventory = inventoryRepository.createDefaultInventory();
  const connection = new InventoryConnection(inventory);
  const documentKey = "mining:job:basic_pickaxe";

  const issued = await inventoryService.reconcileBoundItemInstances(connection, 42, [{
    active: true,
    itemId: "mining_basic_pickaxe",
    documentKey,
    metadata: { miningJobTool: "basic_pickaxe" },
  }]);
  const uid = issued.entries[0].item.uid;
  assert.ok(uid);
  assert.equal(connection.inventory.items[uid].itemId, "mining_basic_pickaxe");
  assert.equal(connection.inventory.items[uid].bound, true);
  assert.ok(connection.inventory.slots.includes(uid));

  await inventoryService.reconcileBoundItemInstances(connection, 42, [{
    active: false,
    itemId: "mining_basic_pickaxe",
    documentKey,
    expectedUid: uid,
  }]);
  assert.equal(connection.inventory.items[uid], undefined);
  assert.ok(!connection.inventory.slots.includes(uid));
});
