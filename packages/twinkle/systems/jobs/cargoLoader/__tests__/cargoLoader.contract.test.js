"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../../../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

global.mp = global.mp || {};
global.mp.Vector3 = global.mp.Vector3 || class Vector3 {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
};

const core = require("../cargoLoader.core.js");
const config = require("../cargoLoader.config.js");

test("both loader sites preserve all supplied coordinates", () => {
  const port = config.sites.port;
  const construction = config.sites.construction;
  assert.equal(port.points.length, 13);
  assert.deepEqual(
    [port.npc.position.x, port.npc.position.y, port.npc.position.z, port.npc.heading],
    [1243.848, -3196.904, 6.028, -91.76]
  );
  assert.deepEqual(
    port.points.map((point) => [point.x, point.y, point.z, point.heading]),
    [
      [1234.47, -3201.708, 5.528, -1.32],
      [1219.714, -3201.685, 5.527, 8.21],
      [1218.421, -3234.722, 5.529, 179.41],
      [1233.191, -3233.461, 5.529, 176.56],
      [1243.957, -3235.585, 6.029, 102.47],
      [1244.463, -3240.958, 6.029, 95.01],
      [1244.757, -3244.576, 6.029, 85.72],
      [1242.807, -3270.542, 5.533, 89.22],
      [1243.316, -3281.168, 6.029, 91.82],
      [1245.273, -3283.526, 6.029, 78.27],
      [1244.856, -3310.496, 6.029, 98.41],
      [1242.808, -3315.479, 6.029, -9.1],
      [1245.624, -3170.067, 5.59, -167.37],
    ]
  );
  assert.deepEqual(
    [construction.npc.position.x, construction.npc.position.y, construction.npc.position.z, construction.npc.heading],
    [-97.182, -1013.671, 27.275, 159.04]
  );
  assert.deepEqual(
    [construction.pickup.x, construction.pickup.y, construction.pickup.z, construction.pickup.heading],
    [-82.87, -1006.421, 27.852, 70.67]
  );
  assert.deepEqual(
    [construction.dropoff.x, construction.dropoff.y, construction.dropoff.z, construction.dropoff.heading],
    [-123.016, -1095.558, 21.685, -112.59]
  );
});

test("every port point can be a source and only receives a distant destination", () => {
  const site = config.sites.port;
  for (const source of site.points) {
    for (const randomValue of [0, 0.5, 0.999999]) {
      const leg = core.selectPortLeg(site.points, source.id, {
        minimumDistanceM: site.route.minimumDistanceM,
        random: () => randomValue,
      });
      assert.equal(leg.source.id, source.id);
      assert.notEqual(leg.destination.id, source.id);
      assert.ok(leg.distanceM >= 20);
    }
  }
});

test("port economy stays in the entry-job band and pays by distance", () => {
  const site = config.sites.port;
  const legs = [];
  for (const source of site.points) {
    for (const destination of site.points) {
      const distanceM = core.distance(source, destination);
      if (source.id !== destination.id && distanceM >= site.route.minimumDistanceM) {
        legs.push({ distanceM, payout: core.calculatePortPayout(distanceM, site.economy) });
      }
    }
  }
  assert.ok(legs.length > 100);
  assert.ok(Math.min(...legs.map((leg) => leg.payout)) >= 20);
  assert.ok(Math.max(...legs.map((leg) => leg.payout)) <= 120);
  const seconds = legs.reduce((sum, leg) => sum + leg.distanceM / 2.2 + 1, 0);
  const incomePerHour = legs.reduce((sum, leg) => sum + leg.payout, 0) / seconds * 3600;
  assert.ok(incomePerHour >= 5500 && incomePerHour <= 7000, `port income ${incomePerHour}`);
  const maximumAcceptedSeconds = legs.reduce((sum, leg) => sum + leg.distanceM / config.antiCheat.minimumTravelSpeedMps + 1, 0);
  const maximumAcceptedIncome = legs.reduce((sum, leg) => sum + leg.payout, 0) / maximumAcceptedSeconds * 3600;
  assert.ok(maximumAcceptedIncome < 10_000, `maximum accepted port income ${maximumAcceptedIncome}`);
});

