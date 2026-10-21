"use strict";

const config = require("./taxi.config.js");
const chat = require("../../chat/chat.service.js");
const db = require("../../../database/query.js");
const logsDb = require("../../../database/logs.js");
const { getUuid } = require("../../../utils/player.js");
const rentalPayment = require("../jobRentalPayment.service.js");
const employment = require("../jobEmployment.service.js");

const taxiDrivers = new Map();
const taxiVehicles = new Map();
const pendingRideOffers = new Map();
const processingRideOffers = new Set();
const rentalLocks = new Set();

const TAXI_DESTINATION_BOUNDS = Object.freeze({
  x: Object.freeze([-10_000, 10_000]),
  y: Object.freeze([-10_000, 10_000]),
  z: Object.freeze([-1_000, 3_000]),
});

function getName(player) {
  const character = player.character || player.characterData || {};

  return (
    [character.username, character.lastname].filter(Boolean).join(" ") ||
    player.name ||
    `Игрок #${player.id}`
  );
}

function notify(player, text, color = "#66ccff") {
  if (!player || !text) return;

  try {
    chat.sendToPlayer(player, text, color);
  } catch {
    try {
      player.outputChatBox(text);
    } catch {}
  }
}

function callTaxiClearRoute(player) {
  if (!player) return;

  try {
    player.call("client:taxi:clearRoute", []);
  } catch {}

  try {
    player.call("taxi:clearRoute", []);
  } catch {}
}

function callTaxiSetRoute(player, payload) {
  if (!player) return;

  const json = JSON.stringify(payload || {});

  try {
    player.call("client:taxi:setRoute", [json]);
  } catch {}

  try {
    player.call("taxi:setRoute", [json]);
  } catch {}
}

function getVehicleConfig(id) {
  return config.vehicles.find((item) => item.id === id);
}

function syncCash(player, cash) {
  const normalizedCash = Math.max(0, Number(cash || 0));

  if (player.character) player.character.cash = normalizedCash;
  if (player.characterData) player.characterData.cash = normalizedCash;

  try {
    player.call("c:hud:update", [
      JSON.stringify({
        player: {
          cash: normalizedCash,
        },
      }),
    ]);
  } catch {}
}

async function transferTaxiFare(passenger, driver, rawAmount) {
  const passengerUuid = Number(getUuid(passenger));
  const driverUuid = Number(getUuid(driver));
  const amount = Number(rawAmount);

  if (
    !Number.isInteger(passengerUuid) || passengerUuid <= 0 ||
    !Number.isInteger(driverUuid) || driverUuid <= 0 ||
    passengerUuid === driverUuid ||
    !Number.isInteger(amount) || amount <= 0
  ) {
    return { ok: false, reason: "invalid" };
  }

  const result = await db.withConn(async (connection) => {
    let transactionOpen = false;

    try {
      await connection.beginTransaction();
      transactionOpen = true;

      const orderedUuids = [passengerUuid, driverUuid].sort((left, right) => left - right);
      const [rows] = await connection.query(
        "SELECT uuid, cash FROM characters WHERE uuid IN (?, ?) ORDER BY uuid FOR UPDATE",
        orderedUuids
      );
      const balances = new Map(rows.map((row) => [Number(row.uuid), Number(row.cash || 0)]));
      const passengerCash = balances.get(passengerUuid);
      const driverCash = balances.get(driverUuid);

      if (!Number.isFinite(passengerCash) || !Number.isFinite(driverCash)) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "character_missing" };
      }

      if (passengerCash < amount) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "insufficient" };
      }

      const [debitResult] = await connection.query(
        "UPDATE characters SET cash = cash - ? WHERE uuid = ? AND cash >= ?",
        [amount, passengerUuid, amount]
      );
      if (Number(debitResult.affectedRows) !== 1) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "insufficient" };
      }

      const [creditResult] = await connection.query(
        "UPDATE characters SET cash = cash + ? WHERE uuid = ?",
        [amount, driverUuid]
      );
      if (Number(creditResult.affectedRows) !== 1) {
        throw new Error("Taxi fare recipient no longer exists");
      }

      await connection.commit();
      transactionOpen = false;

      return {
        ok: true,
        passengerBefore: passengerCash,
        passengerAfter: passengerCash - amount,
        driverBefore: driverCash,
        driverAfter: driverCash + amount,
      };
    } catch (error) {
      if (transactionOpen) {
        try { await connection.rollback(); } catch {}
      }
      throw error;
    }
  });

  if (!result.ok) return result;

  syncCash(passenger, result.passengerAfter);
  syncCash(driver, result.driverAfter);

  const logResults = await Promise.allSettled([
    logsDb.writeMoneyLog({
      source: "job_taxi",
      action: "spend",
      currency: "cash",
      amount: -amount,
      balanceBefore: result.passengerBefore,
      balanceAfter: result.passengerAfter,
      target: passenger,
      comment: "Оплата такси",
    }),
    logsDb.writeMoneyLog({
      source: "job_taxi",
      action: "reward",
      currency: "cash",
      amount,
      balanceBefore: result.driverBefore,
      balanceAfter: result.driverAfter,
      target: driver,
      comment: "Заработок такси",
    }),
  ]);
  for (const logResult of logResults) {
    if (logResult.status === "rejected") {
      console.error("[TAXI] Fare log failed:", logResult.reason?.message || logResult.reason);
    }
  }

  return result;
}

