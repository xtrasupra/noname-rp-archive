"use strict";

const E_KEY = 0x45;
const SHOP_PAGE = "forestryEquipment";
const CHALLENGE_PAGE = "forestryChallenge";
const CHALLENGE_OWNER = "forestryChallenge";
const UNLOAD_POINT = Object.freeze({ x: -556.339, y: 5371.781, z: 70.24 });
const SAFE_ZONE = Object.freeze({
  minX: -880, maxX: -390, minY: 5070, maxY: 5860, minZ: 20, maxZ: 150,
});
const TREE_DISTANCE = 2.8;
const TREE_MARKER_DISTANCE = 85;
// GTA has a finite blip pool. Creating all 298 tree blips breaks the pause-map
// waypoint. Keep only the nearest markers while every tree remains interactable.
const MAX_TREE_BLIPS = 36;
const LOG_ANIM_DICT = "anim@heists@box_carry@";
const LOG_ANIM_NAME = "idle";
const LOG_ATTACH = Object.freeze({ bone: 28422, position: [0.01, -0.16, -0.15], rotation: [5, 2, 90] });

const trees = new Map();
const treeBlips = new Map();
const remoteHeldProps = new Map();
let forestryState = null;
let challenge = null;
let challengeSubmission = null;
let toolObject = null;
let toolVisual = null;
let toolGeneration = 0;
let logObject = null;
let logGeneration = 0;
let cargoRouteBlip = null;
let cargoCheckpoint = null;
let haulRoute = null;
let haulBlip = null;
let haulCheckpoint = null;
let haulStage = null;
let haulFrozenVehicle = null;
let safeZone = false;
let uniformSnapshot = null;
let spillSentAt = 0;
let lastToolCheckAt = 0;
let lastLogCheckAt = 0;
let lastLogAnimCheckAt = 0;
let lastTreeBlipRefreshAt = 0;
let lastTreeBlipPosition = null;

function parseJson(raw, fallback = {}) {
  try { return !raw ? fallback : typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return fallback; }
}

function notify(message, variant = "info") {
  try { global.interfaceLock?.notify?.(String(message), variant); } catch {}
}

function vdist(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return mp.game.system.vdist(Number(left.x), Number(left.y), Number(left.z), Number(right.x), Number(right.y), Number(right.z));
}

function exists(collection, entity) {
  if (!entity) return false;
  try { return typeof collection.exists !== "function" || collection.exists(entity); } catch { return false; }
}

function destroyObject(object) {
  try { if (exists(mp.objects, object)) object.destroy(); } catch {}
}

function destroyBlip(blip) {
  try { if (blip && mp.blips.exists(blip)) blip.destroy(); } catch {}
}

// Remove the radius blip created by the previous client revision during a hot reload.
try {
  const legacySafeZoneBlip = global.__TWINKLE_FORESTRY_SAFE_ZONE_BLIP__;
  if (legacySafeZoneBlip && mp.blips.exists(legacySafeZoneBlip)) legacySafeZoneBlip.destroy();
  global.__TWINKLE_FORESTRY_SAFE_ZONE_BLIP__ = null;
} catch {}

function modelHash(name, fallback = name) {
  try {
    const hash = mp.game.joaat(String(name));
    if (mp.game.streaming.isModelInCdimage(hash) && mp.game.streaming.isModelValid(hash)) return hash;
  } catch {}
  return mp.game.joaat(String(fallback));
}

