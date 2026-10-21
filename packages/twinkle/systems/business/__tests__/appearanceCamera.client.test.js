"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCameraContract() {
  const modulePath = path.resolve(
    __dirname,
    "../../../../../client_packages/events/business/business.js"
  );
  const source = fs.readFileSync(modulePath, "utf8");
  const remoteCalls = [];
  const eventHandlers = new Map();
  const uiEmits = [];
  const scheduledTimers = [];
  const freezeCalls = [];
  const componentCalls = [];
  const propClearCalls = [];
  const propSetCalls = [];
  const decorationCalls = [];
  const componentState = new Map(Array.from({ length: 12 }, (_, component) => [
    component,
    { drawable: component + 20, palette: component % 4, texture: component + 2 },
  ]));
  const propState = new Map([0, 1, 2, 6, 7].map((prop) => [
    prop,
    { drawable: prop + 5, texture: prop + 1 },
  ]));
  const player = {
    clearProp(prop) {
      propClearCalls.push(prop);
      propState.set(prop, { drawable: -1, texture: 0 });
    },
    dimension: 70001,
    freezePosition(value) { freezeCalls.push(value); },
    getDrawableVariation(component) { return componentState.get(component)?.drawable ?? 0; },
    getPaletteVariation(component) { return componentState.get(component)?.palette ?? 0; },
    getPropIndex(prop) { return propState.get(prop)?.drawable ?? -1; },
    getPropTextureIndex(prop) { return propState.get(prop)?.texture ?? 0; },
    getTextureVariation(component) { return componentState.get(component)?.texture ?? 0; },
    handle: 42,
    isPositionFrozen: false,
    position: { x: 402.8664, y: -996.4108, z: -99.00027 },
    setComponentVariation(component, drawable, texture, palette) {
      componentCalls.push([component, drawable, texture, palette]);
      componentState.set(component, { drawable, texture, palette });
    },
    setHairColor() {},
    setHeading() {},
    setPropIndex(prop, drawable, texture, attach) {
      propSetCalls.push([prop, drawable, texture, attach]);
      propState.set(prop, { drawable, texture });
    },
  };
  const sandbox = {
    clearTimeout,
    console: { log() {} },
    global: {
      bindKey() {},
      ui: { emit(...args) { uiEmits.push(args); } },
    },
    mp: {
      console: { logError() {} },
      events: {
        add(name, handler) { eventHandlers.set(name, handler); },
        addDataHandler() {},
        call() {},
        callRemote(...args) { remoteCalls.push(args); },
      },
      game: {
        cam: { renderScriptCams() {} },
        entity: { hasCollisionLoadedAround() { return true; } },
        joaat(value) { return String(value).split("").reduce((hash, char) => hash + char.charCodeAt(0), 0); },
        ped: {
          addDecorationFromHashes(...args) { decorationCalls.push(["add", ...args]); },
          clearDecorations(...args) { decorationCalls.push(["clear", ...args]); },
        },
        streaming: { requestCollisionAtCoord() {} },
      },
      keys: { bind() {} },
      players: { local: player },
    },
    setTimeout(callback, delay, ...args) {
      const timer = setTimeout(callback, delay, ...args);
      scheduledTimers.push({ callback, delay, timer });
      return timer;
    },
  };

  vm.runInNewContext(
    `${source}\n;globalThis.__appearanceCameraContract = {
      PREVIEW_FRAMES,
      applyProductPreview,
      capturePreviewSnapshot,
      closeShop,
      getPreviewFrame,
      isPreviewStageReady,
      isValidShopPayload,
      isValidProductPreview,
      prepareAppearancePreview,
      restorePreviewSnapshot,
      setPreviewModeForTest(stage) {
        previewModeActive = true;
        previewStage = stage;
      },
      setShopForTest(payload) {
        shopOpen = true;
        currentShopPayload = payload;
      },
      stopPreviewMode,
      updatePreviewSnapshotFromCanonical,
      waitForPreviewStage,
    };`,
    sandbox,
    { filename: modulePath }
  );

  return {
    contract: sandbox.__appearanceCameraContract,
    componentCalls,
    componentState,
    decorationCalls,
    eventHandlers,
    freezeCalls,
    player,
    propClearCalls,
    propSetCalls,
    propState,
    remoteCalls,
    sandbox,
    scheduledTimers,
    uiEmits,
  };
}

