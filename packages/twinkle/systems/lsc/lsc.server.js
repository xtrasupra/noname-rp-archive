"use strict";

const crypto = require("crypto");
const db = require("../../database/query.js");
const { canControlVehicle, getPlayerUuid } = require("../vehicle/vehicle.owner.js");
const tuningService = require("./tuning.service.js");
const { POINTS, MOD_CATEGORIES } = require("./lsc.config.js");
const { getAdminLevel } = require("../admin/admin.logs.js");

const sessions = new Map();
const pendingPurchases = new Set();
const shapes = [];

function isPlayer(player) { return Boolean(player && mp.players.exists(player)); }
function notify(player, type, message) {
  if (isPlayer(player)) player.call("client:notification", [String(type), String(message), 4500]);
}
function distance(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dy = Number(a?.y || 0) - Number(b?.y || 0);
  const dz = Number(a?.z || 0) - Number(b?.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function isDriver(player) {
  const seat = Number(player?.seat);
  return seat === 0 || seat === -1;
}
function getVehicleDbId(vehicle) {
  try { return Number(vehicle?.getVariable?.("vehicleDbId") || 0); } catch { return 0; }
}
function getCategory(id) { return MOD_CATEGORIES.find((item) => item.id === String(id)) || null; }
function parseDynamicOption(optionId) {
  if (String(optionId) === "stock") return -1;
  const match = String(optionId).match(/^mod:(\d{1,3})$/);
  if (!match) return null;
  const index = Number(match[1]);
  return index >= 0 && index <= 255 ? index : null;
}
function resolveOption(category, optionId) {
  if (category.dynamic) {
    const gameModIndex = parseDynamicOption(optionId);
    if (gameModIndex === null) return null;
    return { id: String(optionId), name: gameModIndex < 0 ? "Стандарт" : `Вариант ${gameModIndex + 1}`, gameModIndex, price: Number(category.price || 0) };
  }
  return category.options?.find((item) => String(item.id) === String(optionId)) || null;
}
function calculatePrice(category, option, vehiclePrice) {
  const base = Number(option.price ?? category.price ?? 0);
  const margin = (Number(vehiclePrice || 0) / 100) * Number(category.multiplier || 0);
  return Math.max(0, Math.round(base + margin));
}
function findInstalledOption(category, value) {
  if (category.dynamic) return Number(value) < 0 ? "stock" : `mod:${Number(value)}`;
  const found = category.options?.find((option) => Number(option.gameModIndex) === Number(value));
  return found?.id ?? "stock";
}
function getInstalledMap(tuning) {
  const result = {};
  for (const category of MOD_CATEGORIES) {
    if (category.id === "repair") result.repair = "__none__";
    else if (category.id === "turbo") result.turbo = tuning.turbo ? "turbo-kit" : "stock";
    else if (category.id === "tint") result.tint = findInstalledOption(category, tuning.tint);
    else if (category.id === "lights") result.lights = findInstalledOption(category, tuning.lights);
    else if (category.id === "plate") result.plate = findInstalledOption(category, tuning.plate);
    else if (category.id === "neon") result.neon = tuning.neon?.enabled ? "enabled" : "stock";
    else if (category.id === "paint") result.paint = "custom";
    else result[category.id] = findInstalledOption(category, tuning.mods?.[category.id] ?? -1);
  }
  return result;
}
function publicCategories(vehiclePrice) {
  return MOD_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    supportsColor: Boolean(category.supportsColor),
    dynamic: Boolean(category.dynamic),
    modType: category.modType,
    options: category.dynamic
      ? [{ id: "stock", name: "Стандарт", gameModIndex: -1, price: calculatePrice(category, { price: category.price }, vehiclePrice) }]
      : (category.options || []).map((option) => ({ ...option, price: calculatePrice(category, option, vehiclePrice) })),
  }));
}
function isAtPoint(player, pointIndex) {
  const point = POINTS[Number(pointIndex)];
  return Boolean(point && Number(player.dimension) === Number(point.dimension) && distance(player.position, point.position) <= 4.5);
}
function validateVehicle(player, pointIndex) {
  const vehicle = player?.vehicle;
  if (!vehicle || !mp.vehicles.exists(vehicle)) return "Вы должны находиться в автомобиле.";
  if (!isDriver(player)) return "LS Customs доступен только водителю.";
  if (!isAtPoint(player, pointIndex)) return "Автомобиль находится вне зоны LS Customs.";
  if (!canControlVehicle(player, vehicle)) return "Тюнинг доступен только владельцу автомобиля.";
  if (String(vehicle.getVariable("ownerType") || "") !== "player" || !getVehicleDbId(vehicle)) return "Этот автомобиль нельзя модифицировать.";
  if (vehicle.getVariable("rentalVehicle")) return "Арендованный транспорт нельзя модифицировать.";
  return null;
}
async function getVehicleCatalogPrice(vehicle) {
  try {
    const model = String(vehicle.getVariable("modelName") || "");
    if (!model) return 0;
    const rows = await db.query("SELECT gov_price FROM vehicle_catalog WHERE model = ? LIMIT 1", [model]);
    return Number(rows[0]?.gov_price || 0);
  } catch { return 0; }
}
function closeSession(player, tellClient = true) {
  if (!player) return;
  sessions.delete(player.id);
  if (tellClient && isPlayer(player)) player.call("client:lsc:close");
}
function hexToRgb(value) {
  const match = String(value || "").match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const number = parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}
