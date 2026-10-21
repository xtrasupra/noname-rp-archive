"use strict";

const E_KEY = 0x45;
const UNLOAD_POSITION = Object.freeze({
  x: -470.832,
  y: -624.416,
  z: 25.309,
  heading: 90.63,
  dimension: 0,
});
const CARRY_MODEL = "prop_money_bag_01";
const CARRY_ANIM_DICT = "anim@heists@narcotics@trash";
const CARRY_ANIM_NAME = "idle";
const CARRY_BONE = 57005;
// Keep the handle in the right palm while the weight of the bag hangs below
// it. The old 220/120 rotation put the flat side through the forearm.
const CARRY_OFFSET = Object.freeze([0.12, 0.0, -0.05]);
const CARRY_ROTATION = Object.freeze([0.0, 270.0, 60.0]);

let shiftState = null;
let activeRoute = null;
let routeKey = "";
let routeBlip = null;
let routeCheckpoint = null;
let routeBlipPoint = null;
let lastVehicleGpsSyncAt = 0;
let carryState = null;
let carryObject = null;
let carryGeneration = 0;
let carryAnimationReady = false;
let activeCarryAnimation = null;
let lastCarryKeepaliveAt = 0;
let carryCreateInFlight = false;
let carryCreateGeneration = -1;
let lastCarryCreateAttemptAt = 0;
let vehicleLeaveTimer = null;
let actionLockedUntil = 0;
let tabletWasOpen = false;
let lastTabletRequestAt = 0;
let tabletState = null;