function destroyTaxiVehicleForPlayer(player) {
  const state = taxiDrivers.get(player.id);

  if (state) {
    state.currentOrder = null;
  }

  callTaxiClearRoute(player);

  if (state?.vehicle && mp.vehicles.exists(state.vehicle)) {
    try {
      taxiVehicles.delete(state.vehicle.id);
      state.vehicle.destroy();
    } catch {}
  }

  if (state) {
    state.vehicle = null;
  }
}

function getSpawnPositionNearPlayer(player) {
  const pos = player.position;
  const heading = Number(player.heading || 0);
  const rad = (heading * Math.PI) / 180;

  return {
    position: new mp.Vector3(
      pos.x + Math.sin(rad) * 4,
      pos.y + Math.cos(rad) * 4,
      pos.z
    ),
    heading,
    dimension: Number(player.dimension || 0),
  };
}

function createTaxiVehicle(player, vehicleConfig) {
  const spawn = getSpawnPositionNearPlayer(player);
  const driverUuid = getUuid(player);

  const vehicle = mp.vehicles.new(
    mp.joaat(vehicleConfig.model),
    spawn.position,
    {
      heading: spawn.heading,
      numberPlate: "TAXI",
      locked: false,
      engine: true,
      dimension: spawn.dimension,
    }
  );

  vehicle.taxiVehicle = true;
  vehicle.taxiDriverId = player.id;
  vehicle.taxiDriverUuid = driverUuid;
  vehicle.taxiVehicleType = vehicleConfig.id;

  try {
    vehicle.engine = true;
    vehicle.locked = false;
  } catch {}

  try {
    vehicle.setVariable("taxiVehicle", true);
    vehicle.setVariable("taxiDriverId", player.id);
    vehicle.setVariable("taxiDriverUuid", driverUuid);
    vehicle.setVariable("taxiVehicleType", vehicleConfig.id);

    vehicle.setVariable("ownerType", "player");
    vehicle.setVariable("ownerId", driverUuid);

    vehicle.setVariable("engine", true);
    vehicle.setVariable("locked", false);

    vehicle.setVariable("fuel", Number(vehicleConfig.fuel ?? 100));
    vehicle.setVariable("fuelMax", Number(vehicleConfig.fuelMax ?? 100));
    vehicle.setVariable("fuelType", vehicleConfig.fuelType || "petrol_95");
    vehicle.setVariable("fuelConsumption", Number(vehicleConfig.fuelConsumption ?? 1));

    vehicle.setVariable("mileage", 0);
    vehicle.setVariable("maxSpeed", Number(vehicleConfig.maxSpeed ?? 240));
  } catch {}

  taxiVehicles.set(vehicle.id, vehicle);

  return vehicle;
}

function isTaxiDriver(player) {
  return taxiDrivers.has(player.id);
}

function getTaxiDriverByVehicle(vehicle) {
  if (!vehicle) return null;

  let driver = null;

  mp.players.forEach((player) => {
    const state = taxiDrivers.get(player.id);

    if (state?.vehicle === vehicle) {
      driver = player;
    }
  });

  return driver;
}

function createTaxiRuntime(player) {
  if (isTaxiDriver(player)) return false;
  taxiDrivers.set(player.id, {
    active: true,
    vehicle: null,
    currentOrder: null,
  });
  return true;
}

