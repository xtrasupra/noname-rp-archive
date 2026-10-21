"use strict";

try {
  global.__twinkleCargoLoaderClientRuntime?.shutdown?.();
} catch (error) {
  try { mp.console.logError(`[CARGO LOADER] Previous client runtime shutdown failed: ${error.message}`); } catch {}
}

const E_KEY = 0x45;
const INTERACTION_RADIUS = 2.9;
const DEFAULT_MODEL = "prop_cs_cardbox_01";

let loaderState = null;
let routeBlip = null;
let cargoObject = null;
let cargoGeneration = 0;
let cargoCreateInFlight = false;
let visualKey = "";
let animationReady = false;
let lastAttachCheckAt = 0;
let lastAnimationCheckAt = 0;
let wasJumping = false;
let jumpDropPending = false;
let jumpDropSentAt = 0;
let lastStateRequestAt = 0;

const runtime = {
  active: true,
  handlers: [],
  keyBindings: [],
  remoteCargo: new Map(),
  shutdown: null,
};
global.__twinkleCargoLoaderClientRuntime = runtime;

function registerClientEvent(name, handler) {
  const guarded = (...args) => runtime.active ? handler(...args) : undefined;
  mp.events.add(name, guarded);
  runtime.handlers.push({ name, handler: guarded });
  return guarded;
}

function registerDataHandler(name, handler) {
  if (typeof mp.events.addDataHandler !== "function") return;
  const guarded = (...args) => runtime.active ? handler(...args) : undefined;
  mp.events.addDataHandler(name, guarded);
  runtime.handlers.push({ name, handler: guarded, data: true });
}

function parseJson(raw, fallback = null) {
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(String(raw || "")); } catch { return fallback; }
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return Math.hypot(
    finiteNumber(left.x) - finiteNumber(right.x),
    finiteNumber(left.y) - finiteNumber(right.y),
    finiteNumber(left.z) - finiteNumber(right.z)
  );
}

function vector(point) {
  return new mp.Vector3(finiteNumber(point?.x), finiteNumber(point?.y), finiteNumber(point?.z));
}

function tuple3(value, fallback) {
  return Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((item, index) => finiteNumber(item, fallback[index]))
    : [...fallback];
}

function objectExists(object) {
  try { return Boolean(object && (!mp.objects.exists || mp.objects.exists(object))); } catch { return false; }
}

function destroyObject(object) {
  if (!object) return;
  try { if (!mp.objects.exists || mp.objects.exists(object)) object.destroy(); } catch {}
}

function destroyCargoObject(options = {}) {
  cargoGeneration += 1;
  destroyObject(cargoObject);
  cargoObject = null;
  cargoCreateInFlight = false;
  animationReady = false;
  lastAttachCheckAt = 0;
  lastAnimationCheckAt = 0;
  if (options.clearTasks !== false) {
    try { mp.players.local.clearTasks(); } catch {}
  }
}

function destroyRouteBlip() {
  if (!routeBlip) return;
  try { routeBlip.setRoute(false); } catch {}
  try { if (!mp.blips.exists || mp.blips.exists(routeBlip)) routeBlip.destroy(); } catch {}
  routeBlip = null;
}

function createRouteBlip() {
  destroyRouteBlip();
  const target = loaderState?.target;
  if (!target) return;
  const unloading = loaderState.phase === "carry" || loaderState.phase === "settling";
  const dropped = loaderState.phase === "dropped";
  try {
    routeBlip = mp.blips.new(unloading ? 1 : 478, vector(target), {
      name: dropped ? "Упавший груз" : unloading ? "Разгрузка груза" : "Погрузка груза",
      color: dropped ? 47 : unloading ? 2 : 5,
      scale: 0.82,
      shortRange: false,
      dimension: finiteNumber(target.dimension, 0),
    });
    try { routeBlip.setRoute(true); } catch {}
    try { routeBlip.setRouteColour(dropped ? 47 : unloading ? 2 : 5); } catch {}
  } catch { routeBlip = null; }
}

async function waitFrame() {
  try { await mp.game.waitAsync(0); } catch { await new Promise((resolve) => setTimeout(resolve, 0)); }
}

