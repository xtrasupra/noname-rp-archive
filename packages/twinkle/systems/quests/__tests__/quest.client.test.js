"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadQuestClient(options = {}) {
  const modulePath = path.resolve(
    __dirname,
    "../../../../../client_packages/events/quests/quests.js"
  );
  const source = fs.readFileSync(modulePath, "utf8");
  const localCalls = [];
  const sandbox = {
    clearTimeout: options.clearTimeout || clearTimeout,
    console,
    global: {},
    mp: {
      console: { logError() {}, logInfo() {} },
      events: {
        add() {},
        call(...args) { localCalls.push(args); },
        callRemote() {},
      },
      Vector3: function Vector3(x, y, z) { return { x, y, z }; },
      blips: { new() { return options.blip || null; } },
      markers: { new() { return options.marker || { destroy() {} }; } },
    },
    setTimeout: options.setTimeout || setTimeout,
  };

  vm.runInNewContext(
    `${source}\n;globalThis.__questClientContract = { activateTargetRoute, createTarget, destroyTarget, pushHud };`,
    sandbox,
    { filename: modulePath }
  );

  return { contract: sandbox.__questClientContract, localCalls };
}

test("client quest bridge adds the active newcomer quest to HUD tasks", () => {
  const { contract, localCalls } = loadQuestClient();
  contract.pushHud({
    active: {
      title: "Дорожная карта новичка",
      objective: "Получите стартовые документы",
      progress: { current: 0, target: 1 },
    },
  });

  assert.equal(localCalls.length, 1);
  assert.equal(localCalls[0][0], "c:hud:tasks");
  const payload = JSON.parse(localCalls[0][1]);
  assert.equal(payload.isVisible, true);
  assert.equal(payload.merge, true);
  assert.equal(payload.items[0].id, "quest:current");
  assert.equal(payload.items[0].description, "Получите стартовые документы");
});

test("client quest bridge removes only the quest card when no quest is active", () => {
  const { contract, localCalls } = loadQuestClient();
  contract.pushHud(null);

  const payload = JSON.parse(localCalls[0][1]);
  assert.equal(Object.hasOwn(payload, "isVisible"), false);
  assert.equal(payload.merge, true);
  assert.equal(payload.items[0].id, "quest:current");
  assert.equal(payload.items[0].hidden, true);
});

test("quest GPS waits for a valid blip handle before enabling its route", () => {
  const timers = [];
  const routeCalls = [];
  const blip = {
    handle: 0,
    destroy() {},
    setRoute(value) { routeCalls.push(value); },
  };
  const { contract } = loadQuestClient({
    blip,
    setTimeout(callback) { timers.push(callback); return callback; },
    clearTimeout() {},
  });

  contract.createTarget({
    target: {
      kind: "location",
      label: "Quest target",
      position: { x: 1, y: 2, z: 3 },
      dimension: 0,
    },
  });
  assert.deepEqual(routeCalls, []);
  assert.equal(timers.length, 1);

  blip.handle = 12;
  timers.shift()();
  assert.deepEqual(routeCalls, [true]);
  contract.destroyTarget();
  assert.deepEqual(routeCalls, [true, false]);
});

test("quest GPS cancels delayed route activation when the target is destroyed", () => {
  let pendingRoute = null;
  const routeCalls = [];
  const blip = {
    handle: 0,
    destroy() {},
    setRoute(value) { routeCalls.push(value); },
  };
  const { contract } = loadQuestClient({
    blip,
    setTimeout(callback) { pendingRoute = callback; return callback; },
    clearTimeout() {},
  });

  contract.createTarget({
    target: {
      kind: "location",
      label: "Quest target",
      position: { x: 1, y: 2, z: 3 },
      dimension: 0,
    },
  });
  contract.destroyTarget();
  blip.handle = 12;
  pendingRoute();

  assert.deepEqual(routeCalls, []);
});
