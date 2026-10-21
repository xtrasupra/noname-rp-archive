"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../../../../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const trees = require("../forestry.trees.json");

test("forestry coordinates and progression match the product contract", () => {
  assert.equal(trees.length, 298);
  assert.equal(new Set(trees.map((point) => `${point.x}:${point.y}:${point.z}`)).size, trees.length);
  const configSource = read("packages/twinkle/systems/jobs/forestry/forestry.config.js");
  assert.match(configSource, /-567\.946, 5253\.788, 70\.47/);
  assert.match(configSource, /-556\.339, 5371\.781, 70\.24/);
  assert.equal((configSource.match(/level: \d+/g) || []).length, 10);
  assert.match(configSource, /treesRequired: 1000/);
  assert.match(configSource, /treeClusterRadiusM: 0\.75/);
  assert.match(configSource, /clientTreeWindowSize: 24/);
  assert.match(configSource, /clientTreePacketBytes: 6000/);
  assert.match(configSource, /minLevel: 6, license: "cdl_b"/);
  assert.match(configSource, /minLevel: 6, license: "cdl_a"/);
});

test("server authority and cargo idempotency guards are present", () => {
  const service = read("packages/twinkle/systems/jobs/forestry/forestry.service.js");
  const repository = read("packages/twinkle/systems/jobs/forestry/forestry.repository.js");
  assert.match(service, /token: crypto\.randomBytes/);
  assert.match(service, /payload\.round/);
  assert.match(service, /inputId/);
  assert.match(service, /cursorPosition\(challenge/);
  assert.match(service, /cargoTravelM/);
  assert.match(service, /logs_route_integrity_failed/);
  assert.match(service, /treeCooldowns/);
  assert.match(repository, /getRecentTreeCooldowns/);
  assert.match(repository, /UNIQUE KEY uq_forestry_cargo_key/);
  assert.match(repository, /UNIQUE KEY uq_forestry_one_active_cargo/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /secret_saw_claimed/);
});

test("jump loss uses the explicit jump control and never generic in-air state", () => {
  const client = read("client_packages/events/jobs/forestry.js");
  assert.match(client, /isControlJustPressed\(0, 22\)/);
  assert.doesNotMatch(client, /isInAir|isFalling|isJumping/);
  assert.match(client, /prop_tool_consaw/);
  assert.match(client, /prop_tool_fireaxe/);
  assert.match(client, /prop_log_01/);
  assert.match(client, /forestryHeldProp/);
  assert.match(client, /MAX_TREE_BLIPS = 36/);
  assert.match(client, /slice\(0, MAX_TREE_BLIPS\)/);
  assert.match(client, /\[E\] Рубить дерево/);
  assert.match(client, /TREE_MARKER_DISTANCE = 85/);
  assert.doesNotMatch(client, /Зелёная зона лесопилки|mapRadius/);
  assert.match(client, /hud:forestry-safe-zone/);
  const service = read("packages/twinkle/systems/jobs/forestry/forestry.service.js");
  assert.match(service, /slice\(0, Math\.max\(1, Number\(config\.clientTreeWindowSize/);
  assert.match(service, /Buffer\.byteLength\(encoded, "utf8"\) > byteLimit/);
});

test("tree synchronization stays below the RAGE remote-event payload ceiling", () => {
  const worstCaseWindow = trees.slice(0, 24).map((position, slot) => ({
    id: `2147483647:${slot}:ffffffff`,
    slot,
    position: { x: position.x, y: position.y, z: position.z },
    heading: position.heading,
    resourceId: "cedar",
    resourceName: "Редкий дуб",
    color: [218, 174, 83],
    locked: false,
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(worstCaseWindow), "utf8") <= 6000);
});

test("NPC, loader, interfaces, inventory and canonical twinkledb are wired", () => {
  assert.match(read("packages/twinkle/systems/npcDialog/npcDialog.config.js"), /id: forestryConfig\.npc\.id/);
  assert.match(read("packages/twinkle/systems/npcDialog/npcDialog.server.js"), /forestryJoin/);
  assert.match(read("packages/twinkle/systems/npcDialog/npcDialog.config.js"), /label: "Открыть магазин"/);
  assert.match(read("packages/twinkle/systems/inventory/inventory.items.js"), /forestry_secret_saw_trophy/);
  assert.match(read("client_packages/loader.js"), /events\/jobs\/forestry\.js/);
  assert.match(read("frontend/src/shared/contracts/ui.ts"), /forestryChallenge/);
  const schema = read("database/schema.sql");
  assert.match(schema, /CREATE TABLE `forestry_profiles`/);
  assert.match(schema, /CREATE TABLE `forestry_entitlements`/);
  assert.match(schema, /CREATE TABLE `forestry_cargo`/);
  assert.match(schema, /CREATE TABLE `delivery_stop_settlements`/);
});

test("secret saw multiplier is integrated only through server payout paths", () => {
  const helper = read("packages/twinkle/systems/jobs/jobRewardMultiplier.service.js");
  assert.match(helper, /forestry_secret_saw_trophy/);
  assert.match(helper, /secret_saw_claimed[^\n]+\? 3 : 1/);
  for (const relative of [
    "packages/twinkle/systems/jobs/forestry/forestry.service.js",
    "packages/twinkle/systems/jobs/mining/mining.service.js",
    "packages/twinkle/systems/jobs/delivery/delivery.service.js",
    "packages/twinkle/systems/jobs/trucker/trucker.service.js",
    "packages/twinkle/systems/jobs/armoredCollector/armoredCollector.service.js",
    "packages/twinkle/systems/jobs/cargoLoader/cargoLoader.service.js",
  ]) assert.match(read(relative), /jobRewardMultiplier/);
  const delivery = read("packages/twinkle/systems/jobs/delivery/delivery.service.js");
  assert.match(delivery, /routeLoadInProgress/);
  assert.match(delivery, /legSuspiciousM/);
  assert.match(delivery, /delivery_stop_settlements/);
});
