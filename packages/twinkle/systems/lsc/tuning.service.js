"use strict";

const db = require("../../database/query.js");

const DEFAULT_TUNING = Object.freeze({
  version: 1,
  mods: {
    engine: -1, transmission: -1, brakes: -1, suspension: -1, armor: -1,
    horn: -1, rims: -1, spoiler: -1, front_bumper: -1, rear_bumper: -1,
    sideskirt: -1, exhaust: -1, frame: -1, grille: -1, hood: -1, roof: -1, livery: -1,
  },
  turbo: false,
  tint: -1,
  lights: -1,
  plate: -1,
  neon: { enabled: false, color: [224, 0, 255] },
  paint: {
    primary: { enabled: false, color: [0, 0, 0], type: 0 },
    secondary: { enabled: false, color: [0, 0, 0], type: 0 },
  },
});

function cloneDefault() { return JSON.parse(JSON.stringify(DEFAULT_TUNING)); }
function parseJson(value, fallback = {}) {
  try { return typeof value === "string" ? JSON.parse(value) : (value || fallback); } catch { return fallback; }
}
function normalizeColor(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return value.slice(0, 3).map((part) => Math.max(0, Math.min(255, Math.round(Number(part) || 0))));
}
function safeInteger(value, fallback = -1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}
function normalize(raw) {
  const source = parseJson(raw, {});
  const data = cloneDefault();
  data.version = 1;
  data.mods = { ...data.mods, ...(source.mods || {}) };
  for (const key of Object.keys(data.mods)) data.mods[key] = Math.max(-1, Math.min(255, safeInteger(data.mods[key], -1)));
  data.turbo = Boolean(source.turbo);
  data.tint = Math.max(-1, Math.min(10, safeInteger(source.tint, -1)));
  data.lights = Math.max(-1, Math.min(20, safeInteger(source.lights, -1)));
  data.plate = Math.max(-1, Math.min(10, safeInteger(source.plate, -1)));
  data.neon = { enabled: Boolean(source.neon?.enabled), color: normalizeColor(source.neon?.color, data.neon.color) };
  data.paint = {
    primary: { enabled: Boolean(source.paint?.primary?.enabled), color: normalizeColor(source.paint?.primary?.color), type: Math.max(0, Math.min(5, Number(source.paint?.primary?.type) || 0)) },
    secondary: { enabled: Boolean(source.paint?.secondary?.enabled), color: normalizeColor(source.paint?.secondary?.color), type: Math.max(0, Math.min(5, Number(source.paint?.secondary?.type) || 0)) },
  };
  return data;
}
function get(vehicle) {
  try { return normalize(vehicle?.getVariable?.("tuning")); } catch { return cloneDefault(); }
}
function sync(vehicle, tuning) {
  const normalized = normalize(tuning);
  vehicle.setVariable("tuning", JSON.stringify(normalized));
  return normalized;
}
async function ensureSchema() {
  const rows = await db.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles' AND COLUMN_NAME = 'tuning_json'`);
  if (!rows.length) await db.query("ALTER TABLE vehicles ADD COLUMN tuning_json LONGTEXT NULL");
}

module.exports = { DEFAULT_TUNING, cloneDefault, normalize, get, sync, ensureSchema };