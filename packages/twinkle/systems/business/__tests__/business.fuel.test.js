"use strict";

const assert = require("node:assert/strict");
const {
  calculateFullRefuel,
  isDriverSeat,
  normalizeFuelCapacity,
} = require("../business.fuel.js");
const {
  APPEARANCE_BUSINESS_TYPES,
  BUSINESSES,
} = require("../business.config.js");

assert.deepEqual(calculateFullRefuel(10, 60), {
  currentFuel: 10,
  nextFuel: 60,
  billedLitres: 50,
});
assert.deepEqual(calculateFullRefuel(59.2, 60), {
  currentFuel: 59.2,
  nextFuel: 60,
  billedLitres: 1,
});
assert.deepEqual(calculateFullRefuel(60, 60), {
  currentFuel: 60,
  nextFuel: 60,
  billedLitres: 0,
});
assert.deepEqual(calculateFullRefuel(-5, 60), {
  currentFuel: 0,
  nextFuel: 60,
  billedLitres: 60,
});
assert.deepEqual(calculateFullRefuel(Number.NaN, "60"), {
  currentFuel: 0,
  nextFuel: 60,
  billedLitres: 60,
});
assert.equal(normalizeFuelCapacity(0), null);
assert.equal(normalizeFuelCapacity(-1), null);
assert.equal(normalizeFuelCapacity(Number.NaN), null);
assert.equal(normalizeFuelCapacity(Number.POSITIVE_INFINITY), null);
assert.equal(normalizeFuelCapacity(10001), null);
assert.equal(normalizeFuelCapacity("100"), 100);
assert.throws(() => calculateFullRefuel(10, 10001), RangeError);
assert.equal(isDriverSeat(0), true);
assert.equal(isDriverSeat(-1), true);
assert.equal(isDriverSeat("0"), false);
assert.equal(isDriverSeat(1), false);
assert.equal(isDriverSeat(null), false);
assert.equal(isDriverSeat(undefined), false);

const gasStations = BUSINESSES.filter((business) => business.type === "gas");
assert.deepEqual(gasStations.map((business) => business.id), ["gas_strawberry", "gas_route68"]);
assert.equal(gasStations.some((business) => APPEARANCE_BUSINESS_TYPES.includes(business.type)), false);
assert.equal(new Set(BUSINESSES.map((business) => business.id)).size, BUSINESSES.length);

console.log("[BUSINESS FUEL TEST] Full-tank, driver-seat, and gas configuration tests passed.");