function applyPurchase(tuning, category, option, color) {
  if (category.id === "turbo") tuning.turbo = option.gameModIndex >= 0;
  else if (category.id === "tint") tuning.tint = option.gameModIndex;
  else if (category.id === "lights") tuning.lights = option.gameModIndex;
  else if (category.id === "plate") tuning.plate = option.gameModIndex;
  else if (category.id === "neon") {
    tuning.neon.enabled = option.gameModIndex >= 0;
    if (tuning.neon.enabled) tuning.neon.color = hexToRgb(color) || tuning.neon.color;
  } else if (category.id === "paint") {
    const rgb = hexToRgb(color);
    if (!rgb) throw new Error("INVALID_COLOR");
    tuning.paint[option.id].enabled = true;
    tuning.paint[option.id].color = rgb;
  } else if (category.id !== "repair") tuning.mods[category.id] = option.gameModIndex;
  return tuningService.normalize(tuning);
}

for (const [index, point] of POINTS.entries()) {
  const position = new mp.Vector3(point.position.x, point.position.y, point.position.z);
  const shape = mp.colshapes.newSphere(position.x, position.y, position.z, 3.5, point.dimension);
  shape.lsCustomsPoint = index;
  shapes.push(shape);
  mp.markers.new(1, new mp.Vector3(position.x, position.y, position.z - 1), 3.2, { color: [224, 0, 255, 150], visible: true, dimension: point.dimension });
  mp.blips.new(72, position, { name: "LS Customs", color: 4, shortRange: true, dimension: point.dimension });
}

mp.events.add("playerEnterColshape", (player, shape) => {
  if (shape?.lsCustomsPoint === undefined) return;
  player.call("client:lsc:setAvailable", [Number(shape.lsCustomsPoint), true]);
});
mp.events.add("playerExitColshape", (player, shape) => {
  if (shape?.lsCustomsPoint === undefined) return;
  player.call("client:lsc:setAvailable", [Number(shape.lsCustomsPoint), false]);
  closeSession(player, true);
});

mp.events.add("server:lsc:requestOpen", async (player, pointIndexRaw) => {
  try {
    if (!isPlayer(player) || !player.auth || !getPlayerUuid(player)) return;
    if (pendingPurchases.has(player.id)) return notify(player, "info", "Дождитесь завершения предыдущей покупки.");
    const pointIndex = Number(pointIndexRaw);
    const error = validateVehicle(player, pointIndex);
    if (error) return notify(player, "error", error);
    const vehicle = player.vehicle;
    const vehiclePrice = await getVehicleCatalogPrice(vehicle);
    const tuning = tuningService.get(vehicle);
    const session = {
      id: crypto.randomBytes(16).toString("hex"),
      pointIndex,
      vehicle,
      vehicleId: vehicle.id,
      vehicleDbId: getVehicleDbId(vehicle),
      vehiclePrice,
      expiresAt: Date.now() + (5 * 60 * 1000),
    };
    sessions.set(player.id, session);
    const point = POINTS[pointIndex];
    player.call("client:lsc:open", [JSON.stringify({
      sessionId: session.id,
      vehicle: {
        id: session.vehicleDbId,
        model: String(vehicle.getVariable("modelName") || "vehicle"),
        name: String(vehicle.getVariable("displayName") || vehicle.getVariable("modelName") || "Автомобиль"),
        plate: String(vehicle.numberPlate || ""),
      },
      balance: { cash: Number(player.character?.cash || 0), bank: Number(player.character?.bank || 0) },
      installed: getInstalledMap(tuning),
      categories: publicCategories(vehiclePrice),
      point: { camera: point.camera, lookAt: point.lookAt, heading: point.heading },
    })]);
  } catch (error) {
    console.error("[LSC] Open failed:", error);
    notify(player, "error", "Не удалось открыть LS Customs.");
  }
});

