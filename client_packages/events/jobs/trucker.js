"use strict";

const E_KEY = 0x45;
const RESULT_INTERFACE = "truckerResult";
const RESULT_OWNER = "truckerResult";
const RENTAL_INTERFACE = "truckerRental";

let activeRoute = null;
let activeRouteKey = "";
let routeBlip = null;
let routeCheckpoint = null;
let stageProgress = null;
let alignedSince = 0;
let beginSent = false;

function parseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function notify(message, variant = "info") {
  try { global.interfaceLock?.notify?.(String(message), variant); } catch {}
}

function patchTablet(trucker) {
  try {
    if (typeof global.twinkleTabletPatch === "function") {
      global.twinkleTabletPatch({ trucker });
      return;
    }
    global.uiState?.patch?.("tablet", { trucker }, {
      eventName: "twinkle:tablet:update",
      globalName: "__TWINKLE_TABLET_PAYLOAD__",
      retryKey: "tablet:trucker",
    });
  } catch (error) {
    try { mp.console.logError(`[TRUCKER] Tablet patch failed: ${error.message}`); } catch {}
  }
}

function destroyRouteEntities() {
  if (routeCheckpoint) {
    try {
      if (typeof mp.checkpoints.exists !== "function" || mp.checkpoints.exists(routeCheckpoint)) routeCheckpoint.destroy();
    } catch {}
    routeCheckpoint = null;
  }
  if (routeBlip) {
    try { routeBlip.setRoute(false); } catch {}
    try { if (mp.blips.exists(routeBlip)) routeBlip.destroy(); } catch {}
    routeBlip = null;
  }
}

function routeBlipExists() {
  if (!routeBlip) return false;
  try { return mp.blips.exists(routeBlip); } catch { return false; }
}

function routeCheckpointExists() {
  if (!routeCheckpoint) return false;
  try { return typeof mp.checkpoints.exists === "function" ? mp.checkpoints.exists(routeCheckpoint) : true; } catch { return false; }
}

function createRouteEntities() {
  const point = activeRoute?.point;
  if (!point) return false;
  const position = new mp.Vector3(Number(point.x), Number(point.y), Number(point.z));
  const color = activeRoute.phase === "pickup" ? 5 : 2;

  if (!routeBlipExists()) {
    try {
      routeBlip = mp.blips.new(1, position, {
        name: activeRoute.phase === "pickup" ? `Погрузка: ${activeRoute.cargo}` : `Разгрузка: ${activeRoute.company}`,
        color,
        scale: 0.95,
        shortRange: false,
        dimension: Number(mp.players.local.dimension || 0),
      });
    } catch (error) {
      try { mp.console.logError(`[TRUCKER] Route blip creation failed: ${error.message}`); } catch {}
      routeBlip = null;
    }
  }

  if (!routeCheckpointExists()) {
    try {
      routeCheckpoint = mp.checkpoints.new(4, position, Math.max(3, Number(activeRoute.radius || 5)), {
        direction: new mp.Vector3(0, 0, 0),
        color: activeRoute.phase === "pickup" ? [255, 187, 64, 155] : [65, 224, 126, 155],
        visible: true,
        dimension: Number(mp.players.local.dimension || 0),
      });
    } catch (error) {
      try { mp.console.logError(`[TRUCKER] Route checkpoint creation failed: ${error.message}`); } catch {}
      routeCheckpoint = null;
    }
  }
  return routeBlipExists();
}

