"use strict";

const crypto = require("crypto");
const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const hud = require("../hud/hud.service.js");
const vehicleCommands = require("../vehicle/vehicle.commands.js");
const vehicleControl = require("../vehicle/vehicle.control.js");
const { getPlayerUuid } = require("../vehicle/vehicle.owner.js");
const config = require("./autoService.config.js");

try {
  global.__twinkleAutoServiceRuntime?.shutdown?.();
} catch (error) {
  console.error("[AUTO SERVICE] Previous runtime shutdown failed:", error);
}

const runtime = { active: true, events: [], shutdown: null };
global.__twinkleAutoServiceRuntime = runtime;

const sessions = new Map();
const coordinator = global.__twinkleAutoServiceCoordinator || {
  pendingPlayers: new Set(),
  spawnPointQueue: Promise.resolve(),
};
global.__twinkleAutoServiceCoordinator = coordinator;
const pendingPlayers = coordinator.pendingPlayers;

function isPlayer(player) {
  try {
    return Boolean(player && mp.players.exists(player));
  } catch {
    return false;
  }
}

function registerEvent(name, handler) {
  const guarded = (...args) => {
    if (!runtime.active) return undefined;

    try {
      const result = handler(...args);
      if (result && typeof result.then === "function") {
        result.catch((error) => console.error(`[AUTO SERVICE] ${name} failed:`, error));
      }
      return result;
    } catch (error) {
      console.error(`[AUTO SERVICE] ${name} failed:`, error);
      return undefined;
    }
  };

  mp.events.add(name, guarded);
  runtime.events.push({ name, handler: guarded });
}

function notify(player, variant, message) {
  if (!isPlayer(player)) return;
  try {
    player.call("client:notification", [String(variant), String(message), 5000]);
  } catch {}
}

function closeClient(player) {
  if (!isPlayer(player)) return;
  try { player.call("client:autoService:close"); } catch {}
}