async function loadFirstModel(names, timeoutFrames = 240) {
  const candidates = [...new Set([...(Array.isArray(names) ? names : []), DEFAULT_MODEL])]
    .filter((name) => /^[a-zA-Z0-9_]{1,64}$/.test(String(name || "")));
  for (const name of candidates) {
    const hash = mp.game.joaat(name);
    try {
      if (!mp.game.streaming.isModelInCdimage(hash) || !mp.game.streaming.isModelValid(hash)) continue;
      mp.game.streaming.requestModel(hash);
      for (let frame = 0; frame < timeoutFrames; frame += 1) {
        if (mp.game.streaming.hasModelLoaded(hash)) return hash;
        await waitFrame();
      }
    } catch {}
  }
  return null;
}

async function loadAnimation(animation, timeoutMs = 4000) {
  const dictionary = String(animation?.dictionary || "anim@heists@box_carry@");
  try {
    mp.game.streaming.requestAnimDict(dictionary);
    const startedAt = Date.now();
    while (!mp.game.streaming.hasAnimDictLoaded(dictionary)) {
      if (Date.now() - startedAt >= timeoutMs) return false;
      try { await mp.game.waitAsync(25); } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    return true;
  } catch { return false; }
}

function isAttachedToPlayer(object, player) {
  try {
    if (typeof object?.isAttachedTo === "function") return Boolean(object.isAttachedTo(player.handle));
    return Boolean(object?.handle && player?.handle
      && mp.game.invoke("0xEFBE71898A993728", object.handle, player.handle));
  } catch { return false; }
}

function attachCargoObject(object) {
  const player = mp.players.local;
  const cargo = loaderState?.cargo;
  if (!object?.handle || !player?.handle || !cargo) return false;
  const position = tuple3(cargo.position, [0, -0.03, -0.16]);
  const rotation = tuple3(cargo.rotation, [5, 0, 0]);
  try {
    const bone = player.getBoneIndex(Math.floor(finiteNumber(cargo.bone, 28422)));
    object.freezePosition(false);
    object.setCollision(false, false);
    if (typeof object.attachTo === "function") {
      object.attachTo(
        player.handle,
        bone,
        position[0], position[1], position[2],
        rotation[0], rotation[1], rotation[2],
        false, false, false, false, 2, true
      );
    } else {
      mp.game.invoke(
        "0x6B9BBD38AB0796DF",
        object.handle, player.handle, bone,
        position[0], position[1], position[2],
        rotation[0], rotation[1], rotation[2],
        false, false, false, false, 2, true
      );
    }
    try { object.setVisible(true, false); object.resetAlpha?.(); } catch {}
    return isAttachedToPlayer(object, player);
  } catch { return false; }
}

function playCarryAnimation() {
  const player = mp.players.local;
  const animation = loaderState?.cargo?.animation;
  if (!animationReady || !animation || player.vehicle || jumpDropPending) return;
  try {
    player.taskPlayAnim(
      String(animation.dictionary),
      String(animation.name),
      8, -8, -1,
      Math.floor(finiteNumber(animation.flags, 49)),
      0, false, false, false
    );
  } catch {}
}

function settleObjectOnGround(object, target, cargo) {
  if (!object?.handle || !target) return;
  let groundZ = finiteNumber(target.z);
  try {
    mp.game.streaming.requestCollisionAtCoord(finiteNumber(target.x), finiteNumber(target.y), finiteNumber(target.z));
    const result = mp.game.gameplay.getGroundZFor3dCoord(
      finiteNumber(target.x), finiteNumber(target.y), finiteNumber(target.z) + 20, false, false
    );
    const rawCandidate = result?.z ?? result;
    const candidate = typeof rawCandidate === "number" ? rawCandidate : Number.NaN;
    const expectedZ = finiteNumber(target.z);
    if (Number.isFinite(candidate)
      && !(candidate === 0 && Math.abs(expectedZ) > 2)
      && Math.abs(candidate - expectedZ) < 4) {
      groundZ = candidate;
    }
  } catch {}
  const finalZ = groundZ + finiteNumber(cargo?.groundOffset, 0.15);
  try {
    mp.game.invoke("0x239A3351AC1DA385", object.handle, finiteNumber(target.x), finiteNumber(target.y), finalZ, false, false, false);
  } catch {
    try { object.position = new mp.Vector3(finiteNumber(target.x), finiteNumber(target.y), finalZ); } catch {}
  }
  try { object.setRotation(0, 0, finiteNumber(target.heading), 2, true); } catch {}
  try { object.setCollision(true, true); object.freezePosition(true); object.setVisible(true, false); object.resetAlpha?.(); } catch {}
}

async function createCargoObject(generation) {
  if (!loaderState?.cargo || cargoCreateInFlight) return;
  cargoCreateInFlight = true;
  const cargo = loaderState.cargo;
  const modelHash = await loadFirstModel(cargo.models);
  if (!modelHash || generation !== cargoGeneration || !loaderState?.cargo) {
    cargoCreateInFlight = false;
    return;
  }
  const carrying = loaderState.phase === "carry";
  const spawn = carrying ? mp.players.local.position : loaderState.target;
  try {
    cargoObject = mp.objects.new(modelHash, vector(spawn), {
      dimension: finiteNumber(loaderState.target?.dimension ?? mp.players.local.dimension, 0),
      alpha: 255,
    });
    try { cargoObject.setVisible(true, false); } catch {}
    if (carrying) {
      for (let frame = 0; frame < 180; frame += 1) {
        if (generation !== cargoGeneration || !loaderState || cargoObject === null) return;
        if (attachCargoObject(cargoObject)) break;
        await waitFrame();
      }
      animationReady = await loadAnimation(cargo.animation);
      if (generation === cargoGeneration && loaderState?.phase === "carry") playCarryAnimation();
    } else {
      for (let frame = 0; frame < 120 && !cargoObject.handle; frame += 1) await waitFrame();
      if (generation === cargoGeneration && loaderState?.phase !== "carry") {
        settleObjectOnGround(cargoObject, loaderState.target, cargo);
      }
    }
  } catch (error) {
    try { mp.console.logError(`[CARGO LOADER] Cargo object failed: ${error.message}`); } catch {}
  } finally {
    cargoCreateInFlight = false;
    try { mp.game.streaming.setModelAsNoLongerNeeded(modelHash); } catch {}
  }
}

function refreshCargoVisual(force = false) {
  const key = loaderState
    ? [loaderState.cargoId, loaderState.revision, loaderState.phase, loaderState.target?.x, loaderState.target?.y, loaderState.target?.z].join(":")
    : "";
  if (!force && key === visualKey) return;
  visualKey = key;
  destroyCargoObject({ clearTasks: true });
  if (!loaderState?.cargo || loaderState.phase === "settling") return;
  cargoGeneration += 1;
  void createCargoObject(cargoGeneration);
}

function applyState(raw) {
  const payload = parseJson(raw, null);
  loaderState = payload?.active ? payload : null;
  jumpDropPending = false;
  jumpDropSentAt = 0;
  lastStateRequestAt = 0;
  wasJumping = false;
  createRouteBlip();
  refreshCargoVisual();
}

function clearLoader() {
  loaderState = null;
  visualKey = "";
  jumpDropPending = false;
  jumpDropSentAt = 0;
  lastStateRequestAt = 0;
  wasJumping = false;
  destroyRouteBlip();
  destroyCargoObject({ clearTasks: true });
}

function isRemotePlayer(entity) {
  if (!entity || entity === mp.players.local || typeof entity.getBoneIndex !== "function") return false;
  try { return typeof mp.players.exists !== "function" || mp.players.exists(entity); } catch { return false; }
}

function destroyRemoteCargo(player) {
  const entry = runtime.remoteCargo.get(player);
  if (!entry) return;
  entry.generation += 1;
  destroyObject(entry.object);
  runtime.remoteCargo.delete(player);
}

function attachRemoteCargo(object, player, cargo) {
  if (!object?.handle || !player?.handle || !cargo) return false;
  const position = tuple3(cargo.position, [0, -0.03, -0.16]);
  const rotation = tuple3(cargo.rotation, [5, 0, 0]);
  try {
    const bone = player.getBoneIndex(Math.floor(finiteNumber(cargo.bone, 28422)));
    object.freezePosition(false);
    object.setCollision(false, false);
    object.attachTo(
      player.handle,
      bone,
      position[0], position[1], position[2],
      rotation[0], rotation[1], rotation[2],
      false, false, false, false, 2, true
    );
    object.setVisible(true, false);
    return isAttachedToPlayer(object, player);
  } catch { return false; }
}

async function createRemoteCargo(player, cargo, entry) {
  const modelHash = await loadFirstModel(cargo.models);
  const current = runtime.remoteCargo.get(player);
  if (!runtime.active || !modelHash || current !== entry || !isRemotePlayer(player)) {
    if (modelHash) {
      try { mp.game.streaming.setModelAsNoLongerNeeded(modelHash); } catch {}
    }
    return;
  }
  try {
    const object = mp.objects.new(modelHash, player.position, {
      dimension: finiteNumber(player.dimension),
      alpha: 255,
    });
    entry.object = object;
    for (let frame = 0; frame < 180; frame += 1) {
      if (!runtime.active || runtime.remoteCargo.get(player) !== entry) {
        destroyObject(object);
        return;
      }
      if (attachRemoteCargo(object, player, cargo)) break;
      await waitFrame();
    }
  } catch {}
  finally {
    try { mp.game.streaming.setModelAsNoLongerNeeded(modelHash); } catch {}
  }
}

function syncRemoteCargo(player, rawCargo) {
  if (!isRemotePlayer(player)) return;
  destroyRemoteCargo(player);
  const cargo = parseJson(rawCargo, null);
  if (!cargo || !Array.isArray(cargo.models) || !cargo.models.length) return;
  const entry = { player, cargo, object: null, generation: 1, lastAttachCheckAt: 0 };
  runtime.remoteCargo.set(player, entry);
  void createRemoteCargo(player, cargo, entry);
}

function maintainRemoteCargo() {
  const now = Date.now();
  for (const entry of runtime.remoteCargo.values()) {
    if (!isRemotePlayer(entry.player)) {
      destroyRemoteCargo(entry.player);
      continue;
    }
    if (objectExists(entry.object) && now - entry.lastAttachCheckAt >= 1000) {
      entry.lastAttachCheckAt = now;
      if (!isAttachedToPlayer(entry.object, entry.player)) {
        attachRemoteCargo(entry.object, entry.player, entry.cargo);
      }
    }
  }
}

function drawText(text, x, y, scale, color = [255, 255, 255, 235]) {
  try {
    mp.game.graphics.drawText(String(text), [x, y], {
      font: 4,
      color,
      scale: [scale, scale],
      outline: true,
      centre: true,
    });
  } catch {}
}

function drawWorldText(text, position, color) {
  try {
    const screen = mp.game.graphics.world3dToScreen2d(position.x, position.y, position.z);
    if (screen) drawText(text, screen.x, screen.y, 0.32, color);
  } catch {}
}

function isJumping() {
  try { return Boolean(mp.game.invoke("0xCEDABC5900A0BF97", mp.players.local.handle)); } catch { return false; }
}

function sendJumpDrop() {
  if (!loaderState?.carrying || jumpDropPending) return;
  jumpDropPending = true;
  jumpDropSentAt = Date.now();
  destroyObject(cargoObject);
  cargoObject = null;
  try { mp.players.local.clearTasks(); } catch {}
  mp.events.callRemote("server:cargoLoader:jump", JSON.stringify({
    cargoId: loaderState.cargoId,
    revision: loaderState.revision,
  }));
}

const bindKey = global.bindKey || ((key, hold, callback) => {
  mp.keys.bind(key, hold, callback);
  return callback;
});
const interactionKeyHandler = bindKey(E_KEY, false, () => {
  if (!runtime.active) return;
  if (!loaderState?.target || loaderState.phase === "settling" || mp.gui.cursor.visible || mp.players.local.vehicle) return;
  if (finiteNumber(mp.players.local.dimension) !== finiteNumber(loaderState.target.dimension)) return;
  if (distance(mp.players.local.position, loaderState.target) > INTERACTION_RADIUS) return;
  mp.events.callRemote("server:cargoLoader:interact", JSON.stringify({
    cargoId: loaderState.cargoId,
    revision: loaderState.revision,
  }));
});
if (typeof interactionKeyHandler === "function") {
  runtime.keyBindings.push({ key: E_KEY, hold: false, handler: interactionKeyHandler });
}

registerClientEvent("render", () => {
  maintainRemoteCargo();
  if (!loaderState?.target) return;
  const player = mp.players.local;
  const currentDistance = distance(player.position, loaderState.target);
  const sameDimension = finiteNumber(player.dimension) === finiteNumber(loaderState.target.dimension);
  if (sameDimension && currentDistance <= 40) {
    const target = loaderState.target;
    const color = loaderState.phase === "carry" ? [64, 210, 125] : loaderState.phase === "dropped" ? [240, 174, 62] : [90, 170, 255];
    try {
      mp.game.graphics.drawMarker(
        1, target.x, target.y, target.z - 1.0,
        0, 0, 0, 0, 0, 0,
        1.35, 1.35, 0.7,
        color[0], color[1], color[2], 150,
        false, false, 2, false, null, null, false
      );
    } catch {}
    if (currentDistance <= INTERACTION_RADIUS) {
      drawWorldText(`[E] ${loaderState.action}`, { x: target.x, y: target.y, z: target.z + 0.65 }, [...color, 245]);
      drawText(`Оплата: $${Math.max(0, Math.round(finiteNumber(loaderState.payout)))}`, 0.5, 0.86, 0.31, [235, 235, 235, 235]);
    }
  }

  if (!loaderState.carrying) {
    wasJumping = false;
    return;
  }
  [21, 24, 25, 37, 45, 47, 58, 140, 141, 142, 257, 263, 264].forEach((control) => {
    try { mp.game.controls.disableControlAction(0, control, true); } catch {}
  });
  const jumping = isJumping();
  let jumpPressed = false;
  try { jumpPressed = mp.game.controls.isControlJustPressed(0, 22); } catch {}
  if ((jumpPressed || (jumping && !wasJumping)) && !jumpDropPending) sendJumpDrop();
  wasJumping = jumping;

  if (jumpDropPending) {
    const now = Date.now();
    if (now - jumpDropSentAt > 1500 && now - lastStateRequestAt >= 1000) {
      lastStateRequestAt = now;
      mp.events.callRemote("server:cargoLoader:state:request");
    }
    return;
  }
  if (!objectExists(cargoObject) && !cargoCreateInFlight) refreshCargoVisual(true);
  if (objectExists(cargoObject) && Date.now() - lastAttachCheckAt >= 500) {
    lastAttachCheckAt = Date.now();
    if (!isAttachedToPlayer(cargoObject, player)) attachCargoObject(cargoObject);
  }
  if (animationReady && Date.now() - lastAnimationCheckAt >= 1500) {
    lastAnimationCheckAt = Date.now();
    const animation = loaderState.cargo?.animation;
    let playing = false;
    try { playing = player.isPlayingAnim(animation.dictionary, animation.name, 3); } catch {}
    if (!playing) playCarryAnimation();
  }
});

registerClientEvent("client:cargoLoader:state", applyState);
registerClientEvent("client:cargoLoader:clear", clearLoader);
registerClientEvent("entityStreamIn", (entity) => {
  if (!isRemotePlayer(entity)) return;
  let cargo = null;
  try { cargo = entity.getVariable("cargoLoaderCarry"); } catch {}
  syncRemoteCargo(entity, cargo);
});
registerClientEvent("entityStreamOut", (entity) => {
  if (isRemotePlayer(entity)) destroyRemoteCargo(entity);
});
registerClientEvent("playerQuit", (player) => {
  if (isRemotePlayer(player)) destroyRemoteCargo(player);
});
registerDataHandler("cargoLoaderCarry", (entity, value) => syncRemoteCargo(entity, value));

try {
  mp.players.forEach((player) => {
    if (!isRemotePlayer(player)) return;
    syncRemoteCargo(player, player.getVariable("cargoLoaderCarry"));
  });
} catch {}

runtime.shutdown = () => {
  if (!runtime.active) return;
  runtime.active = false;
  clearLoader();
  for (const entry of [...runtime.remoteCargo.values()]) destroyRemoteCargo(entry.player);
  runtime.keyBindings.splice(0).forEach((entry) => {
    try { mp.keys.unbind?.(entry.key, entry.hold, entry.handler); } catch {}
  });
  runtime.handlers.splice(0).forEach((entry) => {
    try {
      if (entry.data) mp.events.removeDataHandler?.(entry.name, entry.handler);
      else mp.events.remove?.(entry.name, entry.handler);
    } catch {}
  });
};

try { mp.console.logInfo("[CARGO LOADER] Client loaded"); } catch {}
