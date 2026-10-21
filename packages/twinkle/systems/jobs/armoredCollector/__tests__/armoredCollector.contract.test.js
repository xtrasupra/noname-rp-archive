"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

global.mp = global.mp || {
  Vector3: class Vector3 {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
  },
};

const root = path.resolve(__dirname, "../../../../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const config = require("../armoredCollector.config.js");
const economy = require("../armoredCollector.economy.js");
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

test("armored collector uses the supplied base coordinates and all legacy pickup points", () => {
  assert.deepEqual(
    [config.npc.position.x, config.npc.position.y, config.npc.position.z, config.npc.heading],
    [-519.759, -615.342, 26.33, -78.79]
  );
  assert.deepEqual(
    [config.vehicle.spawn.x, config.vehicle.spawn.y, config.vehicle.spawn.z, config.vehicle.spawn.heading],
    [-500.978, -611.932, 25.309, -91.82]
  );
  assert.deepEqual(
    [config.unload.position.x, config.unload.position.y, config.unload.position.z, config.unload.position.heading],
    [-470.832, -624.416, 25.309, 90.63]
  );
  assert.equal(config.pickups.length, 47);
  const coordinateHash = (items) => crypto.createHash("sha256").update(items
    .map((item) => [item.position.x, item.position.y, item.position.z].join(","))
    .join("|")).digest("hex");
  assert.equal(coordinateHash(config.pickups), "aa3da0d8e02c5dc808dbb549fc69603ec1bdfca54ce8baff71758bef405e1028");
  assert.equal(config.robberyPoints.length, 19);
  assert.equal(coordinateHash(config.robberyPoints), "f22d75f6eca0f62c473a4906dec1542c9c75b9feca3c9dafd9494771c690805c");
  config.pickups.forEach((pickup, index) => assert.match(pickup.name, new RegExp(`markers\\[${index}\\]`)));
  assert.equal(config.refreshMs, 5 * 60 * 1000);
  assert.equal(config.vehicleAbsenceTimeoutMs, 5 * 60 * 1000);
});

test("economy prices the complete base-pickup-unload cycle and discourages nearest-point farming", () => {
  const hourly = config.pickups.map((route) => {
    const fullCycleM = Math.round((
      distance(config.vehicle.spawn, route.position) + distance(route.position, config.unload.position)
    ) * config.economy.roadDistanceMultiplier);
    const metrics = economy.routeMetrics(fullCycleM);
    const payout = economy.calculatePayout({ ...metrics, elapsedSeconds: metrics.targetSeconds, level: 1 });
    return payout.finalPayout * 3600 / metrics.targetSeconds;
  });
  assert.ok(Math.min(...hourly) >= 11000);
  assert.ok(Math.max(...hourly) <= 15000);
  assert.ok(Math.max(...hourly) / Math.min(...hourly) < 1.3);
});

test("level ten permanently adds a veteran payment to every successful route", () => {
  for (const distanceM of [900, 5000, 18000]) {
    const metrics = economy.routeMetrics(distanceM);
    const levelNine = economy.calculatePayout({ ...metrics, elapsedSeconds: metrics.targetSeconds, level: 9 });
    const levelTen = economy.calculatePayout({ ...metrics, elapsedSeconds: metrics.targetSeconds, level: 10 });
    assert.equal(levelNine.veteranBonus, 0);
    assert.ok(levelTen.veteranBonus > 0);
    assert.equal(levelTen.veteranBonus, config.economy.level10FlatBonus);
  }
});

test("ten pay grades provide a clear and moderate salary progression", () => {
  assert.equal(config.levels.length, 10);
  assert.deepEqual(economy.levelPayScale().map((tier) => tier.percent), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);

  const metrics = economy.routeMetrics(6000);
  const payouts = Array.from({ length: 10 }, (_, index) => economy.calculatePayout({
    ...metrics,
    elapsedSeconds: metrics.targetSeconds,
    level: index + 1,
  }));
  payouts.forEach((payout, index) => assert.equal(payout.levelPercent, index * 2));
  for (let index = 1; index < payouts.length; index += 1) {
    assert.ok(payouts[index].finalPayout > payouts[index - 1].finalPayout);
  }
  assert.ok(payouts[9].levelBonus <= Math.round(payouts[9].basePay * 0.18));
  assert.equal(payouts[9].veteranBonus, 500);
});

test("the active route builds GPS blips for pickup, vehicle loading and unload", () => {
  const client = read("client_packages/events/jobs/armoredCollector.js");
  assert.match(client, /mp\.game\.ui\.setNewWaypoint\(point\.x, point\.y\)/);
  assert.doesNotMatch(client, /routeBlip\.setRoute\(/);
  assert.match(client, /planarDistance <= 15\) mp\.game\.ui\.deleteWaypoint\(\)/);
  assert.match(client, /Служебный фургон · погрузка/);
  assert.match(client, /isVehicleLoad \? 67 : \(isUnload \? 478 : 1\)/);
  assert.match(client, /refreshVehicleGps\(\)/);
  assert.match(client, /mp\.checkpoints\.new\(4/);
  assert.match(client, /if \(isVehicleLoad \|\| isUnload\) return/);
  assert.match(client, /isUnload \? 23 : 1/);
  assert.match(client, /isUnload \? 0\.16 : 1\.0/);
});

test("collector uniform keeps compatible freemode arms", () => {
  const service = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js");
  assert.match(service, /\? \[\[3, 44, 0\]/);
  assert.match(service, /: \[\[3, 41, 0\]/);
  assert.doesNotMatch(service, /\[3, (?:17|18), 0\]/);
});

test("money bag creation waits for a native handle and retries attachment", () => {
  const client = read("client_packages/events/jobs/armoredCollector.js");
  assert.match(client, /prop_money_bag_01/);
  assert.match(client, /mp\.objects\.new\(/);
  assert.match(client, /object\.isAttachedTo\(player\.handle\)/);
  assert.match(client, /await mp\.game\.waitAsync\(16\)/);
  assert.match(client, /!carryObject && !currentCreationInFlight/);
  assert.match(client, /void createCarryObject\(carryGeneration\)/);
  assert.match(client, /CARRY_OFFSET = Object\.freeze\(\[0\.12, 0\.0, -0\.05\]\)/);
  assert.match(client, /CARRY_ROTATION = Object\.freeze\(\[0\.0, 270\.0, 60\.0\]\)/);
});

test("collector shift cleanup explicitly restores the saved vest component", () => {
  const service = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js");
  assert.match(service, /savedVest = \(parsedClothes\.components \|\| parsedClothes\)/);
  assert.match(service, /player\.setClothes\(\s*9,/);
  assert.match(service, /await restoreUniform\(state\.player, state\)/);
});

test("teleport detection never deletes an active route and allows admin testing", () => {
  const service = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js");
  assert.match(service, /getAdminLevel\(state\.player\) > 0/);
  assert.match(service, /Маршрут сохранён; повторите действие/);
  assert.match(service, /integrityBlockedUntil/);
  assert.doesNotMatch(service, /function abortRoute/);
});

test("route cancellation is server-authoritative, charged once and persisted", () => {
  assert.equal(economy.cancellationFee({}), 250);
  assert.equal(economy.cancellationFee({ carrying: true }), 400);
  assert.equal(economy.cancellationFee({ bagsLoaded: 2 }), 600);
  assert.equal(economy.cancellationFee({ bagsLoaded: 8 }), 800);

  const service = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js");
  const repository = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.repository.js");
  const client = read("client_packages/events/jobs/armoredCollector.js");
  assert.match(service, /registerEvent\("server:armoredCollector:cancelRoute"/);
  assert.match(service, /repository\.cancelRun\(state\.characterUuid/);
  assert.match(service, /action: "route_cancellation_fee"/);
  assert.match(client, /tablet:armoredCollector:cancelRouteFromBrowser/);
  assert.match(repository, /async function cancelRun/);
  assert.match(repository, /SELECT cash FROM characters WHERE uuid = \? LIMIT 1 FOR UPDATE/);
  assert.match(repository, /result_status[^\n]+cancelled/);
  assert.match(repository, /cancellation_fee/);
});

test("remote contract and critical server-authoritative checks are present", () => {
  const service = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js");
  for (const event of [
    "server:armoredCollector:interact",
    "server:armoredCollector:tablet:request",
    "server:armoredCollector:selectRoute",
    "server:armoredCollector:cancelRoute",
    "server:armoredCollector:pickupBag",
    "server:armoredCollector:loadBag",
    "server:armoredCollector:unload",
  ]) assert.ok(service.includes(`registerEvent(\"${event}\"`), `missing ${event}`);

  assert.match(service, /documents\.getIdentityDocument\(player\)/);
  assert.match(service, /licenses\.hasLicense\(player, "cdl_b"\)/);
  assert.match(service, /licenses\.hasLicenseDocumentItem\(player, "cdl_b"\)/);
  assert.match(service, /payload\.revision/);
  assert.match(service, /state\.vehicle === vehicle/);
  assert.match(service, /maximumPlausibleTravelMps/);
  assert.match(service, /vehicleAbsenceTimeoutMs/);
  assert.match(service, /client:armoredCollector:tablet:update/);
  assert.match(service, /client:armoredCollector:vehicleLeaveTimer/);
});

test("settlement is locked, idempotent and the shared NPC owns the dispatcher ped", () => {
  const repository = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.repository.js");
  const npcConfig = read("packages/twinkle/systems/npcDialog/npcDialog.config.js");
  const npcServer = read("packages/twinkle/systems/npcDialog/npcDialog.server.js");
  const employment = read("packages/twinkle/systems/jobs/jobEmployment.service.js");
  assert.match(repository, /LIMIT 1 FOR UPDATE/);
  assert.match(repository, /SELECT \* FROM armored_collector_history[\s\S]*WHERE run_id = \?/);
  assert.match(repository, /UNIQUE KEY uq_armored_character_rotation_route \(character_uuid, rotation_bucket, route_id\)/);
  assert.match(repository, /ALTER TABLE armored_collector_history[\s\S]*ADD UNIQUE KEY uq_armored_character_rotation_route/);
  assert.match(repository, /String\(error\?\.code \|\| ""\) !== "ER_DUP_ENTRY"/);
  assert.match(repository, /function alreadySettledResult/);
  assert.match(repository, /async function getCompletedRouteIds/);
  assert.match(repository, /await connection\.beginTransaction\(\)/);
  assert.match(repository, /await connection\.rollback\(\)/);
  assert.match(npcConfig, /armoredCollectorConfig\.npc\.id/);
  assert.match(npcConfig, /action: "armoredCollectorJoin"/);
  assert.match(npcServer, /case "armoredCollectorJoin"/);
  assert.match(npcServer, /armoredCollector\.isShiftActive\(player\)/);
  assert.match(employment, /armored_collector: Object\.freeze/);
});

test("collector persistence stays in the canonical twinkledb dump", () => {
  const schema = read("database/schema.sql");
  const mainDatabaseEnd = schema.indexOf("-- Current Database: `twinkle_admin`");
  const mainDatabase = mainDatabaseEnd >= 0 ? schema.slice(0, mainDatabaseEnd) : schema;

  assert.match(mainDatabase, /CREATE TABLE `armored_collector_profiles`/);
  assert.match(mainDatabase, /CREATE TABLE `armored_collector_history`/);
  assert.match(mainDatabase, /`result_status` enum\('completed','cancelled'\)/);
  assert.match(mainDatabase, /`cancellation_fee` int unsigned/);
  assert.match(mainDatabase, /UNIQUE KEY `uq_armored_character_rotation_route` \(`character_uuid`,`rotation_bucket`,`route_id`\)/);
  assert.doesNotMatch(schema, /CREATE DATABASE[^\n]+armored/i);
});

test("completed rotation routes survive rejoin and shutdown awaits full worker cleanup", () => {
  const service = read("packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js");
  assert.match(service, /repository\.getCompletedRouteIds\(characterUuid, bucket\)/);
  assert.match(service, /usedRouteIds: new Set\(completedRouteIds\)/);
  assert.match(service, /if \(state\.stopPromise\) return state\.stopPromise/);
  assert.match(service, /runtime\.shutdownPromise = \(async \(\) =>/);
  assert.match(service, /await Promise\.allSettled\(states\.map/);
  assert.match(service, /await stopState\(state, \{ reason: "shutdown" \}\)/);
  assert.match(service, /await employment\.clearJob\(player, config\.jobId, \{ reason: "shutdown" \}\)/);
  assert.match(service, /await previousRuntimeShutdown/);
});
