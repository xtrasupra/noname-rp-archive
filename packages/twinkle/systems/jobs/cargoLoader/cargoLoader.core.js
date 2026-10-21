"use strict";

function distance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return Math.hypot(
    Number(left.x || 0) - Number(right.x || 0),
    Number(left.y || 0) - Number(right.y || 0),
    Number(left.z || 0) - Number(right.z || 0)
  );
}

function clamp(value, minimum, maximum) {
  return Math.max(Number(minimum), Math.min(Number(maximum), Number(value)));
}

function calculatePortPayout(distanceM, economy) {
  const raw = Math.round(Math.max(0, Number(distanceM || 0)) * Number(economy?.payPerMeter || 0));
  return Math.round(clamp(raw, economy?.minimumPayout || 0, economy?.maximumPayout || raw));
}

function randomIndex(length, random = Math.random) {
  if (!Number.isSafeInteger(length) || length <= 0) return -1;
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999999, value)) : 0;
  return Math.floor(normalized * length);
}

function selectPortLeg(points, sourceId = null, options = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("Для портового маршрута нужны минимум две точки.");
  const random = typeof options.random === "function" ? options.random : Math.random;
  const minimumDistanceM = Math.max(0, Number(options.minimumDistanceM || 0));
  const source = points.find((point) => point.id === sourceId) || points[randomIndex(points.length, random)];
  const destinations = points.filter((point) => point.id !== source.id && distance(source, point) >= minimumDistanceM);
  if (!destinations.length) throw new Error("Для точки погрузки нет допустимой разгрузки.");
  const destination = destinations[randomIndex(destinations.length, random)];
  return { source, destination, distanceM: distance(source, destination) };
}

function minimumTravelMs(distanceM, antiCheat) {
  const speed = Math.max(0.1, Number(antiCheat?.minimumTravelSpeedMps || 8));
  return Math.max(Number(antiCheat?.minimumTravelFloorMs || 0), Math.ceil(Math.max(0, Number(distanceM || 0)) / speed * 1000));
}

function consumeMovementCredit(currentCreditM, traveledM, elapsedMs, antiCheat) {
  const burstM = Math.max(0, Number(antiCheat?.movementBurstM || 0));
  const refillM = Math.max(0, Number(antiCheat?.maximumFootSpeedMps || 0))
    * Math.max(0, Number(elapsedMs || 0)) / 1000;
  const availableM = Math.min(burstM, Math.max(0, Number(currentCreditM || 0)) + refillM);
  const traveled = Math.max(0, Number(traveledM || 0));
  return {
    ok: traveled <= availableM,
    availableM,
    remainingM: traveled <= availableM ? Math.max(0, availableM - traveled) : 0,
  };
}

function validateDeliveryTravel(metrics, antiCheat) {
  const directDistanceM = Math.max(0, Number(metrics?.directDistanceM || 0));
  const elapsedMs = Math.max(0, Number(metrics?.elapsedMs || 0));
  const validTravelM = Math.max(0, Number(metrics?.validTravelM || 0));
  const suspiciousTravelM = Math.max(0, Number(metrics?.suspiciousTravelM || 0));
  if (elapsedMs < minimumTravelMs(directDistanceM, antiCheat)) return { ok: false, reason: "too_fast" };
  if (validTravelM < directDistanceM * Number(antiCheat?.minimumVerifiedRouteRatio || 0.6)) {
    return { ok: false, reason: "insufficient_route" };
  }
  if (suspiciousTravelM > 0) return { ok: false, reason: "suspicious_travel" };
  return { ok: true, reason: null };
}

module.exports = {
  calculatePortPayout,
  clamp,
  consumeMovementCredit,
  distance,
  minimumTravelMs,
  randomIndex,
  selectPortLeg,
  validateDeliveryTravel,
};
