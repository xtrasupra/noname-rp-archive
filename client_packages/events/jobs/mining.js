"use strict";

const E_KEY = 0x45;
const SHOP_PAGE = "miningEquipment";
const CHALLENGE_PAGE = "miningChallenge";
const CHALLENGE_OWNER = "miningChallenge";
const SALE_POINT = { x: 2958.908935546875, y: 2753.543212890625, z: 43.70643615722656 };
const SAFE_ZONE = { minX: 2663.337158203125, maxX: 3013.124755859375, minY: 2561.1162109375, maxY: 2991.429931640625, minZ: 20, maxZ: 180 };
const ROCK_DISTANCE = 2.7;
const CARGO_ANIM_DICT = "missfinale_c2ig_11";
const CARGO_ANIM_NAME = "pushcar_offcliff_f";
const CARGO_ATTACH = Object.freeze({ bone: 28422, position: [-0.4, -1.8, -0.6], rotation: [0, 20, 90] });

const rocks = new Map();
const gpsBlips = new Map();
let miningState = null;
let challenge = null;
let toolObject = null;
let wheelbarrowObject = null;
let safeZone = false;
let uniformSnapshot = null;
let cargoRouteBlip = null;
let cargoCheckpoint = null;
let haulRoute = null;
let haulBlip = null;
let haulCheckpoint = null;
let haulStage = null;
let haulFrozenVehicle = null;
let spillSentAt = 0;
let toolGeneration = 0;
let toolVisual = null;
let toolCreateInFlight = false;
let toolCreateGeneration = -1;
let lastToolCreateAttemptAt = 0;
let lastToolAttachCheckAt = 0;
let wheelbarrowGeneration = 0;
let miningStateReceivedAt = 0;
let gpsWasActive = false;
let cargoAnimationReady = false;
let lastCargoAnimationCheckAt = 0;
let lastWheelbarrowAttachCheckAt = 0;
let challengeSubmission = null;

