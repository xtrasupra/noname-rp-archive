"use strict";

const db = require("../../database/query.js");
const logsDb = require("../../database/logs.js");
const authFlow = require("../../auth/authFlow.js");
const licenseService = require("../licenses/license.service.js");
const vehicleCommands = require("../vehicle/vehicle.commands.js");
const vehicleScrapyard = require("../vehicle/vehicle.scrapyard.js");
const { getPlayerUuid } = require("../vehicle/vehicle.owner.js");
const config = require("./vehicleDealership.config.js");

const sessions = new Map();
const pendingDeliveries = new Map();
const purchaseLocks = new Set();
let catalogSyncPromise = null;

const pointPosition = new mp.Vector3(
  config.point.position.x,
  config.point.position.y,
  config.point.position.z
);
const dealershipPoint = mp.colshapes.newSphere(
  pointPosition.x,
  pointPosition.y,
  pointPosition.z,
  config.point.radius,
  config.point.dimension
);
const dealershipMarker = mp.markers.new(
  config.point.marker.type,
  new mp.Vector3(
    pointPosition.x,
    pointPosition.y,
    pointPosition.z + config.point.marker.zOffset
  ),
  config.point.marker.scale,
  {
    color: Array.from(config.point.marker.color),
    visible: true,
    dimension: config.point.dimension,
  }
);
const dealershipBlip = mp.blips.new(
  config.point.blip.sprite,
  pointPosition,
  {
    name: config.point.blip.name,
    color: config.point.blip.color,
    scale: config.point.blip.scale,
    shortRange: config.point.blip.shortRange,
    dimension: config.point.dimension,
  }
);

dealershipPoint.isVehicleDealership = true;
dealershipMarker.isVehicleDealership = true;
dealershipBlip.isVehicleDealership = true;

function isValidPlayer(player) {
  return Boolean(player && mp.players.exists(player));
}

function vector(position) {
  return new mp.Vector3(Number(position.x), Number(position.y), Number(position.z));
}

