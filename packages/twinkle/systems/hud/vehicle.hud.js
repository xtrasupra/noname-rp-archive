"use strict";
const hud = require("./hud.service.js");
const UPDATE_MS = 200;
const DEFAULT_MAX_SPEED = 240;

const activePlayers = new Map();

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSeat(seat) {
  const value = Number(seat);

  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

function isDriver(player) {

    if (!player)
        return false;

    try {

        return (
            Number(player.seat) === 0 ||
            Number(player.seat) === -1
        );

    } catch {}

    return false;
}

function getVehicleSpeed(vehicle) {
  try {
    const velocity = vehicle.velocity;

    if (velocity) {
      const x = safeNumber(velocity.x);
      const y = safeNumber(velocity.y);
      const z = safeNumber(velocity.z);

      return Math.sqrt(x * x + y * y + z * z) * 3.6;
    }
  } catch {}

  return 0;
}

function getVehicleFuel(vehicle) {
  try {
    const fuel = vehicle.getVariable("fuel");

    if (fuel !== undefined && fuel !== null) {
      return clamp(safeNumber(fuel, 100), 0, getVehicleFuelMax(vehicle));
    }
  } catch {}

  return 100;
}

function getVehicleFuelMax(vehicle) {
  try {
    const fuelMax = vehicle.getVariable("fuelMax");
    if (fuelMax !== undefined && fuelMax !== null) {
      return Math.max(1, safeNumber(fuelMax, 100));
    }
  } catch {}
  return 100;
}

function getVehicleMileage(vehicle) {
  try {
    const mileage = vehicle.getVariable("mileage");

    if (mileage !== undefined && mileage !== null) {
      return Math.max(0, safeNumber(mileage, 0));
    }
  } catch {}

  return 0;
}

function getVehicleMaxSpeed(vehicle) {
  try {
    const maxSpeed = vehicle.getVariable("maxSpeed");

    if (maxSpeed !== undefined && maxSpeed !== null) {
      return Math.max(1, safeNumber(maxSpeed, DEFAULT_MAX_SPEED));
    }
  } catch {}

  return DEFAULT_MAX_SPEED;
}

function getVehicleEngineHealth(vehicle) {
  try {
    const health = vehicle.engineHealth;

    if (health !== undefined && health !== null) {
      return clamp(safeNumber(health, 1000) / 10, 0, 100);
    }
  } catch {}

  return 100;
}

function getVehicleEngineState(vehicle) {
  try {
    const engine = vehicle.getVariable("engine");

    if (engine !== undefined && engine !== null) {
      return Boolean(engine);
    }
  } catch {}

  return false;
}

function getVehicleLockedState(vehicle) {
  try {
    const locked = vehicle.getVariable("locked");

    if (locked !== undefined && locked !== null) {
      return Boolean(locked);
    }
  } catch {}

  try {
    return Number(vehicle.locked) > 0;
  } catch {}

  return false;
}

function getVehicleLightsState(vehicle) {
  try {
    const lights = vehicle.getVariable("lights");

    if (lights !== undefined && lights !== null) {
      return Boolean(lights);
    }
  } catch {}

  return false;
}

function getSeatbeltState(player) {
  try {
    const seatbelt = player.getVariable("seatbelt");

    if (seatbelt !== undefined && seatbelt !== null) {
      return Boolean(seatbelt);
    }
  } catch {}

  return false;
}

function updateVehicleHud(player, vehiclePayload) {
    hud.update(player, {
        vehicle: vehiclePayload,
    });
}

function makeVehiclePayload(player, vehicle) {
  return {
    inVehicle: true,
    isDriver: true,
    speed: Math.round(getVehicleSpeed(vehicle)),
    maxSpeed: getVehicleMaxSpeed(vehicle),
    fuel: getVehicleFuel(vehicle),
    fuelMax: getVehicleFuelMax(vehicle),
    engineHealth: getVehicleEngineHealth(vehicle),
    mileage: getVehicleMileage(vehicle),
    doorsLocked: getVehicleLockedState(vehicle),
    engineOn: getVehicleEngineState(vehicle),
    seatbeltOn: getSeatbeltState(player),
    lightsOn: getVehicleLightsState(vehicle),
  };
}

function makeHidePayload() {
  return {
    inVehicle: false,
    isDriver: false,
    speed: 0,
    maxSpeed: DEFAULT_MAX_SPEED,
    fuel: 0,
    fuelMax: 100,
    engineHealth: 0,
    mileage: 0,
    doorsLocked: false,
    engineOn: false,
    seatbeltOn: false,
    lightsOn: false,
  };
}

function sendHide(player) {
    updateVehicleHud(player, makeHidePayload());
}

function stopVehicleHud(player) {
  if (!player) return;

  const interval = activePlayers.get(player.id);

  if (interval) {
    clearInterval(interval);
    activePlayers.delete(player.id);
  }
}

function startVehicleHud(player, vehicle) {

    stopVehicleHud(player);

    if (!vehicle)
        return;

    const interval = setInterval(() => {

        if (
            !player ||
            !mp.players.exists(player)
        ) {

            clearInterval(interval);
            return;

        }

        if (
            !player.vehicle ||
            player.vehicle !== vehicle
        ) {

            stopVehicleHud(player);

            sendHide(player);

            return;

        }

        if (!isDriver(player)) {

            sendHide(player);

            return;

        }

        updateVehicleHud(
            player,
            makeVehiclePayload(player, vehicle)
        );

    }, UPDATE_MS);

    activePlayers.set(
        player.id,
        interval
    );

}

mp.events.add("playerEnterVehicle", (player, vehicle) => {

    if (!player || !mp.players.exists(player))
        return;

setTimeout(() => {

    if (!player || !mp.players.exists(player))
        return;

    if (!player.vehicle)
        return;

    if (!isDriver(player)) {
        sendHide(player);
        return;
    }

    hud.update(player, {
        vehicle: {
            inVehicle: true,
            isDriver: true
        }
    });

    startVehicleHud(player, player.vehicle);

}, 300);

});

mp.events.add("playerExitVehicle", (player) => {
    stopVehicleHud(player);
    sendHide(player);
});

mp.events.add("playerQuit", (player) => {
  stopVehicleHud(player);
  sendHide(player);
});

mp.events.add("vehicleHud:update", (player) => {
  try {
    if (!player || !mp.players.exists(player)) return;

    const vehicle = player.vehicle;

    if (!vehicle || !mp.vehicles.exists(vehicle)) {
      sendHide(player);
      return;
    }

    if (!isDriver(player)) {
      sendHide(player);
      return;
    }

    startVehicleHud(player, vehicle);
  } catch (e) {
    console.log("[VEHICLE_HUD] manual update error:", e);
    sendHide(player);
  }
});

module.exports = {
  startVehicleHud,
  stopVehicleHud,
  sendHide,
};

console.log("[VEHICLE_HUD] Loaded");
