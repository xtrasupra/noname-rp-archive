"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspace = path.resolve(__dirname, "../../../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspace, relativePath), "utf8");
}

test("jail service owns an unqualified main-database table and both commands", () => {
  const service = read("packages/twinkle/systems/admin/jail.service.js");
  const dump = read("db/twinkledb.sql");

  assert.match(service, /CREATE TABLE IF NOT EXISTS jail_sentences/);
  assert.doesNotMatch(service, /twinkle_admin\.jail_sentences/);
  assert.match(service, /mp\.registerCommand\("jail"/);
  assert.match(service, /mp\.registerCommand\("unjail"/);
  assert.match(dump, /CREATE TABLE `jail_sentences`/);
});

test("character load, death, position and client resync guards are wired", () => {
  const service = read("packages/twinkle/systems/admin/jail.service.js");

  assert.match(service, /mp\.events\.add\("twinkle:character:loaded"/);
  assert.match(service, /mp\.events\.add\("playerDeath"/);
  assert.match(service, /mp\.events\.add\("s:jail:requestSync"/);
  assert.match(service, /POSITION_CHECK_INTERVAL_MS/);
  assert.match(service, /isInsideCell/);
});

test("admin escape tools and inventory weapons respect jail state", () => {
  const adminCheck = read("packages/twinkle/systems/admin/admin.check.js");
  const inventory = read("packages/twinkle/systems/inventory/inventory.service.js");

  assert.match(adminCheck, /rejectJailedAdminAction/);
  assert.match(inventory, /reason: "jail_restricted"/);
  assert.match(inventory, /Оружие недоступно в деморгане/);
});

test("generated client loader includes the jail controller", () => {
  const loader = read("client_packages/loader.js");
  const client = read("client_packages/events/admin/jail.client.js");

  assert.match(loader, /\.\/events\/admin\/jail\.client\.js/);
  assert.match(client, /c:jail:set/);
  assert.match(client, /ДЕМОРГАН/);
});
