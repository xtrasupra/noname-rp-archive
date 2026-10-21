"use strict";

const PAGE_NAME = "rent-car";
const E_KEY = 0x45;
let rentCarOpen = false;
let rentCarHint = false;
let pendingSeatVehicleId = null;
let pendingSeatTimer = null;

function acknowledgeStreamedRentalVehicle() {
  if (!Number.isInteger(pendingSeatVehicleId)) return false;

  const vehicle = mp.vehicles.atRemoteId(pendingSeatVehicleId);
  if (!vehicle || !mp.vehicles.exists(vehicle)) return false;

  const vehicleId = pendingSeatVehicleId;
  pendingSeatVehicleId = null;

  if (pendingSeatTimer) {
    clearTimeout(pendingSeatTimer);
    pendingSeatTimer = null;
  }

  mp.events.callRemote("server:rentCar:vehicleStreamed", vehicleId);
  return true;
}

function parsePayload(raw) {
  try {
    if (raw && typeof raw === "object") return raw;
    return JSON.parse(String(raw || "{}"));
  } catch {
    return { vehicles: [], minHours: 1, maxHours: 8 };
  }
}

function closeRentCar() {
  rentCarOpen = false;

  if (global.interfaceLock) {
    global.interfaceLock.closePage(PAGE_NAME);
    setTimeout(() => {
      const state = global.interfaceLock?.getInterfaceState?.();
      if (!state?.activePage) {
        global.interfaceLock?.showHud?.(null, true);
      }
    }, 100);
  } else if (typeof global.closePage === "function") {
    global.closePage(PAGE_NAME);
  }
}

mp.events.add("client:rentCar:open", (payloadJson = "{}") => {
  const payload = parsePayload(payloadJson);

  if (!global.interfaceLock) return;

  const opened = global.interfaceLock.openPage(PAGE_NAME, null, payload);
  rentCarOpen = Boolean(opened);
});

mp.events.add("client:rentCar:close", () => {
  closeRentCar();
});

mp.events.add("client:rentCar:setHint", (state) => {
  rentCarHint = Boolean(state);
});

mp.events.add("client:rentCar:vehicleReady", (vehicleIdRaw) => {
  const vehicleId = Number(vehicleIdRaw);
  if (!Number.isInteger(vehicleId) || vehicleId < 0) return;

  pendingSeatVehicleId = vehicleId;
  acknowledgeStreamedRentalVehicle();

  if (pendingSeatVehicleId !== null) {
    if (pendingSeatTimer) clearTimeout(pendingSeatTimer);
    pendingSeatTimer = setTimeout(() => {
      pendingSeatVehicleId = null;
      pendingSeatTimer = null;
    }, 10000);
  }
});

mp.events.add("entityStreamIn", (entity) => {
  if (!entity || entity.type !== "vehicle") return;
  if (Number(entity.remoteId) !== pendingSeatVehicleId) return;
  acknowledgeStreamedRentalVehicle();
});

const bindKey = global.bindKey || ((key, hold, callback) => {
  mp.keys.bind(key, hold, callback);
});

bindKey(E_KEY, false, () => {
  if (!rentCarHint || rentCarOpen) return;
  if (!global.__TWINKLE_GAMEPLAY_READY__) return;
  if (global.interfaceLock?.getInterfaceState?.()?.activePage) return;

  mp.events.callRemote("server:rentCar:open");
}, {
  allowWhenBlocked: false,
  closeChatBefore: false,
});

mp.events.add("rent-car:rentFromBrowser", (vehicleId, colorId, hours, paymentType) => {
  mp.events.callRemote(
    "server:rentCar:rent",
    Number(vehicleId),
    Number(colorId),
    Number(hours),
    String(paymentType || "")
  );
});

mp.events.add("rent-car:closeFromBrowser", () => {
  closeRentCar();
});

mp.events.add("interface:lock:closing", (page) => {
  if (!rentCarOpen) return;
  if (String(page) !== PAGE_NAME && String(page) !== "*") return;
  rentCarOpen = false;
});

mp.events.add("playerQuit", () => {
  rentCarOpen = false;
  rentCarHint = false;
  pendingSeatVehicleId = null;
  if (pendingSeatTimer) clearTimeout(pendingSeatTimer);
  pendingSeatTimer = null;
});

console.log("[RENT CAR] Client loaded");
