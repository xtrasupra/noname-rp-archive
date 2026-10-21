"use strict";

const db = require("../../database/query.js");
const authFlow = require("../../auth/authFlow.js");
const config = require("./rentCar.config.js");
const { getPlayerUuid } = require("../vehicle/vehicle.owner.js");

const activeRentals = new Map();
const rentalByVehicleId = new Map();
const pendingPlayers = new Set();
let rentalSpawnReserved = false;

const pointPosition = new mp.Vector3(
  Number(config.point.position.x),
  Number(config.point.position.y),
  Number(config.point.position.z)
);

const rentalPoint = mp.colshapes.newSphere(
  pointPosition.x,
  pointPosition.y,
  pointPosition.z,
  Number(config.point.radius),
  Number(config.point.dimension)
);

const markerConfig = config.point.marker || {};
const rentalMarker = mp.markers.new(
  Number(markerConfig.type ?? 1),
  new mp.Vector3(
    pointPosition.x,
    pointPosition.y,
    pointPosition.z + Number(markerConfig.zOffset ?? -1)
  ),
  Number(markerConfig.scale ?? config.point.radius),
  {
    color: Array.isArray(markerConfig.color)
      ? markerConfig.color
      : [70, 180, 255, 180],
    visible: true,
    dimension: Number(config.point.dimension),
  }
);

rentalPoint.isRentCarPoint = true;
rentalMarker.isRentCarMarker = true;

function isValidPlayer(player) {
  return Boolean(player && mp.players.exists(player));
}

function notify(player, type, message, duration = 4500) {
  if (!isValidPlayer(player)) return;

  try {
    player.call("client:notification", [
      String(type || "info"),
      String(message || ""),
      Number(duration || 4500),
    ]);
  } catch (error) {
    console.error("[RENT CAR] Notification error:", error);
  }
}

function notifyError(player, message) {
  notify(player, "error", message);
}

function notifyInfo(player, message) {
  notify(player, "info", message);
}

function notifySuccess(player, message) {
  notify(player, "success", message);
}

function getDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isPlayerAtRentalPoint(player) {
  if (!isValidPlayer(player)) return false;
  if (Number(player.dimension) !== Number(config.point.dimension)) return false;

  try {
    return rentalPoint.isPointWithin(player.position);
  } catch {
    return getDistance(player.position, pointPosition) <= Number(config.point.radius) + 0.5;
  }
}

function getCharacter(player) {
  return player?.character || player?.characterData || null;
}

function getPublicPayload() {
  return {
    vehicles: config.vehicles.map((vehicle) => ({
      id: vehicle.id,
      model: vehicle.model,
      name: vehicle.name,
      price: vehicle.price,
      image: vehicle.image,
      colors: vehicle.colors.map((color) => ({ ...color })),
    })),
    minHours: Number(config.minHours),
    maxHours: Number(config.maxHours),
  };
}

function openRental(player) {
  if (!isValidPlayer(player)) return;
  if (!player.auth || !getCharacter(player) || !getPlayerUuid(player)) return;
  if (!authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) return;
  if (!isPlayerAtRentalPoint(player)) return;

  try {
    player.call("client:rentCar:open", [JSON.stringify(getPublicPayload())]);
  } catch (error) {
    console.error("[RENT CAR] Open UI error:", error);
  }
}

function closeRental(player) {
  if (!isValidPlayer(player)) return;
  try {
    player.call("client:rentCar:close");
  } catch (error) {
    console.error("[RENT CAR] Close UI error:", error);
  }
}

function getVehicleConfig(vehicleId) {
  const id = Number(vehicleId);
  return config.vehicles.find((vehicle) => Number(vehicle.id) === id) || null;
}

function getColorConfig(vehicleConfig, colorId) {
  const id = Number(colorId);
  return vehicleConfig.colors.find((color) => Number(color.colorId) === id) || null;
}

function isVehicleSpawnFree() {
  const spawn = config.vehicleSpawn.position;
  const spawnDimension = Number(config.vehicleSpawn.dimension);
  const clearRadius = Number(config.vehicleSpawn.clearRadius || 3.5);
  let free = true;

  mp.vehicles.forEach((vehicle) => {
    if (!free || !vehicle || !mp.vehicles.exists(vehicle)) return;
    if (Number(vehicle.dimension) !== spawnDimension) return;

    if (getDistance(vehicle.position, spawn) < clearRadius) {
      free = false;
    }
  });

  return free;
}

async function chargePlayer(player, paymentType, amount) {
  const character = getCharacter(player);
  const uuid = getPlayerUuid(player);
  const field = paymentType === "card" ? "bank" : "cash";

  if (!character || !uuid) return false;

  const result = await db.query(
    `UPDATE characters SET ${field} = ${field} - ? WHERE uuid = ? AND ${field} >= ?`,
    [amount, uuid, amount]
  );

  if (!result || Number(result.affectedRows || 0) !== 1) {
    return false;
  }

  if (!isValidPlayer(player) || getPlayerUuid(player) !== uuid) return true;

  character[field] = Math.max(0, Number(character[field] || 0) - amount);

  try {
    player.setVariable(field, character[field]);
  } catch {}

  try {
    player.call("c:hud:update", [
      JSON.stringify({
        money: {
          cash: Number(character.cash || 0),
          bank: Number(character.bank || 0),
        },
      }),
    ]);
  } catch (error) {
    console.error("[RENT CAR] HUD balance sync error:", error);
  }

  return true;
}