function stopTaxiRuntime(player) {
  if (!isTaxiDriver(player)) return false;

  const state = taxiDrivers.get(player.id);
  const passengerId = Number(state?.currentOrder?.passengerId || 0);
  if (passengerId > 0) {
    const passenger = mp.players.at(passengerId);
    if (passenger) {
      clearContract(passenger);
      notify(passenger, "Водитель завершил работу. Заказ такси отменён без возврата оплаты.", "#ffcc66");
    }
  }

  for (const [offerId, offer] of pendingRideOffers.entries()) {
    if (Number(offer.driverId) !== Number(player.id)) continue;
    pendingRideOffers.delete(offerId);
    processingRideOffers.delete(offerId);
    const passenger = mp.players.at(offer.passengerId);
    if (passenger) {
      clearContract(passenger);
      notify(passenger, "Водитель больше не принимает заказы.", "#ffcc66");
    }
  }

  destroyTaxiVehicleForPlayer(player);
  taxiDrivers.delete(player.id);
  return true;
}

async function joinTaxiJob(player) {
  const hadRuntime = isTaxiDriver(player);

  try {
    const result = await employment.assignJob(player, "taxi");
    createTaxiRuntime(player);

    if (result.previousJob && result.previousJob.id !== "taxi") {
      notify(
        player,
        `Вы сменили работу «${result.previousJob.name}» на «${result.job.name}». Предыдущая смена завершена.`,
        "#66cc66"
      );
    } else if (!result.changed && hadRuntime) {
      notify(player, "Вы уже работаете таксистом.", "#ffcc66");
    } else {
      notify(
        player,
        "Вы устроились таксистом. Теперь выберите аренду машины у NPC.",
        "#66cc66"
      );
    }
    return true;
  } catch (error) {
    console.error("[TAXI] Employment assignment failed:", error?.message || error);
    notify(player, "Не удалось устроиться на работу таксиста.", "#ff6666");
    return false;
  }
}

async function leaveTaxiJob(player) {
  try {
    const result = await employment.clearJob(player, "taxi");
    if (!result.cleared) {
      stopTaxiRuntime(player);
      notify(player, "Вы не работаете таксистом.", "#ffcc66");
      return false;
    }

    notify(player, "Вы уволились с работы таксиста.", "#ffcc66");
    return true;
  } catch (error) {
    console.error("[TAXI] Employment removal failed:", error?.message || error);
    notify(player, "Не удалось уволиться с работы таксиста.", "#ff6666");
    return false;
  }
}

employment.registerRuntimeCleanup("taxi", stopTaxiRuntime);

