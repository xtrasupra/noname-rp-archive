"use strict";

const PAGE = "drivingSchool";
const ESC_KEY = 0x1B;
const SCHOOL_SAFE_ZONE = Object.freeze({
  x: -838.865,
  y: -161.244,
  z: 37.805,
  radius: 15,
});

let currentToken = null;
let checkpoint = null;
let checkpointMarker = null;
let checkpointBlip = null;
let checkpointSentAt = 0;
let damageReported = false;
let baselineDamageState = null;

function parsePayload(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getActivePage() {
  try {
    return global.interfaceLock?.getInterfaceState?.()?.activePage || null;
  } catch {
    return null;
  }
}

function openPage(payload) {
  currentToken = payload?.token || currentToken;
  try {
    const open = global.interfaceLock?.forceOpenPage || global.openPage;
    if (typeof open === "function") open(PAGE, null, payload || {});
  } catch {}
}

function closePage() {
  try {
    const close = global.interfaceLock?.closePage || global.closePage;
    if (typeof close === "function") close(PAGE);
  } catch {}
}

function notify(message, variant = "info") {
  try {
    if (typeof global.notify === "function") {
      global.notify(String(message), String(variant), 5000);
      return;
    }
  } catch {}
  try { mp.gui.chat.push(`!{#55d67a}[Автошкола] !{#ffffff}${String(message)}`); } catch {}
}

function destroyRouteEntities() {
  if (checkpointMarker) {
    try {
      if (typeof mp.checkpoints.exists !== "function" || mp.checkpoints.exists(checkpointMarker)) checkpointMarker.destroy();
    } catch {}
    checkpointMarker = null;
  }
  if (checkpointBlip) {
    try { checkpointBlip.setRoute(false); } catch {}
    try { checkpointBlip.destroy(); } catch {}
    checkpointBlip = null;
  }
}

function checkpointMarkerExists() {
  if (!checkpointMarker) return false;
  try { return typeof mp.checkpoints.exists === "function" ? mp.checkpoints.exists(checkpointMarker) : true; } catch { return false; }
}

function checkpointBlipExists() {
  if (!checkpointBlip) return false;
  try { return mp.blips.exists(checkpointBlip); } catch { return false; }
}

function createCheckpointEntities() {
  if (!checkpoint?.point) return false;
  const position = new mp.Vector3(checkpoint.point.x, checkpoint.point.y, checkpoint.point.z);
  const color = checkpoint.point.finish ? 5 : 2;

  if (!checkpointMarkerExists()) {
    try {
      checkpointMarker = mp.checkpoints.new(4, position, 4.5, {
        direction: new mp.Vector3(0, 0, 0),
        color: checkpoint.point.finish ? [255, 190, 45, 175] : [65, 220, 95, 175],
        visible: true,
        dimension: checkpoint.dimension,
      });
    } catch (error) {
      try { mp.console.logError(`[DRIVING_SCHOOL] Checkpoint creation failed: ${error.message}`); } catch {}
      checkpointMarker = null;
    }
  }

  if (!checkpointBlipExists()) {
    try {
      checkpointBlip = mp.blips.new(checkpoint.point.finish ? 38 : 1, position, {
        name: checkpoint.point.finish ? "Финиш автошколы" : `Контрольная точка ${checkpoint.point.id}`,
        color,
        scale: 0.9,
        shortRange: false,
        dimension: checkpoint.dimension,
      });
    } catch (error) {
      try { mp.console.logError(`[DRIVING_SCHOOL] Blip creation failed: ${error.message}`); } catch {}
      checkpointBlip = null;
    }
  }

  if (!checkpointBlipExists()) return false;
  const handle = Number(checkpointBlip?.handle || 0);
  if (!(handle > 0)) return false;
  try { checkpointBlip.setAsShortRange(false); } catch {}
  try { checkpointBlip.setDisplay(4); } catch {}
  try { checkpointBlip.setAlpha(255); } catch {}
  try { checkpointBlip.setHighDetail(true); } catch {}
  try { checkpointBlip.setRouteColour(color); } catch {}
  try {
    if (typeof mp.game.ui.doesBlipHaveGpsRoute !== "function" || !mp.game.ui.doesBlipHaveGpsRoute(handle)) {
      checkpointBlip.setRoute(true);
    }
  } catch (error) {
    try { mp.console.logError(`[DRIVING_SCHOOL] GPS route activation failed: ${error.message}`); } catch {}
  }
  return true;
}

function clearRoute() {
  destroyRouteEntities();
  checkpoint = null;
  checkpointSentAt = 0;
  damageReported = false;
  baselineDamageState = null;
}

function getVehicleDamageState(vehicle) {
  let body = 1000;
  let engine = 1000;
  try { body = Number(vehicle.getBodyHealth?.() ?? vehicle.bodyHealth ?? 1000); } catch {}
  try { engine = Number(vehicle.getEngineHealth?.() ?? vehicle.engineHealth ?? 1000); } catch {}
  const state = {
    body: Number.isFinite(body) ? body : 1000,
    engine: Number.isFinite(engine) ? engine : 1000,
    tyres: [],
    windows: [],
    doors: [],
  };

  const api = mp.game.vehicle;
  for (let index = 0; index < 8; index += 1) {
    try {
      state.tyres[index] = typeof api?.isVehicleTyreBurst === "function"
        ? Boolean(api.isVehicleTyreBurst(vehicle.handle, index, false))
        : null;
    } catch { state.tyres[index] = null; }
    try {
      state.windows[index] = typeof api?.isVehicleWindowIntact === "function"
        ? Boolean(api.isVehicleWindowIntact(vehicle.handle, index))
        : null;
    } catch { state.windows[index] = null; }
  }
  for (let index = 0; index < 6; index += 1) {
    try {
      state.doors[index] = typeof api?.isVehicleDoorDamaged === "function"
        ? Boolean(api.isVehicleDoorDamaged(vehicle.handle, index))
        : null;
    } catch { state.doors[index] = null; }
  }

  return state;
}

function hasNewVehicleDamage(baseline, current) {
  if (!baseline || !current) return false;
  if (current.body < baseline.body - 1 || current.engine < baseline.engine - 1) return true;

  for (let index = 0; index < current.tyres.length; index += 1) {
    if (baseline.tyres[index] === false && current.tyres[index] === true) return true;
  }
  for (let index = 0; index < current.windows.length; index += 1) {
    if (baseline.windows[index] === true && current.windows[index] === false) return true;
  }
  for (let index = 0; index < current.doors.length; index += 1) {
    if (baseline.doors[index] === false && current.doors[index] === true) return true;
  }
  return false;
}

function setCheckpoint(payload) {
  const point = payload?.point;
  if (!point || !payload?.token) return;

  destroyRouteEntities();
  checkpoint = null;
  checkpointSentAt = 0;
  currentToken = payload.token;
  checkpoint = {
    token: payload.token,
    index: Number(payload.index),
    total: Number(payload.total),
    dimension: Number(payload.dimension ?? mp.players.local.dimension ?? 0),
    vehicleId: Number(payload.vehicleId ?? -1),
    point: {
      id: String(point.id || payload.index),
      x: Number(point.x),
      y: Number(point.y),
      z: Number(point.z),
      finish: Boolean(point.finish),
    },
  };

  createCheckpointEntities();

  const vehicle = mp.players.local.vehicle;
  if (vehicle && !baselineDamageState) baselineDamageState = getVehicleDamageState(vehicle);
}

function distance(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sendRemote(name, payload) {
  try { mp.events.callRemote(name, JSON.stringify(payload || {})); } catch {}
}

function reportDamage() {
  if (!checkpoint || damageReported) return;
  damageReported = true;
  sendRemote("server:drivingSchool:damageHint", { token: checkpoint.token });
}

function currentVehicleId(vehicle) {
  if (!vehicle) return -1;
  return Number(vehicle.remoteId ?? vehicle.id ?? -1);
}

function tryRegisterCheckpoint() {
  if (!checkpoint) return;
  const player = mp.players.local;
  try {
    mp.game.graphics.drawMarker(
      1,
      checkpoint.point.x, checkpoint.point.y, checkpoint.point.z - 1,
      0, 0, 0, 0, 0, 0,
      6.2, 6.2, 1.2,
      checkpoint.point.finish ? 255 : 65,
      checkpoint.point.finish ? 190 : 220,
      checkpoint.point.finish ? 45 : 95,
      155,
      false, false, 2, false, null, null, false
    );
  } catch {}
  const vehicle = player.vehicle;
  if (!vehicle) return;
  if (checkpoint.vehicleId >= 0 && currentVehicleId(vehicle) !== checkpoint.vehicleId) return;
  try { if (vehicle.getVariable("drivingSchoolExam") !== true) return; } catch { return; }
  if (Number(player.dimension || 0) !== checkpoint.dimension) return;
  const now = Date.now();
  if (now - checkpointSentAt < 250) return;
  if (distance(vehicle.position || player.position, checkpoint.point) > 9.5) return;
  checkpointSentAt = now;
  sendRemote("server:drivingSchool:checkpoint", {
    token: checkpoint.token,
    index: checkpoint.index,
  });
}

function isSchoolSafePlayer(entity) {
  if (!entity || (entity.type !== "player" && entity !== mp.players.local)) return false;
  try { return Boolean(entity.getVariable("drivingSchoolSafeZone")); } catch { return false; }
}

function isLocalSchoolSafe() {
  if (isSchoolSafePlayer(mp.players.local)) return true;
  const local = mp.players.local;
  if (Number(local.dimension || 0) !== 0) return false;
  return distance(local.position, SCHOOL_SAFE_ZONE) <= SCHOOL_SAFE_ZONE.radius + 1;
}

mp.events.add("client:drivingSchool:open", (rawPayload) => {
  openPage(parsePayload(rawPayload));
});

mp.events.add("client:drivingSchool:update", (rawPayload) => {
  openPage(parsePayload(rawPayload));
});

mp.events.add("client:drivingSchool:close", () => {
  clearRoute();
  currentToken = null;
  closePage();
});

mp.events.add("client:drivingSchool:notify", (message, variant) => {
  notify(message, variant);
});

mp.events.add("client:drivingSchool:setCheckpoint", (rawPayload) => {
  setCheckpoint(parsePayload(rawPayload));
});

mp.events.add("client:drivingSchool:clearRoute", () => {
  clearRoute();
  currentToken = null;
});

mp.events.add("drivingSchool:beginTheory", (rawPayload) => {
  const payload = parsePayload(rawPayload);
  sendRemote("server:drivingSchool:beginTheory", {
    token: payload.token || currentToken,
  });
});

mp.events.add("drivingSchool:answer", (rawPayload) => {
  const payload = parsePayload(rawPayload);
  sendRemote("server:drivingSchool:answer", {
    token: payload.token || currentToken,
    index: Number(payload.index),
    answer: Number(payload.answer),
  });
});

mp.events.add("drivingSchool:close", (rawPayload) => {
  const payload = parsePayload(rawPayload);
  sendRemote("server:drivingSchool:cancel", {
    token: payload.token || currentToken,
  });
});

mp.events.add("vehicleDamage", (vehicle, bodyHealthLoss, engineHealthLoss) => {
  if (!checkpoint || vehicle !== mp.players.local.vehicle) return;
  if (Number(bodyHealthLoss || 0) > 0 || Number(engineHealthLoss || 0) > 0) {
    reportDamage();
  }
});

mp.events.add("outgoingDamage", (_sourceEntity, targetEntity) => {
  try {
    if (isLocalSchoolSafe() || isSchoolSafePlayer(targetEntity)) return true;
  } catch {}
  return false;
});

mp.events.add("incomingDamage", (_sourceEntity, sourcePlayer, targetEntity) => {
  try {
    const targetsLocal = !targetEntity || Number(targetEntity.handle) === Number(mp.players.local.handle);
    if (targetsLocal && (isLocalSchoolSafe() || isSchoolSafePlayer(sourcePlayer))) return true;
  } catch {}
  return false;
});

mp.events.add("meleeActionDamage", (_sourceEntity, targetEntity) => {
  try {
    if (isLocalSchoolSafe() || isSchoolSafePlayer(targetEntity)) return true;
  } catch {}
  return false;
});

mp.events.add("playerEnterVehicle", (vehicle) => {
  if (baselineDamageState || !vehicle) return;
  try {
    if (!vehicle.getVariable("drivingSchoolExam")) return;
  } catch {
    return;
  }
  baselineDamageState = getVehicleDamageState(vehicle);
});

mp.events.add("render", () => {
  if (isLocalSchoolSafe()) {
    try {
      [24, 25, 47, 58, 140, 141, 142, 257, 263, 264].forEach((control) => {
        mp.game.controls.disableControlAction(0, control, true);
      });
    } catch {}
  }

  if (!checkpoint) return;
  const player = mp.players.local;
  const vehicle = player.vehicle;
  if (!vehicle) return;

  const damageState = getVehicleDamageState(vehicle);
  if (!baselineDamageState) baselineDamageState = damageState;
  if (hasNewVehicleDamage(baselineDamageState, damageState)) {
    reportDamage();
  }

  tryRegisterCheckpoint();
});

mp.events.add("playerEnterCheckpoint", (enteredCheckpoint) => {
  if (!checkpointMarker || !enteredCheckpoint) return;
  if (enteredCheckpoint !== checkpointMarker && Number(enteredCheckpoint.id) !== Number(checkpointMarker.id)) return;
  tryRegisterCheckpoint();
});

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));
bindKey(ESC_KEY, false, () => {
  if (getActivePage() !== PAGE || !currentToken) return;
  sendRemote("server:drivingSchool:cancel", { token: currentToken });
}, {
  allowWhenBlocked: true,
  closeChatBefore: false,
});

// Client playerQuit fires for every remote player, so it must never clear the
// local exam. Local disconnect unloads this package and needs no manual cleanup.
setInterval(() => {
  if (checkpoint) createCheckpointEntities();
}, 1200);

console.log("[DRIVING_SCHOOL] Client loaded");
