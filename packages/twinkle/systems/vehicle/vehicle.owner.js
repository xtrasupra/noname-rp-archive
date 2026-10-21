"use strict";

function getAdminLevel(player) {
  return Number(
    player?.adminLevel ||
    player?.admin_level ||
    player?.admin ||
    player?.character?.admin_level ||
    player?.characterData?.admin_level ||
    player?.getVariable?.("adminLevel") ||
    player?.getVariable?.("admin") ||
    0
  );
}

function getPlayerUuid(player) {
  return Number(
    player?.uuid ||
    player?.characterId ||
    player?.character?.uuid ||
    player?.characterData?.uuid ||
    player?.getVariable?.("uuid") ||
    0
  );
}

function getVehicleOwnerType(vehicle) {
  try {
    return String(vehicle?.getVariable?.("ownerType") || "none");
  } catch {}

  return "none";
}

function getVehicleOwnerId(vehicle) {
  try {
    return Number(vehicle?.getVariable?.("ownerId") || 0);
  } catch {}

  return 0;
}

function getVehicleStorageKey(vehicle) {
  if (!vehicle) return "";

  const ownerId = Math.max(0, Number(getVehicleOwnerId(vehicle) || 0));
  const modelHash = Number(vehicle.model || 0) >>> 0;
  let plate = "NO_PLATE";

  try {
    plate = String(
      vehicle.numberPlate ||
      vehicle.getVariable?.("numberPlate") ||
      vehicle.getVariable?.("plate") ||
      "NO_PLATE"
    ).trim().toUpperCase();
  } catch {}

  return `${ownerId}:${modelHash}:${plate || "NO_PLATE"}`;
}

function isAdminVehicle(vehicle) {
  const ownerType = getVehicleOwnerType(vehicle);

  if (ownerType === "admin") return true;

  try {
    return Boolean(vehicle?.getVariable?.("adminVehicle"));
  } catch {}

  return false;
}

function canControlVehicle(player, vehicle) {
  if (!player || !vehicle) return false;

  const adminLevel = getAdminLevel(player);

  if (isAdminVehicle(vehicle)) {
    return adminLevel >= 1;
  }

  const ownerType = getVehicleOwnerType(vehicle);
  const ownerId = getVehicleOwnerId(vehicle);
  const playerUuid = getPlayerUuid(player);

  if (ownerType === "player") {
    return playerUuid > 0 && ownerId === playerUuid;
  }

  return false;
}

module.exports = {
  getAdminLevel,
  getPlayerUuid,
  getVehicleOwnerType,
  getVehicleOwnerId,
  getVehicleStorageKey,
  isAdminVehicle,
  canControlVehicle,
};

console.log("[VEHICLE OWNER] Loaded");
