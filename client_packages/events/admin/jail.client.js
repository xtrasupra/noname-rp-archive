"use strict";

const CONTROL_IDS = Object.freeze([
  21, 22, 23, 24, 25, 37, 44, 45, 58, 75, 140, 141, 142, 143, 257, 263, 264,
]);

let jailState = null;
let lastOutfitApplyAt = 0;
let lastLocalCorrectionAt = 0;

function parsePayload(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizePayload(raw) {
  const payload = parsePayload(raw);
  if (!payload.active) return null;

  const bounds = payload.bounds || {};
  const spawn = payload.spawn || {};
  const validBounds = [
    bounds.minX,
    bounds.maxX,
    bounds.minY,
    bounds.maxY,
    bounds.minZ,
    bounds.maxZ,
  ].every(finite);
  const validSpawn = [spawn.x, spawn.y, spawn.z].every(finite);

  if (!validBounds || !validSpawn) return null;

  const remainingSeconds = Math.max(0, Number(payload.remainingSeconds || 0));

  return {
    active: true,
    reason: String(payload.reason || ""),
    remainingSeconds,
    expiresAt: Date.now() + remainingSeconds * 1000,
    bounds: {
      minX: Number(bounds.minX),
      maxX: Number(bounds.maxX),
      minY: Number(bounds.minY),
      maxY: Number(bounds.maxY),
      minZ: Number(bounds.minZ),
      maxZ: Number(bounds.maxZ),
      centerX: finite(bounds.centerX) ? Number(bounds.centerX) : null,
      centerY: finite(bounds.centerY) ? Number(bounds.centerY) : null,
      maxHorizontalDistance: finite(bounds.maxHorizontalDistance)
        ? Number(bounds.maxHorizontalDistance)
        : null,
    },
    spawn: {
      x: Number(spawn.x),
      y: Number(spawn.y),
      z: Number(spawn.z),
      heading: Number(spawn.heading || 0),
    },
    dimension: Number(payload.dimension || 0),
    outfit: payload.outfit && typeof payload.outfit === "object" ? payload.outfit : null,
  };
}

function applyPrisonOutfit() {
  const player = mp.players.local;
  const outfit = jailState?.outfit;
  if (!player?.handle || !outfit) return;

  const components = outfit.components || {};
  for (const [componentId, item] of Object.entries(components)) {
    if (!item) continue;

    try {
      player.setComponentVariation(
        Number(componentId),
        Number(item.drawable || 0),
        Number(item.texture || 0),
        Number(item.palette || 0)
      );
    } catch {}
  }

  for (const propId of outfit.clearProps || []) {
    try {
      player.clearProp(Number(propId));
    } catch {}
  }

  lastOutfitApplyAt = Date.now();
}

function setWeaponLock(enabled) {
  const player = mp.players.local;
  if (!player?.handle) return;

  try {
    player.setCanSwitchWeapon(!enabled);
  } catch {}

  if (enabled) {
    try {
      mp.game.weapon.setCurrentPedWeapon(
        player.handle,
        mp.game.joaat("weapon_unarmed"),
        true
      );
    } catch {}
  }
}

function setJailState(raw, forcePosition = false) {
  const nextState = normalizePayload(raw);

  if (!nextState) {
    jailState = null;
    setWeaponLock(false);
    return;
  }

  jailState = nextState;
  setWeaponLock(true);
  applyPrisonOutfit();

  if (forcePosition) correctLocalPosition(true);
}

function isInsideCell(position) {
  if (!jailState || !position) return false;
  const bounds = jailState.bounds;

  const insideAxisBounds = (
    finite(position.x) &&
    finite(position.y) &&
    finite(position.z) &&
    Number(position.x) >= bounds.minX &&
    Number(position.x) <= bounds.maxX &&
    Number(position.y) >= bounds.minY &&
    Number(position.y) <= bounds.maxY &&
    Number(position.z) >= bounds.minZ &&
    Number(position.z) <= bounds.maxZ
  );

  if (!insideAxisBounds) return false;

  if (
    finite(bounds.centerX) &&
    finite(bounds.centerY) &&
    finite(bounds.maxHorizontalDistance) &&
    Number(bounds.maxHorizontalDistance) > 0
  ) {
    const dx = Number(position.x) - Number(bounds.centerX);
    const dy = Number(position.y) - Number(bounds.centerY);
    return Math.sqrt(dx * dx + dy * dy) <= Number(bounds.maxHorizontalDistance);
  }

  return true;
}

function correctLocalPosition(force = false) {
  const player = mp.players.local;
  if (!jailState || !player?.handle) return false;

  const now = Date.now();
  const needsCorrection = force || Boolean(player.vehicle) || !isInsideCell(player.position);
  if (!needsCorrection || (!force && now - lastLocalCorrectionAt < 150)) return false;

  lastLocalCorrectionAt = now;

  try {
    if (player.vehicle) player.clearTasksImmediately();
  } catch {}

  try {
    player.setVelocity(0, 0, 0);
    player.setCoordsNoOffset(
      jailState.spawn.x,
      jailState.spawn.y,
      jailState.spawn.z,
      false,
      false,
      false
    );
    player.setHeading(jailState.spawn.heading);
    return true;
  } catch {
    return false;
  }
}

function disableRestrictedControls() {
  for (const control of CONTROL_IDS) {
    try {
      mp.game.controls.disableControlAction(0, control, true);
      mp.game.controls.disableControlAction(1, control, true);
      mp.game.controls.disableControlAction(2, control, true);
    } catch {}
  }
}

function formatRemaining() {
  if (!jailState) return "00:00:00";

  const total = Math.max(0, Math.ceil((jailState.expiresAt - Date.now()) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function drawFallbackTimer() {
  try {
    mp.game.graphics.drawText(`ДЕМОРГАН · ${formatRemaining()}`, [0.5, 0.91], {
      font: 4,
      color: [255, 89, 89, 235],
      scale: [0.4, 0.4],
      outline: true,
      centre: true,
    });
  } catch {}
}

mp.events.add("c:jail:set", (rawPayload) => {
  setJailState(rawPayload, false);
});

mp.events.add("c:jail:correctPosition", (rawPayload) => {
  setJailState(rawPayload, true);
});

mp.events.add("c:hud:gameplayReady", (ready) => {
  if (!ready) return;

  try {
    mp.events.callRemote("s:jail:requestSync");
  } catch {}
});

mp.events.add("playerEnterVehicle", () => {
  if (jailState) correctLocalPosition(true);
});

mp.events.add("render", () => {
  if (!jailState) return;

  disableRestrictedControls();
  setWeaponLock(true);
  correctLocalPosition(false);
  drawFallbackTimer();

  if (Date.now() - lastOutfitApplyAt >= 3000) {
    applyPrisonOutfit();
  }
});

global.twinkleJailClient = {
  isActive: () => Boolean(jailState),
  getRemainingSeconds: () => jailState
    ? Math.max(0, Math.ceil((jailState.expiresAt - Date.now()) / 1000))
    : 0,
};

console.log("[JAIL] Client controller loaded");