function distance(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const dx = Number(left.x) - Number(right.x);
  const dy = Number(left.y) - Number(right.y);
  const dz = Number(left.z) - Number(right.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function notify(player, variant, message) {
  if (!isValidPlayer(player)) return;
  try {
    player.call("client:notification", [String(variant), String(message), 5000]);
  } catch (error) {
    console.error("[VEHICLE DEALERSHIP] Notification failed:", error);
  }
}

function dealershipError(code, message) {
  return Object.assign(new Error(message), { dealershipCode: code });
}

function ensureDealershipCatalog() {
  if (!catalogSyncPromise) {
    catalogSyncPromise = (async () => {
      const entries = config.vehicles;
      await vehicleScrapyard.syncVehicleCatalogEntries(entries);
    })().catch((error) => {
      catalogSyncPromise = null;
      throw error;
    });
  }

  return catalogSyncPromise;
}

function getCharacter(player) {
  return player?.character || player?.characterData || null;
}

function isPlayerInGame(player) {
  return Boolean(
    isValidPlayer(player) &&
    player.auth &&
    getCharacter(player) &&
    getPlayerUuid(player) > 0 &&
    authFlow.isPhase(player, authFlow.PHASE.IN_GAME)
  );
}

function isAtDealership(player) {
  return Boolean(
    isValidPlayer(player) &&
    !player.vehicle &&
    Number(player.dimension) === Number(config.point.dimension) &&
    distance(player.position, config.point.position) <= Number(config.point.radius) + 0.75
  );
}

function getVehicle(vehicleId) {
  const id = String(vehicleId || "");
  return config.vehicles.find((entry) => entry.enabled !== false && entry.id === id) || null;
}

function getColor(vehicle, colorId) {
  const id = Number(colorId);
  return vehicle?.colors.find((entry) => Number(entry.id) === id) || null;
}

function getBalances(player) {
  const character = getCharacter(player) || {};
  return {
    cash: Math.max(0, Number(character.cash || 0)),
    bank: Math.max(0, Number(character.bank || 0)),
  };
}

function publicPayload(player, selectedVehicleId = config.vehicles[0]?.id) {
  return {
    contractVersion: config.contractVersion,
    selectedVehicleId,
    balances: getBalances(player),
    maxOwnedVehicles: config.maxOwnedVehicles,
    vehicles: config.vehicles
      .filter((entry) => entry.enabled !== false)
      .map((entry) => ({
        id: entry.id,
        model: entry.model,
        name: entry.name,
        className: entry.className,
        price: entry.price,
        image: entry.image,
        colors: entry.colors.map((color) => ({ ...color })),
      })),
    interiorIpl: config.showroom.interiorIpl,
    camera: { ...config.showroom.camera, target: { ...config.showroom.camera.target } },
  };
}

function destroyPreview(session) {
  const vehicle = session?.previewVehicle;
  session.previewVehicle = null;
  if (!vehicle) return;
  try {
    if (mp.vehicles.exists(vehicle)) vehicle.destroy();
  } catch (error) {
    console.error("[VEHICLE DEALERSHIP] Preview cleanup failed:", error);
  }
}

function createPreview(session) {
  destroyPreview(session);
  const selected = getVehicle(session.selectedVehicleId);
  const color = getColor(selected, session.selectedColorId) || selected?.colors[0];
  if (!selected || !color) throw dealershipError("selection", "Selected vehicle is unavailable.");

  const preview = mp.vehicles.new(
    mp.joaat(selected.model),
    vector(config.showroom.position),
    {
      heading: config.showroom.heading,
      numberPlate: "TWINKLE",
      locked: true,
      engine: false,
      dimension: session.dimension,
    }
  );
  preview.setColor(Number(color.id), Number(color.id));
  preview.setVariables({
    dealershipPreview: true,
    ownerType: "none",
    ownerId: 0,
    engine: false,
    locked: true,
  });
  session.previewVehicle = preview;
  session.selectedColorId = Number(color.id);
  return preview;
}

function closeSession(player, options = {}) {
  const session = sessions.get(Number(player?.id));
  if (!session) return false;

  if (options.cancelPurchase !== false) session.cancelled = true;
  sessions.delete(Number(player.id));
  if (session.timer) clearTimeout(session.timer);
  if (session.previewRefreshTimer) clearTimeout(session.previewRefreshTimer);
  destroyPreview(session);

  if (isValidPlayer(player)) {
    if (options.restore !== false) {
      player.dimension = Number(session.returnState.dimension || 0);
      player.position = vector(session.returnState.position);
      player.heading = Number(session.returnState.heading || 0);
    }
    try { player.call("client:vehicleDealership:close", []); } catch {}
  }
  return true;
}

function sendPreview(player, session) {
  if (!isValidPlayer(player) || !session?.previewVehicle) return;
  player.call("client:vehicleDealership:previewVehicle", [session.previewVehicle.id]);
}

function openSession(player) {
  if (!isPlayerInGame(player) || !isAtDealership(player)) return false;
  if (purchaseLocks.has(player.id)) return false;
  if (sessions.has(player.id)) return true;
  if (player.vehicle) {
    notify(player, "warning", "Leave your current vehicle before entering the showroom.");
    return false;
  }

  const selected = getVehicle(config.vehicles[0]?.id);
  if (!selected) return false;

  const session = {
    playerId: player.id,
    characterUuid: getPlayerUuid(player),
    dimension: config.previewDimensionBase + player.id,
    selectedVehicleId: selected.id,
    selectedColorId: Number(selected.colors[0]?.id || 0),
    previewVehicle: null,
    previewRefreshTimer: null,
    cancelled: false,
    purchaseInFlight: false,
    returnState: {
      position: { ...player.position },
      heading: Number(player.heading || 0),
      dimension: Number(player.dimension || 0),
    },
    timer: null,
  };

  sessions.set(player.id, session);
  try {
    player.dimension = session.dimension;
    player.position = vector(config.showroom.playerPosition);
    player.heading = config.showroom.heading;
    createPreview(session);
    session.timer = setTimeout(() => {
      const current = mp.players.at(session.playerId);
      if (isValidPlayer(current)) {
        closeSession(current);
        notify(current, "info", "The dealership session expired.");
      } else {
        destroyPreview(session);
        sessions.delete(session.playerId);
      }
    }, config.sessionTimeoutMs);

    player.call("client:vehicleDealership:open", [JSON.stringify(publicPayload(player, selected.id))]);
    sendPreview(player, session);
    return true;
  } catch (error) {
    console.error("[VEHICLE DEALERSHIP] Session open failed:", error);
    closeSession(player);
    notify(player, "error", "The vehicle showroom could not be opened.");
    return false;
  }
}

function queuePreviewRefresh(player, session) {
  if (session.previewRefreshTimer) clearTimeout(session.previewRefreshTimer);
  session.previewRefreshTimer = setTimeout(() => {
    session.previewRefreshTimer = null;
    if (sessions.get(session.playerId) !== session || purchaseLocks.has(session.playerId)) return;
    try {
      createPreview(session);
      sendPreview(player, session);
    } catch (error) {
      console.error("[VEHICLE DEALERSHIP] Preview refresh failed:", error);
      notify(player, "error", "This vehicle could not be previewed.");
    }
  }, config.mutationCooldownMs);
}

function makePlate(vehicleId) {
  const encodedId = Number(vehicleId).toString(36).toUpperCase();
  if (!encodedId || encodedId.length > 7) {
    throw dealershipError("plate", "Vehicle registration capacity has been reached.");
  }
  return `D${encodedId.padStart(7, "0")}`;
}

function isActivePurchaseSession(player, session) {
  return Boolean(
    session &&
    session.cancelled !== true &&
    sessions.get(Number(session.playerId)) === session &&
    isPlayerInGame(player) &&
    getPlayerUuid(player) === Number(session.characterUuid)
  );
}

async function compensateCancelledPurchase({ characterUuid, moneyField, price, purchase }) {
  return db.withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const [characters] = await connection.query(
        "SELECT cash, bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
        [characterUuid]
      );
      if (!characters?.[0]) throw dealershipError("character", "Character not found for compensation.");

      const [vehicles] = await connection.query(
        "SELECT id, owner FROM vehicles WHERE id = ? LIMIT 1 FOR UPDATE",
        [purchase.vehicleId]
      );
      if (!vehicles?.[0] || Number(vehicles[0].owner || 0) !== Number(characterUuid)) {
        throw dealershipError("compensation", "Purchased vehicle not found for compensation.");
      }

      const balanceBefore = Math.max(0, Number(characters[0][moneyField] || 0));
      const balanceAfter = balanceBefore + price;
      await connection.query("DELETE FROM vehicles WHERE id = ? AND owner = ?", [purchase.vehicleId, characterUuid]);
      await connection.query(
        `UPDATE characters SET ${moneyField} = ? WHERE uuid = ?`,
        [balanceAfter, characterUuid]
      );
      await connection.commit();
      return { balanceBefore, balanceAfter };
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    }
  });
}