test("generated client loader excludes Node-only test files", () => {
  const loaderPath = path.resolve(__dirname, "../../../../../client_packages/loader.js");
  const loaderSource = fs.readFileSync(loaderPath, "utf8");

  assert.doesNotMatch(loaderSource, /(?:__tests__|__mocks__|\.(?:test|spec)\.js)/i);
});

test("exhausted automatic retries expose a byte-identical manual purchase check", () => {
  const { contract, eventHandlers, remoteCalls, scheduledTimers, uiEmits } = loadCameraContract();
  contract.setShopForTest({
    contractVersion: 5,
    sessionId: "session-1",
    business: { id: "clothing_ponsonbys", interfaceMode: "catalog" },
    products: [{ id: "hoodie_black", kind: "item", stock: 5 }],
  });

  eventHandlers.get("businessShop:buyFromBrowser")(JSON.stringify({
    businessId: "clothing_ponsonbys",
    productId: "hoodie_black",
    paymentType: "cash",
    quantity: 1,
  }));
  const remotePayload = JSON.parse(remoteCalls.at(-1)[1]);
  const firstRetry = scheduledTimers.find((entry) => entry.delay === 8000);
  assert.ok(firstRetry);
  clearTimeout(firstRetry.timer);
  firstRetry.callback();

  assert.equal(remoteCalls.length, 2);
  assert.equal(remoteCalls[0][1], remoteCalls[1][1]);
  assert.equal(uiEmits[0][1], "twinkle:business-shop:purchase-progress");
  assert.deepEqual({ ...uiEmits[0][2] }, {
    contractVersion: 1,
    businessId: "clothing_ponsonbys",
    productId: "hoodie_black",
    state: "retrying",
  });

  const secondRetry = scheduledTimers.at(-1);
  assert.equal(secondRetry.delay, 20000);
  clearTimeout(secondRetry.timer);
  secondRetry.callback();
  const manualRecoveryDelay = scheduledTimers.at(-1);
  assert.equal(manualRecoveryDelay.delay, 8000);
  clearTimeout(manualRecoveryDelay.timer);
  manualRecoveryDelay.callback();

  assert.equal(remoteCalls.length, 3);
  assert.ok(remoteCalls.every((call) => call[1] === remoteCalls[0][1]));
  assert.equal(uiEmits[2][2].state, "retry_available");

  eventHandlers.get("businessShop:retryPurchaseFromBrowser")(JSON.stringify({
    businessId: "clothing_ponsonbys",
    productId: "hoodie_black",
  }));
  assert.equal(remoteCalls.length, 4);
  assert.ok(remoteCalls.every((call) => call[1] === remoteCalls[0][1]));
  assert.equal(uiEmits[3][2].state, "retrying");

  eventHandlers.get("client:business:purchaseResult")(JSON.stringify({
    requestId: remotePayload.requestId,
    sessionId: "session-1",
    businessId: "clothing_ponsonbys",
    success: false,
    reason: "cash",
  }));

  assert.equal(uiEmits.length, 5);
  assert.equal(uiEmits[4][0], "businessShop");
  assert.equal(uiEmits[4][1], "twinkle:business-shop:purchase-result");
  assert.deepEqual({ ...uiEmits[4][2] }, {
    contractVersion: 1,
    businessId: "clothing_ponsonbys",
    productId: "hoodie_black",
    success: false,
    reason: "cash",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(uiEmits[4][3])), {
    cache: false,
    retryDelays: [0],
    retryKey: `business-shop:purchase-result:${remotePayload.requestId}`,
  });
});