async function loadModel(hash, timeoutMs = 5000) {
  try {
    mp.game.streaming.requestModel(hash);
    const startedAt = Date.now();
    while (!mp.game.streaming.hasModelLoaded(hash)) {
      if (Date.now() - startedAt > timeoutMs) return false;
      await new Promise((resolve) => setTimeout(resolve, 40));
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
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return true;
  } catch { return false; }
}

function isAttached(object, target) {
  try { return Boolean(object?.handle && target?.handle && mp.game.invoke("0xEFBE71898A993728", object.handle, target.handle)); }
  catch { return false; }
}

function attach(object, player, attachment) {
  if (!object?.handle || !player?.handle) return false;
  try {
    object.freezePosition(false);
    object.setCollision(false, false);
    object.attachTo(
      player.handle,
      player.getBoneIndex(attachment.bone),
      ...attachment.position,
      ...attachment.rotation,
      false, false, false, false, 2, true,
    );
    object.setVisible(true, false);
    return isAttached(object, player);
  } catch { return false; }
}

function isRemotePlayer(entity) {
  return Boolean(entity && entity !== mp.players.local && exists(mp.players, entity));
}

function destroyRemoteHeldProp(player) {
  const entry = remoteHeldProps.get(player);
  if (!entry) return;
  entry.generation += 1;
  destroyObject(entry.object);
  remoteHeldProps.delete(player);
}

async function createRemoteHeldProp(player, descriptor, entry) {
  const hash = modelHash(descriptor.model, descriptor.model);
  if (!await loadModel(hash) || remoteHeldProps.get(player) !== entry || !isRemotePlayer(player)) return;
  try {
    const object = mp.objects.new(hash, new mp.Vector3(player.position.x, player.position.y, player.position.z), {
      dimension: Number(player.dimension || 0), alpha: 255,
    });
    entry.object = object;
    for (let frame = 0; frame < 120 && remoteHeldProps.get(player) === entry; frame += 1) {
      if (attach(object, player, descriptor)) break;
      try { await mp.game.waitAsync(16); } catch { await new Promise((resolve) => setTimeout(resolve, 16)); }
    }
  } catch {}
  finally { try { mp.game.streaming.setModelAsNoLongerNeeded(hash); } catch {} }
}

function syncRemoteHeldProp(player, raw) {
  if (!isRemotePlayer(player)) return;
  destroyRemoteHeldProp(player);
  const descriptor = parseJson(raw, null);
  if (!descriptor?.model || !Number.isFinite(Number(descriptor.bone))
    || !Array.isArray(descriptor.position) || !Array.isArray(descriptor.rotation)) return;
  const entry = { player, descriptor, object: null, generation: 1, lastAttachCheckAt: 0 };
  remoteHeldProps.set(player, entry);
  void createRemoteHeldProp(player, descriptor, entry);
}

function maintainRemoteHeldProps() {
  const now = Date.now();
  for (const entry of remoteHeldProps.values()) {
    if (!isRemotePlayer(entry.player)) {
      destroyRemoteHeldProp(entry.player);
      continue;
    }
    if (entry.object && now - entry.lastAttachCheckAt >= 750) {
      entry.lastAttachCheckAt = now;
      if (!isAttached(entry.object, entry.player)) attach(entry.object, entry.player, entry.descriptor);
    }
  }
}

function createTreeBlip(tree) {
  const old = treeBlips.get(tree.id);
  destroyBlip(old);
  try {
    const blip = mp.blips.new(1, new mp.Vector3(tree.position.x, tree.position.y, tree.position.z), {
      name: tree.locked ? `Занято: ${tree.resourceName}` : `Дерево: ${tree.resourceName}`,
      color: tree.locked ? 40 : 25,
      scale: 0.47,
      shortRange: true,
      dimension: 0,
    });
    treeBlips.set(tree.id, blip);
  } catch {}
}

function refreshTreeBlips(force = false) {
  const player = mp.players.local;
  const position = player?.position;
  if (!position) return;
  const now = Date.now();
  const moved = !lastTreeBlipPosition || vdist(position, lastTreeBlipPosition) >= 25;
  if (!force && !moved && now - lastTreeBlipRefreshAt < 2000) return;
  lastTreeBlipRefreshAt = now;
  lastTreeBlipPosition = { x: Number(position.x), y: Number(position.y), z: Number(position.z) };

  const visibleIds = new Set([...trees.values()]
    .sort((left, right) => vdist(position, left.position) - vdist(position, right.position))
    .slice(0, MAX_TREE_BLIPS)
    .map((tree) => tree.id));

  for (const [id, blip] of treeBlips) {
    if (visibleIds.has(id)) continue;
    destroyBlip(blip);
    treeBlips.delete(id);
  }
  for (const id of visibleIds) {
    if (!treeBlips.has(id)) createTreeBlip(trees.get(id));
  }
}

function updateTree(raw) {
  const tree = { ...raw, id: String(raw?.id || "") };
  if (!tree.id || !tree.position) return;
  trees.set(tree.id, tree);
}

function removeTree(id, refresh = true) {
  const key = String(id || "");
  trees.delete(key);
  destroyBlip(treeBlips.get(key));
  treeBlips.delete(key);
  if (refresh) refreshTreeBlips(true);
}

function setTrees(payload) {
  const incoming = Array.isArray(payload) ? payload : [];
  const next = new Set(incoming.map((tree) => String(tree.id)));
  for (const id of [...trees.keys()]) if (!next.has(id)) removeTree(id, false);
  incoming.forEach(updateTree);
  refreshTreeBlips(true);
}

function destroyCargoRoute() {
  try { cargoRouteBlip?.setRoute(false); } catch {}
  destroyBlip(cargoRouteBlip);
  try { if (exists(mp.checkpoints, cargoCheckpoint)) cargoCheckpoint.destroy(); } catch {}
  cargoRouteBlip = null;
  cargoCheckpoint = null;
}

function createCargoRoute() {
  destroyCargoRoute();
  if (!forestryState?.cargo) return;
  try {
    const point = new mp.Vector3(UNLOAD_POINT.x, UNLOAD_POINT.y, UNLOAD_POINT.z);
    cargoRouteBlip = mp.blips.new(1, point, { name: "Разгрузка брёвен", color: 2, scale: 0.82, shortRange: false, dimension: 0 });
    cargoRouteBlip.setRoute(true);
    cargoRouteBlip.setRouteColour(2);
    cargoCheckpoint = mp.checkpoints.new(4, new mp.Vector3(point.x, point.y, point.z - 1), 3, {
      direction: new mp.Vector3(0, 0, 0), color: [73, 225, 137, 155], visible: true, dimension: 0,
    });
  } catch {}
}

function destroyHaulRoute() {
  try { haulBlip?.setRoute(false); } catch {}
  destroyBlip(haulBlip);
  try { if (exists(mp.checkpoints, haulCheckpoint)) haulCheckpoint.destroy(); } catch {}
  haulRoute = null;
  haulBlip = null;
  haulCheckpoint = null;
}

function setHaulRoute(payload) {
  destroyHaulRoute();
  if (!payload?.point) return;
  haulRoute = payload;
  const point = new mp.Vector3(Number(payload.point.x), Number(payload.point.y), Number(payload.point.z));
  const loading = payload.phase === "load";
  try {
    haulBlip = mp.blips.new(1, point, {
      name: loading ? "Погрузка древесины" : "Склад получателя",
      color: loading ? 5 : 2, scale: 0.9, shortRange: false, dimension: 0,
    });
    haulBlip.setRoute(true);
    haulBlip.setRouteColour(loading ? 5 : 2);
    haulCheckpoint = mp.checkpoints.new(4, new mp.Vector3(point.x, point.y, point.z - 0.85), Number(payload.radius || 6), {
      direction: new mp.Vector3(0, 0, 0), color: loading ? [236, 174, 63, 150] : [73, 225, 137, 150], visible: true, dimension: 0,
    });
  } catch {}
}

function destroyTool() {
  toolGeneration += 1;
  destroyObject(toolObject);
  toolObject = null;
  toolVisual = null;
}

async function createTool(tool, token) {
  destroyTool();
  const generation = toolGeneration;
  const golden = tool === "golden_axe";
  const visual = golden
    ? { model: "prop_tool_fireaxe", attachment: { bone: 57005, position: [0.11, 0.03, -0.02], rotation: [-79, 11, 31] } }
    : { model: "prop_tool_consaw", attachment: { bone: 57005, position: [0.09, 0.01, -0.02], rotation: [-93, 7, 24] } };
  toolVisual = { ...visual, token };
  const hash = modelHash(visual.model, visual.model);
  if (!await loadModel(hash) || generation !== toolGeneration || challenge?.token !== token) return;
  try {
    const player = mp.players.local;
    toolObject = mp.objects.new(hash, new mp.Vector3(player.position.x, player.position.y, player.position.z), { dimension: Number(player.dimension || 0), alpha: 255 });
    for (let frame = 0; frame < 120 && generation === toolGeneration && challenge?.token === token; frame += 1) {
      if (attach(toolObject, player, visual.attachment)) break;
      try { await mp.game.waitAsync(16); } catch { await new Promise((resolve) => setTimeout(resolve, 16)); }
    }
  } catch {}
  try { mp.game.streaming.setModelAsNoLongerNeeded(hash); } catch {}
}

async function playCutAnimation(tool, token) {
  await createTool(tool, token);
  if (challenge?.token !== token) return;
  const golden = tool === "golden_axe";
  const dict = golden ? "melee@large_wpn@streamed_core" : "amb@world_human_const_drill@male@drill@base";
  const name = golden ? "ground_attack_on_spot" : "base";
  if (await loadAnimDict(dict) && challenge?.token === token) {
    try { mp.players.local.taskPlayAnim(dict, name, 8, -8, -1, 49, 0, false, false, false); } catch {}
  }
}

function freezeChallenge(enabled) {
  try { mp.players.local.freezePosition(Boolean(enabled)); } catch {}
  if (!enabled) {
    try { mp.players.local.clearTasksImmediately(); } catch {}
    destroyTool();
  }
}

function openChallenge(payload) {
  challenge = payload;
  challengeSubmission = null;
  global.__TWINKLE_FORESTRY_CHALLENGE_ACTIVE__ = true;
  freezeChallenge(true);
  void playCutAnimation(payload.tool, payload.token);
  let opened = false;
  try { opened = global.interfaceLock?.openInterface?.(CHALLENGE_PAGE, payload, { interactive: true, owner: CHALLENGE_OWNER }) !== false; } catch {}
  if (!opened) {
    challenge = null;
    global.__TWINKLE_FORESTRY_CHALLENGE_ACTIVE__ = false;
    freezeChallenge(false);
    mp.events.callRemote("server:forestry:tree:cancel");
  }
}

function patchChallenge(payload) {
  if (!challenge || String(payload?.token || "") !== String(challenge.token || "")) return;
  challenge = { ...challenge, ...payload };
  if (challengeSubmission && (payload.resync || String(payload.ackInputId || "") === challengeSubmission.inputId || Number(payload.round) !== challengeSubmission.round)) {
    challengeSubmission = null;
  }
  try {
    global.uiState?.patch?.(CHALLENGE_PAGE, payload, {
      globalName: "__TWINKLE_FORESTRY_CHALLENGE__", retryKey: "forestry:challenge", retryDelays: [0],
    });
  } catch {}
}

function closeChallenge(reason = "cancelled") {
  challenge = null;
  challengeSubmission = null;
  global.__TWINKLE_FORESTRY_CHALLENGE_ACTIVE__ = false;
  try { global.interfaceLock?.closePage?.(CHALLENGE_PAGE); } catch {}
  try { global.interfaceLock?.releaseInteraction?.(CHALLENGE_OWNER); } catch {}
  freezeChallenge(false);
  if (reason && !["completed", "failed", "cancelled", "cleanup"].includes(String(reason))) notify(reason, "error");
}

function sendChallengeInput(payload, source) {
  if (!challenge || String(payload?.token || "") !== String(challenge.token || "")) return false;
  const round = Number(payload.round);
  if (!Number.isInteger(round) || round !== Number(challenge.round || 0)) return false;
  if (challengeSubmission) {
    const retry = source === "browser" && challengeSubmission.source === "browser" && challengeSubmission.inputId === String(payload.inputId || "");
    if (!retry) return false;
  } else {
    challengeSubmission = { round, inputId: String(payload.inputId || ""), source };
  }
  mp.events.callRemote("server:forestry:tree:input", JSON.stringify(payload));
  return true;
}

function destroyLogs() {
  logGeneration += 1;
  destroyObject(logObject);
  logObject = null;
  lastLogCheckAt = 0;
  try { mp.players.local.clearTasks(); } catch {}
  destroyCargoRoute();
}

async function createLogs() {
  const generation = ++logGeneration;
  destroyObject(logObject);
  logObject = null;
  if (!forestryState?.cargo) return;
  const hash = modelHash("prop_log_01", "prop_log_01");
  if (!await loadModel(hash) || generation !== logGeneration || !forestryState?.cargo) return;
  try {
    const player = mp.players.local;
    logObject = mp.objects.new(hash, new mp.Vector3(player.position.x, player.position.y, player.position.z), { dimension: Number(player.dimension || 0), alpha: 255 });
    for (let frame = 0; frame < 120 && generation === logGeneration && forestryState?.cargo; frame += 1) {
      if (attach(logObject, player, LOG_ATTACH)) break;
      try { await mp.game.waitAsync(16); } catch { await new Promise((resolve) => setTimeout(resolve, 16)); }
    }
    if (await loadAnimDict(LOG_ANIM_DICT) && generation === logGeneration && forestryState?.cargo) {
      player.taskPlayAnim(LOG_ANIM_DICT, LOG_ANIM_NAME, 8, -8, -1, 49, 0, false, false, false);
    }
  } catch {}
  try { mp.game.streaming.setModelAsNoLongerNeeded(hash); } catch {}
}

function setCargo(cargo) {
  forestryState = { ...(forestryState || {}), cargo };
  void createLogs();
  createCargoRoute();
}

function snapshotUniform() {
  const player = mp.players.local;
  return {
    components: Array.from({ length: 12 }, (_, component) => ({ component, drawable: player.getDrawableVariation(component), texture: player.getTextureVariation(component), palette: player.getPaletteVariation?.(component) || 0 })),
    props: Array.from({ length: 8 }, (_, prop) => ({ prop, drawable: player.getPropIndex(prop), texture: player.getPropTextureIndex(prop) })),
  };
}

function applyUniform() {
  const player = mp.players.local;
  if (!uniformSnapshot) uniformSnapshot = snapshotUniform();
  const female = (Number(player.model) >>> 0) === (Number(mp.game.joaat("mp_f_freemode_01")) >>> 0);
  const outfit = female
    ? { clothes: [[5, 0, 0], [7, 0, 0], [9, 0, 0], [10, 0, 0], [3, 44, 0], [4, 34, 0], [6, 27, 0], [8, 36, 1], [11, 48, 0]], hat: [0, 45, 0] }
    : { clothes: [[5, 0, 0], [7, 0, 0], [9, 0, 0], [10, 0, 0], [3, 41, 0], [4, 9, 7], [6, 27, 0], [8, 59, 0], [11, 56, 0]], hat: [0, 0, 0] };
  try {
    outfit.clothes.forEach(([component, drawable, texture]) => player.setComponentVariation(component, drawable, texture, 0));
    player.setPropIndex(...outfit.hat, true);
  } catch {}
}

function restoreUniform() {
  const snapshot = uniformSnapshot;
  uniformSnapshot = null;
  if (!snapshot) return;
  try {
    snapshot.components.forEach((item) => mp.players.local.setComponentVariation(item.component, item.drawable, item.texture, item.palette));
    snapshot.props.forEach((item) => item.drawable < 0 ? mp.players.local.clearProp(item.prop) : mp.players.local.setPropIndex(item.prop, item.drawable, item.texture, true));
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
      retryKey: "hud:forestry-safe-zone",
    });
  } catch {}
}

