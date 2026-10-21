"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeRequestedPurchaseQuantity,
  resolvePurchasedQuantity,
} = require("../business.purchase.js");

test("rejects tampered multi-quantity appearance and clothing purchases", () => {
  assert.deepEqual(normalizeRequestedPurchaseQuantity("barber", "hair", 20), {
    quantity: 20,
    valid: false,
  });
  assert.deepEqual(normalizeRequestedPurchaseQuantity("tattoo", "tattoo", 20), {
    quantity: 20,
    valid: false,
  });
  assert.deepEqual(normalizeRequestedPurchaseQuantity("clothing", "item", 20), {
    quantity: 20,
    valid: false,
  });
});

test("allows bounded downstream validation for stackable retail products", () => {
  assert.deepEqual(normalizeRequestedPurchaseQuantity("grocery", "item", 20), {
    quantity: 20,
    valid: true,
  });
});

test("reports fulfilled fuel litres instead of the requested quantity", () => {
  assert.equal(resolvePurchasedQuantity("fuel", 10000, 42), 42);
});

test("always reports one fulfilled appearance service", () => {
  assert.equal(resolvePurchasedQuantity("hair", 20, undefined), 1);
  assert.equal(resolvePurchasedQuantity("tattoo", 20, undefined), 1);
});