async function buyVehicle(player, paymentTypeRaw) {
  const playerId = Number(player.id);
  const session = sessions.get(playerId);
  if (!session || purchaseLocks.has(playerId)) return;
  purchaseLocks.add(playerId);
  session.purchaseInFlight = true;

  try {
    if (!isPlayerInGame(player) || getPlayerUuid(player) !== session.characterUuid) {
      throw dealershipError("character", "The active character changed.");
    }

    const selected = getVehicle(session.selectedVehicleId);
    const color = getColor(selected, session.selectedColorId);
    if (!selected || !color) throw dealershipError("selection", "Selected vehicle is unavailable.");
    if (session.previewRefreshTimer) {
      throw dealershipError("preview", "Wait for the vehicle preview to finish loading.");
    }

    const requiredLicenseId = String(selected.requiredLicenseId || "vehicle_b");
    if (!await licenseService.hasLicense(player, requiredLicenseId)) {
      throw dealershipError("license", "A valid category B driving licence is required.");
    }
    await ensureDealershipCatalog();
    if (!isActivePurchaseSession(player, session)) {
      throw dealershipError("cancelled", "The purchase session was cancelled.");
    }

    const paymentType = String(paymentTypeRaw || "").toLowerCase();
    if (paymentType !== "cash" && paymentType !== "card") {
      throw dealershipError("payment", "Invalid payment method.");
    }
    const moneyField = paymentType === "card" ? "bank" : "cash";
    const characterUuid = session.characterUuid;
    const price = Math.max(1, Number(selected.price));

    const purchase = await db.withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        if (!isActivePurchaseSession(player, session)) {
          throw dealershipError("cancelled", "The purchase session was cancelled.");
        }
        const [characters] = await connection.query(
          "SELECT cash, bank FROM characters WHERE uuid = ? LIMIT 1 FOR UPDATE",
          [characterUuid]
        );
        if (!characters?.[0]) throw dealershipError("character", "Character not found.");

        const [ownedRows] = await connection.query(
          "SELECT COUNT(*) AS total FROM vehicles WHERE owner = ?",
          [characterUuid]
        );
        if (Number(ownedRows?.[0]?.total || 0) >= config.maxOwnedVehicles) {
          throw dealershipError("limit", "Your personal vehicle limit has been reached.");
        }

        const balanceBefore = Math.max(0, Number(characters[0][moneyField] || 0));
        if (balanceBefore < price) throw dealershipError("funds", "Not enough money.");
        const balanceAfter = balanceBefore - price;

        await connection.query(
          `UPDATE characters SET ${moneyField} = ? WHERE uuid = ?`,
          [balanceAfter, characterUuid]
        );

        const spawn = config.delivery;
        const [insert] = await connection.query(
          `INSERT INTO vehicles
            (owner, model, pos_x, pos_y, pos_z, heading, dimension, fuel, mileage, locked, engine, health, plate, color1, color2)
           VALUES (?, ?, ?, ?, ?, ?, ?, 100, 0, 0, 0, 1000, NULL, ?, ?)`,
          [
            characterUuid,
            selected.model,
            spawn.position.x,
            spawn.position.y,
            spawn.position.z,
            spawn.heading,
            spawn.dimension,
            color.id,
            color.id,
          ]
        );
        const vehicleId = Number(insert?.insertId || 0);
        if (!vehicleId) throw dealershipError("insert", "Vehicle purchase could not be saved.");
        const plate = makePlate(vehicleId);
        const [plateCollision] = await connection.query(
          "SELECT id FROM vehicles WHERE plate = ? AND id <> ? LIMIT 1 FOR UPDATE",
          [plate, vehicleId]
        );
        if (plateCollision.length) {
          throw dealershipError("plate", "A unique vehicle registration could not be assigned.");
        }
        await connection.query("UPDATE vehicles SET plate = ? WHERE id = ?", [plate, vehicleId]);
        if (!isActivePurchaseSession(player, session)) {
          throw dealershipError("cancelled", "The purchase session was cancelled.");
        }
        await connection.commit();

        return { vehicleId, plate, balanceBefore, balanceAfter };
      } catch (error) {
        try { await connection.rollback(); } catch {}
        throw error;
      }
    });

    if (!isActivePurchaseSession(player, session)) {
      const compensation = await compensateCancelledPurchase({
        characterUuid,
        moneyField,
        price,
        purchase,
      });
      const sameCharacter = isValidPlayer(player) && getPlayerUuid(player) === characterUuid;
      if (sameCharacter) {
        const currentCharacter = getCharacter(player);
        if (currentCharacter) currentCharacter[moneyField] = compensation.balanceAfter;
        try { player.setVariable(moneyField, compensation.balanceAfter); } catch {}
        try {
          player.call("c:hud:update", [JSON.stringify({
            player: {
              cash: Number(currentCharacter?.cash || 0),
              bank: Number(currentCharacter?.bank || 0),
            },
          })]);
        } catch {}
        notify(player, "info", "Vehicle purchase cancelled. Your payment was refunded.");
      }
      logsDb.writeMoneyLog({
        source: "vehicle_dealership",
        action: "purchase_cancelled_refund",
        currency: moneyField,
        amount: price,
        balanceBefore: compensation.balanceBefore,
        balanceAfter: compensation.balanceAfter,
        target: sameCharacter ? player : null,
        targetUuid: characterUuid,
        comment: `Cancelled purchase ${selected.model}`,
        metadata: { vehicleId: purchase.vehicleId, colorId: color.id },
      }).catch((error) => console.error("[VEHICLE DEALERSHIP] Compensation log failed:", error));
      return;
    }

    const playerStillActive = isActivePurchaseSession(player, session);
    const character = playerStillActive ? getCharacter(player) : null;
    if (character) character[moneyField] = purchase.balanceAfter;
    if (playerStillActive) {
      try { player.setVariable(moneyField, purchase.balanceAfter); } catch {}
      try {
        player.call("c:hud:update", [JSON.stringify({
          player: {
            cash: Number(character?.cash || 0),
            bank: Number(character?.bank || 0),
          },
        })]);
      } catch {}
    }

    logsDb.writeMoneyLog({
      source: "vehicle_dealership",
      action: "purchase",
      currency: moneyField,
      amount: -price,
      balanceBefore: purchase.balanceBefore,
      balanceAfter: purchase.balanceAfter,
      target: playerStillActive ? player : null,
      targetUuid: characterUuid,
      comment: `Purchased ${selected.model}`,
      metadata: { vehicleId: purchase.vehicleId, colorId: color.id },
    }).catch((error) => console.error("[VEHICLE DEALERSHIP] Money log failed:", error));

    closeSession(player, { restore: false, cancelPurchase: false });
    if (!playerStillActive) return;
    player.dimension = Number(config.delivery.dimension);
    player.position = vector(config.delivery.position);
    player.heading = Number(config.delivery.heading);

    const row = {
      id: purchase.vehicleId,
      owner: characterUuid,
      model: selected.model,
      display_name: selected.name,
      fuel: 100,
      mileage: 0,
      locked: 0,
      engine: 0,
      health: 1000,
      plate: purchase.plate,
      color1: color.id,
      color2: color.id,
    };

    try {
      const ownedVehicle = vehicleCommands.createVehicleEntity(
        row,
        vector(config.delivery.position),
        config.delivery.heading,
        config.delivery.dimension
      );
      pendingDeliveries.set(player.id, {
        characterUuid,
        vehicle: ownedVehicle,
        vehicleId: ownedVehicle.id,
        expiresAt: Date.now() + 15000,
        timer: null,
      });
      const pending = pendingDeliveries.get(player.id);
      pending.timer = setTimeout(() => {
        if (pendingDeliveries.get(player.id) === pending) pendingDeliveries.delete(player.id);
      }, 15000);
      player.call("client:vehicleDealership:ownedVehicle", [ownedVehicle.id]);
    } catch (spawnError) {
      console.error("[VEHICLE DEALERSHIP] Purchased vehicle spawn failed:", spawnError);
      notify(player, "warning", "The vehicle was purchased and saved, but could not be spawned. Use your garage or ask an administrator.");
    }

  } catch (error) {
    console.error("[VEHICLE DEALERSHIP] Purchase failed:", error);
    const messages = {
      funds: "Not enough money for this vehicle.",
      limit: "Your personal vehicle limit has been reached.",
      payment: "Invalid payment method.",
      selection: "Selected vehicle is unavailable.",
      preview: "Wait for the vehicle preview to finish loading.",
      license: "You need a valid category B driving licence to buy this vehicle.",
      cancelled: "Vehicle purchase cancelled.",
    };
    notify(player, "error", messages[error?.dealershipCode] || "The vehicle purchase failed.");
  } finally {
    session.purchaseInFlight = false;
    purchaseLocks.delete(playerId);
  }
}