function nearestTree() {
  let nearest = null;
  let nearestDistance = TREE_DISTANCE;
  for (const tree of trees.values()) {
    const current = vdist(mp.players.local.position, tree.position);
    if (!tree.locked && current <= nearestDistance) { nearest = tree; nearestDistance = current; }
  }
  return nearest;
}

function drawText(text, x, y, scale, color = [255, 255, 255, 235]) {
  mp.game.graphics.drawText(String(text), [x, y], { font: 4, color, scale: [scale, scale], outline: true, centre: true });
}

function drawWorldText(text, position, scale = 0.31, color = [255, 255, 255, 235]) {
  try {
    const screen = mp.game.graphics.world3dToScreen2d(position.x, position.y, position.z);
    if (screen) drawText(text, screen.x, screen.y, scale, color);
  } catch {}
}

function drawTreeMarker(tree, playerPosition) {
  const currentDistance = vdist(playerPosition, tree.position);
  if (currentDistance > TREE_MARKER_DISTANCE) return;
  const color = Array.isArray(tree.color) ? tree.color : [82, 210, 116];
  try {
    mp.game.graphics.drawMarker(
      1,
      Number(tree.position.x), Number(tree.position.y), Number(tree.position.z) - 1.05,
      0, 0, 0, 0, 0, 0,
      1.25, 1.25, 0.32,
      color[0], color[1], color[2], currentDistance <= TREE_DISTANCE + 1 ? 185 : 105,
      false, false, 2, false, null, null, false,
    );
  } catch {}
  if (currentDistance <= TREE_DISTANCE + 1.2) {
    drawWorldText(
      `[E] Рубить дерево · ${tree.resourceName}`,
      { x: tree.position.x, y: tree.position.y, z: Number(tree.position.z) + 1.65 },
      0.32,
      [125, 245, 157, 245],
    );
  }
}

