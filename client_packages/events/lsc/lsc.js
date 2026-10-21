"use strict";

const PAGE_NAME = "ls-customs";
const INTERACT_KEY = 0x45; // E
const ESCAPE_KEY = 0x1B;

const MOD_TYPES = {
  spoiler: 0,
  front_bumper: 1,
  rear_bumper: 2,
  sideskirt: 3,
  exhaust: 4,
  frame: 5,
  grille: 6,
  hood: 7,
  roof: 10,
  engine: 11,
  brakes: 12,
  transmission: 13,
  horn: 14,
  suspension: 15,
  armor: 16,
  rims: 23,
  livery: 48,
};

let availablePoint = null;
let isOpen = false;
let currentVehicle = null;
let currentPayload = null;
let savedTuning = null;
let previewTuning = null;
let camera = null;
let originalHeading = null;

function parseJson(raw, fallback = {}) {
  try { return typeof raw === "string" ? JSON.parse(raw) : (raw || fallback); } catch { return fallback; }
}
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function clampColor(color) {
  return Array.isArray(color) ? color.slice(0, 3).map((value) => Math.max(0, Math.min(255, Number(value) || 0))) : [0, 0, 0];
}
function hexToRgb(value) {
  const match = String(value || "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const number = parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}
function getVehicleTuning(vehicle) {
  try {
    const raw = vehicle?.getVariable?.("tuning");
    return raw == null || raw === "" ? null : parseJson(raw, null);
  } catch { return null; }
}
function setHeadlights(vehicle, index) {
  try {
    if (Number(index) < 0) {
      vehicle.toggleMod(22, false);
      vehicle.setMod(22, -1);
      return;
    }
    vehicle.toggleMod(22, true);
    mp.game.invoke("0xE41033B25D003A07", vehicle.handle, Number(index));
  } catch {}
}
function setNeon(vehicle, data) {
  try {
    const enabled = Boolean(data?.enabled);
    for (let index = 0; index < 4; index += 1) vehicle.setNeonLightEnabled(index, enabled);
    if (enabled) vehicle.setNeonLightsColour(...clampColor(data.color));
  } catch {}
}
function applyTuning(vehicle, raw) {
  if (!vehicle || vehicle.type !== "vehicle") return;
  const tuning = parseJson(raw, null);
  if (!tuning || typeof tuning !== "object") return;
  try { vehicle.setModKit(0); } catch {}
  for (const [name, modType] of Object.entries(MOD_TYPES)) {
    const index = Number(tuning.mods?.[name] ?? -1);
    try { vehicle.setMod(modType, Number.isFinite(index) ? index : -1); } catch {}
  }
  try { vehicle.toggleMod(18, Boolean(tuning.turbo)); } catch {}
  try { vehicle.setWindowTint(Number(tuning.tint ?? -1) + 1); } catch {}
  try { vehicle.setNumberPlateTextIndex(Number(tuning.plate ?? -1) + 1); } catch {}
  setHeadlights(vehicle, Number(tuning.lights ?? -1));
  setNeon(vehicle, tuning.neon);
  try {
    if (tuning.paint?.primary?.enabled) {
      const color = clampColor(tuning.paint.primary.color);
      vehicle.setModColor1(Number(tuning.paint.primary.type || 0), 0, 0);
      vehicle.setCustomPrimaryColour(...color);
    } else vehicle.clearCustomPrimaryColour();
    if (tuning.paint?.secondary?.enabled) {
      const color = clampColor(tuning.paint.secondary.color);
      vehicle.setModColor2(Number(tuning.paint.secondary.type || 0), 0);
      vehicle.setCustomSecondaryColour(...color);
    } else vehicle.clearCustomSecondaryColour();
  } catch {}
}
function enrichCategories(payload, vehicle) {
  payload.categories = (payload.categories || []).map((category) => {
    if (!Number.isFinite(Number(category.modType))) return category;
    let amount = 0;
    try { vehicle.setModKit(0); amount = Math.max(0, Number(vehicle.getNumMods(Number(category.modType))) || 0); } catch {}
    if (!category.dynamic) {
      return {
        ...category,
        available: amount > 0,
        options: (category.options || []).map((option) => ({
          ...option,
          available: Number(option.gameModIndex) < 0 || Number(option.gameModIndex) < amount,
        })),
      };
    }
    const basePrice = Number(category.options?.[0]?.price || 0);
    return {
      ...category,
      available: amount > 0,
      options: [
        { id: "stock", name: "Стандарт", gameModIndex: -1, price: basePrice },
        ...Array.from({ length: amount }, (_, index) => ({ id: `mod:${index}`, name: `Вариант ${index + 1}`, gameModIndex: index, price: basePrice })),
      ],
    };
  });
  return payload;
}
function createCamera(point) {
  destroyCamera();
  if (!point?.camera || !point?.lookAt) return;
  const position = new mp.Vector3(Number(point.camera.x), Number(point.camera.y), Number(point.camera.z));
  camera = mp.cameras.new("default", position, new mp.Vector3(0, 0, 0), 58);
  camera.pointAtCoord(Number(point.lookAt.x), Number(point.lookAt.y), Number(point.lookAt.z));
  camera.setActive(true);
  mp.game.cam.renderScriptCams(true, true, 500, true, false);
}
function destroyCamera() {
  try { mp.game.cam.renderScriptCams(false, true, 350, true, false); } catch {}
  try { camera?.destroy(); } catch {}
  camera = null;
}
function openPage(payload) {
  if (!global.interfaceLock) return false;
  return Boolean(global.interfaceLock.openPage(PAGE_NAME, null, payload));
}
function updatePage() {
  if (!isOpen || !currentPayload || !global.interfaceLock) return;
  global.interfaceLock.openPage(PAGE_NAME, null, currentPayload);
}
function setInteractionHint(visible) {
  try {
    mp.events.call(
      "c:hud:interaction",
      JSON.stringify(visible ? { key: "E", holdRequired: false } : null),
    );
  } catch {}
}
function refreshInteractionHint() {
  const hasVehicle = Boolean(mp.players.local?.vehicle);
  const hasOpenPage = Boolean(global.interfaceLock?.getInterfaceState?.()?.activePage);
  setInteractionHint(availablePoint !== null && hasVehicle && !isOpen && !hasOpenPage);
}
function closeLocal(notifyServer = true) {
  if (!isOpen && !currentVehicle) return;
  if (currentVehicle && savedTuning) applyTuning(currentVehicle, savedTuning);
  try {
    if (currentVehicle && originalHeading !== null) currentVehicle.setHeading(originalHeading);
    currentVehicle?.freezePosition(false);
  } catch {}
  destroyCamera();
  if (global.interfaceLock) global.interfaceLock.closePage(PAGE_NAME);
  isOpen = false;
  currentVehicle = null;
  currentPayload = null;
  previewTuning = null;
  savedTuning = null;
  originalHeading = null;
  refreshInteractionHint();
  if (notifyServer) {
    try { mp.events.callRemote("server:lsc:close"); } catch {}
  }
}
function preview(categoryId, optionId, gameModIndex, color) {
  if (!isOpen || !currentVehicle || !previewTuning) return;
  const category = String(categoryId || "");
  const index = Number(gameModIndex ?? -1);
  if (MOD_TYPES[category] !== undefined) previewTuning.mods[category] = index;
  else if (category === "turbo") previewTuning.turbo = index >= 0;
  else if (category === "tint") previewTuning.tint = index;
  else if (category === "lights") previewTuning.lights = index;
  else if (category === "plate") previewTuning.plate = index;
  else if (category === "neon") {
    previewTuning.neon.enabled = index >= 0;
    const rgb = hexToRgb(color);
    if (rgb) previewTuning.neon.color = rgb;
  } else if (category === "paint") {
    const rgb = hexToRgb(color);
    if (rgb && (optionId === "primary" || optionId === "secondary")) {
      previewTuning.paint[optionId].enabled = true;
      previewTuning.paint[optionId].color = rgb;
    }
  }
  applyTuning(currentVehicle, previewTuning);
}

mp.events.add("client:lsc:setAvailable", (pointIndex, state) => {
  availablePoint = state ? Number(pointIndex) : null;
  refreshInteractionHint();
  if (!state && isOpen) closeLocal(false);
});
mp.events.add("client:lsc:open", (payloadJson) => {
  const vehicle = mp.players.local.vehicle;
  setInteractionHint(false);
  if (!vehicle) return;
  const payload = enrichCategories(parseJson(payloadJson, {}), vehicle);
  currentVehicle = vehicle;
  currentPayload = payload;
  try { originalHeading = Number(vehicle.getHeading()); } catch { originalHeading = null; }
  savedTuning = clone(getVehicleTuning(vehicle));
  previewTuning = clone(savedTuning);
  try {
    vehicle.freezePosition(true);
    vehicle.setOnGroundProperly();
    if (payload.point?.heading !== undefined) vehicle.setHeading(Number(payload.point.heading));
  } catch {}
  createCamera(payload.point);
  isOpen = openPage(payload);
  if (!isOpen) closeLocal(true);
});
mp.events.add("client:lsc:close", () => closeLocal(false));
mp.events.add("client:lsc:purchaseSuccess", (resultJson) => {
  if (!isOpen || !currentPayload) return;
  const result = parseJson(resultJson, {});
  currentPayload.installed = result.installed || currentPayload.installed;
  currentPayload.balance = result.balance || currentPayload.balance;
  savedTuning = clone(result.tuning || getVehicleTuning(currentVehicle));
  previewTuning = clone(savedTuning);
  applyTuning(currentVehicle, savedTuning);
  updatePage();
});
mp.events.add("ls-customs:setCategoryFromBrowser", () => {
  if (currentVehicle && savedTuning) {
    previewTuning = clone(savedTuning);
    applyTuning(currentVehicle, previewTuning);
  }
});
mp.events.add("ls-customs:previewFromBrowser", (categoryId, optionId, gameModIndex, color) => preview(categoryId, optionId, gameModIndex, color));
mp.events.add("ls-customs:previewColorFromBrowser", (categoryId, optionId, color) => {
  const category = currentPayload?.categories?.find((item) => String(item.id) === String(categoryId));
  const option = category?.options?.find((item) => String(item.id) === String(optionId));
  preview(categoryId, optionId, option?.gameModIndex ?? -1, color);
});
mp.events.add("ls-customs:restorePreviewFromBrowser", () => {
  if (!currentVehicle || !savedTuning) return;
  previewTuning = clone(savedTuning);
  applyTuning(currentVehicle, savedTuning);
});
mp.events.add("ls-customs:rotateFromBrowser", (delta) => {
  if (!isOpen || !currentVehicle) return;
  try { currentVehicle.setHeading(currentVehicle.getHeading() + Math.max(-40, Math.min(40, Number(delta) || 0)) * 0.18); } catch {}
});
mp.events.add("ls-customs:buyFromBrowser", (sessionId, categoryId, optionId, color, paymentType) => {
  if (!isOpen) return;
  mp.events.callRemote("server:lsc:buy", String(sessionId), String(categoryId), String(optionId), color ? String(color) : "", String(paymentType));
});
mp.events.add("ls-customs:closeFromBrowser", () => closeLocal(true));

mp.keys.bind(INTERACT_KEY, false, () => {
  if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return;
  if (availablePoint === null || isOpen || global.interfaceLock?.getInterfaceState?.()?.activePage) return;
  mp.events.callRemote("server:lsc:requestOpen", availablePoint);
});
mp.keys.bind(ESCAPE_KEY, false, () => { if (global.__TWINKLE_MINING_CHALLENGE_ACTIVE__) return; if (isOpen) closeLocal(true); });

mp.events.add("entityStreamIn", (entity) => {
  if (entity?.type === "vehicle") applyTuning(entity, getVehicleTuning(entity));
});
if (typeof mp.events.addDataHandler === "function") {
  mp.events.addDataHandler("tuning", (entity, value) => {
    if (entity?.type === "vehicle" && entity !== currentVehicle) applyTuning(entity, value);
  });
}
mp.events.add("playerEnterVehicle", () => refreshInteractionHint());
mp.events.add("playerLeaveVehicle", () => {
  setInteractionHint(false);
  if (isOpen) closeLocal(true);
});
mp.events.add("playerQuit", () => { setInteractionHint(false); isOpen = false; currentVehicle = null; });

setTimeout(() => {
  try { mp.vehicles.forEach((vehicle) => applyTuning(vehicle, getVehicleTuning(vehicle))); } catch {}
}, 1000);

console.log("[LS CUSTOMS] Client loaded");