mp.events.add("playerEnterColshape", (player, shape) => {
  if (shape !== dealershipPoint || sessions.has(player.id)) return;
  player.call("client:vehicleDealership:hint", [true]);
  notify(player, "info", "Нажмите E, чтобы открыть автосалон.");
});

mp.events.add("playerExitColshape", (player, shape) => {
  if (shape !== dealershipPoint || sessions.has(player.id)) return;
  player.call("client:vehicleDealership:hint", [false]);
});

mp.events.add("server:vehicleDealership:open", (player) => {
  openSession(player);
});

mp.events.add("server:vehicleDealership:select", (player, vehicleId) => {
  const session = sessions.get(player.id);
  const selected = getVehicle(vehicleId);
  if (!session || purchaseLocks.has(player.id) || !selected) return;

  session.selectedVehicleId = selected.id;
  session.selectedColorId = Number(selected.colors[0]?.id || 0);
  queuePreviewRefresh(player, session);
});

mp.events.add("server:vehicleDealership:color", (player, colorId) => {
  const session = sessions.get(player.id);
  if (!session || purchaseLocks.has(player.id)) return;
  const selected = getVehicle(session.selectedVehicleId);
  const color = getColor(selected, colorId);
  if (!color || !session.previewVehicle || !mp.vehicles.exists(session.previewVehicle)) return;

  session.selectedColorId = Number(color.id);
  session.previewVehicle.setColor(Number(color.id), Number(color.id));
});