function drawHaulStage() {
  if (!haulStage) return;
  const remaining = Math.max(0, haulStage.endsAt - Date.now());
  const progress = Math.max(0, Math.min(1, 1 - remaining / Math.max(1, haulStage.durationMs)));
  mp.game.graphics.drawRect(0.5, 0.5, 0.38, 0.18, 7, 18, 13, 230);
  drawText(haulStage.title, 0.5, 0.47, 0.5);
  drawText(`${Math.ceil(remaining / 1000)} сек.`, 0.5, 0.515, 0.36, [111, 236, 165, 245]);
  mp.game.graphics.drawRect(0.5, 0.56, 0.28, 0.016, 0, 0, 0, 190);
  mp.game.graphics.drawRect(0.36 + progress * 0.14, 0.56, 0.28 * progress, 0.016, 67, 210, 140, 235);
}

function unfreezeHaulVehicle() {
  try { if (haulFrozenVehicle && exists(mp.vehicles, haulFrozenVehicle)) haulFrozenVehicle.freezePosition(false); } catch {}
  haulFrozenVehicle = null;
}

(global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback)))(E_KEY, false, () => {
  if (!forestryState || mp.gui.cursor.visible || challenge || haulStage) return;
  const player = mp.players.local;
  if (player.vehicle && haulRoute && vdist(player.vehicle.position, haulRoute.point) <= Number(haulRoute.radius || 6) + 25) {
    mp.events.callRemote("server:forestry:haul:stage");
    return;
  }
  if (forestryState.cargo && !player.vehicle && vdist(player.position, UNLOAD_POINT) <= 3.5) {
    mp.events.callRemote("server:forestry:cargo:sell");
    return;
  }
  if (!player.vehicle && !forestryState.cargo && !forestryState.haulCargo) {
    const tree = nearestTree();
    if (tree) mp.events.callRemote("server:forestry:tree:begin", JSON.stringify({ treeId: tree.id }));
  }
});