mp.events.add("server:lsc:close", (player) => closeSession(player, false));
mp.events.add("server:lsc:buy", async (player, sessionId, categoryId, optionId, color, paymentTypeRaw) => {
  if (!isPlayer(player) || pendingPurchases.has(player.id)) return;
  pendingPurchases.add(player.id);
  try {
    const session = sessions.get(player.id);
    if (!session || session.id !== String(sessionId) || Date.now() > session.expiresAt || player.vehicle !== session.vehicle || !mp.vehicles.exists(session.vehicle)) throw new Error("INVALID_SESSION");
    const validationError = validateVehicle(player, session.pointIndex);
    if (validationError) throw new Error(validationError);
    const category = getCategory(categoryId);
    const option = category && resolveOption(category, optionId);
    if (!category || !option) throw new Error("INVALID_OPTION");
    if (category.supportsColor && option.gameModIndex !== -1 && !hexToRgb(color)) throw new Error("INVALID_COLOR");
    const paymentType = String(paymentTypeRaw) === "card" ? "card" : String(paymentTypeRaw) === "cash" ? "cash" : null;
    if (!paymentType) throw new Error("INVALID_PAYMENT");
    const price = calculatePrice(category, option, session.vehiclePrice);
    const uuid = getPlayerUuid(player);
    const field = paymentType === "card" ? "bank" : "cash";
    const currentTuning = tuningService.get(session.vehicle);
    const currentlyInstalled = getInstalledMap(currentTuning)[category.id];
    if (!category.supportsColor && category.id !== "repair" && String(currentlyInstalled) === String(option.id)) throw new Error("ALREADY_INSTALLED");
    const nextTuning = category.id === "repair" ? currentTuning : applyPurchase(currentTuning, category, option, color);

    await db.withConn(async (conn) => {
      await conn.beginTransaction();
      try {
        const [vehicles] = await conn.query("SELECT owner FROM vehicles WHERE id = ? FOR UPDATE", [session.vehicleDbId]);
        if (!vehicles.length || Number(vehicles[0].owner) !== Number(uuid)) throw new Error("NOT_OWNER");
        const [characters] = await conn.query(`SELECT cash, bank FROM characters WHERE uuid = ? FOR UPDATE`, [uuid]);
        if (!characters.length || Number(characters[0][field] || 0) < price) throw new Error("NOT_ENOUGH_MONEY");
        await conn.query(`UPDATE characters SET ${field} = ${field} - ? WHERE uuid = ?`, [price, uuid]);
        if (category.id === "repair") await conn.query("UPDATE vehicles SET health = ? WHERE id = ?", [1000, session.vehicleDbId]);
        else await conn.query("UPDATE vehicles SET tuning_json = ? WHERE id = ?", [JSON.stringify(nextTuning), session.vehicleDbId]);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });

    player.character[field] = Math.max(0, Number(player.character[field] || 0) - price);
    if (category.id === "repair") {
      try { session.vehicle.engineHealth = 1000; session.vehicle.bodyHealth = 1000; session.vehicle.repair(); } catch {}
    } else tuningService.sync(session.vehicle, nextTuning);
    const result = {
      installed: getInstalledMap(nextTuning),
      balance: { cash: Number(player.character.cash || 0), bank: Number(player.character.bank || 0) },
      categoryId: category.id,
      optionId: option.id,
      tuning: nextTuning,
    };
    if (sessions.get(player.id)?.id === session.id) player.call("client:lsc:purchaseSuccess", [JSON.stringify(result)]);
    player.call("c:hud:update", [JSON.stringify({ money: result.balance })]);
    notify(player, "success", category.id === "repair" ? "Автомобиль отремонтирован." : "Модификация установлена.");
  } catch (error) {
    const code = String(error?.message || "");
    const message = code === "NOT_ENOUGH_MONEY" ? "Недостаточно средств." : code === "NOT_OWNER" ? "Вы больше не являетесь владельцем автомобиля." : code === "ALREADY_INSTALLED" ? "Эта модификация уже установлена." : code === "INVALID_SESSION" ? "Сессия LS Customs истекла. Откройте меню снова." : code.includes("зоны") ? code : "Не удалось установить модификацию.";
    notify(player, "error", message);
    if (code === "INVALID_SESSION") closeSession(player, true);
  } finally {
    pendingPurchases.delete(player.id);
  }
});

mp.registerCommand("gotolsc", (player) => {
  if (!isPlayer(player)) return;
  if (getAdminLevel(player) < 1) return notify(player, "error", "Нет доступа к команде.");
  const point = POINTS[0];
  if (!point) return notify(player, "error", "Точка LS Customs не настроена.");
  const target = point.approach || point.position;
  const destination = new mp.Vector3(target.x, target.y, target.z + 0.5);
  const vehicle = player.vehicle;
  if (vehicle && mp.vehicles.exists(vehicle)) {
    if (!isDriver(player)) return notify(player, "error", "Чтобы телепортировать автомобиль, займите водительское место.");
    vehicle.dimension = Number(point.dimension || 0);
    vehicle.position = destination;
    vehicle.heading = Number(point.heading || 0);
  } else {
    player.dimension = Number(point.dimension || 0);
    player.position = destination;
    player.heading = Number(point.heading || 0);
  }
  notify(player, "success", "Вы телепортированы к LS Customs.");
});
mp.events.add("playerExitVehicle", (player) => closeSession(player, true));
mp.events.add("playerDeath", (player) => closeSession(player, true));
mp.events.add("playerQuit", (player) => closeSession(player, false));

module.exports = { sessions, getInstalledMap };
console.log(`[LS CUSTOMS] Loaded points: ${POINTS.length}`);