test("camera frames use the character-creation origin and descend by body region", () => {
  const { contract: { PREVIEW_FRAMES: frames } } = loadCameraContract();

  assert.deepEqual({ ...frames.full }, {
    cameraZ: 0.55,
    distance: 4.74,
    fov: 38,
    targetZ: 0.55,
  });
  assert.deepEqual({ ...frames.head }, {
    cameraZ: 0.82,
    distance: 1.74,
    fov: 28,
    targetZ: 0.68,
  });
  assert.ok(frames.head.targetZ > frames.torso.targetZ);
  assert.ok(frames.torso.targetZ > frames.legs.targetZ);
  assert.ok(frames.legs.targetZ > frames.feet.targetZ);
});

test("barber preview removes and restores the mask and hat", () => {
  const { contract, componentCalls, propClearCalls, propSetCalls } = loadCameraContract();
  const payload = {
    appearance: { decorations: [], gender: "male", hair: { hairId: 3, color1: 1, color2: 1 } },
    business: { interfaceMode: "appearance", type: "barber" },
    products: [{ preview: { type: "hair", hairId: 4, color1: 2, color2: 2 } }],
  };

  contract.capturePreviewSnapshot(payload);
  contract.prepareAppearancePreview(payload);
  assert.deepEqual(componentCalls.at(-1), [1, 0, 0, 0]);
  assert.deepEqual(propClearCalls, [0]);

  contract.restorePreviewSnapshot();
  assert.deepEqual(componentCalls.at(-1), [1, 21, 3, 1]);
  assert.deepEqual(propSetCalls.at(-1), [0, 5, 1, true]);
});

test("barber preview preserves an originally empty hat slot", () => {
  const { contract, propClearCalls, propSetCalls, propState } = loadCameraContract();
  const payload = {
    appearance: { decorations: [], gender: "male", hair: { hairId: 3, color1: 1, color2: 1 } },
    business: { interfaceMode: "appearance", type: "barber" },
    products: [{ preview: { type: "hair", hairId: 4, color1: 2, color2: 2 } }],
  };
  propState.set(0, { drawable: -1, texture: 0 });

  contract.capturePreviewSnapshot(payload);
  contract.prepareAppearancePreview(payload);
  contract.restorePreviewSnapshot();

  assert.deepEqual(propClearCalls, [0, 0]);
  assert.deepEqual(propSetCalls, []);
  assert.equal(propState.get(0).drawable, -1);
});

test("tattoo preview uses the female base outfit and clears every supported prop", () => {
  const { contract, componentCalls, propClearCalls } = loadCameraContract();
  const payload = {
    appearance: { decorations: [], gender: "female", hair: { hairId: 3, color1: 1, color2: 1 } },
    business: { interfaceMode: "appearance", type: "tattoo" },
    products: [{ preview: { type: "tattoo", focus: "full", collection: "collection", overlay: "overlay" } }],
  };

  contract.capturePreviewSnapshot(payload);
  contract.prepareAppearancePreview(payload);

  assert.deepEqual(componentCalls.slice(-10), [
    [1, 0, 0, 0],
    [3, 15, 0, 0],
    [4, 14, 0, 0],
    [5, 0, 0, 0],
    [6, 35, 0, 0],
    [7, 0, 0, 0],
    [8, 15, 0, 0],
    [9, 0, 0, 0],
    [10, 0, 0, 0],
    [11, 15, 0, 0],
  ]);
  assert.deepEqual(propClearCalls, [0, 1, 2, 6, 7]);
});