mp.events.add("render", () => {
  const player = mp.players.local;
  refreshTreeBlips();
  maintainRemoteHeldProps();
  if (forestryState && !challenge && !forestryState.cargo) {
    for (const tree of trees.values()) drawTreeMarker(tree, player.position);
  }
  const computedSafe = Number(player.dimension || 0) === 0
    && player.position.x >= SAFE_ZONE.minX && player.position.x <= SAFE_ZONE.maxX
    && player.position.y >= SAFE_ZONE.minY && player.position.y <= SAFE_ZONE.maxY
    && player.position.z >= SAFE_ZONE.minZ && player.position.z <= SAFE_ZONE.maxZ;
  if (computedSafe !== safeZone) applySafeZone(computedSafe);
  if (safeZone) [24, 25, 37, 45, 47, 58, 69, 70, 91, 92, 140, 141, 142, 257, 263, 264, 331].forEach((control) => mp.game.controls.disableControlAction(0, control, true));
  if (challenge) {
    try { mp.game.controls.disableAllControlActions(0); mp.game.controls.disableAllControlActions(1); mp.game.controls.disableAllControlActions(2); } catch {}
    if (toolObject && Date.now() - lastToolCheckAt > 500) {
      lastToolCheckAt = Date.now();
      if (!isAttached(toolObject, player) && toolVisual) attach(toolObject, player, toolVisual.attachment);
    }
  }
  const nearby = forestryState && !challenge && !player.vehicle && !forestryState.cargo ? nearestTree() : null;
  if (nearby) {
    drawText(`[E] Рубить дерево · ${nearby.resourceName}`, 0.5, 0.82, 0.38, [115, 236, 150, 245]);
  }
  if (forestryState?.cargo) {
    if (logObject && Date.now() - lastLogCheckAt > 500) {
      lastLogCheckAt = Date.now();
      if (!isAttached(logObject, player)) attach(logObject, player, LOG_ATTACH);
    }
    if (Date.now() - lastLogAnimCheckAt > 1400) {
      lastLogAnimCheckAt = Date.now();
      try { if (!player.isPlayingAnim(LOG_ANIM_DICT, LOG_ANIM_NAME, 3)) player.taskPlayAnim(LOG_ANIM_DICT, LOG_ANIM_NAME, 8, -8, -1, 49, 0, false, false, false); } catch {}
    }
    drawText(`${forestryState.cargo.resourceName}: ${Number(forestryState.cargo.kg || 0).toFixed(1)} ед. · прыжок уронит брёвна`, 0.5, 0.9, 0.32, [245, 198, 89, 240]);
    let jumpPressed = false;
    try { jumpPressed = mp.game.controls.isControlJustPressed(0, 22); } catch {}
    if (jumpPressed && Date.now() - spillSentAt > 1800) {
      spillSentAt = Date.now();
      mp.events.callRemote("server:forestry:cargo:spill");
    }
  }
  if (forestryState && vdist(player.position, UNLOAD_POINT) <= 45) {
    drawWorldText(`Склад древесины: ${Number(forestryState.stock?.totalUnits || 0).toFixed(1)} ед.`, { ...UNLOAD_POINT, z: UNLOAD_POINT.z + 1.25 }, 0.3, [119, 236, 158, 245]);
  }
  if (haulRoute && player.vehicle && vdist(player.vehicle.position, haulRoute.point) <= Number(haulRoute.radius || 6) + 25) {
    drawText(`[E] ${haulRoute.phase === "load" ? "Загрузить древесину" : "Разгрузить древесину"}`, 0.5, 0.82, 0.38, [100, 235, 165, 245]);
  }
  drawHaulStage();
});

