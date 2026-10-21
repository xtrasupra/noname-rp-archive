"use strict";

const crypto = require("crypto");
const config = require("./trucker.config.js");
const repository = require("./trucker.repository.js");
const employment = require("../jobEmployment.service.js");
const jobRewardMultiplier = require("../jobRewardMultiplier.service.js");
const chat = require("../../chat/chat.service.js");
const documents = require("../../documents/document.service.js");
const { DOCUMENT_ITEM_IDS } = require("../../documents/document.items.js");
const licenses = require("../../licenses/license.service.js");
const logsDb = require("../../../database/logs.js");
const quests = require("../../quests/quest.service.js");
const { getUuid } = require("../../../utils/player.js");

try {
  global.__twinkleTruckerRuntime?.shutdown?.();
} catch (error) {
  console.error("[TRUCKER] Previous runtime shutdown failed:", error);
}

const runtime = { active: true, events: [], timers: [], shutdown: null };
global.__twinkleTruckerRuntime = runtime;

const workers = new Map();
let schemaReady = false;
let schemaError = null;

function registerEvent(name, handler) {
  const guarded = (...args) => runtime.active ? handler(...args) : undefined;
  mp.events.add(name, guarded);
  runtime.events.push({ name, handler: guarded });
  return guarded;
}

function addInterval(handler, delay) {
  const timer = setInterval(() => {
    if (runtime.active) handler();
  }, delay);
  runtime.timers.push(timer);
  return timer;
}

function notify(player, message, variant = "info") {
  if (!player || !message) return;
  try { player.call("client:notification", [variant, String(message), 5000]); } catch {}
  try {
    if (variant === "error") chat.sendError(player, message);
    else if (variant === "success") chat.sendSuccess(player, message);
    else chat.sendInfo(player, message);
  } catch {}
}

function getState(player) {
  return player ? workers.get(Number(player.id)) || null : null;
}

function getVehicleConfig(vehicleId) {
  return config.vehicles.find((vehicle) => vehicle.id === String(vehicleId || "")) || null;
}

function getSkillConfig(skillId) {
  return config.skills.find((skill) => skill.id === String(skillId || "")) || null;
}

function areRentalSpawnsClear(needsTrailer) {
  const points = [config.vehicleSpawn, ...(needsTrailer ? [config.trailerSpawn] : [])];
  let clear = true;
  try {
    mp.vehicles.forEach((vehicle) => {
      if (!clear || !vehicle || !mp.vehicles.exists(vehicle)) return;
      if (points.some((point) => distance(vehicle.position, point) < 5.5)) clear = false;
    });
  } catch {
    return false;
  }
  return clear;
}

