"use strict";

const PAGE_NAME = "vehicle-dealership";
const E_KEY = 0x45;
const STREAM_TIMEOUT_MS = 15000;

let hintVisible = false;
let showroomOpen = false;
let showroomCamera = null;
let cameraConfig = null;
let cameraAngle = 35;
let pendingPreviewVehicleId = null;
let pendingOwnedVehicleId = null;
let previewTimer = null;
let ownedTimer = null;
let showroomPlayerState = null;
const requestedShowroomIpls = new Set();

function parsePayload(raw, fallback = {}) {
  try {
    if (raw && typeof raw === "object") return raw;
    return JSON.parse(String(raw || "{}"));
  } catch {
    return fallback;
  }
}

function clearTimer(timerName) {
  if (timerName === "preview" && previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
  if (timerName === "owned" && ownedTimer) {
    clearTimeout(ownedTimer);
    ownedTimer = null;
  }
}

function destroyCamera() {
  try { mp.game.cam.renderScriptCams(false, true, 250, true, false); } catch {}
  try {
    if (showroomCamera) showroomCamera.destroy(true);
  } catch {}
  showroomCamera = null;
  cameraConfig = null;
}

function ensureShowroomInterior(interiorIpl) {
  const ipl = String(interiorIpl || "").trim();
  if (!ipl || requestedShowroomIpls.has(ipl)) return;
  mp.game.streaming.requestIpl(ipl);
  requestedShowroomIpls.add(ipl);
}

function enterShowroomPresentation() {
  if (!showroomPlayerState) {
    let alpha = 255;
    let frozen = false;
    try { alpha = Number(mp.players.local.getAlpha()); } catch {}
    try { frozen = Boolean(mp.players.local.isPositionFrozen); } catch {}
    showroomPlayerState = {
      alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(255, alpha)) : 255,
      frozen,
    };
  }

  try { mp.players.local.setAlpha(0); } catch {}
  try { mp.players.local.freezePosition(true); } catch {}
  try { global.interfaceLock?.hideHud?.(); } catch {}
  try { mp.events.call("vehicleHud:hide"); } catch {}
}

function leaveShowroomPresentation() {
  const previous = showroomPlayerState;
  showroomPlayerState = null;
  if (!previous) return;
  try { mp.players.local.setAlpha(previous.alpha); } catch {}
  try { mp.players.local.freezePosition(previous.frozen); } catch {}
}

function refreshCamera() {
  if (!showroomCamera || !cameraConfig?.target) return;
  const target = cameraConfig.target;
  const radians = cameraAngle * Math.PI / 180;
  const radius = Math.max(2, Number(cameraConfig.radius || 6.4));
  const x = Number(target.x) + Math.cos(radians) * radius;
  const y = Number(target.y) + Math.sin(radians) * radius;
  const z = Number(target.z) + Number(cameraConfig.height || 2.2);
  showroomCamera.setCoord(x, y, z);
  showroomCamera.pointAtCoord(Number(target.x), Number(target.y), Number(target.z));
}

function createCamera(config) {
  destroyCamera();
  cameraConfig = config && typeof config === "object" ? config : null;
  if (!cameraConfig?.target) return;
  cameraAngle = Number(cameraConfig.angle || 35);
  showroomCamera = mp.cameras.new(
    "default",
    new mp.Vector3(0, 0, 0),
    new mp.Vector3(0, 0, 0),
    Math.max(20, Math.min(80, Number(cameraConfig.fov || 42)))
  );
  refreshCamera();
  showroomCamera.setActive(true);
  mp.game.cam.renderScriptCams(true, true, 350, true, false);
}

function closeLocalShowroom() {
  showroomOpen = false;
  pendingPreviewVehicleId = null;
  clearTimer("preview");
  destroyCamera();
  leaveShowroomPresentation();
  if (global.interfaceLock) global.interfaceLock.closePage(PAGE_NAME);
  else if (typeof global.closePage === "function") global.closePage(PAGE_NAME);
}

function acknowledgeVehicle(kind) {
  const pendingId = kind === "preview" ? pendingPreviewVehicleId : pendingOwnedVehicleId;
  if (!Number.isInteger(pendingId)) return false;
  const vehicle = mp.vehicles.atRemoteId(pendingId);
  if (!vehicle || !mp.vehicles.exists(vehicle)) return false;

  if (kind === "preview") {
    pendingPreviewVehicleId = null;
    clearTimer("preview");
    mp.events.callRemote("server:vehicleDealership:previewStreamed", pendingId);
  } else {
    pendingOwnedVehicleId = null;
    clearTimer("owned");
    mp.events.callRemote("server:vehicleDealership:ownedStreamed", pendingId);
  }
  return true;
}

