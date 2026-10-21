"use strict";

const PAGE_NAME = "auto-service";
let opened = false;
let currentPayload = null;
let closingFromServer = false;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parsePayload(raw) {
  let value;
  try {
    value = raw && typeof raw === "object" ? raw : JSON.parse(String(raw || "{}"));
  } catch {
    return null;
  }

  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    value.contractVersion !== 1 ||
    typeof value.sessionId !== "string" || !/^[0-9a-f]{32}$/.test(value.sessionId) ||
    !Number.isInteger(value.serviceFee) || value.serviceFee < 1 ||
    !isFiniteNumber(value.cash) || value.cash < 0 ||
    !Array.isArray(value.vehicles) || value.vehicles.length > 100
  ) return null;

  const validVehicles = value.vehicles.every((vehicle) => (
    vehicle && typeof vehicle === "object" && !Array.isArray(vehicle) &&
    Number.isSafeInteger(vehicle.id) && vehicle.id > 0 &&
    typeof vehicle.model === "string" && vehicle.model.length >= 1 && vehicle.model.length <= 64 &&
    typeof vehicle.name === "string" && vehicle.name.length >= 1 && vehicle.name.length <= 96 &&
    typeof vehicle.plate === "string" && vehicle.plate.length <= 8 &&
    isFiniteNumber(vehicle.fuel) && vehicle.fuel >= 0 && vehicle.fuel <= 10000 &&
    isFiniteNumber(vehicle.mileage) && vehicle.mileage >= 0 && vehicle.mileage <= 1000000000 &&
    ["stored", "outside", "unavailable"].includes(vehicle.location) &&
    typeof vehicle.spawnable === "boolean" &&
    (vehicle.disabledReason === null || (typeof vehicle.disabledReason === "string" && vehicle.disabledReason.length <= 160))
  ));

  if (!validVehicles) return null;
  return value;
}

function closeLocal(notifyServer) {
  if (!opened && global.interfaceLock?.getInterfaceState?.()?.activePage !== PAGE_NAME) return;
  opened = false;
  currentPayload = null;
  closingFromServer = true;
  try { global.ui?.close?.(PAGE_NAME); } catch {}
  closingFromServer = false;
  if (notifyServer) {
    try { mp.events.callRemote("server:autoService:close"); } catch {}
  }
}

mp.events.add("client:autoService:open", (payloadJson) => {
  const payload = parsePayload(payloadJson);
  if (!payload || !global.ui) {
    try { mp.events.callRemote("server:autoService:close"); } catch {}
    return;
  }

  const didOpen = global.ui.open(PAGE_NAME, payload, {
    chat: false,
    retryKey: `${PAGE_NAME}:payload`,
  });
  if (!didOpen) {
    try { mp.events.callRemote("server:autoService:close"); } catch {}
    return;
  }

  currentPayload = payload;
  opened = true;
});

mp.events.add("client:autoService:update", (payloadJson) => {
  const payload = parsePayload(payloadJson);
  if (!opened || !payload || payload.sessionId !== currentPayload?.sessionId) return;
  currentPayload = payload;
  global.ui?.update?.(PAGE_NAME, payload, { retryKey: `${PAGE_NAME}:payload` });
});

mp.events.add("client:autoService:close", () => closeLocal(false));

mp.events.add("auto-service:spawn", (sessionId, vehicleIdRaw) => {
  const vehicleId = Number(vehicleIdRaw);
  if (
    !opened || !currentPayload ||
    String(sessionId || "") !== currentPayload.sessionId ||
    !Number.isSafeInteger(vehicleId) || vehicleId <= 0 ||
    !currentPayload.vehicles.some((vehicle) => vehicle.id === vehicleId && vehicle.spawnable)
  ) return;

  mp.events.callRemote("server:autoService:spawn", currentPayload.sessionId, vehicleId);
});

mp.events.add("auto-service:refresh", (sessionId) => {
  if (!opened || String(sessionId || "") !== currentPayload?.sessionId) return;
  mp.events.callRemote("server:autoService:refresh", currentPayload.sessionId);
});

mp.events.add("auto-service:close", () => closeLocal(true));

mp.events.add("interface:lock:closing", (page) => {
  if (!opened || (String(page) !== PAGE_NAME && String(page) !== "*")) return;
  opened = false;
  currentPayload = null;
  if (!closingFromServer) {
    try { mp.events.callRemote("server:autoService:close"); } catch {}
  }
});

mp.events.add("render", () => {
  if (!opened) return;
  mp.game.controls.disableAllControlActions(0);
  mp.game.controls.disableAllControlActions(1);
  mp.game.controls.disableAllControlActions(2);
});

mp.events.add("c:twinkle:resourcesReady", () => {
  opened = false;
  currentPayload = null;
});

console.log("[AUTO SERVICE] Client loaded");