async function refundPlayer(player, paymentType, amount, expectedUuid = getPlayerUuid(player)) {
  const uuid = Number(expectedUuid || 0);
  const field = paymentType === "card" ? "bank" : "cash";

  if (!uuid) return;

  await db.query(
    `UPDATE characters SET ${field} = ${field} + ? WHERE uuid = ?`,
    [amount, uuid]
  );

  if (!isValidPlayer(player) || getPlayerUuid(player) !== uuid) return;

  const character = getCharacter(player);
  if (!character) return;

  character[field] = Number(character[field] || 0) + amount;

  try {
    player.setVariable(field, character[field]);
  } catch {}

  try {
    player.call("c:hud:update", [
      JSON.stringify({
        money: {
          cash: Number(character.cash || 0),
          bank: Number(character.bank || 0),
        },
      }),
    ]);
  } catch (error) {
    console.error("[RENT CAR] HUD balance sync error:", error);
  }
}

function destroyRental(playerId, reason = "ended") {
  const rental = activeRentals.get(Number(playerId));
  if (!rental) return;

  activeRentals.delete(Number(playerId));
  rentalByVehicleId.delete(Number(rental.vehicleId));

  if (rental.timer) {
    clearTimeout(rental.timer);
  }

  try {
    if (rental.vehicle && mp.vehicles.exists(rental.vehicle)) {
      rental.vehicle.destroy();
    }
  } catch {}

  if (reason === "expired") {
    const player = mp.players.at(Number(playerId));
    if (isValidPlayer(player)) {
      notifyInfo(player, "Срок аренды автомобиля завершён.");
    }
  }
}

function createRentalVehicle(player, vehicleConfig, colorConfig, hours) {
  const spawn = config.vehicleSpawn;
  const uuid = getPlayerUuid(player);
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;

  const vehicle = mp.vehicles.new(
    mp.joaat(vehicleConfig.model),
    new mp.Vector3(
      Number(spawn.position.x),
      Number(spawn.position.y),
      Number(spawn.position.z)
    ),
    {
      heading: Number(spawn.heading || 0),
      numberPlate: `RENT${String(player.id).padStart(3, "0")}`.slice(0, 8),
      locked: false,
      engine: false,
      dimension: Number(spawn.dimension || 0),
    }
  );

  vehicle.setColor(Number(colorConfig.colorId), Number(colorConfig.colorId));
  vehicle.setVariable("ownerType", "player");
  vehicle.setVariable("ownerId", uuid);
  vehicle.setVariable("rentalVehicle", true);
  vehicle.setVariable("rentalPlayerId", player.id);
  vehicle.setVariable("rentalExpiresAt", expiresAt);
  vehicle.setVariable("engine", false);
  vehicle.setVariable("locked", false);
  vehicle.setVariable("fuel", 100);
  vehicle.setVariable("fuelMax", 100);
  vehicle.setVariable("fuelConsumption", 1);
  vehicle.setVariable("mileage", 0);

  const timer = setTimeout(() => {
    destroyRental(player.id, "expired");
  }, hours * 60 * 60 * 1000);

  activeRentals.set(player.id, {
    vehicle,
    vehicleId: vehicle.id,
    characterUuid: uuid,
    timer,
    expiresAt,
  });
  rentalByVehicleId.set(vehicle.id, player.id);

  return vehicle;
}

mp.events.add("playerEnterColshape", (player, shape) => {
  if (shape !== rentalPoint) return;
  player.call("client:rentCar:setHint", [true]);
});

mp.events.add("playerExitColshape", (player, shape) => {
  if (shape !== rentalPoint) return;
  player.call("client:rentCar:setHint", [false]);
  closeRental(player);
});

mp.events.add("server:rentCar:open", (player) => {
  openRental(player);
});