function parsePayload(raw) {
  try {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function distance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  const dx = Number(left.x || 0) - Number(right.x || 0);
  const dy = Number(left.y || 0) - Number(right.y || 0);
  const dz = Number(left.z || 0) - Number(right.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function headingDifference(left, right) {
  const a = ((Number(left || 0) % 360) + 360) % 360;
  const b = ((Number(right || 0) % 360) + 360) % 360;
  const delta = Math.abs(a - b);
  return Math.min(delta, 360 - delta);
}

function vehicleSpeed(vehicle) {
  try {
    const velocity = vehicle?.velocity;
    if (!velocity) return 0;
    return Math.sqrt(Number(velocity.x || 0) ** 2 + Number(velocity.y || 0) ** 2 + Number(velocity.z || 0) ** 2);
  } catch {
    return 0;
  }
}

function isPlayerActive(player) {
  try { return Boolean(player && mp.players.exists(player) && getUuid(player)); } catch { return false; }
}

function isDriver(player, state) {
  if (!player || !state?.vehicle || !mp.vehicles.exists(state.vehicle)) return false;
  if (player.vehicle !== state.vehicle) return false;
  try {
    const occupant = state.vehicle.getOccupant?.(0);
    if (occupant && occupant !== player) return false;
  } catch {}
  return true;
}

function isAssignedTrailerAttached(state) {
  if (!state?.vehicleConfig || state.vehicleConfig.type !== "truck") return true;
  if (!state.trailer || !mp.vehicles.exists(state.trailer) || !state.vehicle || !mp.vehicles.exists(state.vehicle)) return false;
  if (Number(state.trailer.dimension || 0) !== Number(state.vehicle.dimension || 0)) return false;
  if (distance(state.trailer.position, state.vehicle.position) > 16) return false;
  let matchedRelationship = false;
  let explicitDetached = false;
  try {
    const linkedTrailer = state.vehicle.trailer;
    if (linkedTrailer === state.trailer) matchedRelationship = true;
    else if (linkedTrailer === null) explicitDetached = true;
    else if (linkedTrailer !== undefined) return false;
  } catch {}
  try {
    const linkedVehicle = state.trailer.traileredBy;
    if (linkedVehicle === state.vehicle) matchedRelationship = true;
    else if (linkedVehicle === null) explicitDetached = true;
    else if (linkedVehicle !== undefined) return false;
  } catch {}
  if (matchedRelationship) {
    state.trailerAttached = true;
    return true;
  }
  if (explicitDetached) {
    state.trailerAttached = false;
    return false;
  }
  return state.trailerAttached === true;
}

function createState(player) {
  const existing = getState(player);
  const characterUuid = getUuid(player);
  if (existing && Number(existing.characterUuid) === Number(characterUuid)) return existing;
  if (existing) {
    destroyRental(existing);
    workers.delete(Number(player.id));
  }
  const state = {
    characterUuid,
    vehicle: null,
    trailer: null,
    trailerAttached: false,
    vehicleConfig: null,
    leaseId: null,
    leaseExpiresAt: 0,
    leaseOrdersRemaining: 0,
    active: null,
    pendingAcceptedOrderId: null,
    operationTail: Promise.resolve(),
    renting: false,
    stopping: false,
    alignedSince: 0,
    lastSamplePosition: null,
    lastSampleAt: 0,
    lastFuel: null,
    lastPersistAt: 0,
    missingVehicleCleanup: false,
    suspiciousTravelEvents: 0,
    suspiciousTravelM: 0,
    lastEventAt: Object.create(null),
  };
  workers.set(Number(player.id), state);
  return state;
}

function allowEvent(state, key, cooldownMs) {
  if (!state) return false;
  const now = Date.now();
  const previous = Number(state.lastEventAt?.[key] || 0);
  if (now - previous < cooldownMs) return false;
  state.lastEventAt[key] = now;
  return true;
}

function serialize(state, operation) {
  const previous = state.operationTail || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  state.operationTail = current;
  return current.finally(() => {
    if (state.operationTail === current) state.operationTail = Promise.resolve();
  });
}

function ensureReady() {
  if (!schemaReady) {
    throw new Error(schemaError ? "Сервис дальнобоя временно недоступен: проверьте SQL-схему." : "Сервис дальнобоя запускается. Попробуйте ещё раз.");
  }
}

async function hasPassport(player) {
  const [identity, item] = await Promise.all([
    documents.getIdentityDocument(player),
    documents.hasDocumentItem(player, DOCUMENT_ITEM_IDS.identity),
  ]);
  return Boolean(identity && item);
}

async function hasCdl(player, licenseId, requirePhysical = true) {
  const [active, item] = await Promise.all([
    licenses.hasLicense(player, licenseId),
    requirePhysical ? licenses.hasLicenseDocumentItem(player, licenseId) : Promise.resolve(true),
  ]);
  return Boolean(active && item);
}

async function getEligibility(player) {
  const [passport, cdlB, cdlA] = await Promise.all([
    hasPassport(player),
    hasCdl(player, "cdl_b"),
    hasCdl(player, "cdl_a"),
  ]);
  return { passport, cdlB, cdlA, canWork: passport && (cdlB || cdlA) };
}

async function requireWorkEligibility(player) {
  ensureReady();
  if (!isPlayerActive(player)) throw new Error("Персонаж не загружен.");
  const eligibility = await getEligibility(player);
  if (!eligibility.passport) throw new Error("Для работы нужна действующая ID-карта в инвентаре.");
  if (!eligibility.cdlB && !eligibility.cdlA) throw new Error("Для работы нужны действующие права CDL B или CDL A.");
  return eligibility;
}

function syncCash(player, cash) {
  const amount = Math.max(0, Number(cash || 0));
  player.cash = amount;
  if (player.character) player.character.cash = amount;
  if (player.characterData) player.characterData.cash = amount;
  try { player.setVariable("cash", amount); } catch {}
  try { player.call("client:money:update", [amount]); } catch {}
  try { player.call("c:hud:update", [JSON.stringify({ player: { cash: amount } })]); } catch {}
}

function setupVehicle(player, vehicle, vehicleConfig, leaseId, isTrailer = false) {
  const uuid = getUuid(player);
  vehicle.truckerVehicle = !isTrailer;
  vehicle.truckerTrailer = isTrailer;
  vehicle.truckerOwnerUuid = uuid;
  vehicle.truckerLeaseId = leaseId;
  try {
    vehicle.engine = !isTrailer;
    vehicle.locked = false;
    vehicle.setVariable("truckerVehicle", !isTrailer);
    vehicle.setVariable("truckerTrailer", isTrailer);
    vehicle.setVariable("truckerOwnerUuid", uuid);
    vehicle.setVariable("truckerLeaseId", leaseId);
    vehicle.setVariable("ownerType", "player");
    vehicle.setVariable("ownerId", uuid);
    vehicle.setVariable("engine", !isTrailer);
    vehicle.setVariable("locked", false);
    if (!isTrailer) {
      vehicle.setVariable("fuel", Number(vehicleConfig.fuel || 100));
      vehicle.setVariable("fuelMax", Number(vehicleConfig.fuelMax || 100));
      vehicle.setVariable("fuelType", "diesel");
      vehicle.setVariable("fuelConsumption", Number(vehicleConfig.fuelConsumption || 1));
      vehicle.setVariable("mileage", 0);
    }
  } catch {}
}

function destroyRental(state) {
  for (const entity of [state?.trailer, state?.vehicle]) {
    try {
      if (entity && mp.vehicles.exists(entity)) entity.destroy();
    } catch {}
  }
  if (!state) return;
  state.vehicle = null;
  state.trailer = null;
  state.trailerAttached = false;
  state.vehicleConfig = null;
  state.leaseId = null;
  state.leaseExpiresAt = 0;
  state.leaseOrdersRemaining = 0;
  state.lastSamplePosition = null;
  state.lastSampleAt = 0;
  state.lastFuel = null;
}

function clearClientWork(player) {
  try { player.call("client:trucker:clear", []); } catch {}
  try { player.call("client:trucker:tablet:update", ["null"]); } catch {}
}

async function stopRuntime(player, options = {}) {
  const state = getState(player);
  if (!state) {
    clearClientWork(player);
    return true;
  }

  state.alignedSince = 0;
  let cleanupPersisted = true;
  let rentalClosedWithOrder = false;
  try {
    if (state.active) {
      let persisted = false;
      let lastError = null;
      for (let attempt = 0; attempt < 3 && !persisted; attempt += 1) {
        try {
          const cancellation = await repository.cancelActiveDelivery(
            state.characterUuid,
            state.active.order.orderId,
            state.leaseId,
            options.reason || "work_stopped",
            {
              closeRental: true,
              metrics: {
                actualDistanceM: state.active.actualDistanceM,
                fuelUsed: state.active.fuelUsed,
                cargoValidity: state.active.cargoValidity,
              },
            }
          );
          rentalClosedWithOrder = Boolean(cancellation.rentalClosed);
          if (isPlayerActive(player) && cancellation.cashAfter != null) syncCash(player, cancellation.cashAfter);
          if (!cancellation.alreadyCancelled) {
            logsDb.writeMoneyLog({
              source: "job_trucker",
              action: "cancellation_penalty",
              currency: "cash",
              amount: -Number(cancellation.chargedPenalty || 0),
              balanceBefore: cancellation.cashBefore,
              balanceAfter: cancellation.cashAfter,
              target: isPlayerActive(player) ? player : null,
              targetUuid: state.characterUuid,
              comment: `Отмена заказа ${cancellation.orderId}: ${String(options.reason || "work_stopped")}`,
              metadata: { orderId: cancellation.orderId, reason: options.reason || "work_stopped" },
            }).catch((error) => console.error("[TRUCKER] Cancellation money log failed:", error));
          }
          persisted = true;
        } catch (error) {
          lastError = error;
        }
      }
      if (!persisted) {
        // The active SQL row remains durable and is reconciled on the next
        // character load; runtime entities must still be released now.
        console.error("[TRUCKER] Failed to persist interrupted delivery; deferred to reconnect sweep:", lastError);
        cleanupPersisted = false;
      }
      if (persisted) state.active = null;
    } else if (state.pendingAcceptedOrderId) {
      try {
        const cancellation = await repository.cancelActiveDelivery(
          state.characterUuid,
          state.pendingAcceptedOrderId,
          state.leaseId,
          options.reason || "work_stopped",
          { closeRental: true, metrics: { actualDistanceM: 0, fuelUsed: 0, cargoValidity: 100 } }
        );
        rentalClosedWithOrder = Boolean(cancellation.rentalClosed);
        if (isPlayerActive(player) && cancellation.cashAfter != null) syncCash(player, cancellation.cashAfter);
        if (!cancellation.alreadyCancelled) {
          logsDb.writeMoneyLog({
            source: "job_trucker",
            action: "cancellation_penalty",
            currency: "cash",
            amount: -Number(cancellation.chargedPenalty || 0),
            balanceBefore: cancellation.cashBefore,
            balanceAfter: cancellation.cashAfter,
            target: isPlayerActive(player) ? player : null,
            targetUuid: state.characterUuid,
            comment: `Отмена принятого заказа ${cancellation.orderId}: ${String(options.reason || "work_stopped")}`,
          }).catch((error) => console.error("[TRUCKER] Pending cancellation money log failed:", error));
        }
        state.pendingAcceptedOrderId = null;
      } catch (error) {
        console.error("[TRUCKER] Pending accept cleanup deferred to reconnect sweep:", error);
        cleanupPersisted = false;
      }
    }
    if (state.leaseId && !rentalClosedWithOrder && cleanupPersisted) {
      try {
        await repository.finishRental(state.characterUuid, state.leaseId, options.reason || "work_stopped");
      } catch (error) {
        console.error("[TRUCKER] Failed to close rental; deferred to reconnect sweep:", error);
        cleanupPersisted = false;
      }
    }
  } finally {
    const releaseRuntime = cleanupPersisted || options.forceRelease === true;
    if (releaseRuntime) {
      destroyRental(state);
      if (workers.get(Number(player.id)) === state) workers.delete(Number(player.id));
      clearClientWork(player);
    } else {
      state.stopping = false;
      if (state.active && isPlayerActive(player)) sendRoute(player, state.active);
      if (isPlayerActive(player)) pushTabletSnapshot(player);
    }
  }
  return cleanupPersisted;
}

function queueStopRuntime(player, options = {}) {
  const state = getState(player);
  if (!state) return stopRuntime(player, options);
  state.stopping = true;
  return serialize(state, () => stopRuntime(player, options));
}

employment.registerRuntimeCleanup("trucker", (player, options) => queueStopRuntime(player, options));

function rankDefinition(rank) {
  return config.ranks.find((entry) => entry.rank === Number(rank)) || config.ranks[0];
}

function getNextRank(rank) {
  return config.ranks.find((entry) => entry.rank === Number(rank) + 1) || null;
}

function currentFuel(state) {
  try {
    const value = Number(state.vehicle?.getVariable?.("fuel"));
    return Number.isFinite(value) ? Math.max(0, value) : null;
  } catch {
    return null;
  }
}

function getOrderCompatibility(order, context) {
  const reasons = [];
  if (order.status !== "available") reasons.push(order.status === "accepted" ? "Заказ уже занят другим водителем" : "Заказ закрыт");
  const vehicle = context.vehicleConfig;
  if (!vehicle) reasons.push("Арендуйте рабочий транспорт");
  else {
    if (vehicle.type !== order.vehicleType) reasons.push("Неверный тип транспорта");
    if (Number(vehicle.maxWeightKg) < Number(order.weightKg)) reasons.push(`Перегруз: максимум ${vehicle.maxWeightKg} кг`);
    if (order.vehicleType === "truck" && order.trailerModel && String(stateTrailerModel(context)) !== String(order.trailerModel)) {
      reasons.push(`Нужен прицеп ${order.trailerModel}`);
    }
    if (order.vehicleType === "truck" && !context.trailerAttached) reasons.push("Прицеп не подсоединён");
  }
  if (context.rank < order.requiredRank) reasons.push(`Нужен ранг ${order.requiredRank}`);
  if (order.requiredSkill && !context.skills.has(order.requiredSkill)) reasons.push("Не изучен нужный навык");
  if (!context.licenses[order.requiredLicense]) reasons.push(`Нет ${order.requiredLicense === "cdl_a" ? "CDL A" : "CDL B"}`);
  if (!context.passport) reasons.push("Нет ID-карты");
  if (context.activeOrder) reasons.push("Уже выполняется другой заказ");
  if (context.leaseExpired) reasons.push("Срок аренды истёк");
  if (context.leaseOrdersRemaining <= 0 && vehicle) reasons.push("Лимит рейсов аренды исчерпан");
  return { canAccept: reasons.length === 0, disabledReasons: reasons };
}

function stateTrailerModel(context) {
  return context.trailerModel || context.vehicleConfig?.trailerModel || null;
}

async function buildTabletSnapshot(player) {
  ensureReady();
  const state = getState(player);
  if (!state) return null;
  const uuid = getUuid(player);
  const [profile, unlocked, orders, eligibility] = await Promise.all([
    repository.getProfile(uuid),
    repository.getUnlockedSkills(uuid),
    repository.listRotationOrders(),
    getEligibility(player),
  ]);
  const rank = repository.getRankForXp(profile?.xp || 0);
  const unlockedSet = new Set(unlocked);
  const now = Date.now();
  const context = {
    vehicleConfig: state.vehicleConfig,
    trailerModel: state.trailer && mp.vehicles.exists(state.trailer) ? state.trailer.modelName || state.vehicleConfig?.trailerModel : null,
    trailerAttached: isAssignedTrailerAttached(state),
    rank,
    skills: unlockedSet,
    licenses: { cdl_b: eligibility.cdlB || eligibility.cdlA, cdl_a: eligibility.cdlA },
    passport: eligibility.passport,
    activeOrder: state.active,
    leaseExpired: Boolean(state.vehicleConfig && state.leaseExpiresAt <= now && !state.active),
    leaseOrdersRemaining: state.leaseOrdersRemaining,
  };

  const playerPosition = player.position;
  const orderPayload = orders.map((order) => ({
    ...order,
    distanceToPickupM: Math.round(distance(playerPosition, order.origin)),
    ...getOrderCompatibility(order, context),
  }));
  const activeTarget = state.active ? getStagePoint(state.active) : null;
  const currentRank = rankDefinition(rank);
  const nextRank = getNextRank(rank);
  return {
    available: true,
    revision: now,
    serverNow: now,
    refreshIntervalMs: config.refreshMs,
    nextRefreshAt: (Math.floor(now / config.refreshMs) + 1) * config.refreshMs,
    eligibility,
    profile: {
      xp: Number(profile?.xp || 0),
      rank,
      rankName: currentRank.name,
      nextRankXp: nextRank?.xp ?? null,
      skillPoints: Number(profile?.skill_points || 0),
      skillProgress: Number(profile?.skill_progress || 0),
      completedOrders: Number(profile?.completed_orders || 0),
      failedOrders: Number(profile?.failed_orders || 0),
      cancellationDebt: Number(profile?.cancellation_debt || 0),
      onTimeOrders: Number(profile?.on_time_orders || 0),
      lateOrders: Number(profile?.late_orders || 0),
      totalEarned: Number(profile?.total_earned || 0),
      totalDistanceM: Number(profile?.total_distance_m || 0),
      totalFuelUsed: Number(profile?.total_fuel_used || 0),
    },
    ranks: config.ranks,
    skills: config.skills.map((skill) => ({
      ...skill,
      unlocked: unlockedSet.has(skill.id),
      canUnlock: !unlockedSet.has(skill.id) && rank >= skill.minRank && Number(profile?.skill_points || 0) >= skill.cost && (!skill.prerequisite || unlockedSet.has(skill.prerequisite)),
    })),
    vehicles: config.vehicles.map((vehicle) => {
      const hasLicense = vehicle.license === "cdl_a" ? eligibility.cdlA : eligibility.cdlB || eligibility.cdlA;
      const reasons = [];
      if (rank < vehicle.minRank) reasons.push(`Нужен ранг ${vehicle.minRank}`);
      if (!hasLicense) reasons.push(`Нужны ${vehicle.license === "cdl_a" ? "CDL A" : "CDL B"}`);
      if (!eligibility.passport) reasons.push("Нужна ID-карта");
      return { ...vehicle, available: reasons.length === 0, disabledReasons: reasons };
    }),
    currentVehicle: state.vehicleConfig ? {
      id: state.vehicleConfig.id,
      name: state.vehicleConfig.name,
      type: state.vehicleConfig.type,
      maxWeightKg: state.vehicleConfig.maxWeightKg,
      trailerAttached: isAssignedTrailerAttached(state),
      leaseExpiresAt: state.leaseExpiresAt,
      ordersRemaining: state.leaseOrdersRemaining,
    } : null,
    activeOrder: state.active ? {
      orderId: state.active.order.orderId,
      cargo: state.active.order.cargo,
      company: state.active.order.company,
      weightKg: state.active.order.weightKg,
      stage: state.active.stage,
      deadlineAt: state.active.deadlineAt,
      cargoValidity: state.active.cargoValidity,
      distanceToTargetM: Math.round(distance(playerPosition, activeTarget)),
      cancelFee: repository.getCancellationPenalty(state.active.order.basePay, state.active.stage),
    } : null,
    orders: orderPayload,
  };
}

async function pushTabletSnapshot(player) {
  if (!isPlayerActive(player) || !getState(player)) return;
  try {
    const snapshot = await buildTabletSnapshot(player);
    player.call("client:trucker:tablet:update", [JSON.stringify(snapshot)]);
  } catch (error) {
    console.error("[TRUCKER] Tablet snapshot failed:", error?.message || error);
    notify(player, error?.message || "Не удалось обновить приложение дальнобоя.", "error");
  }
}

async function requireSettledCancellationDebt(player) {
  const uuid = getUuid(player);
  if (!uuid) throw new Error("Персонаж не загружен.");
  await repository.getProfile(uuid);
  const debt = await repository.settleCancellationDebt(uuid);
  syncCash(player, debt.cashAfter);
  if (debt.paid > 0) {
    logsDb.writeMoneyLog({
      source: "job_trucker",
      action: "cancellation_debt_payment",
      currency: "cash",
      amount: -Number(debt.paid),
      balanceBefore: debt.cashBefore,
      balanceAfter: debt.cashAfter,
      target: player,
      targetUuid: uuid,
      comment: "Погашение штрафной задолженности дальнобоя",
    }).catch((error) => console.error("[TRUCKER] Debt payment money log failed:", error));
  }
  if (debt.debtAfter > 0) {
    throw new Error(`Погасите долг $${Number(debt.debtAfter).toLocaleString("ru-RU")}. Наличные списываются автоматически при работе с диспетчером.`);
  }
  return debt;
}

async function joinTruckerJob(player) {
  try {
    ensureReady();
    await requireSettledCancellationDebt(player);
    await requireWorkEligibility(player);
    const result = await employment.assignJob(player, "trucker");
    createState(player);
    notify(player, result.changed ? "Вы начали смену дальнобойщика. Приложение добавлено в планшет." : "Смена дальнобойщика уже активна.", "success");
    await pushTabletSnapshot(player);
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось начать работу.", "error");
    return false;
  }
}

async function leaveTruckerJob(player) {
  try {
    ensureReady();
    const state = getState(player);
    if (state) {
      const cleaned = await queueStopRuntime(player, { reason: "job-leave" });
      if (!cleaned) throw new Error("Не удалось безопасно закрыть активный заказ. Смена сохранена; попробуйте ещё раз.");
    }
    const result = await employment.clearJob(player, "trucker");
    if (!result.cleared) {
      notify(player, "Вы не работаете дальнобойщиком.");
      return false;
    }
    notify(player, "Смена завершена. Приложение удалено из планшета.", "success");
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось завершить смену.", "error");
    return false;
  }
}

function isNearDispatcher(player) {
  return Boolean(
    player && !player.vehicle && Number(player.dimension || 0) === 0 &&
    distance(player.position, config.npc.position) <= Number(config.npc.colshapeRadius || 4) + 1.5
  );
}

function isNearCdlIssuer(player, issuerPosition) {
  return Boolean(
    player && issuerPosition && !player.vehicle && Number(player.dimension || 0) === 0 &&
    distance(player.position, issuerPosition) <= 6
  );
}

async function purchaseCdl(player, licenseId, issuerPosition) {
  try {
    ensureReady();
    const targetId = String(licenseId || "");
    if (targetId !== "cdl_b" && targetId !== "cdl_a") throw new Error("Неизвестная категория CDL.");
    if (!isNearCdlIssuer(player, issuerPosition)) throw new Error("Оформить CDL можно только у инструктора автошколы.");
    const [regularB, regularBDocument, cdlB] = await Promise.all([
      licenses.hasLicense(player, "vehicle_b"),
      licenses.hasLicenseDocumentItem(player, "vehicle_b"),
      targetId === "cdl_a" ? hasCdl(player, "cdl_b") : Promise.resolve(true),
    ]);
    if (!regularB || !regularBDocument) throw new Error("Сначала получите обычные права категории B и их документ в автошколе.");
    if (targetId === "cdl_a" && !cdlB) throw new Error("Для CDL A сначала получите CDL B.");

    const cashBefore = Number(player.character?.cash ?? player.characterData?.cash ?? 0);
    await licenses.issueTruckerLicense(player, targetId, {
      transactionWork: async (connection) => {
        const required = targetId === "cdl_a" ? ["vehicle_b", "cdl_b"] : ["vehicle_b"];
        const [prerequisites] = await connection.query(
          `SELECT license_id FROM character_licenses
           WHERE static_id = ? AND license_id IN (${required.map(() => "?").join(",")})
             AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE`,
          [getUuid(player), ...required]
        );
        const owned = new Set((prerequisites || []).map((row) => String(row.license_id)));
        if (required.some((id) => !owned.has(id))) throw new Error("Не выполнены требования для этой категории CDL.");
      },
    });
    const cashAfter = Number(player.character?.cash ?? player.characterData?.cash ?? cashBefore);
    if (cashAfter < cashBefore) {
      logsDb.writeMoneyLog({
        source: "job_trucker",
        action: "license_purchase",
        currency: "cash",
        amount: cashAfter - cashBefore,
        balanceBefore: cashBefore,
        balanceAfter: cashAfter,
        target: player,
        comment: `Покупка ${targetId.toUpperCase()}`,
      }).catch((error) => console.error("[TRUCKER] CDL money log failed:", error));
    }
    await pushTabletSnapshot(player);
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось оформить CDL.", "error");
    return false;
  }
}

async function openRentalMenu(player) {
  try {
    ensureReady();
    if (!isNearDispatcher(player)) throw new Error("Меню аренды доступно только рядом с диспетчером Cross-State Logistics.");
    const state = getState(player);
    if (!state) throw new Error("Сначала начните смену дальнобойщика.");
    const snapshot = await buildTabletSnapshot(player);
    const vehicles = (snapshot?.vehicles || []).map((vehicle) => {
      const disabledReasons = [...(vehicle.disabledReasons || [])];
      if (state.active) disabledReasons.push("Сначала завершите или отмените активный заказ");
      if (state.renting) disabledReasons.push("Предыдущая аренда ещё оформляется");
      return { ...vehicle, available: disabledReasons.length === 0, disabledReasons };
    });
    player.call("client:trucker:rental:open", [JSON.stringify({
      vehicles,
      currentVehicle: snapshot?.currentVehicle || null,
      durationMinutes: Math.round(config.rentalDurationMs / 60000),
      orderLimit: config.rentalOrderLimit,
    })]);
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось открыть меню аренды.", "error");
    return false;
  }
}

async function rentVehicle(player, vehicleId) {
  const state = getState(player);
  if (!state) {
    notify(player, "Сначала начните смену дальнобойщика.", "error");
    return false;
  }
  return serialize(state, async () => {
    let vehicle = null;
    let trailer = null;
    let rentalPersisted = false;
    let leaseId = null;
    const vehicleConfig = getVehicleConfig(vehicleId);
    try {
      if (!isNearDispatcher(player)) throw new Error("Арендовать рабочий транспорт можно только у диспетчера Cross-State Logistics.");
      await requireWorkEligibility(player);
      await requireSettledCancellationDebt(player);
      if (state.stopping) throw new Error("Смена уже завершается.");
      if (state.active) throw new Error("Нельзя менять транспорт во время активного заказа.");
      if (state.renting) throw new Error("Аренда уже обрабатывается.");
      if (!vehicleConfig) throw new Error("Такой транспорт не найден.");
      const profile = await repository.getProfile(getUuid(player));
      const rank = repository.getRankForXp(profile?.xp || 0);
      if (rank < vehicleConfig.minRank) throw new Error(`Транспорт откроется на ранге ${vehicleConfig.minRank}.`);
      const rentalLicenseOk = vehicleConfig.license === "cdl_a"
        ? await hasCdl(player, "cdl_a")
        : await hasCdl(player, "cdl_b") || await hasCdl(player, "cdl_a");
      if (!rentalLicenseOk) throw new Error(`Нужны действующие права ${vehicleConfig.license === "cdl_a" ? "CDL A" : "CDL B или CDL A"}.`);
      if (!areRentalSpawnsClear(vehicleConfig.type === "truck")) throw new Error("Площадка выдачи занята. Освободите место и повторите попытку.");

      state.renting = true;
      leaseId = crypto.randomBytes(12).toString("hex");
      const spawn = config.vehicleSpawn;
      vehicle = mp.vehicles.new(mp.joaat(vehicleConfig.model), new mp.Vector3(spawn.x, spawn.y, spawn.z), {
        heading: spawn.heading,
        numberPlate: "CROSSST",
        locked: false,
        engine: true,
        dimension: Number(player.dimension || 0),
      });
      setupVehicle(player, vehicle, vehicleConfig, leaseId, false);

      if (vehicleConfig.type === "truck") {
        const trailerSpawn = config.trailerSpawn;
        trailer = mp.vehicles.new(mp.joaat(vehicleConfig.trailerModel), new mp.Vector3(trailerSpawn.x, trailerSpawn.y, trailerSpawn.z), {
          heading: trailerSpawn.heading,
          numberPlate: "CSL",
          locked: false,
          engine: false,
          dimension: Number(player.dimension || 0),
        });
        setupVehicle(player, trailer, vehicleConfig, leaseId, true);
      }

      if (!mp.players.exists(player) || getState(player) !== state) throw new Error("Игрок покинул смену до выдачи транспорта.");

      const leaseExpiresAt = Date.now() + config.rentalDurationMs;
      const payment = await repository.purchaseRental(state.characterUuid, {
        leaseId,
        vehicleConfigId: vehicleConfig.id,
        vehicleModel: vehicleConfig.model,
        vehicleType: vehicleConfig.type,
        trailerModel: vehicleConfig.trailerModel || null,
        rentPrice: vehicleConfig.rentPrice,
        ordersRemaining: config.rentalOrderLimit,
        expiresAt: leaseExpiresAt,
      });
      rentalPersisted = true;
      if (!mp.players.exists(player) || getState(player) !== state) {
        throw new Error("Игрок покинул смену во время оформления аренды.");
      }
      syncCash(player, payment.cashAfter);
      logsDb.writeMoneyLog({
        source: "job_trucker",
        action: "spend",
        currency: "cash",
        amount: -vehicleConfig.rentPrice,
        balanceBefore: payment.cashBefore,
        balanceAfter: payment.cashAfter,
        target: player,
        comment: `Аренда ${vehicleConfig.id}, lease ${leaseId}`,
        metadata: { vehicleId: vehicleConfig.id, leaseId },
      }).catch((error) => console.error("[TRUCKER] Rental money log failed:", error));

      destroyRental(state);
      state.vehicle = vehicle;
      state.trailer = trailer;
      state.trailerAttached = false;
      state.vehicleConfig = vehicleConfig;
      state.leaseId = leaseId;
      state.leaseExpiresAt = leaseExpiresAt;
      state.leaseOrdersRemaining = config.rentalOrderLimit;
      state.lastFuel = currentFuel(state);
      state.lastSamplePosition = vehicle.position ? { ...vehicle.position } : null;
      state.lastSampleAt = Date.now();
      state.suspiciousTravelEvents = 0;
      state.suspiciousTravelM = 0;
      await repository.claimRental(state.characterUuid, leaseId);
      if (!runtime.active || state.stopping || !mp.players.exists(player) || getState(player) !== state) {
        throw new Error("Игрок покинул смену до подтверждения выдачи транспорта.");
      }

      setTimeout(() => {
        try {
          if (runtime.active && mp.players.exists(player) && mp.vehicles.exists(vehicle)) player.putIntoVehicle(vehicle, 0);
        } catch {}
      }, 200);
      notify(player, `${vehicleConfig.name} арендован на 90 минут или 5 рейсов.`, "success");
      if (trailer) notify(player, "Прицеп стоит рядом: подсоедините его перед принятием заказа.");
      await pushTabletSnapshot(player);
      try { player.call("client:trucker:rental:close", []); } catch {}
      return true;
    } catch (error) {
      for (const entity of [trailer, vehicle]) {
        try { if (entity && mp.vehicles.exists(entity)) entity.destroy(); } catch {}
      }
      if (state.leaseId === leaseId) destroyRental(state);
      if (rentalPersisted && leaseId) {
        let refund = null;
        let refundError = null;
        for (let attempt = 0; attempt < 3 && !refund; attempt += 1) {
          try {
            refund = await repository.cancelRentalAndRefund(state.characterUuid, leaseId, "vehicle_issue_failed");
          } catch (error) {
            refundError = error;
          }
        }
        if (refund) {
          if (refund.refunded) {
            syncCash(player, refund.cashAfter);
            logsDb.writeMoneyLog({
              source: "job_trucker",
              action: "refund",
              currency: "cash",
              amount: refund.amount,
              balanceBefore: refund.cashBefore,
              balanceAfter: refund.cashAfter,
              target: player,
              comment: `Возврат за невыданный транспорт ${vehicleConfig?.id || "unknown"}`,
              metadata: { vehicleId: vehicleConfig?.id || null, leaseId },
            }).catch((logError) => console.error("[TRUCKER] Rental refund log failed:", logError));
          }
        } else {
          console.error("[TRUCKER] CRITICAL rental refund failed:", refundError);
        }
      }
      notify(player, error?.message || "Не удалось арендовать транспорт.", "error");
      return false;
    } finally {
      state.renting = false;
    }
  });
}

registerEvent("server:trucker:rentVehicle", (player, rawPayload) => {
  const payload = parsePayload(rawPayload);
  void rentVehicle(player, payload.vehicleId);
});

async function unlockSkill(player, skillId) {
  const state = getState(player);
  if (!state) return notify(player, "Смена дальнобойщика не активна.", "error");
  return serialize(state, async () => {
    try {
      ensureReady();
      const skill = getSkillConfig(skillId);
      if (!skill) throw new Error("Навык не найден.");
      const [profile, unlocked] = await Promise.all([
        repository.getProfile(getUuid(player)),
        repository.getUnlockedSkills(getUuid(player)),
      ]);
      const rank = repository.getRankForXp(profile?.xp || 0);
      if (rank < skill.minRank) throw new Error(`Навык откроется на ранге ${skill.minRank}.`);
      if (skill.prerequisite && !unlocked.includes(skill.prerequisite)) throw new Error("Сначала изучите предыдущий навык ветки.");
      await repository.unlockSkill(getUuid(player), skill);
      notify(player, `Навык «${skill.name}» изучен.`, "success");
      await pushTabletSnapshot(player);
      return true;
    } catch (error) {
      notify(player, error?.message || "Не удалось изучить навык.", "error");
      return false;
    }
  });
}

async function validateOrderAcceptance(player, state, order) {
  if (state.stopping) throw new Error("Смена уже завершается.");
  await requireWorkEligibility(player);
  if (!isDriver(player, state)) throw new Error("Сядьте за руль арендованного транспорта.");
  if (!state.vehicleConfig || !state.leaseId) throw new Error("Арендуйте рабочий транспорт.");
  if (state.active) throw new Error("У вас уже есть активный заказ.");
  if (state.leaseExpiresAt <= Date.now()) throw new Error("Срок аренды истёк. Возьмите транспорт заново.");
  if (state.leaseOrdersRemaining <= 0) throw new Error("Лимит рейсов аренды исчерпан.");

  const [profile, unlocked, eligibility] = await Promise.all([
    repository.getProfile(getUuid(player)),
    repository.getUnlockedSkills(getUuid(player)),
    getEligibility(player),
  ]);
  const rank = repository.getRankForXp(profile?.xp || 0);
  if (state.vehicleConfig.type !== order.vehicleType) throw new Error("Этот заказ нельзя взять на текущем типе транспорта.");
  if (state.vehicleConfig.maxWeightKg < order.weightKg) throw new Error(`Вес ${order.weightKg} кг превышает лимит ${state.vehicleConfig.maxWeightKg} кг.`);
  if (rank < order.requiredRank) throw new Error(`Для заказа нужен ранг ${order.requiredRank}.`);
  if (order.requiredSkill && !unlocked.includes(order.requiredSkill)) throw new Error("Для заказа не изучен обязательный навык.");
  if (order.requiredLicense === "cdl_a" && !eligibility.cdlA) throw new Error("Для заказа нужны CDL A.");
  if (order.requiredLicense === "cdl_b" && !eligibility.cdlB && !eligibility.cdlA) throw new Error("Для заказа нужны CDL B или CDL A.");
  if (order.vehicleType === "truck") {
    if (!isAssignedTrailerAttached(state)) throw new Error("Подсоедините выданный прицеп.");
    if (order.trailerModel && String(state.vehicleConfig.trailerModel) !== String(order.trailerModel)) {
      throw new Error(`Для этого груза нужен прицеп ${order.trailerModel}.`);
    }
  }
  return { rank, unlocked };
}

function sendRoute(player, active) {
  const point = active.stage === "to_pickup" || active.stage === "loading" ? active.order.origin : active.order.destination;
  const phase = active.stage === "to_pickup" || active.stage === "loading" ? "pickup" : "dropoff";
  try {
    player.call("client:trucker:setRoute", [JSON.stringify({
      orderId: active.order.orderId,
      phase,
      vehicleType: active.order.vehicleType,
      point,
      radius: active.order.vehicleType === "pickup" ? config.interaction.pickupRadius : config.interaction.otherRadius,
      headingTolerance: active.order.vehicleType === "pickup" ? config.interaction.pickupHeadingTolerance : config.interaction.otherHeadingTolerance,
      autoStart: phase === "pickup" && active.order.vehicleType === "pickup",
      stableMs: config.interaction.stableMs,
      cargo: active.order.cargo,
      company: active.order.company,
      deadlineAt: active.deadlineAt,
    })]);
  } catch {}
}

async function cancelOrder(player, expectedOrderId) {
  const state = getState(player);
  if (!state) return notify(player, "Смена дальнобойщика не активна.", "error");
  return serialize(state, async () => {
    try {
      ensureReady();
      if (state.stopping) throw new Error("Смена уже завершается.");
      const active = state.active;
      const orderId = String(expectedOrderId || "").slice(0, 64);
      if (!active || active.order.orderId !== orderId) throw new Error("Активный заказ не найден или уже изменён.");

      const result = await repository.cancelActiveDelivery(
        state.characterUuid,
        orderId,
        state.leaseId,
        "player_cancelled",
        {
          closeRental: false,
          metrics: {
            actualDistanceM: active.actualDistanceM,
            fuelUsed: active.fuelUsed,
            cargoValidity: active.cargoValidity,
          },
        }
      );
      state.active = null;
      state.alignedSince = 0;
      state.leaseOrdersRemaining = Number(result.ordersRemaining || 0);
      syncCash(player, result.cashAfter);
      try { player.call("client:trucker:clearRoute", []); } catch {}
      if (result.rentalClosed) destroyRental(state);
      if (!result.alreadyCancelled) {
        logsDb.writeMoneyLog({
          source: "job_trucker",
          action: "cancellation_penalty",
          currency: "cash",
          amount: -Number(result.chargedPenalty || 0),
          balanceBefore: result.cashBefore,
          balanceAfter: result.cashAfter,
          target: player,
          targetUuid: state.characterUuid,
          comment: `Самостоятельная отмена заказа ${orderId}`,
          metadata: { orderId, requestedPenalty: result.penalty, debtAdded: result.debtAdded },
        }).catch((error) => console.error("[TRUCKER] Cancellation money log failed:", error));
      }
      const debtText = Number(result.debtAdded || 0) > 0
        ? ` Недостающие $${Number(result.debtAdded).toLocaleString("ru-RU")} записаны в долг.`
        : "";
      notify(player, result.alreadyCancelled
        ? "Отмена уже сохранена сервером; состояние заказа восстановлено."
        : `Заказ отменён. Списано $${Number(result.chargedPenalty || 0).toLocaleString("ru-RU")}; израсходован один рейс аренды.${debtText}`,
      "success");
      await pushTabletSnapshot(player);
      return true;
    } catch (error) {
      notify(player, error?.message || "Не удалось отменить заказ.", "error");
      await pushTabletSnapshot(player);
      return false;
    }
  });
}

async function acceptOrder(player, orderId) {
  const state = getState(player);
  if (!state) return notify(player, "Смена дальнобойщика не активна.", "error");
  return serialize(state, async () => {
    try {
      ensureReady();
      await requireSettledCancellationDebt(player);
      const safeId = String(orderId || "").slice(0, 64);
      const order = (await repository.listAvailableOrders()).find((item) => item.orderId === safeId);
      if (!order) throw new Error("Заказ уже недоступен или список обновился.");
      await validateOrderAcceptance(player, state, order);
      const accepted = await repository.acceptOrder(getUuid(player), safeId, {
        leaseId: state.leaseId,
        runtimeId: Number(state.vehicle.id),
        configId: state.vehicleConfig.id,
        model: state.vehicleConfig.model,
        type: state.vehicleConfig.type,
        maxWeightKg: state.vehicleConfig.maxWeightKg,
        trailerModel: state.vehicleConfig.trailerModel || null,
        fuelStart: currentFuel(state) || 0,
      });
      state.pendingAcceptedOrderId = accepted.order.orderId;
      if (!runtime.active || state.stopping || getState(player) !== state || !mp.players.exists(player)) {
        const interrupted = new Error("Смена завершилась во время принятия заказа.");
        interrupted.code = "TRUCKER_ACCEPT_INTERRUPTED";
        throw interrupted;
      }
      if (state.trailer && mp.vehicles.exists(state.trailer)) {
        try {
          if (Array.isArray(accepted.order.trailerColors)) {
            state.trailer.setColor?.(accepted.order.trailerColors[0], accepted.order.trailerColors[1]);
          }
          if (Number(accepted.order.trailerLivery) >= 0) state.trailer.livery = Number(accepted.order.trailerLivery);
          state.trailer.setVariable("truckerCargo", accepted.order.cargo);
          state.trailer.setVariable("truckerOrderId", accepted.order.orderId);
        } catch {}
      }
      state.active = {
        order: accepted.order,
        stage: "to_pickup",
        acceptedAt: accepted.acceptedAt,
        deadlineAt: accepted.deadlineAt,
        hardExpiresAt: accepted.deadlineAt + Math.max(5 * 60 * 1000, accepted.order.timeLimitSeconds * 500),
        cargoValidity: 100,
        initialHealth: null,
        minimumHealth: null,
        fuelUsed: 0,
        actualDistanceM: 0,
        loadedAt: 0,
        completionRetryAt: 0,
        phaseNonce: 1,
        loadingEndsAt: 0,
        unlockedSkills: new Set(await repository.getUnlockedSkills(getUuid(player))),
      };
      state.pendingAcceptedOrderId = null;
      state.alignedSince = 0;
      sendRoute(player, state.active);
      notify(
        player,
        `Заказ принят: ${order.cargo}, ${order.weightKg.toLocaleString("ru-RU")} кг. GPS построен до точки погрузки (${Math.max(0, Math.round(distance(player.position, order.origin) / 100) / 10).toLocaleString("ru-RU")} км).`,
        "success"
      );
      await pushTabletSnapshot(player);
      return true;
    } catch (error) {
      if (state.pendingAcceptedOrderId && !state.stopping && runtime.active && getState(player) === state && isPlayerActive(player)) {
        try {
          await repository.failActiveDelivery(state.characterUuid, "accept_initialization_failed", {
            actualDistanceM: 0,
            fuelUsed: 0,
            cargoValidity: 100,
          });
          state.pendingAcceptedOrderId = null;
        } catch (cleanupError) {
          console.error("[TRUCKER] Accepted-order initialization cleanup deferred:", cleanupError);
        }
      }
      notify(player, error?.message || "Не удалось принять заказ.", "error");
      await pushTabletSnapshot(player);
      return false;
    }
  });
}

function getStagePoint(active) {
  return active.stage === "to_pickup" || active.stage === "loading" ? active.order.origin : active.order.destination;
}

function isAlignedForStage(player, state) {
  const active = state.active;
  if (!active || !isDriver(player, state)) return false;
  if (state.vehicleConfig.type === "truck" && !isAssignedTrailerAttached(state)) return false;
  const point = getStagePoint(active);
  const alignmentEntity = state.vehicleConfig.type === "truck" ? state.trailer : state.vehicle;
  if (!alignmentEntity || !mp.vehicles.exists(alignmentEntity)) return false;
  const exact = active.order.vehicleType === "pickup";
  const radius = exact ? config.interaction.pickupRadius : config.interaction.otherRadius;
  const headingTolerance = exact ? config.interaction.pickupHeadingTolerance : config.interaction.otherHeadingTolerance;
  if (distance(alignmentEntity.position, point) > radius) return false;
  if (vehicleSpeed(state.vehicle) > config.interaction.maxSpeed || vehicleSpeed(alignmentEntity) > config.interaction.maxSpeed) return false;
  const rotationHeading = Number(alignmentEntity.rotation?.z ?? alignmentEntity.heading ?? 0);
  if (Number(point.heading) >= 0 && headingDifference(rotationHeading, point.heading) > headingTolerance) return false;
  return Number(player.dimension || 0) === Number(state.vehicle.dimension || 0);
}

function actionDuration(active) {
  const isLoading = active.stage === "to_pickup";
  const truck = active.order.vehicleType === "truck";
  const settings = isLoading ? config.loading : config.unloading;
  const base = truck ? settings.truckMs : settings.baseMs;
  const multiplier = active.unlockedSkills.has("quick_loading") ? 0.8 : 1;
  return Math.max(settings.minimumMs, Math.round(base * multiplier));
}

async function cancelStage(player, state, reason) {
  const active = state.active;
  if (!active || (active.stage !== "loading" && active.stage !== "unloading")) return;
  const wasLoading = active.stage === "loading";
  const nextStage = wasLoading ? "to_pickup" : "to_dropoff";
  const nextValidity = Math.max(0, active.cargoValidity - (wasLoading ? config.loading.spoilOnCancel : config.unloading.spoilOnCancel));
  await repository.updateActive(state.characterUuid, { stage: nextStage, cargoValidity: nextValidity });
  active.phaseNonce += 1;
  active.stage = nextStage;
  active.loadingEndsAt = 0;
  active.cargoValidity = nextValidity;
  state.alignedSince = 0;
  try { player.call("client:trucker:stageCancelled", [String(reason || "Позиция потеряна"), active.cargoValidity]); } catch {}
  sendRoute(player, active);
  notify(player, `Операция прервана. Сохранность груза: ${Math.round(active.cargoValidity)}%.`, "error");
  await pushTabletSnapshot(player);
}

async function finishDelivery(player, state) {
  const active = state.active;
  if (!active) return;
  const now = Date.now();
  if (now > active.hardExpiresAt || active.cargoValidity <= 0) {
    await repository.failActiveDelivery(state.characterUuid, now > active.hardExpiresAt ? "cargo_expired" : "cargo_destroyed", {
      actualDistanceM: active.actualDistanceM,
      fuelUsed: active.fuelUsed,
      cargoValidity: active.cargoValidity,
    });
    state.active = null;
    try { player.call("client:trucker:clearRoute", []); } catch {}
    notify(player, "Срок годности или сохранность груза исчерпаны. Заказ провален.", "error");
    await pushTabletSnapshot(player);
    return;
  }

  const plannedDistanceM = Math.max(1, Number(active.order.routeDistanceM || 0));
  const deliveryDurationSeconds = Math.max(0, (now - Number(active.loadedAt || now)) / 1000);
  const minimumDistanceM = Math.min(plannedDistanceM, Math.max(100, plannedDistanceM * 0.55));
  const minimumDurationSeconds = Math.max(15, plannedDistanceM / 70);
  const impossibleTravelLimitM = Math.max(200, plannedDistanceM * 0.2);
  if (
    active.actualDistanceM < minimumDistanceM ||
    deliveryDurationSeconds < minimumDurationSeconds ||
    state.suspiciousTravelM > impossibleTravelLimitM
  ) {
    await repository.failActiveDelivery(state.characterUuid, "route_integrity_failed", {
      actualDistanceM: active.actualDistanceM,
      fuelUsed: active.fuelUsed,
      cargoValidity: active.cargoValidity,
    });
    state.active = null;
    try { player.call("client:trucker:clearRoute", []); } catch {}
    notify(player, "Заказ провален: сервер обнаружил невозможную дистанцию или время маршрута.", "error");
    await pushTabletSnapshot(player);
    return false;
  }

  const healthEntity = state.vehicleConfig.type === "truck" ? state.trailer : state.vehicle;
  const currentHealth = Math.max(0, Number(healthEntity?.bodyHealth ?? active.minimumHealth ?? active.initialHealth ?? 1000));
  if (!Number.isFinite(active.initialHealth) || active.initialHealth <= 0) active.initialHealth = Math.max(1, currentHealth);
  if (!Number.isFinite(active.minimumHealth)) active.minimumHealth = currentHealth;
  active.minimumHealth = Math.min(active.minimumHealth, currentHealth);
  const healthValidity = Math.min(100, active.minimumHealth / active.initialHealth * 100);
  active.cargoValidity = Math.max(0, Math.min(active.cargoValidity, healthValidity));
  const earlySeconds = Math.max(0, Math.floor((active.deadlineAt - now) / 1000));
  const lateSeconds = Math.max(0, Math.floor((now - active.deadlineAt) / 1000));
  const basePay = active.order.basePay;
  const earlyRatio = Math.min(1, earlySeconds / Math.max(1, active.order.timeLimitSeconds * 0.25));
  const earlyBonus = Math.round(basePay * config.economy.earlyBonusMax * earlyRatio);
  let skillBonus = active.unlockedSkills.has("priority_dispatch") ? Math.round(basePay * config.economy.priorityBonus) : 0;
  if (active.unlockedSkills.has("fuel_planning") && active.fuelUsed > 0) {
    const benchmark = active.actualDistanceM / 1000 * Number(state.vehicleConfig.fuelConsumption || 1) / 10;
    if (benchmark > 0 && active.fuelUsed <= benchmark) {
      skillBonus += Math.round(basePay * config.economy.fuelBonusMax * Math.min(1, (benchmark - active.fuelUsed) / Math.max(0.01, benchmark * 0.2)));
    }
  }
  const gross = basePay + earlyBonus + skillBonus;
  const damagePenalty = Math.round(gross * (1 - active.cargoValidity / 100));
  const lateWindow = Math.max(1, (active.hardExpiresAt - active.deadlineAt) / 1000);
  const latePenalty = Math.round(basePay * config.economy.latePenaltyMax * Math.min(1, lateSeconds / lateWindow));
  const trophyMultiplier = await jobRewardMultiplier.getMultiplier(player, "trucker");
  const finalPayout = Math.max(0, Math.round((gross - damagePenalty - latePenalty) * trophyMultiplier));
  const kindXp = { standard: 1, valuable: 1.1, fragile: 1.15, perishable: 1.2, hazmat: 1.25 }[active.order.cargoKind] || 1;
  const xpEarned = Math.max(10, Math.round((25 + 4 * active.order.routeDistanceM / 1000 + 8 * Math.sqrt(active.order.weightKg / 1000)) * kindXp * (lateSeconds > 0 ? 0.75 : 1 + 0.2 * earlyRatio)));
  const skillProgressEarned = 10 + (lateSeconds === 0 ? 2 : 0) + (earlyRatio >= 0.5 ? 5 : 0);
  const completionMetrics = {
    orderId: active.order.orderId,
    deliveredAt: now,
    actualDistanceM: active.actualDistanceM,
    earlySeconds,
    lateSeconds,
    cargoValidity: active.cargoValidity,
    fuelUsed: active.fuelUsed,
    earlyBonus,
    skillBonus,
    damagePenalty,
    latePenalty,
    finalPayout,
    xpEarned,
    skillProgressEarned,
    trophyMultiplier,
  };
  let result = null;
  let completionError = null;
  for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
    try {
      result = await repository.completeDelivery(state.characterUuid, completionMetrics);
    } catch (error) {
      completionError = error;
    }
  }
  if (!result) throw completionError || new Error("Не удалось зафиксировать доставку.");
  const settled = result.persistedMetrics || completionMetrics;
  const settledPayout = Number(settled.finalPayout ?? finalPayout);
  syncCash(player, result.cashAfter);
  logsDb.writeMoneyLog({
    source: "job_trucker",
    action: "reward",
    currency: "cash",
    amount: settledPayout,
    balanceBefore: result.cashBefore,
    balanceAfter: result.cashAfter,
    target: player,
    comment: `Доставка ${active.order.orderId}: ${active.order.cargo}`,
    metadata: {
      orderId: active.order.orderId,
      earlyBonus: Number(settled.earlyBonus ?? earlyBonus),
      skillBonus: Number(settled.skillBonus ?? skillBonus),
      damagePenalty: Number(settled.damagePenalty ?? damagePenalty),
      latePenalty: Number(settled.latePenalty ?? latePenalty),
    },
  }).catch((error) => console.error("[TRUCKER] Money log failed:", error));

  quests.recordProgress(player, {
    type: "job.money_earned",
    subjectId: "trucker",
    idempotencyKey: `${active.order.orderId}:reward`,
    amount: settledPayout,
    metadata: { jobId: "trucker", orderId: active.order.orderId },
  }, { sync: true }).catch((error) => console.error("[TRUCKER] Quest progress failed:", error));

  const resultPayload = {
    orderId: active.order.orderId,
    cargo: active.order.cargo,
    company: active.order.company,
    weightKg: active.order.weightKg,
    routeDistanceM: active.order.routeDistanceM,
    actualDistanceM: Number(settled.actualDistanceM ?? active.actualDistanceM),
    durationSeconds: Number(settled.durationSeconds ?? Math.max(0, Math.round((now - active.acceptedAt) / 1000))),
    earlySeconds: Number(settled.earlySeconds ?? earlySeconds),
    lateSeconds: Number(settled.lateSeconds ?? lateSeconds),
    cargoValidity: Number(settled.cargoValidity ?? active.cargoValidity),
    fuelUsed: Number(settled.fuelUsed ?? active.fuelUsed),
    basePay: Number(settled.basePay ?? basePay),
    earlyBonus: Number(settled.earlyBonus ?? earlyBonus),
    skillBonus: Number(settled.skillBonus ?? skillBonus),
    damagePenalty: Number(settled.damagePenalty ?? damagePenalty),
    latePenalty: Number(settled.latePenalty ?? latePenalty),
    finalPayout: settledPayout,
    xpEarned: Number(settled.xpEarned ?? xpEarned),
    skillProgressEarned: Number(settled.skillProgressEarned ?? skillProgressEarned),
    skillPointsEarned: result.skillPointsEarned,
    oldRank: result.oldRank,
    newRank: result.newRank,
  };
  state.active = null;
  state.leaseOrdersRemaining = Math.max(0, state.leaseOrdersRemaining - 1);
  state.alignedSince = 0;
  try { player.call("client:trucker:clearRoute", []); } catch {}
  try { player.call("client:trucker:result", [JSON.stringify(resultPayload)]); } catch {}
  notify(player, `Груз доставлен. Выплата: $${settledPayout.toLocaleString("ru-RU")}.`, "success");
  await pushTabletSnapshot(player);
  return true;
}

async function completeStage(player, state, nonce) {
  const active = state.active;
  if (!active || active.phaseNonce !== nonce || !isAlignedForStage(player, state)) {
    if (active && active.phaseNonce === nonce) await cancelStage(player, state, "Транспорт покинул зону операции");
    return;
  }
  if (active.stage === "loading") {
    const loadedAt = Date.now();
    await repository.updateActive(state.characterUuid, { stage: "to_dropoff", loadedAt, cargoValidity: active.cargoValidity });
    const healthEntity = state.vehicleConfig.type === "truck" ? state.trailer : state.vehicle;
    const loadedHealth = Math.max(1, Number(healthEntity?.bodyHealth || 1000));
    active.stage = "to_dropoff";
    active.loadedAt = loadedAt;
    active.initialHealth = loadedHealth;
    active.minimumHealth = loadedHealth;
    active.actualDistanceM = 0;
    active.loadingEndsAt = 0;
    state.lastSamplePosition = state.vehicle?.position ? { ...state.vehicle.position } : null;
    state.lastSampleAt = Date.now();
    state.suspiciousTravelEvents = 0;
    state.suspiciousTravelM = 0;
    try { player.call("client:trucker:stageComplete", ["loading"]); } catch {}
    sendRoute(player, active);
    notify(player, "Груз загружен. Доставьте его получателю.", "success");
    await pushTabletSnapshot(player);
    return;
  }
  if (active.stage === "unloading") {
    active.loadingEndsAt = 0;
    try {
      const completed = await finishDelivery(player, state);
      if (completed !== false || !state.active) {
        try { player.call("client:trucker:stageComplete", ["unloading"]); } catch {}
      }
    } catch (error) {
      active.completionRetryAt = Date.now() + 5000;
      try { player.call("client:trucker:stageComplete", ["unloading"]); } catch {}
      notify(player, "Сервер временно не подтвердил доставку. Результат будет повторно сверяться автоматически.", "error");
      throw error;
    }
  }
}

async function beginStage(player) {
  const state = getState(player);
  if (!state) return;
  return serialize(state, async () => {
    try {
      const active = state.active;
      if (!active || (active.stage !== "to_pickup" && active.stage !== "to_dropoff")) throw new Error("Сейчас операция недоступна.");
      await requireWorkEligibility(player);
      if (!isAlignedForStage(player, state)) throw new Error("Поставьте транспорт точно в отмеченную зону и остановитесь.");
      if (active.order.vehicleType === "pickup" && active.stage === "to_pickup" && Date.now() - state.alignedSince < config.interaction.stableMs) {
        throw new Error("Удерживайте машину в зелёной зоне одну секунду.");
      }
      const duration = actionDuration(active);
      const nextStage = active.stage === "to_pickup" ? "loading" : "unloading";
      await repository.updateActive(state.characterUuid, { stage: nextStage, cargoValidity: active.cargoValidity });
      active.stage = nextStage;
      active.phaseNonce += 1;
      const nonce = active.phaseNonce;
      active.loadingEndsAt = Date.now() + duration;
      player.call("client:trucker:stageStarted", [JSON.stringify({
        stage: nextStage,
        title: nextStage === "loading" ? "Погрузка" : "Разгрузка",
        cargo: active.order.cargo,
        durationMs: duration,
        endsAt: active.loadingEndsAt,
      })]);
      setTimeout(() => {
        const currentState = getState(player);
        if (!runtime.active || currentState !== state) return;
        serialize(state, () => completeStage(player, state, nonce)).catch((error) => console.error("[TRUCKER] Stage completion failed:", error));
      }, duration);
    } catch (error) {
      notify(player, error?.message || "Не удалось начать операцию.", "error");
    }
  });
}

function sampleWorker(player, state) {
  const vehicleMissing = !state.vehicle || !mp.vehicles.exists(state.vehicle);
  const trailerMissing = state.vehicleConfig?.type === "truck" && (!state.trailer || !mp.vehicles.exists(state.trailer));
  if (vehicleMissing || trailerMissing) {
    if (state.active && !state.missingVehicleCleanup) {
      state.missingVehicleCleanup = true;
      serialize(state, async () => {
        if (!state.active) return;
        await repository.failActiveDelivery(state.characterUuid, vehicleMissing ? "work_vehicle_missing" : "work_trailer_missing", {
          actualDistanceM: state.active.actualDistanceM,
          fuelUsed: state.active.fuelUsed,
          cargoValidity: 0,
        });
        state.active = null;
        if (state.leaseId) await repository.finishRental(state.characterUuid, state.leaseId, vehicleMissing ? "vehicle_missing" : "trailer_missing");
        destroyRental(state);
        try { player.call("client:trucker:clearRoute", []); } catch {}
        notify(player, "Рабочий транспорт потерян. Заказ провален.", "error");
        await pushTabletSnapshot(player);
      }).catch((error) => {
        state.missingVehicleCleanup = false;
        console.error("[TRUCKER] Missing vehicle cleanup failed:", error);
      });
    } else if (!state.active && state.vehicleConfig && !state.missingVehicleCleanup) {
      state.missingVehicleCleanup = true;
      const leaseId = state.leaseId;
      repository.finishRental(state.characterUuid, leaseId, vehicleMissing ? "vehicle_missing" : "trailer_missing")
        .catch((error) => console.error("[TRUCKER] Missing rental close failed:", error))
        .finally(() => {
          if (state.leaseId === leaseId) {
            destroyRental(state);
            pushTabletSnapshot(player);
          }
          state.missingVehicleCleanup = false;
        });
    }
    return;
  }
  if (state.missingVehicleCleanup) return;
  if (!state.active && state.vehicleConfig && (state.leaseExpiresAt <= Date.now() || state.leaseOrdersRemaining <= 0)) {
    const reason = state.leaseExpiresAt <= Date.now() ? "lease_expired" : "order_limit_reached";
    const leaseId = state.leaseId;
    state.missingVehicleCleanup = true;
    repository.finishRental(state.characterUuid, leaseId, reason)
      .catch((error) => console.error("[TRUCKER] Rental expiry persistence failed:", error))
      .finally(() => {
        if (state.leaseId === leaseId) {
          destroyRental(state);
          notify(player, reason === "lease_expired" ? "Срок аренды истёк." : "Лимит рейсов аренды исчерпан.");
          pushTabletSnapshot(player);
        }
        state.missingVehicleCleanup = false;
      });
    return;
  }
  const fuel = currentFuel(state);
  if (fuel != null && state.lastFuel != null && state.active && fuel < state.lastFuel) {
    state.active.fuelUsed += Math.max(0, state.lastFuel - fuel);
  }
  if (fuel != null) state.lastFuel = fuel;

  const sampledAt = Date.now();
  const position = state.vehicle.position;
  if (state.active && position && state.lastSamplePosition && ["to_dropoff", "unloading"].includes(state.active.stage)) {
    const delta = distance(position, state.lastSamplePosition);
    const elapsedMs = Math.max(1, sampledAt - Number(state.lastSampleAt || sampledAt));
    const plausibleDeltaM = Math.max(15, elapsedMs / 1000 * 75);
    if (delta >= 0 && delta <= plausibleDeltaM) {
      state.active.actualDistanceM += delta;
    } else if (delta > plausibleDeltaM) {
      state.suspiciousTravelEvents += 1;
      state.suspiciousTravelM += delta;
    }
  }
  if (position) state.lastSamplePosition = { x: position.x, y: position.y, z: position.z };
  state.lastSampleAt = sampledAt;

  if (!state.active) return;
  if (["to_dropoff", "unloading"].includes(state.active.stage)) {
    const healthEntity = state.vehicleConfig.type === "truck" ? state.trailer : state.vehicle;
    const sampledHealth = Math.max(0, Number(healthEntity?.bodyHealth ?? state.active.minimumHealth ?? state.active.initialHealth ?? 1000));
    if (!Number.isFinite(state.active.initialHealth) || state.active.initialHealth <= 0) state.active.initialHealth = Math.max(1, sampledHealth);
    if (!Number.isFinite(state.active.minimumHealth)) state.active.minimumHealth = sampledHealth;
    state.active.minimumHealth = Math.min(state.active.minimumHealth, sampledHealth);
    state.active.cargoValidity = Math.min(state.active.cargoValidity, state.active.minimumHealth / state.active.initialHealth * 100);
  }
  if (
    state.active.stage === "unloading" &&
    state.active.loadingEndsAt === 0 &&
    state.active.completionRetryAt > 0 &&
    sampledAt >= state.active.completionRetryAt
  ) {
    const retryActive = state.active;
    retryActive.completionRetryAt = sampledAt + 5000;
    serialize(state, async () => {
      if (state.active !== retryActive || retryActive.stage !== "unloading") return;
      const completed = await finishDelivery(player, state);
      if (completed !== false) {
        try { player.call("client:trucker:stageComplete", ["unloading"]); } catch {}
      }
    }).catch((error) => console.error("[TRUCKER] Completion reconciliation failed:", error));
  }
  if (Date.now() - Number(state.lastPersistAt || 0) >= 5000) {
    state.lastPersistAt = Date.now();
    const persistedActive = state.active;
    serialize(state, async () => {
      if (state.active !== persistedActive) return;
      await repository.updateActive(state.characterUuid, {
        cargoValidity: state.active.cargoValidity,
        fuelUsed: state.active.fuelUsed,
        actualDistanceM: state.active.actualDistanceM,
      });
    }).catch((error) => console.error("[TRUCKER] Metric persistence failed:", error));
  }
  const aligned = isAlignedForStage(player, state);
  if ((state.active.stage === "to_pickup" || state.active.stage === "to_dropoff") && aligned) {
    if (!state.alignedSince) state.alignedSince = Date.now();
  } else if (state.active.stage === "to_pickup" || state.active.stage === "to_dropoff") {
    state.alignedSince = 0;
  }
  if ((state.active.stage === "loading" || state.active.stage === "unloading") && state.active.loadingEndsAt > 0 && !aligned) {
    serialize(state, () => cancelStage(player, state, "Транспорт покинул зону операции")).catch((error) => console.error("[TRUCKER] Stage cancellation failed:", error));
  }
  if (Date.now() > state.active.hardExpiresAt) {
    serialize(state, async () => {
      if (!state.active || Date.now() <= state.active.hardExpiresAt) return;
      await repository.failActiveDelivery(state.characterUuid, "cargo_expired", {
        actualDistanceM: state.active.actualDistanceM,
        fuelUsed: state.active.fuelUsed,
        cargoValidity: state.active.cargoValidity,
      });
      state.active = null;
      try { player.call("client:trucker:clearRoute", []); } catch {}
      notify(player, "Максимальный срок доставки истёк. Заказ провален.", "error");
      await pushTabletSnapshot(player);
    }).catch((error) => console.error("[TRUCKER] Expiry handling failed:", error));
  }
}

registerEvent("server:trucker:tablet:request", (player) => {
  const state = getState(player);
  if (state) {
    pushTabletSnapshot(player);
    if (state.active) sendRoute(player, state.active);
  }
  else try { player.call("client:trucker:tablet:update", ["null"]); } catch {}
});

registerEvent("server:trucker:restoreRoute", (player) => {
  const state = getState(player);
  if (!allowEvent(state, "restore_route", 750)) return;
  if (!state?.active) return notify(player, "Сейчас нет активного заказа.", "error");
  sendRoute(player, state.active);
  notify(player, state.active.stage === "to_pickup" || state.active.stage === "loading"
    ? "GPS восстановлен: следуйте к точке погрузки."
    : "GPS восстановлен: следуйте к точке разгрузки.", "success");
});

registerEvent("server:trucker:acceptOrder", (player, raw) => {
  const state = getState(player);
  if (!allowEvent(state, "accept", 650)) return;
  const payload = parsePayload(raw);
  acceptOrder(player, String(payload.orderId || "")).catch((error) => console.error("[TRUCKER] Accept handler failed:", error));
});

registerEvent("server:trucker:unlockSkill", (player, raw) => {
  const state = getState(player);
  if (!allowEvent(state, "skill", 650)) return;
  const payload = parsePayload(raw);
  unlockSkill(player, String(payload.skillId || "").slice(0, 64)).catch((error) => console.error("[TRUCKER] Skill handler failed:", error));
});

registerEvent("server:trucker:cancelOrder", (player, raw) => {
  const state = getState(player);
  if (!allowEvent(state, "cancel", 1750)) return;
  const payload = parsePayload(raw);
  cancelOrder(player, String(payload.orderId || "")).catch((error) => console.error("[TRUCKER] Cancel handler failed:", error));
});

registerEvent("server:trucker:beginStage", (player) => {
  const state = getState(player);
  if (!allowEvent(state, "stage", 500)) return;
  beginStage(player).catch((error) => console.error("[TRUCKER] Stage handler failed:", error));
});

registerEvent("trailerAttached", (vehicle, trailer) => {
  for (const [playerId, state] of workers.entries()) {
    if ((state.vehicle === vehicle && state.trailer === trailer) || (state.vehicle === trailer && state.trailer === vehicle)) {
      state.trailerAttached = true;
      const player = mp.players.at(playerId);
      if (player) pushTabletSnapshot(player);
      break;
    }
  }
});

registerEvent("trailerDetached", (vehicle, trailer) => {
  for (const [playerId, state] of workers.entries()) {
    if ((state.vehicle === vehicle && state.trailer === trailer) || (state.vehicle === trailer && state.trailer === vehicle)) {
      state.trailerAttached = false;
      const player = mp.players.at(playerId);
      if (player) pushTabletSnapshot(player);
      break;
    }
  }
});

registerEvent("playerDeath", (player) => {
  const state = getState(player);
  if (!state?.active) return;
  serialize(state, async () => {
    if (!state.active) return;
    await repository.failActiveDelivery(state.characterUuid, "player_died", {
      actualDistanceM: state.active.actualDistanceM,
      fuelUsed: state.active.fuelUsed,
      cargoValidity: state.active.cargoValidity,
    });
    state.active = null;
    try { player.call("client:trucker:clearRoute", []); } catch {}
    notify(player, "Заказ провален после гибели персонажа.", "error");
    await pushTabletSnapshot(player);
  }).catch((error) => console.error("[TRUCKER] Death cleanup failed:", error));
});

registerEvent("vehicleDeath", (vehicle) => {
  for (const [playerId, state] of workers.entries()) {
    if (state.vehicle !== vehicle && state.trailer !== vehicle) continue;
    const player = mp.players.at(playerId);
    if (player && state.active) {
      serialize(state, async () => {
        if (!state.active) return;
        await repository.failActiveDelivery(state.characterUuid, "work_vehicle_destroyed", {
          actualDistanceM: state.active.actualDistanceM,
          fuelUsed: state.active.fuelUsed,
          cargoValidity: 0,
        });
        state.active = null;
        if (state.leaseId) await repository.finishRental(state.characterUuid, state.leaseId, "vehicle_destroyed");
        destroyRental(state);
        try { player.call("client:trucker:clearRoute", []); } catch {}
        notify(player, "Рабочий транспорт уничтожен. Заказ провален.", "error");
        await pushTabletSnapshot(player);
      }).catch((error) => console.error("[TRUCKER] Vehicle death cleanup failed:", error));
    } else {
      if (state.leaseId) repository.finishRental(state.characterUuid, state.leaseId, "vehicle_destroyed").catch((error) => console.error("[TRUCKER] Rental close failed:", error));
      destroyRental(state);
      if (player) pushTabletSnapshot(player);
    }
    break;
  }
});

registerEvent("playerQuit", (player) => {
  const state = getState(player);
  if (!state) return;
  queueStopRuntime(player, { reason: "player_disconnected", forceRelease: true })
    .catch((error) => console.error("[TRUCKER] Quit cleanup failed:", error));
});

registerEvent("twinkle:character:loaded", (player) => {
  setTimeout(async () => {
    if (!runtime.active || !isPlayerActive(player) || player.__activeJob !== "trucker") return;
    const state = createState(player);
    try {
      const staleCancellation = await repository.cancelStaleActiveDelivery(
        state.characterUuid,
        "session_restored_without_vehicle"
      );
      if (staleCancellation && !staleCancellation.alreadyCancelled) {
        syncCash(player, staleCancellation.cashAfter);
        logsDb.writeMoneyLog({
          source: "job_trucker",
          action: "cancellation_penalty",
          currency: "cash",
          amount: -Number(staleCancellation.chargedPenalty || 0),
          balanceBefore: staleCancellation.cashBefore,
          balanceAfter: staleCancellation.cashAfter,
          target: player,
          targetUuid: state.characterUuid,
          comment: `Сверка прерванного заказа ${staleCancellation.orderId}`,
        }).catch((error) => console.error("[TRUCKER] Stale cancellation money log failed:", error));
      }
      const staleRental = await repository.finishStaleRentals(
        state.characterUuid,
        "session_restored_without_vehicle"
      );
      if (Number(staleRental?.refundAmount || 0) > 0) {
        syncCash(player, staleRental.cashAfter);
        logsDb.writeMoneyLog({
          source: "job_trucker",
          action: "refund",
          currency: "cash",
          amount: Number(staleRental.refundAmount),
          balanceBefore: staleRental.cashBefore,
          balanceAfter: staleRental.cashAfter,
          target: player,
          targetUuid: state.characterUuid,
          comment: "Автовозврат за аренду, которую сервер не успел выдать",
        }).catch((error) => console.error("[TRUCKER] Unclaimed rental refund log failed:", error));
      }
      if (runtime.active && getState(player) === state) await pushTabletSnapshot(player);
    } catch (error) {
      console.error("[TRUCKER] Stale active cleanup failed:", error);
      notify(player, "Не удалось восстановить смену дальнобойщика. Попробуйте переподключиться.", "error");
    }
  }, 500);
});

addInterval(() => {
  for (const [playerId, state] of workers.entries()) {
    const player = mp.players.at(playerId);
    if (player) sampleWorker(player, state);
  }
}, 250);

addInterval(() => {
  repository.rotateOrders(true)
    .then(() => Promise.all([...workers.keys()].map((playerId) => {
      const player = mp.players.at(playerId);
      return player ? pushTabletSnapshot(player) : null;
    })))
    .catch((error) => console.error("[TRUCKER] Order rotation failed:", error));
}, config.refreshMs);

repository.ensureSchema()
  .then(() => repository.rotateOrders())
  .then(() => {
    schemaReady = true;
    schemaError = null;
    console.log(`[TRUCKER] Ready: ${config.orderCount} orders per ${config.refreshMs / 60000} minutes`);
  })
  .catch((error) => {
    schemaReady = false;
    schemaError = error;
    console.error("[TRUCKER] Disabled because SQL schema is unavailable:", error);
  });

runtime.shutdown = () => {
  if (!runtime.active) return;
  runtime.active = false;
  for (const timer of runtime.timers.splice(0)) clearInterval(timer);
  for (const entry of runtime.events.splice(0)) {
    try { mp.events.remove?.(entry.name, entry.handler); } catch {}
  }
  for (const state of workers.values()) {
    if (state.active) {
      repository.cancelActiveDelivery(
        state.characterUuid,
        state.active.order.orderId,
        state.leaseId,
        "resource_reloaded",
        {
          closeRental: true,
          waivePenalty: true,
          metrics: {
            actualDistanceM: state.active.actualDistanceM,
            fuelUsed: state.active.fuelUsed,
            cargoValidity: state.active.cargoValidity,
          },
        }
      ).catch((error) => console.error("[TRUCKER] Reload cleanup failed:", error));
    } else if (state.pendingAcceptedOrderId) {
      repository.cancelActiveDelivery(
        state.characterUuid,
        state.pendingAcceptedOrderId,
        state.leaseId,
        "resource_reloaded",
        { closeRental: true, waivePenalty: true, metrics: { actualDistanceM: 0, fuelUsed: 0, cargoValidity: 100 } }
      ).catch((error) => console.error("[TRUCKER] Pending reload cleanup failed:", error));
    } else if (state.leaseId) {
      repository.finishRental(state.characterUuid, state.leaseId, "resource_reloaded")
        .catch((error) => console.error("[TRUCKER] Reload rental cleanup failed:", error));
    }
    destroyRental(state);
  }
  workers.clear();
};

module.exports = {
  buildTabletSnapshot,
  joinTruckerJob,
  leaveTruckerJob,
  purchaseCdl,
  openRentalMenu,
  rentVehicle,
};