function parseJson(raw, fallback = {}) {
  try {
    if (!raw) return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch { return fallback; }
}

function notify(message, variant = "info") {
  try { global.interfaceLock?.notify?.(String(message), variant); } catch {}
}

function vdist(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return mp.game.system.vdist(Number(left.x), Number(left.y), Number(left.z), Number(right.x), Number(right.y), Number(right.z));
}

function insideSafeZone(position) {
  return Boolean(position && position.x >= SAFE_ZONE.minX && position.x <= SAFE_ZONE.maxX
    && position.y >= SAFE_ZONE.minY && position.y <= SAFE_ZONE.maxY
    && position.z >= SAFE_ZONE.minZ && position.z <= SAFE_ZONE.maxZ
    && Number(mp.players.local.dimension || 0) === 0);
}

function modelHash(name, fallback = "prop_rock_4_c") {
  try {
    const hash = mp.game.joaat(String(name || fallback));
    return mp.game.streaming.isModelInCdimage(hash) && mp.game.streaming.isModelValid(hash)
      ? hash
      : mp.game.joaat(fallback);
  } catch { return mp.game.joaat(fallback); }
}

async function loadModel(hash, timeoutMs = 5000) {
  try {
    mp.game.streaming.requestModel(hash);
    const startedAt = Date.now();
    while (!mp.game.streaming.hasModelLoaded(hash)) {
      if (Date.now() - startedAt > timeoutMs) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return true;
  } catch { return false; }
}

async function loadAnimDict(dict, timeoutMs = 4000) {
  try {
    mp.game.streaming.requestAnimDict(dict);
    const startedAt = Date.now();
    while (!mp.game.streaming.hasAnimDictLoaded(dict)) {
      if (Date.now() - startedAt > timeoutMs) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return true;
  } catch { return false; }
}

function entityExists(collection, entity) {
  if (!entity) return false;
  try { return typeof collection.exists !== "function" || collection.exists(entity); } catch { return false; }
}

function destroyObject(object) {
  if (!object) return;
  try { if (entityExists(mp.objects, object)) object.destroy(); } catch {}
}

function isAttachedToEntity(object, target) {
  try {
    return Boolean(object && target && object.handle !== 0 && target.handle !== 0
      && mp.game.invoke("0xEFBE71898A993728", object.handle, target.handle));
  } catch {
    try { return Boolean(object?.isAttachedTo?.(target.handle)); } catch { return false; }
  }
}

function attachWheelbarrowObject(object, player) {
  if (!object || !player || object.handle === 0 || player.handle === 0) return false;
  try {
    const bone = player.getBoneIndex(CARGO_ATTACH.bone);
    object.freezePosition(false);
    object.setCollision(false, false);
    if (typeof object.attachTo === "function") {
      object.attachTo(
        player.handle,
        bone,
        CARGO_ATTACH.position[0], CARGO_ATTACH.position[1], CARGO_ATTACH.position[2],
        CARGO_ATTACH.rotation[0], CARGO_ATTACH.rotation[1], CARGO_ATTACH.rotation[2],
        false, false, false, false, 2, true
      );
    } else {
      mp.game.invoke(
        "0x6B9BBD38AB0796DF",
        object.handle, player.handle, bone,
        CARGO_ATTACH.position[0], CARGO_ATTACH.position[1], CARGO_ATTACH.position[2],
        CARGO_ATTACH.rotation[0], CARGO_ATTACH.rotation[1], CARGO_ATTACH.rotation[2],
        false, false, false, false, 2, true
      );
    }
    return isAttachedToEntity(object, player);
  } catch {
    return false;
  }
}

async function createRockObject(data) {
  const existing = rocks.get(data.id);
  if (!existing || existing.generation !== data.generation || existing.object) return;
  let hash = modelHash(data.model);
  if (!await loadModel(hash)) {
    hash = modelHash("prop_rock_4_c");
    if (!await loadModel(hash)) return;
  }
  const current = rocks.get(data.id);
  if (!current || current.generation !== data.generation || current.object) return;
  try {
    const object = mp.objects.new(hash, new mp.Vector3(data.position.x, data.position.y, data.position.z + Number(data.zOffset || 0)), {
      rotation: new mp.Vector3(0, 0, Number(data.heading || 0)),
      alpha: 255,
      dimension: 0,
    });
    try { object.freezePosition(true); } catch {}
    current.object = object;
    try { mp.game.streaming.setModelAsNoLongerNeeded(hash); } catch {}
  } catch (error) {
    try { mp.console.logError(`[MINING] Rock object failed: ${error.message}`); } catch {}
  }
}

function removeRock(id) {
  const key = String(id || "");
  const rock = rocks.get(key);
  if (rock) destroyObject(rock.object);
  rocks.delete(key);
  const blip = gpsBlips.get(key);
  if (blip) {
    try { if (mp.blips.exists(blip)) blip.destroy(); } catch {}
    gpsBlips.delete(key);
  }
}

function setRocks(payload) {
  const incoming = Array.isArray(payload) ? payload : [];
  const nextIds = new Set(incoming.map((rock) => String(rock.id)));
  for (const id of [...rocks.keys()]) if (!nextIds.has(id)) removeRock(id);
  for (const data of incoming) updateRock(data);
  refreshGpsBlips();
}

function updateRock(raw) {
  const data = { ...raw, id: String(raw?.id || "") };
  if (!data.id || !data.position) return;
  const existing = rocks.get(data.id);
  if (existing) {
    const previousPosition = existing.position || {};
    const needsRecreate = existing.model !== data.model
      || Number(existing.zOffset || 0) !== Number(data.zOffset || 0)
      || Number(existing.heading || 0) !== Number(data.heading || 0)
      || Number(previousPosition.x) !== Number(data.position.x)
      || Number(previousPosition.y) !== Number(data.position.y)
      || Number(previousPosition.z) !== Number(data.position.z);
    Object.assign(existing, data);
    if (needsRecreate) {
      destroyObject(existing.object);
      existing.object = null;
      existing.generation = Date.now() + Math.random();
      createRockObject(existing);
    }
    return;
  }
  const entry = { ...data, object: null, generation: Date.now() + Math.random() };
  rocks.set(data.id, entry);
  createRockObject(entry);
}

function gpsActive() {
  const remainingMs = Number(miningState?.entitlements?.gps?.remainingMs || 0);
  return miningState?.gpsEnabled !== false && remainingMs - Math.max(0, Date.now() - miningStateReceivedAt) > 0;
}

function refreshGpsBlips() {
  const active = gpsActive();
  gpsWasActive = active;
  if (!active) {
    for (const [id, blip] of gpsBlips.entries()) {
      try { if (mp.blips.exists(blip)) blip.destroy(); } catch {}
      gpsBlips.delete(id);
    }
    return;
  }
  for (const [id, rock] of rocks.entries()) {
    if (gpsBlips.has(id)) continue;
    try {
      const blip = mp.blips.new(1, new mp.Vector3(rock.position.x, rock.position.y, rock.position.z), {
        name: `GPS: ${rock.resourceName}`,
        color: rock.rarity === "very_rare" ? 3 : rock.rarity === "rare" ? 5 : rock.rarity === "medium" ? 47 : 40,
        scale: 0.62,
        shortRange: false,
        dimension: 0,
      });
      gpsBlips.set(id, blip);
    } catch {}
  }
  for (const [id, blip] of gpsBlips.entries()) {
    if (rocks.has(id)) continue;
    try { if (mp.blips.exists(blip)) blip.destroy(); } catch {}
    gpsBlips.delete(id);
  }
}

function destroyCargoRoute() {
  if (cargoBlipExists()) {
    try { cargoRouteBlip.setRoute(false); } catch {}
    try { cargoRouteBlip.destroy(); } catch {}
  }
  if (cargoCheckpoint && entityExists(mp.checkpoints, cargoCheckpoint)) {
    try { cargoCheckpoint.destroy(); } catch {}
  }
  cargoRouteBlip = null;
  cargoCheckpoint = null;
}

function cargoBlipExists() {
  try { return Boolean(cargoRouteBlip && mp.blips.exists(cargoRouteBlip)); } catch { return false; }
}

function createCargoRoute() {
  destroyCargoRoute();
  if (!miningState?.cargo) return;
  const position = new mp.Vector3(SALE_POINT.x, SALE_POINT.y, SALE_POINT.z);
  const markerPosition = new mp.Vector3(SALE_POINT.x, SALE_POINT.y, SALE_POINT.z - 1.05);
  try {
    cargoRouteBlip = mp.blips.new(1, position, { name: "Сбыт камня", color: 2, scale: 0.8, shortRange: false, dimension: 0 });
    cargoRouteBlip.setRoute(true);
    cargoRouteBlip.setRouteColour(2);
    cargoCheckpoint = mp.checkpoints.new(4, markerPosition, 3, { direction: new mp.Vector3(0, 0, 0), color: [70, 235, 128, 150], visible: true, dimension: 0 });
  } catch {}
}

function destroyHaulRoute() {
  if (haulBlip) {
    try { haulBlip.setRoute(false); } catch {}
    try { if (mp.blips.exists(haulBlip)) haulBlip.destroy(); } catch {}
  }
  if (haulCheckpoint) {
    try { if (entityExists(mp.checkpoints, haulCheckpoint)) haulCheckpoint.destroy(); } catch {}
  }
  haulBlip = null;
  haulCheckpoint = null;
  haulRoute = null;
}

function setHaulRoute(payload) {
  destroyHaulRoute();
  if (!payload?.point) return;
  haulRoute = payload;
  const point = payload.point;
  const position = new mp.Vector3(Number(point.x), Number(point.y), Number(point.z));
  const markerPosition = new mp.Vector3(Number(point.x), Number(point.y), Number(point.z) - (payload.phase === "load" ? 1.05 : 0.65));
  const loading = payload.phase === "load";
  try {
    haulBlip = mp.blips.new(1, position, { name: loading ? "Загрузка породы" : "Разгрузка породы", color: loading ? 5 : 2, scale: 0.9, shortRange: false, dimension: 0 });
    haulBlip.setRoute(true);
    haulBlip.setRouteColour(loading ? 5 : 2);
    haulCheckpoint = mp.checkpoints.new(4, markerPosition, Number(payload.radius || 6), { direction: new mp.Vector3(0, 0, 0), color: loading ? [255, 190, 60, 150] : [70, 230, 125, 150], visible: true, dimension: 0 });
  } catch {}
}

function patchChallenge(payload) {
  if (!challenge || !payload?.token || String(payload.token) !== String(challenge.token)) return;
  challenge = { ...challenge, ...payload };
  if (challengeSubmission && (payload.resync
    || Number(payload.index) !== Number(challengeSubmission.index)
    || String(payload.token) !== String(challengeSubmission.token))) challengeSubmission = null;
  try {
    global.uiState?.patch?.(CHALLENGE_PAGE, payload, {
      globalName: "__TWINKLE_MINING_CHALLENGE__",
      retryKey: "mining:challenge",
      retryDelays: [0],
    });
  } catch {}
}

function destroyTool(clearVisual = true) {
  toolGeneration += 1;
  destroyObject(toolObject);
  toolObject = null;
  toolCreateInFlight = false;
  toolCreateGeneration = -1;
  lastToolAttachCheckAt = 0;
  if (clearVisual) toolVisual = null;
}

function attachMiningTool(object, player, attachment) {
  if (!object || !player || object.handle === 0 || player.handle === 0) return false;
  try {
    object.freezePosition(false);
    object.setCollision(false, false);
    object.attachTo(
      player.handle,
      player.getBoneIndex(attachment.bone),
      attachment.position[0], attachment.position[1], attachment.position[2],
      attachment.rotation[0], attachment.rotation[1], attachment.rotation[2],
      false, false, false, false, 2, true
    );
    try { object.setVisible(true, false); object.resetAlpha?.(); } catch {}
    return isAttachedToEntity(object, player);
  } catch { return false; }
}

async function createMiningToolObject(generation) {
  if (toolCreateInFlight && toolCreateGeneration === generation) return;
  const visual = toolVisual;
  if (!visual || !challenge || String(challenge.token || "") !== visual.token) return;
  toolCreateInFlight = true;
  toolCreateGeneration = generation;
  lastToolCreateAttemptAt = Date.now();
  const hash = modelHash(visual.model, visual.model);
  try {
    if (!await loadModel(hash)) return;
    if (generation !== toolGeneration || toolVisual !== visual || !challenge
      || String(challenge.token || "") !== visual.token) return;
    const player = mp.players.local;
    const spawnPosition = new mp.Vector3(player.position.x, player.position.y, player.position.z);
    const object = mp.objects.new(hash, spawnPosition, { dimension: Number(player.dimension || 0), alpha: 255 });
    toolObject = object;
    try { object.setVisible(true, false); object.freezePosition(false); object.setCollision(false, false); } catch {}
    let attached = false;
    for (let frameIndex = 0; frameIndex < 180; frameIndex += 1) {
      if (generation !== toolGeneration || toolObject !== object || toolVisual !== visual
        || !challenge || String(challenge.token || "") !== visual.token) return;
      if (entityExists(mp.objects, object) && attachMiningTool(object, player, visual.attachment)) {
        attached = true;
        break;
      }
      try { await mp.game.waitAsync(16); } catch { await new Promise((resolve) => setTimeout(resolve, 16)); }
    }
    if (!attached) {
      try { mp.console.logError("[MINING] Tool attachment delayed; keepalive will retry"); } catch {}
    }
  } catch {}
  finally {
    if (toolCreateGeneration === generation) toolCreateInFlight = false;
    try { mp.game.streaming.setModelAsNoLongerNeeded(hash); } catch {}
  }
}

async function createMiningTool(model, attachment) {
  destroyTool();
  toolVisual = { model, attachment, token: String(challenge?.token || "") };
  return createMiningToolObject(toolGeneration);
}

function keepMiningToolAlive() {
  if (!challenge || !toolVisual || String(challenge.token || "") !== toolVisual.token) return;
  const player = mp.players.local;
  if (toolObject && !entityExists(mp.objects, toolObject)) toolObject = null;
  const creating = toolCreateInFlight && toolCreateGeneration === toolGeneration;
  if (!toolObject && !creating && Date.now() - lastToolCreateAttemptAt >= 1500) {
    toolGeneration += 1;
    void createMiningToolObject(toolGeneration);
  }
  if (!toolObject || Date.now() - lastToolAttachCheckAt < 500) return;
  lastToolAttachCheckAt = Date.now();
  if (!isAttachedToEntity(toolObject, player)) attachMiningTool(toolObject, player, toolVisual.attachment);
  try { toolObject.setVisible(true, false); toolObject.resetAlpha?.(); } catch {}
}

function createPickaxe(golden) {
  return createMiningTool("prop_tool_pickaxe", {
    bone: 57005,
    // Align the shaft with the right palm for the large-weapon ground swing.
    position: [0.09, 0.03, -0.02],
    rotation: [-78, 13, golden ? 36 : 28],
  });
}

function createDrill() {
  return createMiningTool("prop_tool_jackham", {
    bone: 28422,
    position: [0, 0, -0.03],
    rotation: [0, 0, 0],
  });
}

async function playMiningAnimation(tool, token) {
  const player = mp.players.local;
  try { player.clearTasksImmediately(); } catch {}
  if (!challenge || challenge.token !== token) return;
  if (tool === "drill") {
    await createDrill();
    const dict = "amb@world_human_const_drill@male@drill@base";
    if (await loadAnimDict(dict) && challenge?.token === token) {
      try { player.taskPlayAnim(dict, "base", 8, -8, -1, 49, 0, false, false, false); } catch {}
    }
    return;
  }
  await createPickaxe(tool === "golden_pickaxe");
  const dict = "melee@large_wpn@streamed_core";
  if (await loadAnimDict(dict) && challenge?.token === token) {
    try { player.taskPlayAnim(dict, "ground_attack_on_spot", 8, -8, -1, 49, 0, false, false, false); } catch {}
  }
}

function freezeForChallenge(enabled) {
  try { mp.players.local.freezePosition(Boolean(enabled)); } catch {}
  if (!enabled) {
    try { mp.players.local.clearTasksImmediately(); } catch {}
    destroyTool();
  }
}

function openChallenge(payload) {
  challenge = payload;
  challengeSubmission = null;
  global.__TWINKLE_MINING_CHALLENGE_ACTIVE__ = true;
  freezeForChallenge(true);
  playMiningAnimation(payload.tool, payload.token);
  let opened = false;
  try {
    opened = global.interfaceLock?.openInterface?.(CHALLENGE_PAGE, payload, { interactive: true, owner: CHALLENGE_OWNER }) !== false;
  } catch {}
  if (!opened) {
    global.__TWINKLE_MINING_CHALLENGE_ACTIVE__ = false;
    freezeForChallenge(false);
    challenge = null;
    mp.events.callRemote("server:mining:rock:cancel");
  } else {
    // Cancels delayed feedback retries from the previous sequence before they
    // can overwrite a freshly issued token/sequence in the active overlay.
    try {
      global.ui?.pushReliable?.(CHALLENGE_PAGE, payload, {
        globalName: "__TWINKLE_MINING_CHALLENGE__",
        retryKey: "mining:challenge",
        retryDelays: [0],
      });
    } catch {}
  }
}

function closeChallenge(reason = "cancelled") {
  challenge = null;
  challengeSubmission = null;
  global.__TWINKLE_MINING_CHALLENGE_ACTIVE__ = false;
  try { global.interfaceLock?.closePage?.(CHALLENGE_PAGE); } catch {}
  try { global.interfaceLock?.releaseInteraction?.(CHALLENGE_OWNER); } catch {}
  freezeForChallenge(false);
  if (reason && !["depleted", "cancelled", "cleanup"].includes(String(reason))) notify(reason, "error");
}

async function createWheelbarrow() {
  wheelbarrowGeneration += 1;
  const generation = wheelbarrowGeneration;
  destroyObject(wheelbarrowObject);
  wheelbarrowObject = null;
  if (!miningState?.cargo) return;
  const hash = modelHash("prop_wheelbarrow01a", "prop_wheelbarrow01a");
  if (!await loadModel(hash)) return;
  if (generation !== wheelbarrowGeneration || !miningState?.cargo) return;
  try {
    const player = mp.players.local;
    const hiddenPosition = new mp.Vector3(player.position.x, player.position.y, player.position.z - 4);
    const object = mp.objects.new(hash, hiddenPosition, { dimension: Number(player.dimension || 0), alpha: 255 });
    wheelbarrowObject = object;
    // A local RAGE object can exist before GTA assigns its native handle.
    // Attaching during that window is silently ignored and leaves the barrow
    // at its spawn position, so wait for the handle and verify the native link.
    try { object.setVisible(true, false); object.freezePosition(false); object.setCollision(false, false); } catch {}
    let attached = false;
    for (let frameIndex = 0; frameIndex < 180; frameIndex += 1) {
      if (generation !== wheelbarrowGeneration || wheelbarrowObject !== object || !entityExists(mp.objects, object) || !miningState?.cargo) return;
      if (attachWheelbarrowObject(object, player)) { attached = true; break; }
      try { await mp.game.waitAsync(0); } catch { await new Promise((resolve) => setTimeout(resolve, 0)); }
    }
    if (!attached) {
      // Keep the visible object and let the render keepalive retry. Never
      // delete a player's barrow merely because native confirmation lagged.
      try { mp.console.logError("[MINING] Wheelbarrow attachment delayed; keepalive will retry"); } catch {}
    }
    try { object.setVisible(true, false); object.resetAlpha?.(); } catch {}
    if (await loadAnimDict(CARGO_ANIM_DICT) && generation === wheelbarrowGeneration && miningState?.cargo) {
      cargoAnimationReady = true;
      try { player.taskPlayAnim(CARGO_ANIM_DICT, CARGO_ANIM_NAME, 8, -8, -1, 51, 0, false, false, false); } catch {}
    }
  } catch {}
}

function clearCargoVisuals() {
  wheelbarrowGeneration += 1;
  destroyObject(wheelbarrowObject);
  wheelbarrowObject = null;
  cargoAnimationReady = false;
  lastCargoAnimationCheckAt = 0;
  lastWheelbarrowAttachCheckAt = 0;
  destroyCargoRoute();
  try { mp.players.local.clearTasks(); } catch {}
}

function setCargo(cargo) {
  miningState = { ...(miningState || {}), cargo };
  createWheelbarrow();
  createCargoRoute();
}

function snapshotUniform() {
  const player = mp.players.local;
  return {
    components: Array.from({ length: 12 }, (_, component) => ({
      component,
      drawable: player.getDrawableVariation(component),
      texture: player.getTextureVariation(component),
      palette: player.getPaletteVariation ? player.getPaletteVariation(component) : 0,
    })),
    props: Array.from({ length: 8 }, (_, prop) => ({
      prop,
      drawable: player.getPropIndex(prop),
      texture: player.getPropTextureIndex(prop),
    })),
  };
}

function applyUniform() {
  const player = mp.players.local;
  if (!uniformSnapshot) uniformSnapshot = snapshotUniform();
  const female = (Number(player.model) >>> 0) === (Number(mp.game.joaat("mp_f_freemode_01")) >>> 0);
  const outfit = female
    ? { components: [[5, 0, 0], [7, 0, 0], [9, 0, 0], [10, 0, 0], [3, 44, 0], [4, 34, 0], [6, 27, 0], [8, 36, 1], [11, 48, 0]], hat: [0, 45, 0] }
    : { components: [[5, 0, 0], [7, 0, 0], [9, 0, 0], [10, 0, 0], [3, 41, 0], [4, 9, 7], [6, 27, 0], [8, 59, 0], [11, 56, 0]], hat: [0, 0, 0] };
  try {
    outfit.components.forEach(([component, drawable, texture]) => player.setComponentVariation(component, drawable, texture, 0));
    player.setPropIndex(outfit.hat[0], outfit.hat[1], outfit.hat[2], true);
  } catch {}
}

function restoreUniform() {
  const player = mp.players.local;
  const snapshot = uniformSnapshot;
  uniformSnapshot = null;
  if (!snapshot) return;
  try {
    snapshot.components.forEach((item) => player.setComponentVariation(item.component, item.drawable, item.texture, item.palette));
    snapshot.props.forEach((item) => {
      if (item.drawable < 0) player.clearProp(item.prop);
      else player.setPropIndex(item.prop, item.drawable, item.texture, true);
    });
  } catch {}
}

function applySafeZone(enabled) {
  safeZone = Boolean(enabled);
  try { mp.players.local.setInvincible(safeZone); } catch {}
  try { mp.players.local.setCanAttackFriendly(!safeZone, false); } catch {}
  try {
    global.uiState?.patch?.("hud", { info: { safeZone } }, {
      eventName: "twinkle:hud:update",
      globalName: "__TWINKLE_HUD_PAYLOAD__",
      retryKey: "hud:mining-safe-zone",
    });
  } catch {}
}

function nearestRock() {
  const player = mp.players.local;
  let nearest = null;
  let nearestDistance = ROCK_DISTANCE;
  for (const rock of rocks.values()) {
    const current = vdist(player.position, rock.position);
    if (current <= nearestDistance) {
      nearest = rock;
      nearestDistance = current;
    }
  }
  return nearest;
}

function drawText(text, x, y, scale, color = [255, 255, 255, 235]) {
  mp.game.graphics.drawText(String(text), [x, y], { font: 4, color, scale: [scale, scale], outline: true, centre: true });
}

function drawWorldText(text, position, scale = 0.32, color = [255, 255, 255, 235]) {
  try {
    const screen = mp.game.graphics.world3dToScreen2d(position.x, position.y, position.z);
    if (screen) drawText(text, screen.x, screen.y, scale, color);
  } catch {}
}

function drawRock(rock) {
  const color = Array.isArray(rock.color) ? rock.color : [180, 180, 180];
  if (gpsActive()) {
    mp.game.graphics.drawMarker(0, rock.position.x, rock.position.y, rock.position.z + 1.45, 0, 0, 0, 0, 0, 0, 0.28, 0.28, 0.28, color[0], color[1], color[2], 210, false, true, 2, true, null, null, false);
  }
}

function drawHaulStage() {
  if (!haulStage) return;
  const remaining = Math.max(0, haulStage.endsAt - Date.now());
  const progress = Math.max(0, Math.min(1, 1 - remaining / Math.max(1, haulStage.durationMs)));
  mp.game.graphics.drawRect(0.5, 0.5, 0.38, 0.2, 7, 13, 20, 230);
  drawText(haulStage.title, 0.5, 0.46, 0.52);
  drawText(`${Math.ceil(remaining / 1000)} сек.`, 0.5, 0.505, 0.38, [100, 224, 255, 245]);
  mp.game.graphics.drawRect(0.5, 0.56, 0.28, 0.018, 0, 0, 0, 190);
  mp.game.graphics.drawRect(0.36 + progress * 0.14, 0.56, 0.28 * progress, 0.018, 67, 210, 160, 235);
}

function unfreezeHaulVehicle() {
  const vehicle = haulFrozenVehicle;
  haulFrozenVehicle = null;
  try { if (vehicle && entityExists(mp.vehicles, vehicle)) vehicle.freezePosition(false); } catch {}
}

(global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback)))(E_KEY, false, () => {
  if (!miningState || mp.gui.cursor.visible || challenge || haulStage) return;
  const player = mp.players.local;
  // A tractor can be well ahead of its trailer. The server validates the exact
  // load/unload alignment against the trailer, so the client only needs a wide
  // enough interaction envelope to let the driver submit the request.
  if (player.vehicle && haulRoute && vdist(player.vehicle.position, haulRoute.point) <= Number(haulRoute.radius || 6) + 25) {
    mp.events.callRemote("server:mining:haul:stage");
    return;
  }
  if (miningState?.cargo && !player.vehicle && vdist(player.position, SALE_POINT) <= 3.5) {
    mp.events.callRemote("server:mining:cargo:sell");
    return;
  }
  if (!player.vehicle && !miningState?.cargo && !miningState?.haulCargo) {
    const rock = nearestRock();
    if (rock) mp.events.callRemote("server:mining:rock:begin", JSON.stringify({ rockId: rock.id }));
  }
});

function sameChallengeStep(submission, token, index) {
  return Boolean(submission && String(submission.token) === String(token) && Number(submission.index) === Number(index));
}

function sendChallengeInput(payload, source) {
  if (!challenge || !payload || String(payload.token || "") !== String(challenge.token || "")) return false;
  const index = Number(payload.index);
  if (!Number.isInteger(index) || index !== Number(challenge.index || 0)) return false;
  if (sameChallengeStep(challengeSubmission, payload.token, index)) {
    // Browser retries reuse the same id and must reach the idempotent server
    // handler. A fallback and browser event for one physical press must not.
    if (source !== "browser" || challengeSubmission.source !== "browser"
      || String(challengeSubmission.inputId) !== String(payload.inputId || "")) return false;
  } else {
    challengeSubmission = { token: payload.token, index, inputId: String(payload.inputId || ""), source };
  }
  mp.events.callRemote("server:mining:rock:input", JSON.stringify(payload));
  return true;
}

function queueChallengeKeyboardFallback(key) {
  const current = challenge;
  if (!current?.token) return;
  const token = String(current.token);
  const index = Number(current.index || 0);
  setTimeout(() => {
    if (!challenge || String(challenge.token || "") !== token || Number(challenge.index || 0) !== index) return;
    if (sameChallengeStep(challengeSubmission, token, index)) return;
    sendChallengeInput({
      token,
      index,
      key,
      inputId: `${token}:${index}:client:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    }, "client");
  }, 45);
}

// RAGE can fail to deliver alphabetic keydown events to embedded CEF on some
// keyboard layouts. The original, unguarded binder is reserved here only for
// the active QTE; every other game bind remains blocked by interfaceLock.
const rawChallengeBind = global.__TWINKLE_GUARDED_KEY_BIND__;
if (typeof rawChallengeBind === "function") {
  for (let keyCode = 0x41; keyCode <= 0x5A; keyCode += 1) {
    const label = String.fromCharCode(keyCode);
    rawChallengeBind(keyCode, false, () => queueChallengeKeyboardFallback(label));
  }
  for (let keyCode = 0x30; keyCode <= 0x39; keyCode += 1) {
    const label = String.fromCharCode(keyCode);
    rawChallengeBind(keyCode, false, () => queueChallengeKeyboardFallback(label));
  }
  rawChallengeBind(0x20, false, () => queueChallengeKeyboardFallback("SPACE"));
  rawChallengeBind(0x10, false, () => queueChallengeKeyboardFallback("SHIFT"));
}

mp.events.add("render", () => {
  const player = mp.players.local;
  if (gpsActive() !== gpsWasActive) refreshGpsBlips();
  const computedSafe = insideSafeZone(player.position);
  if (computedSafe !== safeZone) applySafeZone(computedSafe);
  if (safeZone) {
    [24, 25, 37, 45, 47, 58, 69, 70, 91, 92, 140, 141, 142, 257, 263, 264, 331].forEach((control) => mp.game.controls.disableControlAction(0, control, true));
  }
  if (challenge) {
    keepMiningToolAlive();
    try {
      mp.game.controls.disableAllControlActions(0);
      mp.game.controls.disableAllControlActions(1);
      mp.game.controls.disableAllControlActions(2);
    } catch {}
  }
  for (const rock of rocks.values()) drawRock(rock);
  const saleDistance = vdist(player.position, SALE_POINT);
  if (miningState && saleDistance <= 45) {
    const totalKg = Math.max(0, Number(miningState.stock?.totalKg || 0));
    drawWorldText(
      `Общий склад породы: ${totalKg.toFixed(1)} кг`,
      { x: SALE_POINT.x, y: SALE_POINT.y, z: SALE_POINT.z + 1.25 },
      0.31,
      [118, 238, 168, 245]
    );
  }
  const nearest = miningState && !challenge && !player.vehicle && !miningState.cargo ? nearestRock() : null;
  if (nearest) {
    drawText(`[E] Добывать: ${nearest.resourceName}`, 0.5, 0.82, 0.38, [nearest.color?.[0] || 255, nearest.color?.[1] || 255, nearest.color?.[2] || 255, 245]);
    drawText(`HP ${Math.max(0, nearest.hp)} / ${nearest.maxHp} · участников ${nearest.participants || 0}`, 0.5, 0.855, 0.29);
  }
  if (miningState?.cargo) {
    if (wheelbarrowObject && Date.now() - lastWheelbarrowAttachCheckAt >= 500) {
      lastWheelbarrowAttachCheckAt = Date.now();
      if (!isAttachedToEntity(wheelbarrowObject, player)) attachWheelbarrowObject(wheelbarrowObject, player);
      try { wheelbarrowObject.setVisible(true, false); wheelbarrowObject.resetAlpha?.(); } catch {}
    }
    if (cargoAnimationReady && Date.now() - lastCargoAnimationCheckAt >= 1500) {
      lastCargoAnimationCheckAt = Date.now();
      let playing = false;
      try { playing = player.isPlayingAnim(CARGO_ANIM_DICT, CARGO_ANIM_NAME, 3); } catch {}
      if (!playing) try { player.taskPlayAnim(CARGO_ANIM_DICT, CARGO_ANIM_NAME, 8, -8, -1, 51, 0, false, false, false); } catch {}
    }
    drawText(`${miningState.cargo.resourceName}: ${Number(miningState.cargo.kg || 0).toFixed(2)} кг · не прыгайте`, 0.5, 0.9, 0.33, [255, 205, 82, 240]);
    let jumpPressed = false;
    try { jumpPressed = mp.game.controls.isControlJustPressed(0, 22); } catch {}
    if (jumpPressed && Date.now() - spillSentAt > 1800) {
      spillSentAt = Date.now();
      mp.events.callRemote("server:mining:cargo:spill");
    }
  }
  if (haulRoute && player.vehicle && vdist(player.vehicle.position, haulRoute.point) <= Number(haulRoute.radius || 6) + 25) {
    drawText(`[E] ${haulRoute.phase === "load" ? "Загрузить породу" : "Разгрузить породу"}`, 0.5, 0.82, 0.38, [100, 235, 165, 245]);
  }
  drawHaulStage();
});

mp.events.add("client:mining:rocks:set", (raw) => setRocks(parseJson(raw, [])));
mp.events.add("client:mining:rock:update", (raw) => updateRock(parseJson(raw, {})));
mp.events.add("client:mining:rock:remove", removeRock);
mp.events.add("client:mining:state", (raw) => {
  const previousCargoId = miningState?.cargo?.id;
  miningState = parseJson(raw, null);
  miningStateReceivedAt = Date.now();
  refreshGpsBlips();
  if (miningState?.cargo && miningState.cargo.id !== previousCargoId) setCargo(miningState.cargo);
  if (!miningState?.cargo && previousCargoId) clearCargoVisuals();
});
mp.events.add("tablet:openAppFromBrowser", (appId) => {
  if (String(appId || "") !== "gps") return;
  const hasMiningGps = Number(miningState?.entitlements?.gps?.remainingMs || 0) > 0;
  if (!hasMiningGps) return;
  mp.events.callRemote("server:mining:gps:toggle");
});
mp.events.add("client:mining:uniform", (enabled) => enabled ? applyUniform() : restoreUniform());
mp.events.add("client:mining:safeZone", applySafeZone);
mp.events.add("client:mining:challenge:start", (raw) => openChallenge(parseJson(raw, {})));
mp.events.add("client:mining:challenge:feedback", (raw) => patchChallenge(parseJson(raw, {})));
mp.events.add("client:mining:challenge:stop", closeChallenge);
mp.events.add("client:mining:cargo:set", (raw) => setCargo(parseJson(raw, null)));
mp.events.add("client:mining:cargo:clear", () => {
  if (miningState) miningState.cargo = null;
  clearCargoVisuals();
});
mp.events.add("client:mining:haul:route", (raw) => setHaulRoute(parseJson(raw, null)));
mp.events.add("client:mining:haul:clear", destroyHaulRoute);
mp.events.add("client:mining:haul:stage:start", (raw) => {
  haulStage = parseJson(raw, null);
  if (haulStage) haulStage.endsAt = Date.now() + Number(haulStage.durationMs || 0);
  unfreezeHaulVehicle();
  haulFrozenVehicle = mp.players.local.vehicle || null;
  try { haulFrozenVehicle?.freezePosition(true); } catch {}
});
mp.events.add("client:mining:haul:stage:complete", () => {
  haulStage = null;
  unfreezeHaulVehicle();
});
mp.events.add("client:mining:haul:stage:cancel", (reason) => {
  haulStage = null;
  unfreezeHaulVehicle();
  if (reason) notify(reason, "error");
});

mp.events.add("client:mining:shop:open", (raw) => {
  try { global.interfaceLock?.openPage?.(SHOP_PAGE, null, parseJson(raw, {})); } catch {}
});
mp.events.add("client:mining:shop:update", (raw) => {
  try {
    global.uiState?.patch?.(SHOP_PAGE, parseJson(raw, {}), {
      globalName: "__TWINKLE_MINING_EQUIPMENT__",
      retryKey: "mining:equipment",
    });
  } catch {}
});
mp.events.add("miningEquipment:purchaseFromBrowser", (raw) => mp.events.callRemote("server:mining:shop:purchase", String(raw || "{}")));
mp.events.add("miningEquipment:closeFromBrowser", () => {
  try { global.interfaceLock?.closePage?.(SHOP_PAGE); } catch {}
});
mp.events.add("miningChallenge:inputFromBrowser", (raw) => {
  const payload = parseJson(raw, null);
  if (payload) sendChallengeInput(payload, "browser");
});
mp.events.add("miningChallenge:cancelFromBrowser", () => {
  mp.events.callRemote("server:mining:rock:cancel");
  closeChallenge("cancelled");
});

mp.events.add("client:mining:cleanup", () => {
  haulStage = null;
  unfreezeHaulVehicle();
  closeChallenge("cleanup");
  clearCargoVisuals();
  destroyHaulRoute();
  setRocks([]);
  destroyTool();
  applySafeZone(false);
  try { global.interfaceLock?.closePage?.(SHOP_PAGE); } catch {}
  restoreUniform();
  miningState = null;
  miningStateReceivedAt = 0;
  refreshGpsBlips();
});

mp.events.add("interface:lock:closing", (page) => {
  if (page === CHALLENGE_PAGE || page === "*") {
    global.__TWINKLE_MINING_CHALLENGE_ACTIVE__ = false;
    if (challenge) {
      challenge = null;
      freezeForChallenge(false);
      try { mp.events.callRemote("server:mining:rock:cancel"); } catch {}
    }
    try { global.interfaceLock?.releaseInteraction?.(CHALLENGE_OWNER); } catch {}
  }
});

try { mp.console.logInfo("[MINING] Client loaded"); } catch {}
