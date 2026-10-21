"use strict";

const MAX_FUEL_CAPACITY = 10000;

function finiteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeFuelCapacity(value) {
  const capacity = finiteNumber(value);
  if (capacity === null || capacity < 1 || capacity > MAX_FUEL_CAPACITY) return null;
  return capacity;
}

function isDriverSeat(value) {
  return value === 0 || value === -1;
}

function calculateFullRefuel(currentFuelRaw, capacityRaw) {
  const capacity = normalizeFuelCapacity(capacityRaw);
  if (capacity === null) throw new RangeError("Fuel capacity must be finite and between 1 and 10000 litres.");
  const normalizedCurrentFuel = finiteNumber(currentFuelRaw);
  const currentFuel = Math.min(
    capacity,
    Math.max(0, normalizedCurrentFuel === null ? 0 : normalizedCurrentFuel)
  );
  const missingFuel = Math.max(0, capacity - currentFuel);

  return Object.freeze({
    currentFuel,
    nextFuel: capacity,
    billedLitres: missingFuel > 0 ? Math.ceil(missingFuel) : 0,
  });
}

module.exports = {
  calculateFullRefuel,
  isDriverSeat,
  normalizeFuelCapacity,
};
