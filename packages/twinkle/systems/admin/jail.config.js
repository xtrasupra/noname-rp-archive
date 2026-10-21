"use strict";

const WALL_POINT_A = Object.freeze({
  x: 1654.76,
  y: 2573.956,
  z: 45.565,
  heading: -54.87,
  dimension: 0,
});

const WALL_POINT_B = Object.freeze({
  x: 1647.885,
  y: 2566.875,
  z: 45.565,
  heading: 136.79,
  dimension: 0,
});

const WALL_INSET = 0.45;
const CELL_CENTER_X = (WALL_POINT_A.x + WALL_POINT_B.x) / 2;
const CELL_CENTER_Y = (WALL_POINT_A.y + WALL_POINT_B.y) / 2;

const CELL_BOUNDS = Object.freeze({
  minX: Math.min(WALL_POINT_A.x, WALL_POINT_B.x) + WALL_INSET,
  maxX: Math.max(WALL_POINT_A.x, WALL_POINT_B.x) - WALL_INSET,
  minY: Math.min(WALL_POINT_A.y, WALL_POINT_B.y) + WALL_INSET,
  maxY: Math.max(WALL_POINT_A.y, WALL_POINT_B.y) - WALL_INSET,
  minZ: Math.min(WALL_POINT_A.z, WALL_POINT_B.z) - 1.25,
  maxZ: Math.max(WALL_POINT_A.z, WALL_POINT_B.z) + 2.75,
  centerX: CELL_CENTER_X,
  centerY: CELL_CENTER_Y,
  // The supplied wall points describe a rotated cell. This conservative
  // inner radius prevents an axis-aligned corner from ending up outside it.
  maxHorizontalDistance: 2.9,
});

const CELL_SPAWN = Object.freeze({
  x: CELL_CENTER_X,
  y: CELL_CENTER_Y,
  z: (WALL_POINT_A.z + WALL_POINT_B.z) / 2,
  heading: WALL_POINT_B.heading,
  dimension: WALL_POINT_A.dimension,
});

const RELEASE_POSITION = Object.freeze({
  x: 1849.444,
  y: 2601.747,
  z: 45.60717,
  heading: 96.0,
  dimension: 0,
});

// Full component sets are intentional: torso (3), undershirt (8), and top
// (11) are always applied together so neither freemode model becomes invisible.
const PRISON_OUTFITS = Object.freeze({
  male: Object.freeze({
    components: Object.freeze({
      3: Object.freeze({ drawable: 0, texture: 0, palette: 0 }),
      4: Object.freeze({ drawable: 7, texture: 15, palette: 0 }),
      6: Object.freeze({ drawable: 6, texture: 0, palette: 0 }),
      8: Object.freeze({ drawable: 15, texture: 0, palette: 0 }),
      11: Object.freeze({ drawable: 56, texture: 0, palette: 0 }),
    }),
    clearProps: Object.freeze([0, 1, 2, 6, 7]),
  }),
  female: Object.freeze({
    components: Object.freeze({
      3: Object.freeze({ drawable: 0, texture: 0, palette: 0 }),
      4: Object.freeze({ drawable: 3, texture: 15, palette: 0 }),
      6: Object.freeze({ drawable: 5, texture: 0, palette: 0 }),
      8: Object.freeze({ drawable: 14, texture: 0, palette: 0 }),
      11: Object.freeze({ drawable: 0, texture: 0, palette: 0 }),
    }),
    clearProps: Object.freeze([0, 1, 2, 6, 7]),
  }),
});

module.exports = Object.freeze({
  WALL_POINT_A,
  WALL_POINT_B,
  CELL_BOUNDS,
  CELL_SPAWN,
  RELEASE_POSITION,
  PRISON_OUTFITS,
  MAX_JAIL_MINUTES: 100000,
  POSITION_CHECK_INTERVAL_MS: 250,
  SENTENCE_TICK_INTERVAL_MS: 1000,
  PERSIST_INTERVAL_SECONDS: 10,
  OUTFIT_REFRESH_INTERVAL_MS: 3000,
});