async function rentTaxiVehicle(player, vehicleId) {
  const playerId = Number(player?.id);
  if (rentalLocks.has(playerId)) {
    return notify(player, "Аренда транспорта уже обрабатывается.", "#ffcc66");
  }
  rentalLocks.add(playerId);

  let vehicle = null;
  let vehicleConfig = null;
  let charged = false;

  try {
    if (!isTaxiDriver(player)) {
      return notify(player, "Сначала устройтесь таксистом у NPC.", "#ff6666");
    }

    vehicleConfig = getVehicleConfig(vehicleId);

  if (!vehicleConfig) {
    return notify(player, "Такой транспорт не найден.", "#ff6666");
  }

  const state = taxiDrivers.get(player.id);

  const previousVehicle = state.vehicle && mp.vehicles.exists(state.vehicle)
    ? state.vehicle
    : null;

  vehicle = createTaxiVehicle(player, vehicleConfig);
  const payment = await rentalPayment.chargeCash(player, vehicleConfig.rentPrice, {
    source: "job_taxi",
    comment: `Аренда такси ${vehicleConfig.id}`,
  });

  if (!payment.ok) {
    if (vehicle && mp.vehicles.exists(vehicle)) {
      taxiVehicles.delete(vehicle.id);
      vehicle.destroy();
    }
    vehicle = null;
    const message = payment.reason === "insufficient"
      ? `Недостаточно наличных. Нужно $${vehicleConfig.rentPrice}.`
      : "Не удалось провести оплату аренды.";
    return notify(player, message, "#ff6666");
  }
  charged = true;

  if (!mp.players.exists(player) || taxiDrivers.get(playerId) !== state) {
    throw new Error("Taxi rental owner left before delivery");
  }

  if (previousVehicle) destroyTaxiVehicleForPlayer(player);
  state.vehicle = vehicle;

  setTimeout(() => {
    try {
      if (mp.players.exists(player) && mp.vehicles.exists(vehicle)) {
        player.putIntoVehicle(vehicle, 0);

        player.call("c:vehicle:engine:set", [true]);
        player.call("c:vehicle:lock:set", [vehicle.id, false]);
      }
    } catch (err) {
      console.error("[TAXI] putIntoVehicle error:", err.message);
    }
  }, 150);

  notify(
    player,
    `Вы арендовали ${vehicleConfig.name} за $${vehicleConfig.rentPrice}.`,
    "#66cc66"
  );
  return true;
  } catch (error) {
    console.error("[TAXI] Vehicle rental failed:", error?.message || error);
    if (vehicle && mp.vehicles.exists(vehicle)) {
      taxiVehicles.delete(vehicle.id);
      try { vehicle.destroy(); } catch {}
    }
    let refundSucceeded = !charged;
    if (charged) {
      try {
        const refund = await rentalPayment.refundCash(player, vehicleConfig?.rentPrice, {
          source: "job_taxi",
          comment: `Возврат за невыданное такси ${vehicleConfig?.id || "unknown"}`,
        });
        refundSucceeded = Boolean(refund.ok);
        if (!refundSucceeded) {
          console.error("[TAXI] CRITICAL rental refund was rejected:", refund.reason);
        }
      } catch (refundError) {
        console.error("[TAXI] CRITICAL rental refund failed:", refundError?.message || refundError);
      }
    }
    notify(
      player,
      refundSucceeded
        ? "Не удалось выдать такси. Оплата возвращена."
        : "Не удалось выдать такси. Возврат требует проверки администратора.",
      "#ff6666"
    );
    return false;
  } finally {
    rentalLocks.delete(playerId);
  }
}

function getDistance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function calculatePrice(from, to) {
  const distance = getDistance(from, to);
  const km = distance / 1000;

  return {
    distance,
    price: Math.max(
      config.price.min,
      Math.floor(config.price.base + km * config.price.perKm)
    ),
  };
}

function parseTaxiDestination(rawPayload) {
  let value = rawPayload;

  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const destination = {
    x: Number(value.x),
    y: Number(value.y),
    z: Number(value.z),
  };
  if (!Object.values(destination).every(Number.isFinite)) return null;

  for (const axis of Object.keys(TAXI_DESTINATION_BOUNDS)) {
    const [minimum, maximum] = TAXI_DESTINATION_BOUNDS[axis];
    if (destination[axis] < minimum || destination[axis] > maximum) return null;
  }

  return destination;
}

function clearContract(player) {
  try {
    player.call("client:hud:setContract", [
      JSON.stringify({
        enabled: false,
      }),
    ]);
  } catch {}
}

function sendRideOffer(passenger, driver, destination, price, distance) {
  const offerId = `taxi:${passenger.id}:${driver.id}:${Date.now()}`;

  pendingRideOffers.set(offerId, {
    offerId,
    passengerId: passenger.id,
    driverId: driver.id,
    destination,
    price,
    distance,
    createdAt: Date.now(),
  });

  passenger.call("client:hud:setContract", [
    JSON.stringify({
      id: offerId,
      enabled: true,
      title: "Поездка на такси",
      description: `Стоимость поездки: $${price}. Расстояние: ${(distance / 1000).toFixed(2)} км. При выходе из такси заказ отменяется без возврата оплаты.`,
      trueAction: {
        label: "Согласиться",
        event: "contract:accept",
        payload: {
          type: "taxiRide",
          offerId,
        },
      },
      falseAction: {
        label: "Отказаться",
        event: "contract:decline",
        payload: {
          type: "taxiRide",
          offerId,
        },
      },
    }),
  ]);

  notify(passenger, "Подтвердите поездку через модальное окно.", "#66ccff");

  setTimeout(() => {
    const offer = pendingRideOffers.get(offerId);
    if (!offer) return;

    pendingRideOffers.delete(offerId);

    const target = mp.players.at(offer.passengerId);

    if (target) {
      clearContract(target);
      notify(target, "Предложение поездки истекло.", "#ffcc66");
    }
  }, 30000);
}