function distance(left, right) {
  const dx = Number(left?.x || 0) - Number(right?.x || 0);
  const dy = Number(left?.y || 0) - Number(right?.y || 0);
  const dz = Number(left?.z || 0) - Number(right?.z || 0);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function isAtService(player) {
  return Boolean(
    isPlayer(player) &&
    !player.vehicle &&
    Number(player.dimension || 0) === 0 &&
    distance(player.position, config.npc.position) <= config.interactionRange
  );
}

function getOccupantCount(vehicle) {
  if (!vehicle || !mp.vehicles.exists(vehicle)) return 0;
  try {
    const occupants = vehicle.getOccupants();
    return Array.isArray(occupants) ? occupants.length : null;
  } catch {
    return null;
  }
}

function getRuntimeState(vehicleId) {
  const vehicle = vehicleCommands.getSpawnedVehicle(vehicleId);
  if (!vehicle) return { present: false, occupied: false };
  const occupantCount = getOccupantCount(vehicle);
  return { present: true, occupied: occupantCount === null || occupantCount > 0 };
}

function mapVehicle(row) {
  const runtimeState = getRuntimeState(row.id);
  const stored = String(row.garage_status || "outside") === "stored";

  return {
    id: Number(row.id),
    model: String(row.model || "vehicle").slice(0, 64),
    name: String(row.display_name || row.model || "Vehicle").slice(0, 96),
    plate: String(row.plate || "").slice(0, 8),
    fuel: Math.max(0, Math.min(10000, Number(row.fuel || 0))),
    mileage: Math.max(0, Math.min(1000000000, Number(row.mileage || 0))),
    location: stored ? "stored" : runtimeState.present ? "outside" : "unavailable",
    spawnable: !runtimeState.occupied,
    disabledReason: runtimeState.occupied ? "В автомобиле сейчас кто-то находится." : null,
  };
}

async function loadOwnedVehicles(characterUuid) {
  const rows = await db.query(
    `SELECT v.id, v.model, v.plate, v.fuel, v.mileage, v.garage_status,
            vc.display_name
       FROM vehicles v
       LEFT JOIN vehicle_catalog vc
         ON vc.model COLLATE utf8mb4_unicode_ci = v.model COLLATE utf8mb4_unicode_ci
      WHERE v.owner = ?
      ORDER BY v.id ASC
      LIMIT 100`,
    [characterUuid]
  );

  return (Array.isArray(rows) ? rows : []).map(mapVehicle);
}

function getCash(player) {
  return Math.max(0, Number(player?.character?.cash ?? player?.characterData?.cash ?? 0));
}

function syncCash(player, characterUuid, cash) {
  if (!isPlayer(player) || Number(getPlayerUuid(player)) !== Number(characterUuid)) return;
  const normalizedCash = Math.max(0, Number(cash || 0));
  if (player.character) player.character.cash = normalizedCash;
  if (player.characterData) player.characterData.cash = normalizedCash;
  try { hud.update(player, { player: { finance: { cash: normalizedCash } } }); } catch {}
}

function buildPayload(session, vehicles, cash) {
  return {
    contractVersion: config.contractVersion,
    sessionId: session.token,
    serviceFee: config.fee,
    cash: Math.max(0, Number(cash || 0)),
    vehicles,
  };
}

async function sendPayload(player, session, eventName = "client:autoService:open") {
  const vehicles = await loadOwnedVehicles(session.characterUuid);
  session.vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
  if (!isPlayer(player) || sessions.get(player.id) !== session) return false;
  player.call(eventName, [JSON.stringify(buildPayload(session, vehicles, getCash(player)))]);
  return true;
}

function getSession(player, token) {
  const session = sessions.get(player?.id);
  if (!session || session.token !== String(token || "")) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(player.id);
    closeClient(player);
    return null;
  }
  if (Number(getPlayerUuid(player)) !== Number(session.characterUuid) || !isAtService(player)) {
    sessions.delete(player.id);
    closeClient(player);
    return null;
  }
  return session;
}

function isSpawnPointClear(ignoredVehicle = null) {
  let clear = true;
  mp.vehicles.forEach((vehicle) => {
    if (!clear || vehicle === ignoredVehicle || !mp.vehicles.exists(vehicle)) return;
    if (Number(vehicle.dimension || 0) !== Number(config.spawn.dimension)) return;
    if (distance(vehicle.position, config.spawn.position) <= config.clearSpawnRadius) clear = false;
  });
  return clear;
}

function destroyLeakedVehicleEntity(vehicleId) {
  let destroyed = false;
  mp.vehicles.forEach((vehicle) => {
    if (destroyed || !mp.vehicles.exists(vehicle)) return;
    let databaseId = 0;
    try { databaseId = Number(vehicle.getVariable("vehicleDbId") || 0); } catch {}
    if (databaseId !== Number(vehicleId)) return;
    try {
      vehicle.destroy();
      destroyed = true;
    } catch {}
  });
  vehicleCommands.unregisterSpawnedVehicle(vehicleId);
  return destroyed;
}

function withSpawnPointLock(operation) {
  const run = coordinator.spawnPointQueue.then(operation, operation);
  coordinator.spawnPointQueue = run.catch(() => undefined);
  return run;
}

async function clearGarageSlot(characterUuid, vehicleId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await db.query(
        "DELETE FROM character_vehicle_garage_slots WHERE character_uuid = ? AND vehicle_id = ?",
        [characterUuid, vehicleId]
      );
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`[AUTO SERVICE] Garage slot cleanup failed for vehicle #${vehicleId}:`, lastError);
  return false;
}