test("male tattoo timeout restores every component, prop, and canonical decoration", () => {
  const {
    contract,
    componentState,
    decorationCalls,
    player,
    propState,
    remoteCalls,
  } = loadCameraContract();
  const originalComponents = new Map(Array.from(componentState, ([key, value]) => [key, { ...value }]));
  const originalProps = new Map(Array.from(propState, ([key, value]) => [key, { ...value }]));
  const payload = {
    sessionId: "session-male-tattoo",
    appearance: {
      decorations: [{ collection: "owned_collection", overlay: "owned_overlay" }],
      gender: "male",
      hair: { hairId: 3, color1: 1, color2: 1 },
    },
    business: { id: "tattoo_vespucci", interfaceMode: "appearance", type: "tattoo" },
    products: [{ preview: { type: "tattoo", focus: "full", collection: "new_collection", overlay: "new_overlay" } }],
  };
  const session = {
    dimension: 70001,
    heading: 180,
    initialFrame: "full",
    position: { x: 402.8664, y: -996.4108, z: -99.00027 },
    sessionId: payload.sessionId,
  };

  contract.setShopForTest(payload);
  contract.capturePreviewSnapshot(payload);
  contract.prepareAppearancePreview(payload);
  contract.applyProductPreview(payload.products[0]);
  contract.setPreviewModeForTest({ sessionId: payload.sessionId, wasFrozen: false });
  player.dimension = 70002;
  contract.waitForPreviewStage(session, Date.now() - 1);

  assert.deepEqual(componentState, originalComponents);
  assert.deepEqual(propState, originalProps);
  assert.deepEqual(decorationCalls.slice(-2).map((entry) => entry[0]), ["clear", "add"]);
  assert.deepEqual(remoteCalls, [["server:business:close", payload.sessionId]]);
});

test("tattoo selection applies canonical and selected decorations to the player body", () => {
  const { contract, decorationCalls } = loadCameraContract();
  const payload = {
    appearance: {
      decorations: [{ collection: "owned_collection", overlay: "owned_overlay" }],
      gender: "male",
      hair: { hairId: 3, color1: 1, color2: 1 },
    },
    business: { id: "tattoo_vespucci", interfaceMode: "appearance", type: "tattoo" },
    products: [],
  };
  contract.setShopForTest(payload);
  contract.capturePreviewSnapshot(payload);

  assert.equal(contract.applyProductPreview({
    preview: { type: "tattoo", focus: "full", collection: "new_collection", overlay: "new_overlay" },
  }), true);
  assert.deepEqual(decorationCalls.map((entry) => entry[0]), ["clear", "add", "add"]);
});

test("tattoo close rolls back an unpaid preview and preserves a paid canonical tattoo", () => {
  const originalDecoration = { collection: "owned_collection", overlay: "owned_overlay" };
  const selectedDecoration = { collection: "new_collection", overlay: "new_overlay" };
  const makePayload = () => ({
    appearance: {
      decorations: [originalDecoration],
      gender: "male",
      hair: { hairId: 3, color1: 1, color2: 1 },
    },
    business: { id: "tattoo_vespucci", interfaceMode: "appearance", type: "tattoo" },
    products: [{ preview: { type: "tattoo", focus: "full", ...selectedDecoration } }],
  });

  const unpaid = loadCameraContract();
  const unpaidPayload = makePayload();
  unpaid.contract.setShopForTest(unpaidPayload);
  unpaid.contract.capturePreviewSnapshot(unpaidPayload);
  unpaid.contract.applyProductPreview(unpaidPayload.products[0]);
  unpaid.contract.restorePreviewSnapshot();
  assert.deepEqual(unpaid.decorationCalls.slice(-2).map((entry) => entry[0]), ["clear", "add"]);

  const paid = loadCameraContract();
  const paidPayload = makePayload();
  paid.contract.setShopForTest(paidPayload);
  paid.contract.capturePreviewSnapshot(paidPayload);
  paid.contract.applyProductPreview(paidPayload.products[0]);
  paid.contract.updatePreviewSnapshotFromCanonical({
    business: paidPayload.business,
    appearance: { ...paidPayload.appearance, decorations: [originalDecoration, selectedDecoration] },
  });
  paid.contract.restorePreviewSnapshot();
  assert.deepEqual(paid.decorationCalls.slice(-3).map((entry) => entry[0]), ["clear", "add", "add"]);
});

