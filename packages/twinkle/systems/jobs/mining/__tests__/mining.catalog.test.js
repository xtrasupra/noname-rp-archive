"use strict";

const assert = require("node:assert/strict");
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

const config = require("../mining.config.js");

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

test("rock catalog is finite, unique and can fill the configured active wave", () => {
  assert.ok(config.rockPositions.length >= 59);
  assert.ok(config.initialWaveSize > 0 && config.initialWaveSize <= config.activeRockCap);
  assert.ok(config.refillWaveSize > 0 && config.refillWaveSize < config.activeRockCap);

  const coordinateKeys = new Set();
  for (const rock of config.rockPositions) {
    assert.ok([rock.x, rock.y, rock.z, rock.heading].every(Number.isFinite));
    assert.ok(rock.x >= config.zone.minX && rock.x <= config.zone.maxX);
    assert.ok(rock.y >= config.zone.minY && rock.y <= config.zone.maxY);
    assert.ok(rock.z >= config.zone.minZ && rock.z <= config.zone.maxZ);
    const key = `${rock.x.toFixed(4)}:${rock.y.toFixed(4)}:${rock.z.toFixed(4)}`;
    assert.ok(!coordinateKeys.has(key), `duplicate rock coordinate ${key}`);
    coordinateKeys.add(key);
  }

  const selected = [];
  for (const candidate of config.rockPositions) {
    if (selected.every((other) => distance(candidate, other) >= config.activeRockMinDistance)) selected.push(candidate);
  }
  assert.ok(selected.length >= config.activeRockCap, `only ${selected.length} non-overlapping rock slots`);
});

test("rarities, ten levels and rental gates match the mining design", () => {
  assert.equal(config.resources.reduce((sum, resource) => sum + resource.chance, 0), 100);
  assert.equal(new Set(config.resources.map((resource) => resource.id)).size, config.resources.length);
  assert.ok(config.resources.every((resource) => resource.hp > 0 && resource.kg[0] > 0 && resource.kg[1] >= resource.kg[0] && resource.pricePerKg > 0));
  assert.ok(config.resources.every((resource) => Number.isFinite(resource.zOffset) && resource.zOffset <= -0.9));
  assert.equal(config.resources.find((resource) => resource.id === "diamond").chance, 1);

  assert.equal(config.levels.length, 10);
  config.levels.forEach((level, index) => {
    assert.equal(level.level, index + 1);
    if (index > 0) {
      assert.ok(level.xp > config.levels[index - 1].xp);
      assert.ok(level.kgMultiplier > config.levels[index - 1].kgMultiplier);
    }
  });
  assert.equal(config.entitlements.golden_pickaxe.minLevel, 3);
  assert.equal(config.entitlements.golden_pickaxe.yieldMultiplier, 2);
  assert.equal(config.basicTool.itemId, "mining_basic_pickaxe");
  assert.equal(config.basicTool.damage, 8);
  assert.equal(config.stimulant.yieldMultiplier, 2);
  assert.equal(config.yieldMultiplierCap, 3);
  assert.ok(config.haulVehicles.every((vehicle) => vehicle.minLevel === 6 && ["cdl_a", "cdl_b"].includes(vehicle.license)));
});

test("timers, routes and payouts stay inside the intended economy envelope", () => {
  assert.equal(config.waveMs, 5 * 60 * 1000);
  assert.equal(config.entitlements.drill.durationMs, 60 * 60 * 1000);
  assert.equal(config.entitlements.golden_pickaxe.durationMs, 2 * 60 * 60 * 1000);
  assert.equal(config.entitlements.gps.durationMs, 60 * 60 * 1000);
  assert.equal(config.stimulant.durationMs, 10 * 60 * 1000);

  const expectedBaseRockValue = config.resources.reduce((sum, resource) => {
    const meanKg = (resource.kg[0] + resource.kg[1]) / 2;
    return sum + resource.chance / 100 * meanKg * resource.pricePerKg;
  }, 0);
  assert.ok(expectedBaseRockValue >= 250 && expectedBaseRockValue <= 350, expectedBaseRockValue);

  const eligibleDestinations = config.haulDestinations.filter((destination) => distance(destination, config.salePoint) >= config.haul.minDestinationDistanceM);
  assert.ok(eligibleDestinations.length >= 10);
  assert.equal(new Set(config.haulDestinations.map((point) => `${point.x.toFixed(2)}:${point.y.toFixed(2)}:${point.z.toFixed(2)}`)).size, config.haulDestinations.length);
  for (const vehicle of config.haulVehicles) {
    const lowestFormula = config.haul.basePay
      + config.haul.minDestinationDistanceM / 1000 * config.haul.payPerKm
      + vehicle.capacityKg[0] * config.haul.payPerKg;
    assert.ok(Math.max(config.haul.minimumPay, lowestFormula * vehicle.payoutMultiplier) >= 2500);
  }
  assert.equal(config.haul.roadDistanceMultiplier, 1.24);
  assert.ok(config.haul.maxPlausibleSpeedMps <= 55);
});

test("QTE exposes every requested key at a steady human tempo", () => {
  const expected = [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ..."0123456789",
    "SPACE", "SHIFT", "MOUSE1", "MOUSE2",
  ];
  assert.deepEqual(config.challenge.keys, expected);
  assert.equal(config.challenge.length, 18);
  assert.equal(config.challenge.firstDelayMs, config.challenge.minimumDelayMs);
  assert.equal(config.challenge.acceleration, 1);
  assert.ok(config.challenge.firstDelayMs >= 1000 && config.challenge.firstDelayMs <= 1400);
  assert.ok(config.challenge.ttlMs >= config.challenge.length * config.challenge.firstDelayMs);
  assert.ok(config.challenge.serverMinIntervalMs >= 20 && config.challenge.serverMinIntervalMs <= 40);
  assert.ok(config.competitionIdleSettleMs >= 3000 && config.competitionIdleSettleMs <= 8000);
});