async function openForPlayer(player) {
  if (!isPlayer(player) || !player.auth || !getPlayerUuid(player)) return false;
  if (!isAtService(player)) {
    notify(player, "error", "Подойдите ближе к сотруднику автосервиса и выйдите из транспорта.");
    return false;
  }

  const session = {
    token: crypto.randomBytes(16).toString("hex"),
    characterUuid: Number(getPlayerUuid(player)),
    expiresAt: Date.now() + config.sessionLifetimeMs,
    vehicleIds: new Set(),
    refreshPending: false,
    lastRefreshAt: 0,
  };
  sessions.set(player.id, session);

  try {
    await sendPayload(player, session);
    return true;
  } catch (error) {
    sessions.delete(player.id);
    console.error("[AUTO SERVICE] Open failed:", error);
    notify(player, "error", "Автосервис временно недоступен.");
    return false;
  }
}

function capturePreviousRow(row) {
  return {
    pos_x: Number(row.pos_x || 0), pos_y: Number(row.pos_y || 0), pos_z: Number(row.pos_z || 0),
    heading: Number(row.heading || 0), dimension: Number(row.dimension || 0),
    engine: Number(row.engine || 0), garage_status: row.garage_status || "outside",
    garage_id: row.garage_id ?? null, garage_slot: row.garage_slot ?? null,
  };
}

async function chargeAndMoveVehicle(characterUuid, vehicleId) {
  return db.withConn(async (connection) => {
    let transactionOpen = false;
    try {
      await connection.beginTransaction();
      transactionOpen = true;

      const [characterRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      const cashBefore = Number(characterRows?.[0]?.cash);
      if (!Number.isFinite(cashBefore)) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "character" };
      }
      if (cashBefore < config.fee) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "cash" };
      }

      const [vehicleRows] = await connection.query(
        `SELECT v.*, vc.display_name, vc.fuel_max,
                vc.fuel_consumption AS fuelConsumption
           FROM vehicles v
           LEFT JOIN vehicle_catalog vc
             ON vc.model COLLATE utf8mb4_unicode_ci = v.model COLLATE utf8mb4_unicode_ci
          WHERE v.id = ? AND v.owner = ?
          LIMIT 1 FOR UPDATE`,
        [vehicleId, characterUuid]
      );
      const vehicleRow = vehicleRows?.[0];
      if (!vehicleRow) {
        await connection.rollback();
        transactionOpen = false;
        return { ok: false, reason: "vehicle" };
      }

      const previous = capturePreviousRow(vehicleRow);
      const cashAfter = cashBefore - config.fee;

      await connection.query("UPDATE characters SET cash = ? WHERE uuid = ?", [cashAfter, characterUuid]);
      await connection.query(
        `UPDATE vehicles
            SET pos_x = ?, pos_y = ?, pos_z = ?, heading = ?, dimension = ?,
                engine = 0, garage_status = 'outside', garage_id = NULL, garage_slot = NULL
          WHERE id = ? AND owner = ?`,
        [
          config.spawn.position.x, config.spawn.position.y, config.spawn.position.z,
          config.spawn.heading, config.spawn.dimension, vehicleId, characterUuid,
        ]
      );
      await connection.commit();
      transactionOpen = false;
      return { ok: true, vehicleRow: { ...vehicleRow, engine: 0 }, previous, cashBefore, cashAfter };
    } catch (error) {
      if (transactionOpen) {
        try { await connection.rollback(); } catch {}
      }
      throw error;
    }
  });
}