function waitForVehicle(kind, vehicleId) {
  const id = Number(vehicleId);
  if (!Number.isInteger(id) || id < 0) return;
  if (kind === "preview") pendingPreviewVehicleId = id;
  else pendingOwnedVehicleId = id;
  acknowledgeVehicle(kind);

  const stillPending = kind === "preview"
    ? pendingPreviewVehicleId !== null
    : pendingOwnedVehicleId !== null;
  if (!stillPending) return;

  clearTimer(kind);
  const timer = setTimeout(() => {
    if (kind === "preview") pendingPreviewVehicleId = null;
    else pendingOwnedVehicleId = null;
    clearTimer(kind);
  }, STREAM_TIMEOUT_MS);
  if (kind === "preview") previewTimer = timer;
  else ownedTimer = timer;
}

mp.events.add("client:vehicleDealership:hint", (state) => {
  hintVisible = Boolean(state);
});

mp.events.add("client:vehicleDealership:open", (payloadJson) => {
  const payload = parsePayload(payloadJson, { vehicles: [] });
  if (!global.interfaceLock) {
    mp.events.callRemote("server:vehicleDealership:close");
    return;
  }
  const opened = global.interfaceLock.openPage(PAGE_NAME, null, payload);
  showroomOpen = Boolean(opened);
  if (!showroomOpen) {
    mp.events.callRemote("server:vehicleDealership:close");
    return;
  }
  try {
    ensureShowroomInterior(payload.interiorIpl);
    enterShowroomPresentation();
    createCamera(payload.camera);
  } catch (error) {
    console.log(`[VEHICLE DEALERSHIP] Showroom presentation failed: ${error?.message || error}`);
    closeLocalShowroom();
    mp.events.callRemote("server:vehicleDealership:close");
  }
});

mp.events.add("client:vehicleDealership:close", () => {
  closeLocalShowroom();
});

mp.events.add("client:vehicleDealership:previewVehicle", (vehicleId) => {
  waitForVehicle("preview", vehicleId);
});

mp.events.add("client:vehicleDealership:ownedVehicle", (vehicleId) => {
  waitForVehicle("owned", vehicleId);
});

mp.events.add("entityStreamIn", (entity) => {
  if (!entity || entity.type !== "vehicle") return;
  const remoteId = Number(entity.remoteId);
  if (remoteId === pendingPreviewVehicleId) acknowledgeVehicle("preview");
  if (remoteId === pendingOwnedVehicleId) acknowledgeVehicle("owned");
});

mp.events.add("vehicle-dealership:select", (vehicleId) => {
  if (!showroomOpen) return;
  mp.events.callRemote("server:vehicleDealership:select", String(vehicleId || ""));
});

mp.events.add("vehicle-dealership:color", (colorId) => {
  if (!showroomOpen) return;
  mp.events.callRemote("server:vehicleDealership:color", Number(colorId));
});

mp.events.add("vehicle-dealership:rotate", (deltaRaw) => {
  if (!showroomOpen) return;
  const delta = Math.max(-45, Math.min(45, Number(deltaRaw || 0)));
  cameraAngle = (cameraAngle + delta + 360) % 360;
  refreshCamera();
});

mp.events.add("vehicle-dealership:buy", (paymentType) => {
  if (!showroomOpen) return;
  mp.events.callRemote("server:vehicleDealership:buy", String(paymentType || ""));
});

mp.events.add("vehicle-dealership:close", () => {
  if (!showroomOpen) return;
  mp.events.callRemote("server:vehicleDealership:close");
});

mp.events.add("interface:lock:closing", (page) => {
  if (!showroomOpen) return;
  if (String(page) !== PAGE_NAME && String(page) !== "*") return;
  showroomOpen = false;
  destroyCamera();
  leaveShowroomPresentation();
  mp.events.callRemote("server:vehicleDealership:close");
});

mp.events.add("render", () => {
  if (!showroomOpen) return;
  mp.game.controls.disableAllControlActions(0);
  mp.game.controls.disableAllControlActions(1);
  mp.game.controls.disableAllControlActions(2);
});

const bindKey = global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback));
bindKey(E_KEY, false, () => {
  if (!hintVisible || showroomOpen || !global.__TWINKLE_GAMEPLAY_READY__) return;
  if (global.interfaceLock?.getInterfaceState?.()?.activePage) return;
  mp.events.callRemote("server:vehicleDealership:open");
});

mp.events.add("playerQuit", () => {
  hintVisible = false;
  showroomOpen = false;
  pendingPreviewVehicleId = null;
  pendingOwnedVehicleId = null;
  clearTimer("preview");
  clearTimer("owned");
  destroyCamera();
  leaveShowroomPresentation();
});

console.log("[VEHICLE DEALERSHIP] Client loaded");
