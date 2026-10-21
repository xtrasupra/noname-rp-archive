"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const snapshotPath = path.resolve(
  __dirname,
  "../../../../../client_packages/events/hud/hudSnapshot.js"
);

test("HUD snapshot bootstraps as a plain RAGE:MP client script", () => {
  const sandbox = { global: {} };

  vm.runInNewContext(fs.readFileSync(snapshotPath, "utf8"), sandbox, {
    filename: snapshotPath,
  });

  assert.equal(typeof sandbox.global.twinkleHudSnapshot?.remember, "function");
  assert.equal(typeof sandbox.global.twinkleHudSnapshot?.get, "function");
  assert.equal(typeof sandbox.global.twinkleHudSnapshot?.reset, "function");
});

test("client bootstrap loads the HUD snapshot before its consumers", () => {
  const clientRoot = path.resolve(__dirname, "../../../../../client_packages");
  const entrySource = fs.readFileSync(path.join(clientRoot, "index.js"), "utf8");
  const loaderSource = fs.readFileSync(path.join(clientRoot, "loader.js"), "utf8");
  const snapshotEntry = "./events/hud/hudSnapshot.js";
  const interfaceEntry = "./events/interfaceLock.js";

  assert.ok(entrySource.indexOf(snapshotEntry) < entrySource.indexOf(interfaceEntry));
  assert.ok(loaderSource.indexOf(snapshotEntry) < loaderSource.indexOf(interfaceEntry));
});

test("HUD restore snapshot always returns the latest complete task state", () => {
  delete require.cache[snapshotPath];
  const snapshot = require(snapshotPath);

  try {
    snapshot.remember({
      visible: true,
      tasks: {
        isVisible: true,
        items: [{ id: "daily-online-reward" }],
      },
    });
    snapshot.remember({
      visible: true,
      tasks: {
        isVisible: true,
        items: [
          { id: "daily-online-reward" },
          { id: "quest:current", description: "Получите стартовые документы" },
        ],
      },
    });

    assert.equal(
      Array.from(snapshot.get().tasks.items, (item) => item.id).join(","),
      "daily-online-reward,quest:current"
    );

    snapshot.remember(null);
    assert.equal(snapshot.get().tasks.items[1].description, "Получите стартовые документы");

    snapshot.reset();
    assert.deepEqual(snapshot.get(), {});
  } finally {
    delete require.cache[snapshotPath];
  }
});

test("a live quest HUD patch becomes the payload restored after an interface closes", () => {
  const hudClientPath = path.resolve(
    __dirname,
    "../../../../../client_packages/events/hud/hud.js"
  );
  delete require.cache[snapshotPath];
  const snapshot = require(snapshotPath);
  const handlers = new Map();
  const sandbox = {
    clearInterval() {},
    clearTimeout() {},
    console,
    global: {
      twinkleHudSnapshot: snapshot,
      uiBrowser: { execute() {} },
      uiState: {
        clear() {},
        patch(_page, payload) { return payload; },
      },
    },
    mp: {
      console: { logError() {} },
      events: {
        add(name, handler) { handlers.set(name, handler); },
        call() {},
        callRemote() {},
      },
      players: {
        atRemoteId() { return null; },
        local: null,
      },
      voiceChat: {},
    },
    setInterval() { return 1; },
    setTimeout() { return 1; },
  };

  try {
    vm.runInNewContext(fs.readFileSync(hudClientPath, "utf8"), sandbox, {
      filename: hudClientPath,
    });

    handlers.get("c:hud:update")(JSON.stringify({
      visible: true,
      tasks: {
        isVisible: true,
        items: [{ id: "daily-online-reward", type: "red", title: "Daily reward" }],
      },
    }));
    handlers.get("c:hud:tasks")(JSON.stringify({
      isVisible: true,
      merge: true,
      items: [{
        id: "quest:current",
        type: "yellow",
        title: "Дорожная карта новичка",
        description: "Получите стартовые документы",
      }],
    }));

    assert.equal(
      Array.from(snapshot.get().tasks.items, (item) => item.id).join(","),
      "daily-online-reward,quest:current"
    );
  } finally {
    snapshot.reset();
    delete require.cache[snapshotPath];
  }
});