function applyGpsRoute() {
  if (!createRouteEntities()) return false;

  const color = activeRoute.phase === "pickup" ? 5 : 2;
  const handle = Number(routeBlip?.handle || 0);
  if (!(handle > 0)) return false;

  try { routeBlip.setAsShortRange(false); } catch {}
  try { routeBlip.setDisplay(4); } catch {}
  try { routeBlip.setAlpha(255); } catch {}
  try { routeBlip.setHighDetail(true); } catch {}

  const canVerify = typeof mp.game.ui.doesBlipHaveGpsRoute === "function";
  let hasRoute = false;
  try {
    if (canVerify) hasRoute = Boolean(mp.game.ui.doesBlipHaveGpsRoute(handle));
  } catch {}

  if (!hasRoute) {
    try { routeBlip.setRouteColour(color); } catch {}
    try {
      routeBlip.setRoute(true);
      hasRoute = true;
    } catch (error) {
      try { mp.console.logError(`[TRUCKER] GPS route activation failed: ${error.message}`); } catch {}
    }
    if (canVerify) {
      try { hasRoute = Boolean(mp.game.ui.doesBlipHaveGpsRoute(handle)); } catch {}
    }
  }
  return hasRoute;
}

function clearRoute() {
  activeRoute = null;
  activeRouteKey = "";
  stageProgress = null;
  alignedSince = 0;
  beginSent = false;
  destroyRouteEntities();
}

function closeResult() {
  try { global.interfaceLock?.closePage?.(RESULT_INTERFACE); } catch {}
  try { global.interfaceLock?.releaseInteraction?.(RESULT_OWNER); } catch {}
}

function closeRental() {
  try { global.interfaceLock?.closePage?.(RENTAL_INTERFACE); } catch {}
}

function setRoute(payload) {
  const point = payload?.point;
  if (!point) return;
  const nextKey = [payload.orderId, payload.phase, Number(point.x), Number(point.y), Number(point.z)].join(":");
  if (activeRoute && activeRouteKey === nextKey) {
    activeRoute = payload;
    applyGpsRoute();
    return;
  }

  destroyRouteEntities();
  activeRoute = payload;
  activeRouteKey = nextKey;
  alignedSince = 0;
  beginSent = false;
  applyGpsRoute();
}

function findAssignedTrailer(vehicle) {
  if (!vehicle) return null;
  let leaseId = null;
  try { leaseId = vehicle.getVariable("truckerLeaseId"); } catch {}
  if (!leaseId) return null;
  let result = null;
  try {
    mp.vehicles.forEachInStreamRange((candidate) => {
      if (result || candidate === vehicle) return;
      try {
        if (candidate.getVariable("truckerTrailer") === true && candidate.getVariable("truckerLeaseId") === leaseId) {
          result = candidate;
        }
      } catch {}
    });
  } catch {}
  return result;
}

function getAlignmentState() {
  const player = mp.players.local;
  const vehicle = player?.vehicle;
  const point = activeRoute?.point;
  if (!vehicle || !point || stageProgress) return { valid: false, distance: Number.MAX_SAFE_INTEGER };
  let entity = vehicle;
  if (activeRoute.vehicleType === "truck") {
    try { if (!vehicle.isAttachedToTrailer()) return { valid: false, distance: Number.MAX_SAFE_INTEGER }; } catch { return { valid: false, distance: Number.MAX_SAFE_INTEGER }; }
    entity = findAssignedTrailer(vehicle) || vehicle;
  }
  const distance = mp.game.system.vdist(
    entity.position.x, entity.position.y, entity.position.z,
    Number(point.x), Number(point.y), Number(point.z)
  );
  let speed = 0;
  let heading = 0;
  try { speed = Number(entity.getSpeed() || 0); } catch {}
  try { heading = Number(entity.getHeading() || 0); } catch {}
  const targetHeading = Number(point.heading || 0);
  const rawDelta = Math.abs((((heading - targetHeading) % 360) + 540) % 360 - 180);
  const valid = distance <= Number(activeRoute.radius || 5)
    && speed <= 0.8
    && (Number(point.heading) < 0 || rawDelta <= Number(activeRoute.headingTolerance || 40));
  return { valid, distance };
}

function drawText(text, x, y, scale, color = [255, 255, 255, 235]) {
  mp.game.graphics.drawText(String(text), [x, y], {
    font: 4,
    color,
    scale: [scale, scale],
    outline: true,
    centre: true,
  });
}