mp.events.add(
  "server:rentCar:rent",
  async (player, vehicleId, colorId, hoursRaw, paymentTypeRaw) => {
    if (!isValidPlayer(player)) return;
    if (pendingPlayers.has(player.id)) return;

    let ownsSpawnReservation = false;
    let chargedCharacterUuid = 0;
    let chargedPaymentType = null;
    let chargedAmount = 0;
    let compensationRequired = false;
    pendingPlayers.add(player.id);

    try {
      if (!player.auth || !getCharacter(player) || !getPlayerUuid(player)) {
        return notifyError(player, "Сначала выберите персонажа.");
      }

      if (!authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) {
        return notifyError(player, "Дождитесь завершения загрузки персонажа.");
      }

      if (!isPlayerAtRentalPoint(player)) {
        closeRental(player);
        return notifyError(player, "Вы отошли от точки аренды.");
      }

      if (activeRentals.has(player.id)) {
        return notifyError(player, "У вас уже есть активный арендованный автомобиль.");
      }

      const vehicleConfig = getVehicleConfig(vehicleId);
      if (!vehicleConfig) {
        return notifyError(player, "Выбранный автомобиль недоступен.");
      }

      const colorConfig = getColorConfig(vehicleConfig, colorId);
      if (!colorConfig) {
        return notifyError(player, "Выбранный цвет недоступен.");
      }

      const hours = Number(hoursRaw);
      if (!Number.isInteger(hours) || hours < config.minHours || hours > config.maxHours) {
        return notifyError(player, "Некорректный срок аренды.");
      }

      const paymentType = String(paymentTypeRaw || "").toLowerCase();
      if (paymentType !== "cash" && paymentType !== "card") {
        return notifyError(player, "Некорректный способ оплаты.");
      }

      if (rentalSpawnReserved || !isVehicleSpawnFree()) {
        return notifyError(player, "Место выдачи занято. Освободите площадку и попробуйте снова.");
      }

      rentalSpawnReserved = true;
      ownsSpawnReservation = true;

      const renterUuid = getPlayerUuid(player);
      const total = Number(vehicleConfig.price) * hours;
      chargedCharacterUuid = renterUuid;
      chargedPaymentType = paymentType;
      chargedAmount = total;
      const paid = await chargePlayer(player, paymentType, total);

      if (!paid) {
        return notifyError(
          player,
          paymentType === "card"
            ? "Недостаточно денег на банковском счёте."
            : "Недостаточно наличных."
        );
      }

      compensationRequired = true;

      if (
        !isValidPlayer(player) ||
        getPlayerUuid(player) !== renterUuid ||
        !authFlow.isPhase(player, authFlow.PHASE.IN_GAME) ||
        !isPlayerAtRentalPoint(player) ||
        activeRentals.has(player.id) ||
        !isVehicleSpawnFree()
      ) {
        await refundPlayer(player, paymentType, total, renterUuid);
        compensationRequired = false;

        if (isValidPlayer(player)) {
          notifyError(player, "Условия аренды изменились. Оплата возвращена.");
        }
        return;
      }

      let vehicle;

      try {
        vehicle = createRentalVehicle(player, vehicleConfig, colorConfig, hours);
        compensationRequired = false;
      } catch (error) {
        await refundPlayer(player, paymentType, total, renterUuid);
        compensationRequired = false;
        console.error("[RENT CAR] Vehicle creation error:", error);
        return notifyError(player, "Не удалось выдать автомобиль. Оплата возвращена.");
      }

      closeRental(player);
      notifySuccess(
        player,
        `Вы арендовали ${vehicleConfig.name} на ${hours} ч. за $${total}.`
      );
      try {
        player.call("client:rentCar:vehicleReady", [vehicle.id]);
      } catch (error) {
        console.error("[RENT CAR] Vehicle stream request error:", error);
      }
    } catch (error) {
      console.error("[RENT CAR] Rent error:", error);

      if (compensationRequired && chargedCharacterUuid && chargedPaymentType) {
        try {
          await refundPlayer(
            player,
            chargedPaymentType,
            chargedAmount,
            chargedCharacterUuid
          );
          compensationRequired = false;
        } catch (refundError) {
          console.error("[RENT CAR] Compensation error:", refundError);
        }
      }

      notifyError(player, "Ошибка аренды автомобиля.");
    } finally {
      pendingPlayers.delete(player.id);
      if (ownsSpawnReservation) {
        rentalSpawnReserved = false;
      }
    }
  }
);

mp.events.add("server:rentCar:vehicleStreamed", (player, vehicleIdRaw) => {
  if (!isValidPlayer(player)) return;
  if (!authFlow.isPhase(player, authFlow.PHASE.IN_GAME)) return;

  const rental = activeRentals.get(player.id);
  if (!rental) return;

  const vehicleId = Number(vehicleIdRaw);
  if (!Number.isInteger(vehicleId) || vehicleId !== Number(rental.vehicleId)) return;
  if (getPlayerUuid(player) !== Number(rental.characterUuid)) return;

  const vehicle = rental.vehicle;
  if (!vehicle || !mp.vehicles.exists(vehicle)) return;
  if (getDistance(player.position, vehicle.position) > 15) return;

  try {
    player.putIntoVehicle(vehicle, 0);
    player.call("c:vehicle:engine:set", [false, true]);
    player.call("c:vehicle:lock:set", [vehicle.id, false]);
  } catch (error) {
    console.error("[RENT CAR] Seat after stream error:", error);
  }
});

mp.events.add("vehicleDeath", (vehicle) => {
  if (!vehicle) return;

  const playerId = rentalByVehicleId.get(Number(vehicle.id));
  if (playerId === undefined) return;

  destroyRental(playerId, "destroyed");
});

mp.events.add("playerQuit", (player) => {
  pendingPlayers.delete(player.id);
  destroyRental(player.id, "quit");
});

console.log(
  `[RENT CAR] Point created at ${pointPosition.x}, ${pointPosition.y}, ${pointPosition.z}`
);

module.exports = {
  rentalPoint,
  activeRentals,
  destroyRental,
  getPublicPayload,
};