mp.events.add("client:forestry:trees:set", (raw) => setTrees(parseJson(raw, [])));
mp.events.add("client:forestry:tree:update", (raw) => updateTree(parseJson(raw, {})));
mp.events.add("client:forestry:tree:remove", removeTree);
mp.events.add("client:forestry:state", (raw) => {
  const previousCargoId = forestryState?.cargo?.id;
  forestryState = parseJson(raw, null);
  if (forestryState?.cargo && forestryState.cargo.id !== previousCargoId) setCargo(forestryState.cargo);
  if (!forestryState?.cargo && previousCargoId) destroyLogs();
});
mp.events.add("client:forestry:uniform", (enabled) => enabled ? applyUniform() : restoreUniform());
mp.events.add("client:forestry:safeZone", applySafeZone);
mp.events.add("client:forestry:challenge:start", (raw) => openChallenge(parseJson(raw, {})));
mp.events.add("client:forestry:challenge:feedback", (raw) => patchChallenge(parseJson(raw, {})));
mp.events.add("client:forestry:challenge:stop", closeChallenge);
mp.events.add("client:forestry:cargo:set", (raw) => setCargo(parseJson(raw, null)));
mp.events.add("client:forestry:cargo:clear", () => { if (forestryState) forestryState.cargo = null; destroyLogs(); });
mp.events.add("client:forestry:haul:route", (raw) => setHaulRoute(parseJson(raw, null)));
mp.events.add("client:forestry:haul:clear", destroyHaulRoute);
mp.events.add("client:forestry:haul:stage:start", (raw) => {
  haulStage = parseJson(raw, null);
  if (haulStage) haulStage.endsAt = Date.now() + Number(haulStage.durationMs || 0);
  unfreezeHaulVehicle();
  haulFrozenVehicle = mp.players.local.vehicle || null;
  try { haulFrozenVehicle?.freezePosition(true); } catch {}
});
mp.events.add("client:forestry:haul:stage:complete", () => { haulStage = null; unfreezeHaulVehicle(); });
mp.events.add("client:forestry:haul:stage:cancel", (reason) => { haulStage = null; unfreezeHaulVehicle(); if (reason) notify(reason, "error"); });
mp.events.add("entityStreamIn", (entity) => {
  if (!isRemotePlayer(entity)) return;
  try { syncRemoteHeldProp(entity, entity.getVariable("forestryHeldProp")); } catch {}
});
mp.events.add("entityStreamOut", (entity) => { if (entity !== mp.players.local) destroyRemoteHeldProp(entity); });
mp.events.add("playerQuit", (player) => destroyRemoteHeldProp(player));
try { mp.events.addDataHandler?.("forestryHeldProp", (entity, value) => syncRemoteHeldProp(entity, value)); } catch {}
try {
  mp.players.forEach((player) => {
    if (isRemotePlayer(player)) syncRemoteHeldProp(player, player.getVariable("forestryHeldProp"));
  });
} catch {}
mp.events.add("client:forestry:shop:open", (raw) => {
  const payload = parseJson(raw, {});
  const open = () => {
    try { return Boolean(global.interfaceLock?.openPage?.(SHOP_PAGE, null, payload)); } catch { return false; }
  };
  try {
    if (global.interfaceLock?.getInterfaceState?.().activePage === "npcDialog") {
      global.interfaceLock.closePage("npcDialog");
      setTimeout(open, 0);
      return;
    }
  } catch {}
  if (!open()) setTimeout(open, 100);
});
mp.events.add("client:forestry:shop:update", (raw) => {
  try { global.uiState?.patch?.(SHOP_PAGE, parseJson(raw, {}), { globalName: "__TWINKLE_FORESTRY_EQUIPMENT__", retryKey: "forestry:equipment" }); } catch {}
});
mp.events.add("forestryEquipment:purchaseFromBrowser", (raw) => mp.events.callRemote("server:forestry:shop:purchase", String(raw || "{}")));
mp.events.add("forestryEquipment:closeFromBrowser", () => { try { global.interfaceLock?.closePage?.(SHOP_PAGE); } catch {} });
mp.events.add("forestryChallenge:inputFromBrowser", (raw) => { const payload = parseJson(raw, null); if (payload) sendChallengeInput(payload, "browser"); });
mp.events.add("forestryChallenge:cancelFromBrowser", () => { mp.events.callRemote("server:forestry:tree:cancel"); closeChallenge("cancelled"); });
mp.events.add("client:forestry:cleanup", () => {
  haulStage = null;
  unfreezeHaulVehicle();
  closeChallenge("cleanup");
  destroyLogs();
  destroyHaulRoute();
  setTrees([]);
  applySafeZone(false);
  restoreUniform();
  forestryState = null;
  try { global.interfaceLock?.closePage?.(SHOP_PAGE); } catch {}
});
mp.events.add("interface:lock:closing", (page) => {
  if (page !== CHALLENGE_PAGE && page !== "*") return;
  global.__TWINKLE_FORESTRY_CHALLENGE_ACTIVE__ = false;
  if (challenge) {
    challenge = null;
    freezeChallenge(false);
    try { mp.events.callRemote("server:forestry:tree:cancel"); } catch {}
  }
  try { global.interfaceLock?.releaseInteraction?.(CHALLENGE_OWNER); } catch {}
});