async function compensateFailedSpawn(characterUuid, vehicleId, result) {
  return db.withConn(async (connection) => {
    let transactionOpen = false;
    try {
      await connection.beginTransaction();
      transactionOpen = true;
      await connection.query("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [config.fee, characterUuid]);
      await connection.query(
        `UPDATE vehicles
            SET pos_x = ?, pos_y = ?, pos_z = ?, heading = ?, dimension = ?, engine = ?,
                garage_status = ?, garage_id = ?, garage_slot = ?
          WHERE id = ? AND owner = ?`,
        [
          result.previous.pos_x, result.previous.pos_y, result.previous.pos_z,
          result.previous.heading, result.previous.dimension, result.previous.engine,
          result.previous.garage_status, result.previous.garage_id, result.previous.garage_slot,
          vehicleId, characterUuid,
        ]
      );
      const [cashRows] = await connection.query(
        "SELECT cash FROM characters WHERE uuid = ? LIMIT 1",
        [characterUuid]
      );
      await connection.commit();
      transactionOpen = false;
      return Math.max(0, Number(cashRows?.[0]?.cash || 0));
    } catch (error) {
      if (transactionOpen) {
        try { await connection.rollback(); } catch {}
      }
      throw error;
    }
  });
}

function restorePreviousRuntime(result) {
  if (vehicleCommands.getSpawnedVehicle(result.vehicleRow.id)) return null;
  const previous = result.previous;
  return vehicleCommands.createVehicleEntity(
    { ...result.vehicleRow, ...previous },
    new mp.Vector3(previous.pos_x, previous.pos_y, previous.pos_z),
    previous.heading,
    previous.dimension
  );
}

async function relocateVehicle(player, token, vehicleIdRaw) {
  if (!isPlayer(player) || pendingPlayers.has(player.id)) return;
  const session = getSession(player, token);
  const vehicleId = Number(vehicleIdRaw);
  if (!session || !Number.isSafeInteger(vehicleId) || vehicleId <= 0 || !session.vehicleIds.has(vehicleId)) {
    notify(player, "error", "Сессия автосервиса недействительна. Откройте меню заново.");
    closeClient(player);
    sessions.delete(player?.id);
    return;
  }

  pendingPlayers.add(player.id);
  try {
    await withSpawnPointLock(async () => {
      if (getSession(player, token) !== session) throw Object.assign(new Error("SESSION_EXPIRED"), { publicReason: "session" });
      const existing = vehicleCommands.getSpawnedVehicle(vehicleId);
      const occupantCount = existing ? getOccupantCount(existing) : 0;
      if (occupantCount === null || occupantCount > 0) {
        throw Object.assign(new Error("VEHICLE_OCCUPIED"), { publicReason: "occupied" });
      }
      if (!isSpawnPointClear(existing)) throw Object.assign(new Error("SPAWN_BLOCKED"), { publicReason: "blocked" });

      if (existing) await vehicleControl.saveVehicleState(existing);
      const result = await chargeAndMoveVehicle(session.characterUuid, vehicleId);
      if (!result.ok) throw Object.assign(new Error(`PAYMENT_${result.reason}`), { publicReason: result.reason });

      syncCash(player, session.characterUuid, result.cashAfter);
      let previousDestroyed = false;
      let replacementCreated = false;
      try {
        if (!isSpawnPointClear(existing)) {
          throw Object.assign(new Error("SPAWN_BLOCKED_AFTER_PAYMENT"), { publicReason: "blocked" });
        }
        if (existing) {
          const latestOccupantCount = getOccupantCount(existing);
          if (latestOccupantCount === null || latestOccupantCount > 0) {
            throw Object.assign(new Error("VEHICLE_BECAME_OCCUPIED"), { publicReason: "occupied" });
          }
          if (vehicleCommands.getSpawnedVehicle(vehicleId) !== existing) {
            throw new Error("VEHICLE_ENTITY_CHANGED");
          }
          if (!vehicleCommands.destroySpawnedVehicle(vehicleId)) throw new Error("OLD_ENTITY_DESTROY_FAILED");
          previousDestroyed = true;
        }

        vehicleCommands.createVehicleEntity(
          result.vehicleRow,
          new mp.Vector3(config.spawn.position.x, config.spawn.position.y, config.spawn.position.z),
          config.spawn.heading,
          config.spawn.dimension
        );
        replacementCreated = true;
      } catch (spawnError) {
        if (replacementCreated) {
          try { vehicleCommands.destroySpawnedVehicle(vehicleId); } catch {}
        } else if (previousDestroyed) {
          destroyLeakedVehicleEntity(vehicleId);
        }
        try {
          const refundedCash = await compensateFailedSpawn(session.characterUuid, vehicleId, result);
          syncCash(player, session.characterUuid, refundedCash);
          if (previousDestroyed) restorePreviousRuntime(result);
        } catch (compensationError) {
          console.error(`[AUTO SERVICE] Critical compensation failure for vehicle #${vehicleId}:`, compensationError);
          spawnError.publicReason = "compensation";
        }
        throw spawnError;
      }

      await clearGarageSlot(session.characterUuid, vehicleId);

      sessions.delete(player.id);
      closeClient(player);
      notify(player, "success", `${result.vehicleRow.display_name || result.vehicleRow.model} доставлен за $${config.fee}.`);
      logsDb.writeMoneyLog({
        source: "vehicle_service",
        action: "vehicle_delivery",
        currency: "cash",
        amount: -config.fee,
        balanceBefore: result.cashBefore,
        balanceAfter: result.cashAfter,
        target: isPlayer(player) ? player : null,
        targetUuid: session.characterUuid,
        comment: `Vehicle service delivery #${vehicleId}`,
        metadata: { vehicleId, model: result.vehicleRow.model },
      }).catch((error) => console.error("[AUTO SERVICE] Money log failed:", error));
    });
  } catch (error) {
    const messages = {
      session: "Сессия истекла. Поговорите с сотрудником ещё раз.",
      occupied: "В автомобиле кто-то находится, поэтому его нельзя переместить.",
      blocked: "Место выдачи занято другим транспортом.",
      cash: `Для доставки нужно $${config.fee} наличными.`,
      character: "Персонаж недоступен.",
      vehicle: "Этот транспорт больше не принадлежит вашему персонажу.",
      compensation: "Произошла критическая ошибка доставки. Обратитесь к администратору и пока не повторяйте выдачу этой машины.",
    };
    console.error(`[AUTO SERVICE] Delivery #${vehicleId} failed:`, error);
    notify(player, "error", messages[error.publicReason] || "Не удалось доставить транспорт. Оплата $200 возвращена.");
    if (sessions.get(player.id) === session && isAtService(player)) {
      await sendPayload(player, session, "client:autoService:update").catch(() => {});
    }
  } finally {
    pendingPlayers.delete(player.id);
  }
}

registerEvent("server:autoService:spawn", relocateVehicle);
registerEvent("server:autoService:refresh", async (player, token) => {
  const session = getSession(player, token);
  if (!session) return closeClient(player);
  const now = Date.now();
  if (session.refreshPending || now - session.lastRefreshAt < 1000) return;
  session.refreshPending = true;
  session.lastRefreshAt = now;
  try {
    await sendPayload(player, session, "client:autoService:update");
  } catch (error) {
    console.error("[AUTO SERVICE] Refresh failed:", error);
    notify(player, "error", "Не удалось обновить список транспорта.");
    closeClient(player);
    sessions.delete(player.id);
  } finally {
    session.refreshPending = false;
  }
});
registerEvent("server:autoService:close", (player) => sessions.delete(player.id));
registerEvent("playerQuit", (player) => {
  sessions.delete(player.id);
  pendingPlayers.delete(player.id);
});
registerEvent("playerDeath", (player) => {
  sessions.delete(player.id);
  closeClient(player);
});

runtime.shutdown = () => {
  if (!runtime.active) return;
  runtime.active = false;
  for (const entry of runtime.events.splice(0)) {
    try { mp.events.remove(entry.name, entry.handler); } catch {}
  }
  for (const playerId of sessions.keys()) {
    try {
      const player = mp.players.at(playerId);
      closeClient(player);
    } catch {}
  }
  sessions.clear();
};

module.exports = { npcId: config.npcId, openForPlayer };

console.log("[AUTO SERVICE] Vehicle delivery service loaded.");
