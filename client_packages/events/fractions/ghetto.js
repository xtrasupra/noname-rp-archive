"use strict";

const SET_BLIP_COLOUR = "0x03D7FB09E75D6B7E";
const SET_BLIP_ALPHA = "0x45FF974EEE1C8734";
const SET_BLIP_FLASH_TIMER = "0xD3CD6FD297AE87CC";
const SET_BLIP_FLASHES = "0xB14552383D39CE3E";
const TERRITORY_BLIP_DISPLAY = 3;

const zoneBlips = new Map();
let zones = [];
let localFractionId = 0;
let lastReportAt = 0;
let initialRequestAttempts = 0;

function rageColor(zone) {
  return Number(zone?.rageColor || 0);
}

function center(zone) {
  return {
    x: Number(zone.centerX ?? (Number(zone.minX) + Number(zone.maxX)) / 2),
    y: Number(zone.centerY ?? (Number(zone.minY) + Number(zone.maxY)) / 2),
    z: Number(zone.z || 30),
  };
}

function radius(zone) {
  return Math.max(
    1,
    Number(
      zone.radius ??
        Math.min(
          Math.abs(Number(zone.maxX) - Number(zone.minX)),
          Math.abs(Number(zone.maxY) - Number(zone.minY))
        ) / 2
    )
  );
}

function destroyZoneBlip(blip) {
  if (!blip) return;
  try {
    if (mp.blips.exists(blip)) blip.destroy();
  } catch {
    try {
      blip.destroy();
    } catch {}
  }
}

function createZoneBlip(zone) {
  const position = center(zone);
  const blip = mp.blips.new(5, new mp.Vector3(position.x, position.y, position.z), {
    name: "",
    radius: radius(zone),
    color: rageColor(zone),
    alpha: zone.capture ? 145 : zone.isTitle ? 125 : 100,
    drawDistance: 100,
    shortRange: false,
    rotation: 0,
    dimension: -1,
  });
  blip.setDisplay(TERRITORY_BLIP_DISPLAY);

  zoneBlips.set(Number(zone.id), blip);
  return blip;
}

function rebuildZoneBlips() {
  for (const blip of zoneBlips.values()) destroyZoneBlip(blip);
  zoneBlips.clear();
  for (const zone of zones) createZoneBlip(zone);
}

function updateZoneBlip(zone) {
  const blip = zoneBlips.get(Number(zone.id));
  if (!blip) return createZoneBlip(zone);

  try {
    mp.game.invoke(SET_BLIP_COLOUR, blip.handle, rageColor(zone));
    mp.game.invoke(SET_BLIP_ALPHA, blip.handle, zone.capture ? 145 : zone.isTitle ? 125 : 100);
    mp.game.invoke(SET_BLIP_FLASH_TIMER, blip.handle, 1000);
    mp.game.invoke(SET_BLIP_FLASHES, blip.handle, Boolean(zone.capture));
  } catch (error) {
    mp.console.logError(`[GHETTO] Update zone ${zone.id}: ${error.message}`);
  }

  return blip;
}

function reportStatus(reason) {
  const now = Date.now();
  if (reason !== "debug" && now - lastReportAt < 1500) return;
  lastReportAt = now;
  try {
    mp.events.callRemote(
      "server:ghetto:clientStatus",
      String(reason || "sync"),
      Number(zones.length),
      Number(zoneBlips.size),
      "mp.blips.new:sprite5-radius:rotation0:main-map-only",
      Number(localFractionId)
    );
  } catch {}
}

function applyZones(payload) {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    zones = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.zones) ? parsed.zones : [];
    localFractionId = Number(parsed?.playerFractionId || 0);
    rebuildZoneBlips();
    reportStatus("sync");
  } catch (error) {
    mp.console.logError(`[GHETTO] Sync failed: ${error.message}`);
  }
}

mp.events.add("client:ghetto:sync", applyZones);

mp.events.add("client:ghetto:update", (payload) => {
  try {
    const zone = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (!zone || !Number(zone.id)) return;
    const index = zones.findIndex((item) => Number(item.id) === Number(zone.id));
    if (index === -1) {
      zones.push(zone);
      createZoneBlip(zone);
    } else {
      zones[index] = zone;
      updateZoneBlip(zone);
    }
  } catch (error) {
    mp.console.logError(`[GHETTO] Zone update failed: ${error.message}`);
  }
});

mp.events.add("client:ghetto:debug", () => {
  rebuildZoneBlips();
  reportStatus("debug");
});

function requestInitialSync() {
  if (zones.length || initialRequestAttempts >= 2) return;
  initialRequestAttempts += 1;
  mp.events.callRemote("server:ghetto:request");
}

setTimeout(requestInitialSync, 6000);
setTimeout(requestInitialSync, 12000);

mp.console.logInfo("[GHETTO] Gang zone renderer loaded");