test("construction uses one fixed leg and a distinct 110 dollar payout", () => {
  const site = config.sites.construction;
  const distanceM = core.distance(site.pickup, site.dropoff);
  assert.ok(distanceM > 97 && distanceM < 99);
  assert.equal(site.economy.payout, 110);
  assert.notEqual(core.calculatePortPayout(distanceM, config.sites.port.economy), site.economy.payout);
  const maximumAcceptedCycleSeconds = distanceM / config.antiCheat.minimumTravelSpeedMps + distanceM / 6 + 1;
  assert.ok(site.economy.payout / maximumAcceptedCycleSeconds * 3600 < 10_000);
});

test("travel verification rejects teleports, waiting and partial routes", () => {
  const antiCheat = config.antiCheat;
  const valid = core.validateDeliveryTravel({
    directDistanceM: 100,
    elapsedMs: 40_000,
    validTravelM: 90,
    suspiciousTravelM: 0,
  }, antiCheat);
  assert.equal(valid.ok, true);
  assert.equal(core.validateDeliveryTravel({
    directDistanceM: 100,
    elapsedMs: 3_000,
    validTravelM: 100,
    suspiciousTravelM: 0,
  }, antiCheat).reason, "too_fast");
  assert.equal(core.validateDeliveryTravel({
    directDistanceM: 100,
    elapsedMs: 40_000,
    validTravelM: 20,
    suspiciousTravelM: 0,
  }, antiCheat).reason, "insufficient_route");
  assert.equal(core.validateDeliveryTravel({
    directDistanceM: 100,
    elapsedMs: 40_000,
    validTravelM: 100,
    suspiciousTravelM: 50,
  }, antiCheat).reason, "suspicious_travel");
  let credit = antiCheat.movementBurstM;
  for (let tick = 0; tick < 8; tick += 1) {
    const movement = core.consumeMovementCredit(credit, 3, 500, antiCheat);
    assert.equal(movement.ok, true);
    credit = movement.remainingM;
  }
  const oneBurst = core.consumeMovementCredit(credit, 7, 500, antiCheat);
  assert.equal(oneBurst.ok, true);
  assert.equal(core.consumeMovementCredit(oneBurst.remainingM, 7, 500, antiCheat).ok, false);

  const exhausted = core.consumeMovementCredit(antiCheat.movementBurstM, antiCheat.movementBurstM, 1, antiCheat);
  assert.equal(exhausted.ok, true);
  assert.equal(core.consumeMovementCredit(exhausted.remainingM, antiCheat.movementBurstM, 500, antiCheat).ok, false);
});

