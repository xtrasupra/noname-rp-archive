"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../jail.core.js");
const config = require("../jail.config.js");

test("cell bounds accept only finite positions in the jail dimension", () => {
  assert.equal(
    core.isInsideCell(config.CELL_SPAWN, 0, config.CELL_BOUNDS, 0),
    true
  );
  assert.equal(
    core.isInsideCell(config.CELL_SPAWN, 1, config.CELL_BOUNDS, 0),
    false
  );
  assert.equal(
    core.isInsideCell(
      { ...config.CELL_SPAWN, x: config.CELL_BOUNDS.maxX + 0.001 },
      0,
      config.CELL_BOUNDS,
      0
    ),
    false
  );
  assert.equal(
    core.isInsideCell(
      { ...config.CELL_SPAWN, z: Number.NaN },
      0,
      config.CELL_BOUNDS,
      0
    ),
    false
  );
  assert.equal(
    core.isInsideCell(
      {
        ...config.CELL_SPAWN,
        x: config.CELL_BOUNDS.maxX,
        y: config.CELL_BOUNDS.maxY,
      },
      0,
      config.CELL_BOUNDS,
      0
    ),
    false,
    "axis-aligned corners outside the rotated cell must be rejected"
  );
});

test("online sentence timer consumes only complete elapsed seconds", () => {
  const sentence = { remainingSeconds: 120, lastTickMs: 10_000 };

  assert.deepEqual(core.consumeElapsedTime(sentence, 10_999), {
    elapsedSeconds: 0,
    remainingSeconds: 120,
    lastTickMs: 10_000,
  });

  assert.deepEqual(core.consumeElapsedTime(sentence, 13_250), {
    elapsedSeconds: 3,
    remainingSeconds: 117,
    lastTickMs: 13_000,
  });
});

test("sentence timer never underflows", () => {
  assert.deepEqual(
    core.consumeElapsedTime({ remainingSeconds: 2, lastTickMs: 1_000 }, 20_000),
    {
      elapsedSeconds: 2,
      remainingSeconds: 0,
      lastTickMs: 3_000,
    }
  );
});

test("command duration and reason validation reject unsafe input", () => {
  assert.equal(core.normalizeMinutes(1, 100), 1);
  assert.equal(core.normalizeMinutes(100, 100), 100);
  assert.equal(core.normalizeMinutes(0, 100), 0);
  assert.equal(core.normalizeMinutes(1.5, 100), 0);
  assert.equal(core.normalizeMinutes(101, 100), 0);
  assert.equal(core.sanitizeReason("  flood\n\tand   cheats  "), "flood and cheats");
});

test("HUD duration always uses HH:MM:SS", () => {
  assert.equal(core.formatDuration(0), "00:00:00");
  assert.equal(core.formatDuration(65), "00:01:05");
  assert.equal(core.formatDuration(3661), "01:01:01");
});

test("both prison outfits include a complete visible body set", () => {
  for (const gender of ["male", "female"]) {
    const outfit = config.PRISON_OUTFITS[gender];

    for (const component of [3, 4, 6, 8, 11]) {
      const item = outfit.components[component];
      assert.ok(item, `${gender} component ${component} is required`);
      assert.ok(Number.isInteger(item.drawable) && item.drawable >= 0);
      assert.ok(Number.isInteger(item.texture) && item.texture >= 0 && item.texture < 100);
      assert.ok(Number.isInteger(item.palette) && item.palette >= 0 && item.palette <= 3);
    }
  }
});