function drawRouteMarker(alignment) {
  const point = activeRoute?.point;
  if (!point) return;
  const valid = alignment.valid;
  const radius = Number(activeRoute.radius || 5);
  mp.game.graphics.drawMarker(
    1,
    Number(point.x), Number(point.y), Number(point.z) - 1,
    0, 0, 0, 0, 0, Number(point.heading) >= 0 ? Number(point.heading) : 0,
    radius * 1.7, radius * 1.7, 1.2,
    valid ? 64 : 235, valid ? 220 : 72, valid ? 120 : 72, 155,
    false, false, 2, false, null, null, false
  );
  if (alignment.distance <= Math.max(18, radius * 3)) {
    const label = activeRoute.phase === "pickup" ? "Погрузка" : "Разгрузка";
    drawText(valid ? `${label}: позиция верная` : `${label}: выровняйте транспорт`, 0.5, 0.79, 0.4, valid ? [92, 255, 145, 240] : [255, 105, 105, 240]);
    drawText(valid ? (activeRoute.autoStart ? "Удерживайте позицию 1 секунду или нажмите E" : "Нажмите E") : "Маркер станет зелёным при точной остановке", 0.5, 0.83, 0.32);
  }
}

function drawStageProgress() {
  if (!stageProgress) return;
  const duration = Math.max(1, Number(stageProgress.durationMs || 1));
  const remaining = Math.max(0, Number(stageProgress.endsAt || 0) - Date.now());
  const progress = Math.max(0, Math.min(1, 1 - remaining / duration));
  mp.game.graphics.drawRect(0.5, 0.5, 1, 1, 3, 5, 10, 205);
  mp.game.graphics.drawRect(0.5, 0.5, 0.36, 0.23, 12, 17, 27, 245);
  drawText(stageProgress.title || "Обработка груза", 0.5, 0.435, 0.58);
  drawText(stageProgress.cargo || "Груз", 0.5, 0.48, 0.37, [205, 220, 240, 235]);
  drawText(`${Math.ceil(remaining / 1000)} сек.`, 0.5, 0.525, 0.42, [116, 223, 255, 245]);
  mp.game.graphics.drawRect(0.5, 0.575, 0.28, 0.018, 0, 0, 0, 190);
  mp.game.graphics.drawRect(0.36 + progress * 0.14, 0.575, 0.28 * progress, 0.018, 67, 201, 255, 235);
  drawText("Не двигайтесь и не покидайте транспорт", 0.5, 0.615, 0.29, [176, 189, 207, 225]);
}

function openResult(payload) {
  let opened = false;
  try {
    opened = global.interfaceLock?.openInterface?.(RESULT_INTERFACE, payload, {
      interactive: true,
      owner: RESULT_OWNER,
    }) !== false;
  } catch (error) {
    try { mp.console.logError(`[TRUCKER] Result open failed: ${error.message}`); } catch {}
  }
  if (!opened) notify(`Груз доставлен. Выплата: $${Number(payload.finalPayout || 0).toLocaleString("ru-RU")}`, "success");
}

(global.bindKey || ((key, hold, callback) => mp.keys.bind(key, hold, callback)))(E_KEY, false, () => {
  if (!activeRoute || stageProgress || beginSent || mp.gui.cursor.visible) return;
  const alignment = getAlignmentState();
  if (!alignment.valid) return;
  beginSent = true;
  mp.events.callRemote("server:trucker:beginStage");
  setTimeout(() => { if (!stageProgress) beginSent = false; }, 2500);
});