test("service owns phases, jump drop, anti-teleport invalidation and route chaining", () => {
  const service = read("packages/twinkle/systems/jobs/cargoLoader/cargoLoader.service.js");
  assert.match(service, /route\.phase = "dropped"/);
  assert.match(service, /droppedPosition = \{ \.\.\.position/);
  assert.match(service, /server:cargoLoader:jump/);
  assert.match(service, /invalidateCargo\(state, "Слишком резкое перемещение/);
  assert.match(service, /return-teleport/);
  assert.match(service, /return-vehicle/);
  assert.match(service, /registerEvent\("playerEnterVehicle"/);
  assert.match(service, /state\.terminationPending/);
  assert.match(service, /activeStarts/);
  assert.match(service, /global\.__twinkleCargoLoaderService = publicApi/);
  assert.doesNotMatch(service, /getAdminLevel/);
  assert.match(service, /consumeMovementCredit/);
  assert.match(service, /resetTracking\(state, positionOf\(player\), Date\.now\(\), firstPickup\)/);
  assert.match(service, /Forced termination cleanup failed/);
  assert.match(service, /state\.site\.id === "port" \? route\.destination\.id : null/);
  assert.match(service, /player\.vehicle/);
  assert.match(service, /Number\(player\.dimension \|\| 0\) !== 0/);
  assert.match(service, /maximumQueuedOperations/);
  assert.match(service, /validatePayload\(route, payload\)/);
});

test("settlement is durable, transactional and idempotent", () => {
  const repository = read("packages/twinkle/systems/jobs/cargoLoader/cargoLoader.repository.js");
  const service = read("packages/twinkle/systems/jobs/cargoLoader/cargoLoader.service.js");
  assert.match(repository, /PRIMARY KEY \(cargo_id\)/);
  assert.match(repository, /SHOW COLUMNS FROM cargo_loader_deliveries/);
  assert.match(repository, /SHOW INDEX FROM cargo_loader_deliveries/);
  assert.match(repository, /SELECT cash FROM characters[\s\S]*FOR UPDATE/);
  assert.match(repository, /SELECT payout FROM cargo_loader_deliveries[\s\S]*FOR UPDATE/);
  assert.match(repository, /beginTransaction\(\)/);
  assert.match(repository, /commit\(\)/);
  assert.match(repository, /rollback\(\)/);
  assert.match(repository, /ER_DUP_ENTRY/);
  assert.match(service, /cargo-loader:\$\{route\.cargoId\}/);
  assert.match(service, /job_port_loader/);
  assert.match(service, /job_construction_loader/);
});

test("client creates GPS, natural carry visuals and unconditional jump reporting", () => {
  const client = read("client_packages/events/jobs/cargoLoader.js");
  assert.match(client, /anim@heists@box_carry@/);
  assert.match(client, /attachTo\(/);
  assert.match(client, /for \(let frame = 0; frame < 180/);
  assert.match(client, /getGroundZFor3dCoord/);
  assert.match(client, /rawCandidate === "number"/);
  assert.match(client, /setRoute\(true\)/);
  assert.match(client, /setRouteColour/);
  assert.match(client, /isControlJustPressed\(0, 22\)/);
  assert.match(client, /server:cargoLoader:jump/);
  assert.doesNotMatch(client, /disableControlAction\(0, 22/);
  assert.ok(config.sites.construction.cargo.models.includes("prop_cs_wood_board"));
  assert.match(client, /addDataHandler/);
  assert.match(client, /cargoLoaderCarry/);
  assert.match(client, /mp\.keys\.unbind/);
});

test("uniforms keep complete compatible male and female torsos and restore equipment", () => {
  const service = read("packages/twinkle/systems/jobs/cargoLoader/cargoLoader.service.js");
  for (const outfit of [config.uniform.male, config.uniform.female]) {
    assert.deepEqual(outfit.components.map((item) => item[0]), [3, 4, 6, 8, 11]);
    assert.ok(outfit.components.every((item) => item[1] >= 0));
  }
  assert.match(service, /captureUniform\(player\)/);
  assert.match(service, /applyCharacterAppearance\(player, character\)/);
  assert.match(service, /inventory\.restoreEquipment\(player\)/);
});

test("employment, NPC dialogs and static worker blips are wired for both sites", () => {
  const employment = read("packages/twinkle/systems/jobs/jobEmployment.service.js");
  const npcConfig = read("packages/twinkle/systems/npcDialog/npcDialog.config.js");
  const npcServer = read("packages/twinkle/systems/npcDialog/npcDialog.server.js");
  assert.match(employment, /port_loader: Object\.freeze/);
  assert.match(employment, /construction_loader: Object\.freeze/);
  assert.match(npcConfig, /Object\.values\(cargoLoaderConfig\.sites\)/);
  assert.match(npcConfig, /cargoLoaderJoin:\$\{site\.id\}/);
  assert.match(npcServer, /getCargoLoader\(\)\.leave\(player\)/);
  assert.match(npcServer, /cargoLoader\.joinSite\(player, siteId\)/);
  assert.match(read("client_packages/loader.js"), /events\/jobs\/cargoLoader\.js/);
  for (const site of Object.values(config.sites)) {
    assert.ok(site.blip.sprite > 0);
    assert.ok(site.blip.name.includes("Работа грузчика"));
  }
});
