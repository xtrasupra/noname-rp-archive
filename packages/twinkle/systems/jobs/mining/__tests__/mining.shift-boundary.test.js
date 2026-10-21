"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

global.mp = global.mp || {
  Vector3: class Vector3 {
    constructor(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  },
};

const root = path.resolve(__dirname, "../../../../../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = require("../mining.config.js");

test("mining shift boundary has a five-minute timeout and a reasonable edge buffer", () => {
  assert.equal(config.shiftOutsideTimeoutMs, 5 * 60 * 1000);
  assert.ok(config.shiftBoundaryPaddingM >= 50 && config.shiftBoundaryPaddingM <= 150);
});

test("boundary enforcement resets on return and preserves legitimate haul travel", () => {
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");
  const employment = read("packages/twinkle/systems/jobs/jobEmployment.service.js");

  assert.match(server, /function isAuthorizedHaulAwayFromMine/);
  assert.match(server, /state\.outsideZoneSince = 0/);
  assert.match(server, /terminateWorkerOutsideZone\(state\)/);
  assert.match(server, /employment\.clearJob\(state\.player, "mining", \{ reason: "zone-timeout" \}\)/);
  assert.match(server, /cancelCargoAndRental\(state, "mining-zone-timeout"\)/);
  assert.match(employment, /options\.reason \|\| "job-leave"/);
});

test("mining actions and GPS rock markers require an explicitly started session shift", () => {
  const server = read("packages/twinkle/systems/jobs/mining/mining.service.js");
  const npcConfig = read("packages/twinkle/systems/npcDialog/npcDialog.config.js");
  const npcServer = read("packages/twinkle/systems/npcDialog/npcDialog.server.js");

  assert.match(server, /function hasActiveMiningShift/);
  assert.match(server, /__miningShiftStartedForUuid/);
  assert.match(server, /async function openShop[\s\S]*getWorkingState\(player\)/);
  assert.match(server, /async function beginRock[\s\S]*getWorkingState\(player\)/);
  assert.match(server, /async function beginHaulStage[\s\S]*getWorkingState\(player\)/);
  assert.match(server, /function broadcastRocks[\s\S]*getWorkingState\(target\)/);
  assert.match(server, /function broadcastRockUpdate[\s\S]*hasActiveMiningShift\(state\.player, state\)/);
  assert.match(server, /player\.__miningShiftStartedForUuid = 0;[\s\S]*client:mining:cleanup/);
  assert.match(server, /employment\.clearJob\(player, "mining", \{ reason: "session-login-reset" \}\)/);
  assert.match(npcConfig, /action: "miningShopOpen", onlyIf: "miningActive"/);
  assert.match(npcServer, /action\.onlyIf === "miningActive"[\s\S]*mining\.isShiftActive\(player\)/);
});