mp.events.add("server:vehicleDealership:previewStreamed", (player, vehicleIdRaw) => {
  const session = sessions.get(player.id);
  const vehicleId = Number(vehicleIdRaw);
  if (!session || !session.previewVehicle || vehicleId !== Number(session.previewVehicle.id)) return;
  if (!mp.vehicles.exists(session.previewVehicle)) return;
  if (Number(player.dimension) !== Number(session.dimension)) return;
  if (distance(player.position, session.previewVehicle.position) > 20) return;
  session.previewVehicle.setVariable("engine", false);
});

mp.events.add("server:vehicleDealership:buy", (player, paymentType) => {
  buyVehicle(player, paymentType).catch((error) => {
    console.error("[VEHICLE DEALERSHIP] Purchase handler failed:", error);
  });
});

mp.events.add("server:vehicleDealership:close", (player) => {
  closeSession(player);
});

mp.events.add("server:vehicleDealership:ownedStreamed", (player, vehicleIdRaw) => {
  const pending = pendingDeliveries.get(player.id);
  const vehicleId = Number(vehicleIdRaw);
  if (!pending || pending.vehicleId !== vehicleId) return;
  if (Date.now() > pending.expiresAt || pending.characterUuid !== getPlayerUuid(player)) {
    if (pending.timer) clearTimeout(pending.timer);
    pendingDeliveries.delete(player.id);
    return;
  }
  if (!pending.vehicle || !mp.vehicles.exists(pending.vehicle)) return;
  if (distance(player.position, pending.vehicle.position) > 20) return;
  if (pending.timer) clearTimeout(pending.timer);
  pendingDeliveries.delete(player.id);
  try { player.putIntoVehicle(pending.vehicle, 0); } catch (error) {
    console.error("[VEHICLE DEALERSHIP] Delivery seating failed:", error);
  }
  try { player.call("c:vehicle:engine:set", [false, true]); } catch {}
});

function cleanupPlayer(player) {
  const pending = pendingDeliveries.get(Number(player?.id));
  if (pending?.timer) clearTimeout(pending.timer);
  pendingDeliveries.delete(Number(player?.id));
  closeSession(player);
}

mp.events.add("playerDeath", cleanupPlayer);
mp.events.add("playerQuit", cleanupPlayer);

console.log("[VEHICLE DEALERSHIP] Loaded");

ensureDealershipCatalog()
  .then(() => console.log("[VEHICLE DEALERSHIP] Vehicle catalog synchronized."))
  .catch((error) => console.error("[VEHICLE DEALERSHIP] Vehicle catalog sync failed:", error));

module.exports = {
  sessions,
  closeSession,
  openSession,
  publicPayload,
};
