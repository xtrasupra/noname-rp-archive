"use strict";

const config = require("./delivery.config.js");
const chat = require("../../chat/chat.service.js");
const db = require("../../../database/query.js");
const logsDb = require("../../../database/logs.js");
const quests = require("../../quests/quest.service.js");
const rentalPayment = require("../jobRentalPayment.service.js");
const employment = require("../jobEmployment.service.js");
const jobRewardMultiplier = require("../jobRewardMultiplier.service.js");
const {
  rows,
  getUuid,
} = require("../../../utils/player.js");

const workers = new Map();
const vehicles = new Map();
const rentalLocks = new Set();
let deliverySettlementSchemaPromise = null;

function ensureDeliverySettlementSchema() {
  if (!deliverySettlementSchemaPromise) {
    deliverySettlementSchemaPromise = db.query(`
      CREATE TABLE IF NOT EXISTS delivery_stop_settlements (
        settlement_key VARCHAR(160) NOT NULL,
        character_uuid BIGINT UNSIGNED NOT NULL,
        route_id VARCHAR(128) NOT NULL,
        stop_index INT UNSIGNED NOT NULL,
        payout INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (settlement_key),
        KEY idx_delivery_stop_character (character_uuid, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
      deliverySettlementSchemaPromise = null;
      throw error;
    });
  }
  return deliverySettlementSchemaPromise;
}

const loadingShape = mp.colshapes.newSphere(
  config.loadingPoint.position.x,
  config.loadingPoint.position.y,
  config.loadingPoint.position.z,
  config.loadingPoint.radius
);

loadingShape.isDeliveryLoading = true;

function notify(player, message, color = "#66ccff") {
  try {
    chat.sendToPlayer(player, message, color);
  } catch {
    try {
      player.outputChatBox(message);
    } catch {}
  }
}

function getVehicleConfig(id) {
  return config.vehicles.find((vehicle) => vehicle.id === id);
}

function getDistance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vehicleSpeed(vehicle) {
  try {
    const velocity = vehicle?.velocity;
    return velocity ? Math.hypot(Number(velocity.x || 0), Number(velocity.y || 0), Number(velocity.z || 0)) : 0;
  } catch { return 0; }
}

function normalizeHouseIds(values) {
  if (!Array.isArray(values)) return [];

  return Array.from(new Set(values
    .map(Number)
    .filter((houseId) => Number.isSafeInteger(houseId) && houseId > 0)))
    .slice(0, 5000);
}

function normalizeHouseIdRanges(values) {
  if (!Array.isArray(values)) return [];

  return values
    .map((range) => ({
      min: Number(range?.min),
      max: Number(range?.max),
    }))
    .filter((range) => (
      Number.isSafeInteger(range.min) &&
      Number.isSafeInteger(range.max) &&
      range.min > 0 &&
      range.max >= range.min
    ))
    .slice(0, 100);
}

function buildRouteHouseQuery(maxStops) {
  const clauses = [
    "x IS NOT NULL",
    "y IS NOT NULL",
    "z IS NOT NULL",
  ];
  const parameters = [];
  const allowedHouseIds = normalizeHouseIds(config.route.allowedHouseIds);
  const excludedHouseIds = normalizeHouseIds(config.route.excludedHouseIds);
  const excludedHouseIdRanges = normalizeHouseIdRanges(config.route.excludedHouseIdRanges);

  if (allowedHouseIds.length) {
    clauses.push(`id IN (${allowedHouseIds.map(() => "?").join(", ")})`);
    parameters.push(...allowedHouseIds);
  }

  if (excludedHouseIds.length) {
    clauses.push(`id NOT IN (${excludedHouseIds.map(() => "?").join(", ")})`);
    parameters.push(...excludedHouseIds);
  }

  for (const range of excludedHouseIdRanges) {
    clauses.push("id NOT BETWEEN ? AND ?");
    parameters.push(range.min, range.max);
  }

  const maximumDistance = Number(config.route.maxDistanceFromWarehouse);
  const warehouse = config.loadingPoint.position;
  if (
    Number.isFinite(maximumDistance) &&
    maximumDistance > 0 &&
    warehouse &&
    [warehouse.x, warehouse.y, warehouse.z].every((coordinate) => Number.isFinite(Number(coordinate)))
  ) {
    clauses.push("POW(x - ?, 2) + POW(y - ?, 2) + POW(z - ?, 2) <= POW(?, 2)");
    parameters.push(
      Number(warehouse.x),
      Number(warehouse.y),
      Number(warehouse.z),
      maximumDistance
    );
  }

  parameters.push(maxStops);

  return {
    sql: `
      SELECT id, x, y, z
      FROM houses
      WHERE ${clauses.join("\n        AND ")}
      ORDER BY RAND()
      LIMIT ?
    `,
    parameters,
  };
}

function updateHudCash(player) {
  const cash = Number(player.character?.cash ?? player.characterData?.cash ?? 0);

  try {
    player.call("c:hud:update", [
      JSON.stringify({
        player: {
          cash,
        },
      }),
    ]);
  } catch {}
}

async function giveMoney(player, amount, settlement) {
  const uuid = getUuid(player);
  amount = Number(amount || 0);

  const routeId = String(settlement?.routeId || "").slice(0, 128);
  const stopIndex = Math.max(0, Math.floor(Number(settlement?.stopIndex || 0)));
  const settlementKey = `${routeId}:stop:${stopIndex}`.slice(0, 160);
  if (!uuid || amount <= 0 || !routeId) throw new Error("Некорректная фиксация выплаты доставки.");
  await ensureDeliverySettlementSchema();
  const result = await db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [cashRows] = await connection.query("SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE", [uuid]);
      if (!cashRows?.[0]) throw new Error("Персонаж не найден.");
      const cashBefore = Math.max(0, Number(cashRows[0].cash || 0));
      const [insert] = await connection.query(
        `INSERT IGNORE INTO delivery_stop_settlements
          (settlement_key, character_uuid, route_id, stop_index, payout)
         VALUES (?, ?, ?, ?, ?)`,
        [settlementKey, uuid, routeId, stopIndex, Math.round(amount)]
      );
      if (Number(insert.affectedRows || 0) !== 1) {
        const [savedRows] = await connection.query(
          "SELECT payout FROM delivery_stop_settlements WHERE settlement_key = ? AND character_uuid = ? LIMIT 1",
          [settlementKey, uuid]
        );
        if (!savedRows?.[0]) throw new Error("Ключ выплаты принадлежит другому персонажу.");
        await connection.commit();
        return { alreadySettled: true, payout: Number(savedRows[0].payout || 0), cashBefore, cashAfter: cashBefore };
      }
      const cashAfter = cashBefore + Math.round(amount);
      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, uuid]);
      await connection.commit();
      return { alreadySettled: false, payout: Math.round(amount), cashBefore, cashAfter };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });

  if (player.character) player.character.cash = result.cashAfter;
  if (player.characterData) player.characterData.cash = result.cashAfter;
  if (!result.alreadySettled) logsDb.writeMoneyLog({
    source: "job_delivery",
    action: "reward",
    currency: "cash",
    amount: result.payout,
    balanceBefore: result.cashBefore,
    balanceAfter: result.cashAfter,
    target: player,
    comment: "Заработок доставки",
    metadata: { settlementKey, routeId, stopIndex },
  }).catch((error) => console.error("[DELIVERY] Money log failed:", error?.message || error));

  updateHudCash(player);
  return result;
}

function syncVehicleStateToPlayer(player, vehicle) {
  if (!player || !vehicle) return;

  try {
    player.call("c:vehicle:engine:set", [
      Boolean(vehicle.getVariable("engine")),
    ]);
  } catch {}

  try {
    player.call("c:vehicle:lock:set", [
      vehicle.id,
      Boolean(vehicle.getVariable("locked")),
    ]);
  } catch {}
}

function setupDeliveryVehicleVariables(player, vehicle, vehicleConfig) {
  const uuid = getUuid(player);

  vehicle.deliveryVehicle = true;
  vehicle.deliveryDriverId = player.id;
  vehicle.deliveryDriverUuid = uuid;

  try {
    vehicle.engine = true;
    vehicle.locked = false;
  } catch {}

  try {
    vehicle.setVariable("deliveryVehicle", true);
    vehicle.setVariable("deliveryDriverId", player.id);
    vehicle.setVariable("deliveryDriverUuid", uuid);

    vehicle.setVariable("ownerType", "player");
    vehicle.setVariable("ownerId", uuid);

    vehicle.setVariable("engine", true);
    vehicle.setVariable("locked", false);

    vehicle.setVariable("fuel", Number(vehicleConfig.fuel ?? 100));
    vehicle.setVariable("fuelMax", Number(vehicleConfig.fuelMax ?? 100));
    vehicle.setVariable("fuelType", vehicleConfig.fuelType || "petrol_95");
    vehicle.setVariable("fuelConsumption", Number(vehicleConfig.fuelConsumption ?? 1));

    vehicle.setVariable("mileage", Number(vehicleConfig.mileage ?? 0));
    vehicle.setVariable("maxSpeed", Number(vehicleConfig.maxSpeed ?? 240));
  } catch {}
}

function destroyWorkerVehicle(player) {
  const state = workers.get(player.id);

  if (state?.vehicle && mp.vehicles.exists(state.vehicle)) {
    try {
      vehicles.delete(state.vehicle.id);
      state.vehicle.destroy();
    } catch {}
  }

  if (state) {
    state.vehicle = null;
    state.route = [];
    state.currentIndex = 0;
    state.lastPoint = null;
    state.earned = 0;
    state.loaded = false;
    state.routeId = null;
    state.routeLoadInProgress = false;
    state.legStartedAt = 0;
    state.legTravelM = 0;
    state.legSuspiciousM = 0;
    state.lastVehiclePosition = null;
    state.lastSampleAt = 0;
  }
}

function createDeliveryRuntime(player) {
  if (workers.has(player.id)) return false;
  workers.set(player.id, {
    player,
    vehicle: null,
    route: [],
    currentIndex: 0,
    lastPoint: null,
    earned: 0,
    loaded: false,
    routeId: null,
    stopInProgress: false,
    routeLoadInProgress: false,
    legStartedAt: 0,
    legTravelM: 0,
    legSuspiciousM: 0,
    lastVehiclePosition: null,
    lastSampleAt: 0,
  });
  return true;
}

function stopDeliveryRuntime(player) {
  if (!workers.has(player.id)) return false;

  destroyWorkerVehicle(player);
  workers.delete(player.id);
  player.inDeliveryLoading = false;

  try {
    player.call("client:delivery:clearRoute");
  } catch {}
  return true;
}

async function joinDeliveryJob(player) {
  const hadRuntime = workers.has(player.id);

  try {
    const result = await employment.assignJob(player, "delivery");
    createDeliveryRuntime(player);

    if (result.previousJob && result.previousJob.id !== "delivery") {
      notify(
        player,
        `Вы сменили работу «${result.previousJob.name}» на «${result.job.name}». Предыдущая смена завершена.`,
        "#66cc66"
      );
    } else if (!result.changed && hadRuntime) {
      notify(player, "Вы уже работаете доставщиком.", "#ffcc66");
    } else {
      notify(player, "Вы устроились доставщиком. Арендуйте рабочий транспорт у NPC.", "#66cc66");
    }
    return true;
  } catch (error) {
    console.error("[DELIVERY] Employment assignment failed:", error?.message || error);
    notify(player, "Не удалось устроиться на работу доставщика.", "#ff6666");
    return false;
  }
}

async function leaveDeliveryJob(player) {
  try {
    const result = await employment.clearJob(player, "delivery");
    if (!result.cleared) {
      stopDeliveryRuntime(player);
      notify(player, "Вы не работаете доставщиком.", "#ffcc66");
      return false;
    }

    notify(player, "Вы уволились с работы доставщика.", "#ffcc66");
    return true;
  } catch (error) {
    console.error("[DELIVERY] Employment removal failed:", error?.message || error);
    notify(player, "Не удалось уволиться с работы доставщика.", "#ff6666");
    return false;
  }
}

employment.registerRuntimeCleanup("delivery", stopDeliveryRuntime);

async function rentDeliveryVehicle(player, vehicleId) {
  const playerId = Number(player?.id);
  if (rentalLocks.has(playerId)) {
    return notify(player, "Аренда транспорта уже обрабатывается.", "#ffcc66");
  }
  rentalLocks.add(playerId);

  let vehicle = null;
  let vehicleConfig = null;
  let charged = false;

  try {
  const state = workers.get(player.id);

  if (!state) {
    return notify(player, "Сначала устройтесь доставщиком у NPC.", "#ff6666");
  }

  vehicleConfig = getVehicleConfig(vehicleId);

  if (!vehicleConfig) {
    return notify(player, "Такой транспорт не найден.", "#ff6666");
  }

  const previousVehicle = state.vehicle && mp.vehicles.exists(state.vehicle)
    ? state.vehicle
    : null;

  const pos = player.position;

  vehicle = mp.vehicles.new(
    mp.joaat(vehicleConfig.model),
    new mp.Vector3(pos.x + 3, pos.y + 3, pos.z),
    {
      heading: player.heading || 0,
      numberPlate: "DELIV",
      locked: false,
      engine: true,
      dimension: player.dimension || 0,
    }
  );

  setupDeliveryVehicleVariables(player, vehicle, vehicleConfig);

  const payment = await rentalPayment.chargeCash(player, vehicleConfig.rentPrice, {
    source: "job_delivery",
    comment: `Аренда транспорта доставки ${vehicleConfig.id}`,
  });

  if (!payment.ok) {
    if (vehicle && mp.vehicles.exists(vehicle)) vehicle.destroy();
    vehicle = null;
    const message = payment.reason === "insufficient"
      ? `Недостаточно наличных. Нужно $${vehicleConfig.rentPrice}.`
      : "Не удалось провести оплату аренды.";
    return notify(player, message, "#ff6666");
  }
  charged = true;

  if (!mp.players.exists(player) || workers.get(playerId) !== state) {
    throw new Error("Delivery rental owner left before delivery");
  }

  if (previousVehicle) destroyWorkerVehicle(player);

  state.vehicle = vehicle;
  vehicles.set(vehicle.id, vehicle);

  setTimeout(() => {
    try {
      if (mp.players.exists(player) && mp.vehicles.exists(vehicle)) {
        player.putIntoVehicle(vehicle, 0);
        syncVehicleStateToPlayer(player, vehicle);
      }
    } catch {}
  }, 150);

  notify(player, `Вы арендовали ${vehicleConfig.name} за $${vehicleConfig.rentPrice}.`, "#66cc66");
  notify(player, "Заезжайте на точку загрузки возле склада.", "#66ccff");

  player.call("client:delivery:setLoadingPoint", [
    JSON.stringify({
      position: {
        x: config.loadingPoint.position.x,
        y: config.loadingPoint.position.y,
        z: config.loadingPoint.position.z,
      },
      radius: config.loadingPoint.radius,
    }),
  ]);
  return true;
  } catch (error) {
    console.error("[DELIVERY] Vehicle rental failed:", error?.message || error);
    if (vehicle && mp.vehicles.exists(vehicle)) {
      vehicles.delete(vehicle.id);
      try { vehicle.destroy(); } catch {}
    }
    let refundSucceeded = !charged;
    if (charged) {
      try {
        const refund = await rentalPayment.refundCash(player, vehicleConfig?.rentPrice, {
          source: "job_delivery",
          comment: `Возврат за невыданный транспорт доставки ${vehicleConfig?.id || "unknown"}`,
        });
        refundSucceeded = Boolean(refund.ok);
        if (!refundSucceeded) {
          console.error("[DELIVERY] CRITICAL rental refund was rejected:", refund.reason);
        }
      } catch (refundError) {
        console.error("[DELIVERY] CRITICAL rental refund failed:", refundError?.message || refundError);
      }
    }
    notify(
      player,
      refundSucceeded
        ? "Не удалось выдать транспорт. Оплата возвращена."
        : "Не удалось выдать транспорт. Возврат требует проверки администратора.",
      "#ff6666"
    );
    return false;
  } finally {
    rentalLocks.delete(playerId);
  }
}

async function getRandomHousesForRoute() {
  try {
    const maxStops = Math.max(1, Number(config.route.maxStops || 1));
    const routeQuery = buildRouteHouseQuery(maxStops);
    const result = await db.query(routeQuery.sql, routeQuery.parameters);

    return (rows(result) || [])
      .filter((row) => {
        return (
          Number.isFinite(Number(row.x)) &&
          Number.isFinite(Number(row.y)) &&
          Number.isFinite(Number(row.z))
        );
      })
      .map((row) => ({
        id: Number(row.id),
        x: Number(row.x),
        y: Number(row.y),
        z: Number(row.z),
      }));
  } catch (err) {
    console.log("[DELIVERY] get houses error:", err.message);
    return [];
  }
}

async function startDeliveryRoute(player) {
  const state = workers.get(player.id);

  if (!state) {
    return notify(player, "Вы не работаете доставщиком.", "#ff6666");
  }

  if (!state.vehicle || !mp.vehicles.exists(state.vehicle)) {
    return notify(player, "Сначала арендуйте рабочий транспорт.", "#ff6666");
  }

  if (player.vehicle !== state.vehicle) {
    return notify(player, "Заезжайте на загрузку на рабочем транспорте.", "#ff6666");
  }

  if (state.loaded) {
    return notify(player, "У вас уже есть активный маршрут.", "#ffcc66");
  }

  if (state.routeLoadInProgress) {
    return notify(player, "Маршрут уже загружается.", "#ffcc66");
  }

  state.routeLoadInProgress = true;

  try {
    const houses = await getRandomHousesForRoute();

    if (workers.get(player.id) !== state || !player.inDeliveryLoading || state.loaded
      || !state.vehicle || !mp.vehicles.exists(state.vehicle) || player.vehicle !== state.vehicle) {
      return notify(player, "Останьтесь на погрузке в рабочем транспорте до выдачи маршрута.", "#ff6666");
    }

    if (!houses.length) {
      return notify(player, "В базе нет домов для маршрута доставки.", "#ff6666");
    }

    const stopsCount = Math.min(
      houses.length,
      Number(config.route.maxStops || houses.length)
    );

    const stops = houses.slice(0, stopsCount);

    state.route = stops;
    state.currentIndex = 0;
    state.lastPoint = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
    };
    state.earned = 0;
    state.loaded = true;
    state.routeId = `delivery:${getUuid(player)}:${Date.now()}`;
    state.stopInProgress = false;
    state.legStartedAt = Date.now();
    state.legTravelM = 0;
    state.legSuspiciousM = 0;
    state.lastVehiclePosition = { ...state.lastPoint };
    state.lastSampleAt = Date.now();

    notify(player, `Маршрут загружен. Точек доставки: ${stops.length}.`, "#66cc66");

    player.call("client:delivery:startRoute", [
      JSON.stringify({ stops, currentIndex: 0 }),
    ]);
  } finally {
    if (workers.get(player.id) === state) state.routeLoadInProgress = false;
  }
}

function invalidateDeliveryRoute(player, state, message) {
  state.route = [];
  state.currentIndex = 0;
  state.lastPoint = null;
  state.earned = 0;
  state.loaded = false;
  state.routeId = null;
  state.stopInProgress = false;
  state.legStartedAt = 0;
  state.legTravelM = 0;
  state.legSuspiciousM = 0;
  state.lastVehiclePosition = null;
  state.lastSampleAt = 0;
  try { player.call("client:delivery:clearRoute"); } catch {}
  notify(player, message, "#ff6666");
}

function sampleDeliveryRoutes() {
  const now = Date.now();
  for (const state of workers.values()) {
    const player = state.player;
    if (!state.loaded || !player || !state.vehicle || !mp.vehicles.exists(state.vehicle)) continue;
    const current = state.vehicle.position;
    const previous = state.lastVehiclePosition;
    const previousAt = Number(state.lastSampleAt || now);
    state.lastSampleAt = now;
    state.lastVehiclePosition = { x: Number(current.x), y: Number(current.y), z: Number(current.z) };
    if (!previous || player.vehicle !== state.vehicle) continue;
    const segment = getDistance(previous, current);
    const elapsedMs = Math.max(100, Math.min(3000, now - previousAt));
    const plausible = 65 * elapsedMs / 1000 + 10;
    if (segment <= plausible) state.legTravelM += segment;
    else state.legSuspiciousM += segment;
  }
}

try { clearInterval(global.__twinkleDeliveryRouteSecurityInterval); } catch {}
global.__twinkleDeliveryRouteSecurityInterval = setInterval(sampleDeliveryRoutes, 1000);
global.__twinkleDeliveryRouteSecurityInterval.unref?.();

async function completeCurrentStop(player) {
  const state = workers.get(player.id);

  if (!state || !state.loaded) {
    return notify(player, "У вас нет активного маршрута.", "#ff6666");
  }

  if (state.stopInProgress) {
    return;
  }

  if (!state.vehicle || !mp.vehicles.exists(state.vehicle)) {
    return notify(player, "Рабочий транспорт не найден.", "#ff6666");
  }

  if (player.vehicle !== state.vehicle) {
    return notify(player, "Доставку нужно выполнять на рабочем транспорте.", "#ff6666");
  }

  const stop = state.route[state.currentIndex];

  if (!stop) {
    return notify(player, "Текущая точка доставки не найдена.", "#ff6666");
  }

  const distToStop = getDistance(player.position, stop);

  if (distToStop > 15) {
    return;
  }

  state.stopInProgress = true;

  const distance = getDistance(state.lastPoint || player.position, stop);
  const km = distance / 1000;
  const routeId = state.routeId || `delivery:${getUuid(player)}:unknown`;
  const stopIndex = Number(state.currentIndex || 0);
  const routeLength = Array.isArray(state.route) ? state.route.length : 0;

  const minimumTimeMs = Math.max(3000, distance / 65 * 1000);
  const minimumTravelM = Math.max(5, distance * 0.65);
  if (Date.now() - Number(state.legStartedAt || Date.now()) < minimumTimeMs
    || Number(state.legTravelM || 0) < minimumTravelM
    || Number(state.legSuspiciousM || 0) > Math.max(25, distance * 0.12)
    || vehicleSpeed(state.vehicle) > 3) {
    return invalidateDeliveryRoute(player, state, "Маршрут не подтверждён сервером. Вернитесь на склад за новым.");
  }

  let pay = Math.max(
    Number(config.route.minPayPerStop || 250),
    Math.floor(km * Number(config.route.payPerKm || 180))
  );

  try {
    const trophyMultiplier = await jobRewardMultiplier.getMultiplier(player, "delivery");
    pay = Math.round(pay * trophyMultiplier);
    const settlement = await giveMoney(player, pay, { routeId, stopIndex });
    pay = Number(settlement.payout || pay);

    await Promise.allSettled([quests.recordProgress(player, {
      type: "finance.cash_earned",
      subjectId: "delivery",
      idempotencyKey: `${routeId}:stop:${stopIndex}:cash`,
      amount: pay,
      metadata: {
        jobId: "delivery",
        routeId,
        stopIndex,
        source: "delivery_job",
      },
    }, { sync: false }),

    quests.recordProgress(player, {
      type: "job.money_earned",
      subjectId: "delivery",
      idempotencyKey: `${routeId}:stop:${stopIndex}`,
      amount: pay,
      metadata: {
        jobId: "delivery",
        routeId,
        stopIndex,
        routeComplete: stopIndex + 1 >= routeLength,
      },
    }, { sync: true })]);
  } catch (error) {
    console.error("[DELIVERY] complete stop failed:", error?.message || error);
    notify(player, "Ошибка завершения доставки. Попробуйте ещё раз.", "#ff6666");
    return;
  } finally {
    if (workers.get(player.id) === state) {
      state.stopInProgress = false;
    }
  }

  state.earned += pay;
  state.currentIndex = stopIndex + 1;
  state.lastPoint = {
    x: stop.x,
    y: stop.y,
    z: stop.z,
  };
  state.legStartedAt = Date.now();
  state.legTravelM = 0;
  state.legSuspiciousM = 0;
  state.lastVehiclePosition = { ...state.lastPoint };
  state.lastSampleAt = Date.now();

  notify(player, `Посылка доставлена. Получено: $${pay}.`, "#66cc66");

  if (state.currentIndex >= state.route.length) {
    const totalEarned = state.earned;

    state.route = [];
    state.currentIndex = 0;
    state.lastPoint = null;
    state.earned = 0;
    state.loaded = false;
    state.routeId = null;
    state.stopInProgress = false;
    state.legStartedAt = 0;
    state.legTravelM = 0;
    state.legSuspiciousM = 0;
    state.lastVehiclePosition = null;
    state.lastSampleAt = 0;

    notify(player, `Маршрут завершён. Всего заработано: $${totalEarned}.`, "#66cc66");
    notify(player, "Можете вернуться на склад и взять новый маршрут.", "#66ccff");

    player.call("client:delivery:finishRoute", [
      JSON.stringify({
        loadingPoint: {
          position: {
            x: config.loadingPoint.position.x,
            y: config.loadingPoint.position.y,
            z: config.loadingPoint.position.z,
          },
          radius: config.loadingPoint.radius,
        },
      }),
    ]);

    return;
  }

  player.call("client:delivery:setNextStop", [
    JSON.stringify({
      stop: state.route[state.currentIndex],
      currentIndex: state.currentIndex,
      total: state.route.length,
    }),
  ]);
}

mp.events.add("playerEnterColshape", (player, shape) => {
  if (!shape?.isDeliveryLoading) return;

  const state = workers.get(player.id);
  if (!state) return;

  player.inDeliveryLoading = true;

  if (state.loaded) {
    notify(player, "У вас уже есть активный маршрут.", "#ffcc66");
  } else {
    notify(player, "Нажмите E, чтобы загрузить маршрут доставки.", "#66ccff");
  }
});

mp.events.add("playerExitColshape", (player, shape) => {
  if (!shape?.isDeliveryLoading) return;

  player.inDeliveryLoading = false;
});

mp.events.add("server:delivery:loadRoute", (player) => {
  if (!player.inDeliveryLoading) {
    return notify(player, "Вы не на точке загрузки.", "#ff6666");
  }

  startDeliveryRoute(player).catch((error) => {
    console.error("[DELIVERY] route loading failed:", error?.message || error);
    notify(player, "Не удалось загрузить маршрут.", "#ff6666");
  });
});

mp.events.add("server:delivery:completeStop", (player) => {
  completeCurrentStop(player).catch((error) => {
    console.error("[DELIVERY] complete stop handler failed:", error?.message || error);
  });
});

mp.events.add("playerQuit", (player) => {
  stopDeliveryRuntime(player);
});

module.exports = {
  joinDeliveryJob,
  leaveDeliveryJob,
  rentDeliveryVehicle,
};
