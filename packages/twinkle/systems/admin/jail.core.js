"use strict";

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeMinutes(value, maxMinutes) {
  const minutes = Number(value);
  const maximum = Math.max(1, Math.trunc(Number(maxMinutes || 1)));

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > maximum) {
    return 0;
  }

  return minutes;
}

function isInsideCell(position, dimension, bounds, requiredDimension = 0) {
  if (!position || !bounds) return false;
  if (Number(dimension) !== Number(requiredDimension)) return false;

  const { x, y, z } = position;
  if (![x, y, z].every(finite)) return false;

  const insideAxisBounds = (
    Number(x) >= Number(bounds.minX) &&
    Number(x) <= Number(bounds.maxX) &&
    Number(y) >= Number(bounds.minY) &&
    Number(y) <= Number(bounds.maxY) &&
    Number(z) >= Number(bounds.minZ) &&
    Number(z) <= Number(bounds.maxZ)
  );

  if (!insideAxisBounds) return false;

  if (
    finite(bounds.centerX) &&
    finite(bounds.centerY) &&
    finite(bounds.maxHorizontalDistance) &&
    Number(bounds.maxHorizontalDistance) > 0
  ) {
    const dx = Number(x) - Number(bounds.centerX);
    const dy = Number(y) - Number(bounds.centerY);
    return Math.sqrt(dx * dx + dy * dy) <= Number(bounds.maxHorizontalDistance);
  }

  return true;
}

function consumeElapsedTime(sentence, nowMs = Date.now()) {
  const state = sentence || {};
  const now = Math.max(0, Math.trunc(Number(nowMs) || 0));
  const lastTickMs = Math.max(0, Math.trunc(Number(state.lastTickMs) || now));
  const elapsedSeconds = Math.max(0, Math.floor((now - lastTickMs) / 1000));
  const remainingSeconds = Math.max(0, Math.trunc(Number(state.remainingSeconds) || 0));
  const consumedSeconds = Math.min(remainingSeconds, elapsedSeconds);

  return {
    elapsedSeconds: consumedSeconds,
    remainingSeconds: remainingSeconds - consumedSeconds,
    lastTickMs: lastTickMs + consumedSeconds * 1000,
  };
}

function formatDuration(totalSeconds) {
  const total = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function sanitizeReason(value, maxLength = 255) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxLength) || 255));
}

module.exports = {
  normalizeMinutes,
  isInsideCell,
  consumeElapsedTime,
  formatDuration,
  sanitizeReason,
};