mp.events.add("server:taxi:passengerWaypoint", (passenger, destinationJson) => {
  const destination = parseTaxiDestination(destinationJson);
  if (!destination) {
    return notify(passenger, "Не удалось получить точку маршрута.", "#ff6666");
  }

  const vehicle = passenger.vehicle;

  if (!vehicle || !vehicle.taxiVehicle) {
    return notify(passenger, "Вы должны находиться в такси.", "#ff6666");
  }

  if (vehicle.getOccupant && vehicle.getOccupant(0) === passenger) {
    return notify(passenger, "Водитель не может сам заказать поездку.", "#ff6666");
  }

  const driver = getTaxiDriverByVehicle(vehicle);

  if (!driver) {
    return notify(passenger, "Водитель такси не найден.", "#ff6666");
  }

  const driverState = taxiDrivers.get(driver.id);

  if (driverState?.currentOrder) {
    return notify(passenger, "У таксиста уже есть активный заказ.", "#ff6666");
  }

  const from = passenger.position;
  const { price, distance } = calculatePrice(from, destination);
  const maximumDistance = Number(config.price.maxDistance);

  if (
    !Number.isFinite(distance) || distance <= 0 ||
    !Number.isInteger(price) || price <= 0 ||
    !Number.isFinite(maximumDistance) || maximumDistance <= 0 ||
    distance > maximumDistance
  ) {
    return notify(passenger, "Точка слишком далеко.", "#ff6666");
  }

  sendRideOffer(passenger, driver, destination, price, distance);
});

async function acceptTaxiRide(player, rawPayload) {
  let payload = {};

  try {
    payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch {}

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.type !== "taxiRide") return;

  const offer = pendingRideOffers.get(payload.offerId);

  if (!offer) {
    return notify(player, "Предложение поездки недействительно.", "#ff6666");
  }

  if (Number(offer.passengerId) !== Number(player.id)) {
    return notify(player, "Это предложение не для вас.", "#ff6666");
  }

  if (processingRideOffers.has(payload.offerId)) {
    return notify(player, "Оплата этой поездки уже обрабатывается.", "#ffcc66");
  }

  processingRideOffers.add(payload.offerId);

  try {
    const driver = mp.players.at(offer.driverId);

    if (!driver) {
      pendingRideOffers.delete(payload.offerId);
      clearContract(player);
      return notify(player, "Водитель вышел из игры.", "#ff6666");
    }

    const driverState = taxiDrivers.get(driver.id);

    if (!driverState || !driverState.vehicle || !mp.vehicles.exists(driverState.vehicle)) {
      pendingRideOffers.delete(payload.offerId);
      clearContract(player);
      return notify(player, "Рабочее такси водителя не найдено.", "#ff6666");
    }

    if (driverState.currentOrder) {
      pendingRideOffers.delete(payload.offerId);
      clearContract(player);
      return notify(player, "У таксиста уже есть активный заказ.", "#ff6666");
    }

    const payment = await transferTaxiFare(player, driver, offer.price);

    if (!payment.ok) {
      const message = payment.reason === "insufficient"
        ? "Недостаточно наличных для поездки."
        : "Не удалось провести оплату поездки.";
      return notify(player, message, "#ff6666");
    }

    pendingRideOffers.delete(payload.offerId);
    clearContract(player);

    driverState.currentOrder = {
      passengerId: player.id,
      passengerName: getName(player),
      destination: offer.destination,
      price: offer.price,
      startedAt: Date.now(),
      completed: false,
    };

    callTaxiSetRoute(driver, {
      passengerId: player.id,
      passengerName: getName(player),
      destination: offer.destination,
      price: offer.price,
    });

    notify(player, `Вы оплатили поездку: $${offer.price}.`, "#66cc66");
    notify(
      driver,
      `Новый заказ от ${getName(player)}. Оплата: $${offer.price}.`,
      "#66cc66"
    );
  } finally {
    processingRideOffers.delete(payload.offerId);
  }
}

mp.events.add("server:contract:accept", (player, rawPayload) => {
  acceptTaxiRide(player, rawPayload).catch((error) => {
    console.error("[TAXI] Ride acceptance failed:", error?.message || error);
    notify(player, "Не удалось подтвердить поездку. Попробуйте снова.", "#ff6666");
  });
});

