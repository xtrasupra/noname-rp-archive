"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  formatCartPurchaseNotification,
  formatCustomerPurchaseNotification,
} = require("../business.notification.js");

test("formats an authoritative single-item purchase", () => {
  assert.equal(formatCustomerPurchaseNotification({
    productKind: "item",
    productName: "Бургер",
    quantity: 1,
    totalPrice: 250,
  }), "Куплено: Бургер за $250.");
});

test("includes the authoritative quantity for a multi-item purchase", () => {
  assert.equal(formatCustomerPurchaseNotification({
    productKind: "item",
    productName: "Вода",
    quantity: 3,
    totalPrice: 4500,
  }), "Куплено: Вода × 3 за $4 500.");
});

test("labels the actual full-tank fuel quantity in litres", () => {
  assert.equal(formatCustomerPurchaseNotification({
    productKind: "fuel",
    productName: "Бензин АИ-95",
    quantity: 42,
    totalPrice: 7560,
  }), "Куплено: Бензин АИ-95, 42 л за $7 560.");
});

test("bounds malformed display data without throwing", () => {
  assert.equal(formatCustomerPurchaseNotification({
    productKind: "item",
    productName: " ",
    quantity: Number.POSITIVE_INFINITY,
    totalPrice: -500,
  }), "Куплено: Покупка.");
});

test("formats a cart purchase with product names, quantities, and total", () => {
  assert.equal(formatCartPurchaseNotification([
    { name: "Удочка", quantity: 1 },
    { name: "Наживка", quantity: 4 },
  ], 12500), "Куплено: Удочка, Наживка × 4 за $12 500.");
});

test("bounds long cart notifications while retaining omitted item count", () => {
  assert.equal(formatCartPurchaseNotification([
    { name: "A", quantity: 1 },
    { name: "B", quantity: 2 },
    { name: "C", quantity: 3 },
    { name: "D", quantity: 4 },
    { name: "E", quantity: 5 },
  ], 0), "Куплено: A, B × 2, C × 3 и ещё 2.");
});

test("normalizes malformed cart display data without throwing", () => {
  assert.equal(formatCartPurchaseNotification(null, Number.NaN), "Куплено: покупка.");
  assert.equal(formatCartPurchaseNotification([
    { name: " ", quantity: -5 },
    { id: "water", quantity: Number.POSITIVE_INFINITY },
  ], -100), "Куплено: water.");
});
