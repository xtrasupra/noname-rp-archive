"use strict";

const db = require("../../database/query.js");

const DEFAULT_COLOR = Object.freeze({
  hex: "#6f6878",
  rgb: [111, 104, 120],
  rage: 0,
});

const DEFAULT_FACTION_COLORS = Object.freeze({
  8: { hex: "#e53935", rage: 1 },  // Bloods
  9: { hex: "#ae00ff", rage: 7 },  // Ballas
  10: { hex: "#f4c430", rage: 5 }, // Vagos
  11: { hex: "#2388ff", rage: 3 }, // Marabunta
  12: { hex: "#34c759", rage: 2 }, // Families
});

let schemaPromise = null;

function normalizeHex(value, fallback = DEFAULT_COLOR.hex) {
  const raw = String(value || "").trim();
  const shortMatch = raw.match(/^#?([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((part) => part + part)
      .join("")
      .toLowerCase()}`;
  }
  const fullMatch = raw.match(/^#?([0-9a-f]{6})$/i);
  return fullMatch ? `#${fullMatch[1].toLowerCase()}` : fallback;
}

function hexToRgb(value) {
  const hex = normalizeHex(value).slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function normalizeRageColor(value, fallback = DEFAULT_COLOR.rage) {
  const color = Number(value);
  return Number.isInteger(color) && color >= 0 && color <= 255 ? color : fallback;
}

function fromFactionRow(row, fractionId = 0) {
  const id = Number(row?.fraction_id || fractionId || 0);
  const fallback = DEFAULT_FACTION_COLORS[id] || DEFAULT_COLOR;
  const hex = normalizeHex(row?.color_hex, fallback.hex);
  return {
    hex,
    rgb: hexToRgb(hex),
    rage: normalizeRageColor(row?.rage_color, fallback.rage),
  };
}

async function ensureColorSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const columns = await db.query("SHOW COLUMNS FROM fractions");
    const names = new Set((columns || []).map((column) => column.Field));

    if (!names.has("color_hex")) {
      await db.query(
        "ALTER TABLE fractions ADD COLUMN color_hex VARCHAR(7) NULL AFTER short_name"
      );
    }
    if (!names.has("rage_color")) {
      await db.query(
        "ALTER TABLE fractions ADD COLUMN rage_color INT NULL AFTER color_hex"
      );
    }

    await db.query(
      "ALTER TABLE fractions MODIFY COLUMN color_hex VARCHAR(7) NULL"
    );
    await db.query(
      "ALTER TABLE fractions MODIFY COLUMN rage_color INT NULL DEFAULT NULL"
    );

    for (const [fractionId, color] of Object.entries(DEFAULT_FACTION_COLORS)) {
      await db.query(
        `UPDATE fractions
            SET color_hex = COALESCE(NULLIF(color_hex, ''), ?),
                rage_color = COALESCE(rage_color, ?)
          WHERE fraction_id = ?`,
        [normalizeHex(color.hex), normalizeRageColor(color.rage), Number(fractionId)]
      );
    }
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

module.exports = {
  DEFAULT_COLOR,
  DEFAULT_FACTION_COLORS,
  normalizeHex,
  hexToRgb,
  normalizeRageColor,
  fromFactionRow,
  ensureColorSchema,
};