function parseJson(raw, fallback = {}) {
  try {
    if (raw === null || raw === undefined || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function notify(message, variant = "info", duration = 4500) {
  try {
    global.interfaceLock?.notify?.(String(message || ""), variant, duration);
  } catch {}
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pointFrom(rawPoint, fallback = null) {
  const source = rawPoint && typeof rawPoint === "object" ? rawPoint : fallback;
  if (!source) return null;
  const x = Number(source.x);
  const y = Number(source.y);
  const z = Number(source.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return {
    x,
    y,
    z,
    heading: finiteNumber(source.heading, -1),
    dimension: Math.max(0, Math.floor(finiteNumber(source.dimension, 0))),
  };
}

function tuple3(rawValue, fallback) {
  if (Array.isArray(rawValue) && rawValue.length >= 3) {
    return [
      finiteNumber(rawValue[0], fallback[0]),
      finiteNumber(rawValue[1], fallback[1]),
      finiteNumber(rawValue[2], fallback[2]),
    ];
  }
  if (rawValue && typeof rawValue === "object") {
    return [
      finiteNumber(rawValue.x, fallback[0]),
      finiteNumber(rawValue.y, fallback[1]),
      finiteNumber(rawValue.z, fallback[2]),
    ];
  }
  return [...fallback];
}

function normalizedCarryAnimation(rawAnimation) {
  const payload = rawAnimation && typeof rawAnimation === "object" ? rawAnimation : {};
  return {
    dictionary: String(payload.dictionary || payload.dict || CARRY_ANIM_DICT).slice(0, 96),
    name: String(payload.name || payload.animation || CARRY_ANIM_NAME).slice(0, 64),
    flags: Math.max(0, Math.floor(finiteNumber(payload.flags ?? payload.flag, 49))),
  };
}

function vector(point) {
  return new mp.Vector3(point.x, point.y, point.z);
}

function distance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return mp.game.system.vdist(
    finiteNumber(left.x), finiteNumber(left.y), finiteNumber(left.z),
    finiteNumber(right.x), finiteNumber(right.y), finiteNumber(right.z)
  );
}

function entityExists(collection, entity) {
  if (!entity) return false;
  try {
    return typeof collection?.exists !== "function" || collection.exists(entity);
  } catch {
    return false;
  }
}

function drawText(text, x, y, scale = 0.34, color = [255, 255, 255, 235]) {
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

function drawWorldText(text, position, scale = 0.32, color = [255, 255, 255, 235]) {
  try {
    const screen = mp.game.graphics.world3dToScreen2d(position.x, position.y, position.z);
    const x = Number(screen?.x ?? screen?.screenX);
    const y = Number(screen?.y ?? screen?.screenY);
    if (screen && screen.result !== false && Number.isFinite(x) && Number.isFinite(y)) {
      drawText(text, x, y, scale, color);
    }
  } catch {}
}

function patchTablet(payload) {
  try {
    if (typeof global.twinkleTabletPatch === "function") {
      global.twinkleTabletPatch({ armoredCollector: payload });
      return;
    }
    global.uiState?.patch?.("tablet", { armoredCollector: payload }, {
      eventName: "twinkle:tablet:update",
      globalName: "__TWINKLE_TABLET_PAYLOAD__",
      retryKey: "tablet:armoredCollector",
    });
  } catch (error) {
    try { mp.console.logError(`[ARMORED COLLECTOR] Tablet patch failed: ${error.message}`); } catch {}
  }
}

function clearOwnedWaypoint(point) {
  if (!point) return;
  try {
    const waypoint = mp.game.ui.getFirstBlipInfoId(8);
    if (!mp.game.ui.doesBlipExist(waypoint)) return;
    const current = mp.game.ui.getBlipInfoIdCoord(waypoint);
    const planarDistance = Math.hypot(Number(current.x) - point.x, Number(current.y) - point.y);
    if (planarDistance <= 15) mp.game.ui.deleteWaypoint();
  } catch {}
}

function destroyRouteEntities(clearWaypoint = false) {
  if (clearWaypoint) clearOwnedWaypoint(routeBlipPoint);
  if (routeCheckpoint) {
    try {
      if (typeof mp.checkpoints.exists !== "function" || mp.checkpoints.exists(routeCheckpoint)) {
        routeCheckpoint.destroy();
      }
    } catch {}
    routeCheckpoint = null;
  }

  if (routeBlip) {
    try {
      if (typeof mp.blips.exists !== "function" || mp.blips.exists(routeBlip)) routeBlip.destroy();
    } catch {}
    routeBlip = null;
  }
  routeBlipPoint = null;
}

function normalizedRoute(rawRoute) {
  const payload = rawRoute && typeof rawRoute === "object" ? rawRoute : null;
  if (!payload) return null;
  const rawStage = String(payload.phase || payload.stage || "pickup").toLowerCase();
  let phase = rawStage;
  if (["to_pickup", "collecting", "collection", "pickup"].includes(rawStage)) phase = "pickup";
  else if (["to_unload", "unloading", "unload", "return"].includes(rawStage)) phase = "unload";
  else if (["loading", "load", "to_vehicle", "vehicle"].includes(rawStage)) phase = "load";
  const fallback = phase === "unload" || phase === "return" ? UNLOAD_POSITION : null;
  const stagePoint = phase === "pickup"
    ? (payload.pickup || payload.pickupPoint || payload.stop)
    : (phase === "unload" ? (payload.unload || payload.unloadPoint) : null);
  const point = pointFrom(payload.point || payload.position || stagePoint, fallback);
  return {
    ...payload,
    id: String(payload.id ?? payload.routeId ?? ""),
    phase,
    point,
    radius: Math.max(1.5, Math.min(20, finiteNumber(payload.radius, phase === "unload" ? 7 : 2.5))),
  };
}

function routeEntityTitle() {
  if (!activeRoute) return "Маршрут инкассатора";
  if (carryState) return "Служебный фургон · погрузка";
  if (activeRoute.phase === "unload" || activeRoute.phase === "return") return "Разгрузка инкассаторов";
  return String(activeRoute.title || activeRoute.name || "Получение наличности").slice(0, 80);
}

function currentGpsTarget() {
  if (!shiftState?.active || !activeRoute) return null;
  if (carryState) {
    const vehicle = findAssignedVehicle();
    const rear = vehicleRearPosition(vehicle);
    return pointFrom(rear && {
      x: rear.x,
      y: rear.y,
      z: rear.z,
      dimension: Number(vehicle?.dimension || 0),
    });
  }
  return activeRoute.point;
}

function shouldShowGpsRoute() {
  const target = currentGpsTarget();
  if (!target) return false;
  return Boolean(carryState) || (activeRoute.phase !== "load" && activeRoute.phase !== "vehicle");
}

function createRouteEntities(setWaypoint = true) {
  destroyRouteEntities();
  if (!shouldShowGpsRoute()) return;

  const point = currentGpsTarget();
  if (!point) return;
  const isVehicleLoad = Boolean(carryState);
  const isUnload = activeRoute.phase === "unload" || activeRoute.phase === "return";
  try {
    routeBlip = mp.blips.new(isVehicleLoad ? 67 : (isUnload ? 478 : 1), vector(point), {
      name: routeEntityTitle(),
      color: isUnload ? 2 : (isVehicleLoad ? 17 : 5),
      scale: 0.9,
      shortRange: false,
      dimension: point.dimension,
    });
    routeBlipPoint = { ...point };
  } catch (error) {
    routeBlip = null;
    try { mp.console.logError(`[ARMORED COLLECTOR] Blip creation failed: ${error.message}`); } catch {}
  }

  if (setWaypoint) {
    try { mp.game.ui.setNewWaypoint(point.x, point.y); } catch {}
  }

  // Unloading uses the low ring drawn in drawStaticRoute(). A GTA checkpoint
  // at this radius renders as a tall column and obscures both the van and ped.
  if (isVehicleLoad || isUnload) return;

  try {
    routeCheckpoint = mp.checkpoints.new(4, vector(point), activeRoute.radius, {
      direction: new mp.Vector3(0, 0, 0),
      color: isUnload ? [62, 220, 119, 155] : [255, 190, 62, 155],
      visible: true,
      dimension: point.dimension,
    });
  } catch (error) {
    routeCheckpoint = null;
    try { mp.console.logError(`[ARMORED COLLECTOR] Checkpoint creation failed: ${error.message}`); } catch {}
  }
}

function setRoute(rawRoute) {
  const next = normalizedRoute(rawRoute);
  if (!next) {
    activeRoute = null;
    routeKey = "";
    destroyRouteEntities(true);
    return;
  }

  const point = next.point;
  const nextKey = [next.id, next.phase, point?.x, point?.y, point?.z, point?.dimension].join(":");
  activeRoute = next;
  if (routeKey === nextKey) {
    if (shouldShowGpsRoute() && !routeBlip) createRouteEntities();
    return;
  }
  routeKey = nextKey;
  createRouteEntities();
}

function refreshVehicleGps() {
  if (!carryState || !shiftState?.active || Date.now() - lastVehicleGpsSyncAt < 1000) return;
  lastVehicleGpsSyncAt = Date.now();
  const point = currentGpsTarget();
  if (!point) {
    if (routeBlip) destroyRouteEntities();
    return;
  }
  if (!routeBlip || !routeBlipPoint || distance(routeBlipPoint, point) > 3) createRouteEntities(false);
}

function findAssignedVehicle() {
  const explicitId = Number(
    shiftState?.vehicleRemoteId
      ?? shiftState?.vehicleId
      ?? activeRoute?.vehicleRemoteId
      ?? activeRoute?.vehicleId
  );
  if (Number.isInteger(explicitId) && explicitId >= 0) {
    try {
      const explicit = mp.vehicles.atRemoteId(explicitId);
      if (explicit) return explicit;
    } catch {}
  }

  const shiftId = String(shiftState?.shiftId ?? shiftState?.sessionId ?? "");
  if (!shiftId) return null;
  let result = null;
  try {
    mp.vehicles.forEachInStreamRange((vehicle) => {
      if (result) return;
      try {
        const candidateShiftId = vehicle.getVariable("armoredCollectorShiftId");
        if (candidateShiftId !== null && candidateShiftId !== undefined
          && String(candidateShiftId) === shiftId) result = vehicle;
      } catch {}
    });
  } catch {}
  return result;
}

function vehicleRearPosition(vehicle) {
  if (!vehicle) return null;
  try {
    const result = vehicle.getOffsetFromInWorldCoords(0, -3.15, 0.1);
    if (result) return result;
  } catch {}
  try { return vehicle.position; } catch { return null; }
}

function destroyCarryObject() {
  carryGeneration += 1;
  if (carryObject) {
    try {
      if (entityExists(mp.objects, carryObject)) carryObject.destroy();
    } catch {}
    carryObject = null;
  }
  carryAnimationReady = false;
  lastCarryKeepaliveAt = 0;
  const player = mp.players.local;
  if (activeCarryAnimation) {
    try { player.stopAnimTask(activeCarryAnimation.dictionary, activeCarryAnimation.name, 3); } catch {}
  }
  activeCarryAnimation = null;
}

async function loadModel(hash, timeoutMs = 5000) {
  try {
    mp.game.streaming.requestModel(hash);
    const startedAt = Date.now();
    while (!mp.game.streaming.hasModelLoaded(hash)) {
      if (Date.now() - startedAt >= timeoutMs) return false;
      try { await mp.game.waitAsync(25); } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    return true;
  } catch {
    return false;
  }
}

async function loadAnimation(dict, timeoutMs = 4000) {
  try {
    mp.game.streaming.requestAnimDict(dict);
    const startedAt = Date.now();
    while (!mp.game.streaming.hasAnimDictLoaded(dict)) {
      if (Date.now() - startedAt >= timeoutMs) return false;
      try { await mp.game.waitAsync(25); } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    return true;
  } catch {
    return false;
  }
}

function isCarryAttached(object, player) {
  try {
    if (typeof object?.isAttachedTo === "function") return Boolean(object.isAttachedTo(player.handle));
    return Boolean(object && player && object.handle && player.handle
      && mp.game.invoke("0xEFBE71898A993728", object.handle, player.handle));
  } catch {
    return false;
  }
}

function attachCarryObject(object, player) {
  if (!object || !player || !object.handle || !player.handle) return false;
  try {
    const bone = player.getBoneIndex(carryState?.bone ?? CARRY_BONE);
    const position = carryState?.position || CARRY_OFFSET;
    const rotation = carryState?.rotation || CARRY_ROTATION;
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
    return isCarryAttached(object, player);
  } catch {
    return false;
  }
}

async function createCarryObject(generation) {
  if (carryCreateInFlight && carryCreateGeneration === generation) return;
  carryCreateInFlight = true;
  carryCreateGeneration = generation;
  lastCarryCreateAttemptAt = Date.now();
  const modelName = String(carryState?.model || CARRY_MODEL);
  let modelHash = mp.game.joaat(modelName);
  try {
    if (!mp.game.streaming.isModelInCdimage(modelHash) || !mp.game.streaming.isModelValid(modelHash)) {
      modelHash = mp.game.joaat(CARRY_MODEL);
    }
  } catch {}
  if (!await loadModel(modelHash)) {
    notify("Не удалось загрузить модель мешка.", "error");
    if (carryCreateGeneration === generation) carryCreateInFlight = false;
    return;
  }
  if (generation !== carryGeneration || !carryState || !shiftState?.active) {
    if (carryCreateGeneration === generation) carryCreateInFlight = false;
    return;
  }

  const player = mp.players.local;
  try {
    carryObject = mp.objects.new(
      modelHash,
      new mp.Vector3(player.position.x, player.position.y, player.position.z),
      { dimension: Number(player.dimension || 0), alpha: 255 }
    );
    // Local objects can exist for a few frames before GTA assigns a native
    // handle. These calls are best-effort; the attachment loop below retries.
    try { carryObject.setVisible(true, false); } catch {}
    try { carryObject.setCollision(false, false); } catch {}

    for (let frame = 0; frame < 180; frame += 1) {
      if (generation !== carryGeneration || !carryState || carryObject === null) return;
      if (attachCarryObject(carryObject, player)) break;
      try { await mp.game.waitAsync(16); } catch { await new Promise((resolve) => setTimeout(resolve, 16)); }
    }
  } catch (error) {
    try { mp.console.logError(`[ARMORED COLLECTOR] Carry object failed: ${error.message}`); } catch {}
  } finally {
    if (carryCreateGeneration === generation) carryCreateInFlight = false;
    try { mp.game.streaming.setModelAsNoLongerNeeded(modelHash); } catch {}
  }

  if (generation !== carryGeneration || !carryState) return;
  const animation = carryState?.animation || normalizedCarryAnimation(null);
  activeCarryAnimation = animation;
  carryAnimationReady = await loadAnimation(animation.dictionary);
  if (carryAnimationReady && generation === carryGeneration && carryState && !player.vehicle) {
    try {
      player.taskPlayAnim(animation.dictionary, animation.name, 8, -8, -1, animation.flags, 0, false, false, false);
    } catch {}
  }
}

function setCarry(rawCarry) {
  let payload = rawCarry;
  if (typeof rawCarry === "string") payload = parseJson(rawCarry, null);
  const enabled = payload === true || Boolean(payload && typeof payload === "object"
    && (Object.prototype.hasOwnProperty.call(payload, "carrying") ? payload.carrying : payload.active !== false));
  if (!enabled) {
    carryState = null;
    destroyCarryObject();
    createRouteEntities();
    return;
  }

  const data = typeof payload === "object" ? payload : {};
  const model = /^[a-zA-Z0-9_]{1,64}$/.test(String(data.model || "")) ? String(data.model) : CARRY_MODEL;
  carryState = {
    ...data,
    active: true,
    carrying: true,
    model,
    bone: Math.floor(finiteNumber(data.bone, CARRY_BONE)),
    position: tuple3(data.position, CARRY_OFFSET),
    rotation: tuple3(data.rotation, CARRY_ROTATION),
    animation: normalizedCarryAnimation(data.animation),
  };
  destroyCarryObject();
  carryGeneration += 1;
  const generation = carryGeneration;
  createRouteEntities();
  void createCarryObject(generation);
}

function clearVehicleLeaveTimer() {
  vehicleLeaveTimer = null;
}

function epochMilliseconds(value) {
  let parsed = Number(value);
  if (!Number.isFinite(parsed) && value) parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed < 100000000000 ? parsed * 1000 : parsed;
}

function setVehicleLeaveTimer(rawTimer) {
  let payload = typeof rawTimer === "string" ? parseJson(rawTimer, null) : rawTimer;
  if (typeof payload === "number") payload = { remainingSeconds: payload };
  if (!payload || payload.active === false) {
    clearVehicleLeaveTimer();
    return;
  }

  const receivedAt = Date.now();
  const serverStartedAt = epochMilliseconds(payload.startedAt);
  const serverExpiresAt = epochMilliseconds(payload.expiresAt ?? payload.deadlineAt);
  const serverNow = epochMilliseconds(payload.serverNow);
  const explicitRemainingMs = Number(payload.remainingMs);
  const explicitRemainingSeconds = Number(payload.remainingSeconds ?? payload.seconds);
  const explicitTimeoutMs = Number(payload.timeoutMs);
  const sameServerWindow = Boolean(
    vehicleLeaveTimer
      && serverStartedAt
      && serverExpiresAt
      && vehicleLeaveTimer.serverStartedAt === serverStartedAt
      && vehicleLeaveTimer.serverExpiresAt === serverExpiresAt
  );

  let remainingMs = null;
  if (Number.isFinite(explicitRemainingMs)) {
    remainingMs = explicitRemainingMs;
  } else if (Number.isFinite(explicitRemainingSeconds)) {
    remainingMs = explicitRemainingSeconds * 1000;
  } else if (serverExpiresAt && serverNow) {
    remainingMs = serverExpiresAt - serverNow;
  } else if (sameServerWindow) {
    // Repeated snapshots for the same server timer must not restart the local
    // countdown when no authoritative remaining value was included.
    remainingMs = vehicleLeaveTimer.localExpiresAt - receivedAt;
  } else if (serverStartedAt && serverExpiresAt) {
    remainingMs = serverExpiresAt - serverStartedAt;
  } else if (Number.isFinite(explicitTimeoutMs)) {
    remainingMs = explicitTimeoutMs;
  }

  if (!Number.isFinite(remainingMs)) return;
  remainingMs = Math.max(0, remainingMs);

  vehicleLeaveTimer = {
    localExpiresAt: receivedAt + remainingMs,
    serverStartedAt,
    serverExpiresAt,
    receivedAt,
    message: String(payload.message || "Вернитесь в рабочий транспорт"),
  };
}

function requestTablet(reason = "manual", force = false) {
  if (!shiftState?.active) return;
  const now = Date.now();
  if (!force && now - lastTabletRequestAt < 1500) return;
  lastTabletRequestAt = now;
  mp.events.callRemote("server:armoredCollector:tablet:request", JSON.stringify({ reason }));
}

function clearShift() {
  shiftState = null;
  tabletState = null;
  activeRoute = null;
  routeKey = "";
  lastVehicleGpsSyncAt = 0;
  actionLockedUntil = 0;
  destroyRouteEntities(true);
  carryState = null;
  destroyCarryObject();
  clearVehicleLeaveTimer();
  patchTablet(null);
}

function applyShiftState(rawState) {
  const payload = typeof rawState === "string" ? parseJson(rawState, null) : rawState;
  if (!payload || payload.active !== true) {
    clearShift();
    return;
  }

  const wasActive = Boolean(shiftState?.active);
  shiftState = { ...(shiftState || {}), ...payload, active: true };
  tabletState = {
    ...(tabletState || {}),
    shift: {
      ...(tabletState?.shift || {}),
      ...shiftState,
      active: true,
    },
  };
  patchTablet(tabletState);

  if (Object.prototype.hasOwnProperty.call(payload, "route")) setRoute(payload.route);
  else if (activeRoute) createRouteEntities();
  if (Object.prototype.hasOwnProperty.call(payload, "carrying")) {
    const carryingPayload = payload.carrying && typeof payload.carrying === "object"
      ? payload.carrying
      : (payload.carrying ? (payload.bag || { carrying: true }) : null);
    setCarry(carryingPayload);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "vehicleLeaveTimer")) {
    setVehicleLeaveTimer(payload.vehicleLeaveTimer);
  }
  if (!wasActive) requestTablet("shift_started", true);
}

function actionAvailable() {
  if (Date.now() < actionLockedUntil) return false;
  actionLockedUntil = Date.now() + 1300;
  return true;
}

function tryInteract() {
  if (!shiftState?.active || mp.gui.cursor.visible || !actionAvailable()) return;
  const player = mp.players.local;
  const vehicle = findAssignedVehicle();

  if (carryState && !player.vehicle) {
    const rear = vehicleRearPosition(vehicle);
    const nearRear = rear && distance(player.position, rear) <= 5.5;
    const nearBody = vehicle && distance(player.position, vehicle.position) <= 4.5;
    if (nearRear || nearBody) {
      mp.events.callRemote("server:armoredCollector:loadBag");
      return;
    }
  }

  if (!carryState && activeRoute?.phase === "pickup" && activeRoute.point && !player.vehicle
    && Number(player.dimension || 0) === activeRoute.point.dimension
    && distance(player.position, activeRoute.point) <= activeRoute.radius + 1.25) {
    mp.events.callRemote("server:armoredCollector:pickupBag");
    return;
  }

  if (!carryState && (activeRoute?.phase === "unload" || activeRoute?.phase === "return") && activeRoute.point) {
    if (player.vehicle) {
      actionLockedUntil = 0;
      return;
    }
    const deliveryEntity = vehicle || player.vehicle || player;
    if (Number(player.dimension || 0) === activeRoute.point.dimension
      && distance(player.position, activeRoute.point) <= activeRoute.radius + 8.0
      && distance(deliveryEntity.position, activeRoute.point) <= activeRoute.radius + 3.0) {
      mp.events.callRemote("server:armoredCollector:unload");
      return;
    }
  }

  actionLockedUntil = 0;
}

function drawStaticRoute() {
  if (!shiftState?.active || !activeRoute?.point || carryState) return;
  const player = mp.players.local;
  const point = activeRoute.point;
  if (Number(player.dimension || 0) !== point.dimension) return;
  const currentDistance = distance(player.position, point);
  const isUnload = activeRoute.phase === "unload" || activeRoute.phase === "return";
  if (activeRoute.phase === "load" || activeRoute.phase === "vehicle") return;

  mp.game.graphics.drawMarker(
    isUnload ? 23 : 1,
    point.x, point.y, isUnload ? point.z + 0.03 : point.z - 1,
    0, 0, 0,
    0, 0, point.heading >= 0 ? point.heading : 0,
    activeRoute.radius * 1.65, activeRoute.radius * 1.65, isUnload ? 0.16 : 1.0,
    isUnload ? 62 : 255, isUnload ? 220 : 190, isUnload ? 119 : 62, 145,
    false, false, 2, false, null, null, false
  );

  if (currentDistance <= Math.max(18, activeRoute.radius * 3)) {
    if (isUnload) {
      drawWorldText(player.vehicle
        ? "Выйдите из фургона для разгрузки"
        : "[E] Разгрузить инкассаторский автомобиль", {
        x: point.x,
        y: point.y,
        z: point.z + 1.05,
      }, 0.32, player.vehicle ? [255, 210, 95, 245] : [100, 245, 155, 245]);
    } else if (!player.vehicle) {
      drawWorldText("[E] Забрать мешок с наличностью", {
        x: point.x,
        y: point.y,
        z: point.z + 1.05,
      }, 0.32, [255, 210, 95, 245]);
    }
  }
}

function drawVehicleLoading() {
  if (!shiftState?.active || !carryState) return;
  const player = mp.players.local;
  const vehicle = findAssignedVehicle();
  const rear = vehicleRearPosition(vehicle);
  if (!vehicle || !rear || Number(vehicle.dimension || 0) !== Number(player.dimension || 0)) return;
  const currentDistance = distance(player.position, rear);
  if (currentDistance > 35) return;

  mp.game.graphics.drawMarker(
    1,
    rear.x, rear.y, rear.z - 1,
    0, 0, 0, 0, 0, 0,
    1.8, 1.8, 0.75,
    255, 190, 62, 150,
    false, false, 2, false, null, null, false
  );
  if (currentDistance <= 8) {
    drawWorldText("[E] Положить мешок в инкассаторский автомобиль", {
      x: rear.x,
      y: rear.y,
      z: rear.z + 1.0,
    }, 0.31, [255, 210, 95, 245]);
  }
}

function drawVehicleLeaveTimer() {
  if (!shiftState?.active || !vehicleLeaveTimer) return;
  const remainingSeconds = Math.max(0, Math.ceil((vehicleLeaveTimer.localExpiresAt - Date.now()) / 1000));
  const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  drawText(`${vehicleLeaveTimer.message}: ${minutes}:${seconds}`, 0.5, 0.86, 0.38, [255, 104, 104, 245]);
  if (remainingSeconds === 0) {
    drawText("Ожидание подтверждения сервера…", 0.5, 0.895, 0.29, [220, 220, 220, 225]);
  }
}

function keepCarryVisualAlive() {
  if (!shiftState?.active || !carryState) return;
  const player = mp.players.local;
  [21, 22, 23, 24, 25, 37, 44, 140, 141, 142, 257].forEach((control) => {
    try { mp.game.controls.disableControlAction(0, control, true); } catch {}
  });

  const currentCreationInFlight = carryCreateInFlight && carryCreateGeneration === carryGeneration;
  if (!carryObject && !currentCreationInFlight && Date.now() - lastCarryCreateAttemptAt >= 2000) {
    carryGeneration += 1;
    void createCarryObject(carryGeneration);
  }
  if (Date.now() - lastCarryKeepaliveAt < 650) return;
  lastCarryKeepaliveAt = Date.now();
  if (carryObject && entityExists(mp.objects, carryObject) && !isCarryAttached(carryObject, player)) {
    attachCarryObject(carryObject, player);
  }
  try { carryObject?.setVisible(true, false); } catch {}

  if (carryAnimationReady && activeCarryAnimation && !player.vehicle) {
    let playing = false;
    try { playing = player.isPlayingAnim(activeCarryAnimation.dictionary, activeCarryAnimation.name, 3); } catch {}
    if (!playing) {
      try {
        player.taskPlayAnim(
          activeCarryAnimation.dictionary,
          activeCarryAnimation.name,
          8, -8, -1,
          activeCarryAnimation.flags,
          0, false, false, false
        );
      } catch {}
    }
  }
}

(global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback)))(E_KEY, false, tryInteract);

mp.events.add("render", () => {
  if (!shiftState?.active) return;
  refreshVehicleGps();
  drawStaticRoute();
  drawVehicleLoading();
  drawVehicleLeaveTimer();
  keepCarryVisualAlive();
});

mp.events.add("client:armoredCollector:shiftState", applyShiftState);
mp.events.add("client:armoredCollector:setRoute", (raw) => setRoute(parseJson(raw, null)));
mp.events.add("client:armoredCollector:clearRoute", () => setRoute(null));
mp.events.add("client:armoredCollector:setCarry", setCarry);
mp.events.add("client:armoredCollector:vehicleLeaveTimer", setVehicleLeaveTimer);
mp.events.add("client:armoredCollector:clearVehicleLeaveTimer", clearVehicleLeaveTimer);
mp.events.add("client:armoredCollector:tablet:update", (raw) => {
  const payload = raw === "null" ? null : parseJson(raw, null);
  tabletState = payload;
  patchTablet(tabletState);
});
mp.events.add("client:armoredCollector:notify", (first, second, duration = 5000) => {
  actionLockedUntil = 0;
  const variants = new Set(["info", "success", "warning", "error"]);
  const firstValue = String(first || "");
  const serverOrder = variants.has(firstValue);
  notify(serverOrder ? second : first, serverOrder ? firstValue : (second || "info"), duration);
});
mp.events.add("client:armoredCollector:error", (message) => {
  actionLockedUntil = 0;
  notify(message || "Не удалось выполнить действие инкассатора.", "error");
});
mp.events.add("client:armoredCollector:clear", clearShift);

mp.events.add("tablet:armoredCollector:requestFromBrowser", () => requestTablet("browser", true));
mp.events.add("tablet:armoredCollector:selectRouteFromBrowser", (rawPayload) => {
  if (!shiftState?.active || Date.now() < actionLockedUntil) return;
  const payload = parseJson(rawPayload, {});
  const routeId = String(payload.routeId ?? payload.id ?? "").trim().slice(0, 64);
  const revision = Math.floor(finiteNumber(
    payload.revision
      ?? tabletState?.revision
      ?? tabletState?.offersRevision
      ?? tabletState?.meta?.revision,
    -1
  ));
  if (!routeId || revision < 0) {
    notify("Список маршрутов обновляется. Попробуйте ещё раз.", "warning");
    requestTablet("missing_revision", true);
    return;
  }
  actionLockedUntil = Date.now() + 1300;
  mp.events.callRemote("server:armoredCollector:selectRoute", JSON.stringify({ routeId, revision }));
});
mp.events.add("tablet:armoredCollector:cancelRouteFromBrowser", (rawPayload) => {
  if (!shiftState?.active || !activeRoute || Date.now() < actionLockedUntil) return;
  const payload = parseJson(rawPayload, {});
  const routeId = String(payload.routeId || "").slice(0, 32);
  const runId = String(payload.runId || "").slice(0, 48);
  if (!routeId || !runId || routeId !== String(activeRoute.id || activeRoute.routeId || "")
    || runId !== String(activeRoute.runId || "")) {
    notify("Маршрут изменился. Обновите приложение.", "warning");
    requestTablet("cancel_route_stale", true);
    return;
  }
  actionLockedUntil = Date.now() + 1500;
  mp.events.callRemote("server:armoredCollector:cancelRoute", JSON.stringify({ routeId, runId }));
});
mp.events.add("tablet:armoredCollector:restoreRouteFromBrowser", () => {
  if (!shiftState?.active) return;
  createRouteEntities();
  requestTablet("restore_route", true);
});
mp.events.add("tablet:openAppFromBrowser", (appId) => {
  const normalizedAppId = String(appId || "").toLowerCase().replace(/[^a-z]/g, "");
  if (normalizedAppId === "armoredcollector") requestTablet("app_open", true);
});

mp.events.add("playerDeath", clearShift);
mp.events.add("playerQuit", (player) => {
  // Client-side playerQuit is normally emitted for streamed remote players.
  // Never tear down the local shift just because somebody else disconnected.
  if (player !== mp.players.local) return;
  clearShift();
});

setInterval(() => {
  const activePage = global.interfaceLock?.getInterfaceState?.()?.activePage;
  const tabletOpen = activePage === "tablet";
  if (tabletOpen && !tabletWasOpen) requestTablet("tablet_open", true);
  tabletWasOpen = tabletOpen;
}, 1500);

try { mp.console.logInfo("[ARMORED COLLECTOR] Client loaded"); } catch {}