mp.events.add("server:contract:decline", (player, rawPayload) => {
  let payload = {};

  try {
    payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch {}

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  if (payload.type !== "taxiRide") return;

  const offer = pendingRideOffers.get(payload.offerId);
  if (!offer) return;

  if (Number(offer.passengerId) !== Number(player.id)) {
    return notify(player, "Это предложение не для вас.", "#ff6666");
  }

  if (processingRideOffers.has(payload.offerId)) {
    return notify(player, "Оплата поездки уже обрабатывается.", "#ffcc66");
  }

  pendingRideOffers.delete(payload.offerId);
  clearContract(player);

  const driver = mp.players.at(offer.driverId);

  if (driver) {
    notify(driver, `${getName(player)} отказался от поездки.`, "#ffcc66");
  }

  notify(player, "Вы отказались от поездки.", "#ffcc66");
});

mp.events.add("server:taxi:completeRide", (driver) => {
  const state = taxiDrivers.get(driver.id);

  if (!state || !state.currentOrder) {
    callTaxiClearRoute(driver);
    return;
  }

  if (state.currentOrder.completed) {
    callTaxiClearRoute(driver);
    return;
  }

  if (!driver.vehicle || driver.vehicle !== state.vehicle) {
    return notify(driver, "Завершить заказ можно только в рабочем такси.", "#ff6666");
  }

  const order = state.currentOrder;
  const passenger = mp.players.at(order.passengerId);
  if (
    !passenger ||
    passenger.vehicle !== state.vehicle ||
    Number(passenger.dimension) !== Number(driver.dimension)
  ) {
    return notify(driver, "Пассажир должен находиться в вашем такси для завершения заказа.", "#ff6666");
  }
  const distance = getDistance(driver.position, order.destination);

  if (distance > 15) {
    return notify(driver, "Вы слишком далеко от точки завершения заказа.", "#ff6666");
  }

  state.currentOrder.completed = true;

  state.currentOrder = null;

  callTaxiClearRoute(driver);

  notify(driver, `Заказ завершён. Вы заработали $${order.price}.`, "#66cc66");

  if (passenger) {
    notify(passenger, "Поездка завершена.", "#66cc66");
  }
});

mp.events.add("playerExitVehicle", (player, vehicle) => {
  for (const [driverId, state] of taxiDrivers.entries()) {
    const order = state.currentOrder;
    if (
      !order ||
      Number(order.passengerId) !== Number(player.id) ||
      state.vehicle !== vehicle
    ) {
      continue;
    }

    state.currentOrder = null;
    const driver = mp.players.at(driverId);
    if (driver) {
      callTaxiClearRoute(driver);
      notify(driver, "Пассажир вышел из такси. Предоплаченный заказ отменён.", "#ffcc66");
    }
    clearContract(player);
    notify(player, "Вы вышли из такси. Заказ отменён без возврата оплаты.", "#ffcc66");
    break;
  }
});

mp.events.add("playerQuit", (player) => {
  stopTaxiRuntime(player);

  for (const [offerId, offer] of pendingRideOffers.entries()) {
    if (offer.passengerId === player.id || offer.driverId === player.id) {
      pendingRideOffers.delete(offerId);
    }
  }

  for (const [driverId, state] of taxiDrivers.entries()) {
    if (Number(state.currentOrder?.passengerId) !== Number(player.id)) continue;
    state.currentOrder = null;
    const driver = mp.players.at(driverId);
    if (driver) {
      callTaxiClearRoute(driver);
      notify(driver, "Пассажир покинул сервер. Заказ отменён.", "#ffcc66");
    }
  }
});

mp.registerCommand("taxitest", (player) => {
  const state = taxiDrivers.get(player.id);

  if (!state) {
    return notify(player, "Вы не работаете таксистом.", "#ff6666");
  }

  if (!state.vehicle) {
    return notify(player, "Сначала арендуйте такси.", "#ff6666");
  }

  const destination = {
    x: 907.331,
    y: -210.725,
    z: 70,
  };

  state.currentOrder = {
    passengerId: 0,
    passengerName: "Тестовый клиент",
    destination,
    price: 2500,
    startedAt: Date.now(),
    completed: false,
  };

  callTaxiSetRoute(player, {
    passengerId: 0,
    passengerName: "Тестовый клиент",
    destination,
    price: 2500,
  });

  notify(player, "Создан тестовый заказ. Езжайте на метку.", "#66cc66");
});

module.exports = {
  joinTaxiJob,
  leaveTaxiJob,
  rentTaxiVehicle,
  destroyTaxiVehicleForPlayer,
};