test("appearance products resolve to the expected camera focus", () => {
  const { contract: { getPreviewFrame } } = loadCameraContract();
  const cases = [
    [{ type: "component", component: 8 }, "torso", "undershirt"],
    [{ type: "component", component: 11 }, "torso", "top"],
    [{ type: "component", component: 4 }, "legs", "trousers"],
    [{ type: "component", component: 6 }, "feet", "shoes"],
    [{ type: "hair" }, "head", "barber"],
    [{ type: "prop" }, "head", "head accessory"],
    [{ type: "tattoo", focus: "torso" }, "torso", "explicit tattoo region"],
  ];

  for (const [preview, expected, label] of cases) {
    assert.equal(getPreviewFrame(preview), expected, label);
  }
});

test("explicit camera focus overrides the component fallback", () => {
  const { contract: { getPreviewFrame } } = loadCameraContract();
  assert.equal(getPreviewFrame({ type: "component", component: 11, focus: "full" }), "full");
});

test("the browser preview contract rejects unknown camera focuses", () => {
  const { contract: { isValidProductPreview } } = loadCameraContract();
  assert.equal(isValidProductPreview({
    type: "tattoo",
    focus: "invalid",
    collection: "mpbeach_overlays",
    overlay: "fm_hair_fuzz",
  }), false);
});

test("preview readiness requires the authoritative stage and loaded collision", () => {
  const { contract: { isPreviewStageReady }, player, sandbox } = loadCameraContract();
  const session = {
    dimension: 70001,
    position: { x: 402.8664, y: -996.4108, z: -99.00027 },
  };

  assert.equal(isPreviewStageReady(player, session), true);
  player.dimension = 70002;
  assert.equal(isPreviewStageReady(player, session), false);
  player.dimension = 70001;
  player.position = { ...player.position, x: player.position.x + 2 };
  assert.equal(isPreviewStageReady(player, session), false);
  player.position = { ...session.position };
  sandbox.mp.game.entity.hasCollisionLoadedAround = () => false;
  assert.equal(isPreviewStageReady(player, session), false);
});

test("close requests carry the session that owned the local shop", () => {
  const { contract, remoteCalls } = loadCameraContract();
  contract.setShopForTest({ sessionId: "session-a", business: { interfaceMode: "catalog" } });
  contract.closeShop(true);
  assert.deepEqual(remoteCalls, [["server:business:close", "session-a"]]);
});

test("preview cleanup restores the pre-existing frozen state", () => {
  for (const wasFrozen of [false, true]) {
    const { contract, freezeCalls } = loadCameraContract();
    contract.setPreviewModeForTest({ sessionId: "session-a", wasFrozen });
    contract.stopPreviewMode();
    assert.deepEqual(freezeCalls, [wasFrozen]);
  }
});

test("preview readiness timeout cleans up and closes only its own session", () => {
  const { contract, freezeCalls, player, remoteCalls } = loadCameraContract();
  const payload = {
    sessionId: "session-a",
    business: { interfaceMode: "appearance" },
  };
  const session = {
    dimension: 70001,
    heading: 180,
    initialFrame: "full",
    position: { x: 402.8664, y: -996.4108, z: -99.00027 },
    sessionId: "session-a",
  };
  player.dimension = 70002;
  contract.setShopForTest(payload);
  contract.setPreviewModeForTest({ sessionId: "session-a", wasFrozen: false });
  contract.waitForPreviewStage(session, Date.now() - 1);

  assert.deepEqual(freezeCalls, [false]);
  assert.deepEqual(remoteCalls, [["server:business:close", "session-a"]]);
});