mp.events.add("render", () => {
  if (stageProgress) {
    drawStageProgress();
    return;
  }
  if (!activeRoute) return;
  const alignment = getAlignmentState();
  drawRouteMarker(alignment);
  if (alignment.valid) {
    if (!alignedSince) alignedSince = Date.now();
    if (activeRoute.autoStart && !beginSent && Date.now() - alignedSince >= Number(activeRoute.stableMs || 1000)) {
      beginSent = true;
      mp.events.callRemote("server:trucker:beginStage");
      setTimeout(() => { if (!stageProgress) beginSent = false; }, 2500);
    }
  } else {
    alignedSince = 0;
    beginSent = false;
  }
});

mp.events.add("client:trucker:tablet:update", (rawPayload) => {
  const payload = rawPayload === "null" ? null : parseJson(rawPayload, null);
  patchTablet(payload);
});

mp.events.add("client:trucker:setRoute", (rawPayload) => setRoute(parseJson(rawPayload, {})));
mp.events.add("client:trucker:clearRoute", clearRoute);
mp.events.add("client:trucker:clear", () => {
  clearRoute();
  closeResult();
  closeRental();
  patchTablet(null);
});

mp.events.add("client:trucker:stageStarted", (rawPayload) => {
  stageProgress = parseJson(rawPayload, null);
  if (stageProgress) {
    stageProgress.endsAt = Date.now() + Math.max(0, Number(stageProgress.durationMs || 0));
  }
  beginSent = true;
});

mp.events.add("client:trucker:stageCancelled", (reason, cargoValidity) => {
  stageProgress = null;
  beginSent = false;
  alignedSince = 0;
  notify(`${String(reason || "Операция прервана")}. Сохранность: ${Math.round(Number(cargoValidity || 0))}%.`, "error");
});

mp.events.add("client:trucker:stageComplete", () => {
  stageProgress = null;
  beginSent = false;
  alignedSince = 0;
});

mp.events.add("client:trucker:result", (rawPayload) => openResult(parseJson(rawPayload, {})));

mp.events.add("client:trucker:rental:open", (rawPayload) => {
  const payload = parseJson(rawPayload, { vehicles: [] });
  try {
    global.interfaceLock?.openPage?.(RENTAL_INTERFACE, null, payload);
  } catch (error) {
    try { mp.console.logError(`[TRUCKER] Rental menu open failed: ${error.message}`); } catch {}
  }
});
mp.events.add("client:trucker:rental:close", closeRental);
mp.events.add("truckerRental:rentFromBrowser", (rawPayload) => {
  mp.events.callRemote("server:trucker:rentVehicle", String(rawPayload || "{}"));
});
mp.events.add("truckerRental:closeFromBrowser", closeRental);

mp.events.add("tablet:trucker:requestFromBrowser", () => mp.events.callRemote("server:trucker:tablet:request"));
mp.events.add("tablet:trucker:acceptOrderFromBrowser", (rawPayload) => mp.events.callRemote("server:trucker:acceptOrder", String(rawPayload || "{}")));
mp.events.add("tablet:trucker:unlockSkillFromBrowser", (rawPayload) => mp.events.callRemote("server:trucker:unlockSkill", String(rawPayload || "{}")));
mp.events.add("tablet:trucker:restoreRouteFromBrowser", () => {
  applyGpsRoute();
  mp.events.callRemote("server:trucker:restoreRoute");
});
mp.events.add("tablet:trucker:cancelOrderFromBrowser", (rawPayload) => mp.events.callRemote("server:trucker:cancelOrder", String(rawPayload || "{}")));

mp.events.add("truckerResult:closeFromBrowser", () => {
  closeResult();
});

mp.events.add("interface:lock:closing", (page) => {
  if (page === RESULT_INTERFACE || page === "*") {
    try { global.interfaceLock?.releaseInteraction?.(RESULT_OWNER); } catch {}
  }
});

// A client-side playerQuit event is also emitted when any remote player leaves.
// Clearing here used to remove the local driver's GPS route at random.
setInterval(() => {
  if (!activeRoute) return;
  applyGpsRoute();
}, 1500);

try { mp.console.logInfo("[TRUCKER] Client loaded"); } catch {}
