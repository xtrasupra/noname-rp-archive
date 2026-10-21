"use strict";

const crypto = require("crypto");
const config = require("./cargoLoader.config.js");
const core = require("./cargoLoader.core.js");
const repository = require("./cargoLoader.repository.js");
const employment = require("../jobEmployment.service.js");
const jobRewardMultiplier = require("../jobRewardMultiplier.service.js");
const inventory = require("../../inventory/inventory.service.js");
const quests = require("../../quests/quest.service.js");
const chat = require("../../chat/chat.service.js");
const logsDb = require("../../../database/logs.js");
const db = require("../../../database/query.js");
const { applyCharacterAppearance } = require("../../../characters/appearance.js");
const { getUuid, rows } = require("../../../utils/player.js");

const previousRuntime = global.__twinkleCargoLoaderRuntime;
const previousShutdown = Promise.resolve()
  .then(() => previousRuntime?.shutdown?.())
  .catch((error) => console.error("[CARGO LOADER] Previous runtime shutdown failed:", error));

const runtime = { active: true, events: [], timers: [], shutdown: null, shutdownPromise: null };
global.__twinkleCargoLoaderRuntime = runtime;

const workers = new Map();
const startsInFlight = new WeakSet();
const activeStarts = new Set();
let schemaReady = false;
let schemaError = null;

function registerEvent(name, handler) {
  const guarded = (...args) => runtime.active ? handler(...args) : undefined;
  mp.events.add(name, guarded);
  runtime.events.push({ name, handler: guarded });
  return guarded;
}

function addInterval(handler, delay) {
  const timer = setInterval(() => { if (runtime.active) handler(); }, delay);
  timer.unref?.();
  runtime.timers.push(timer);
  return timer;
}

function playerExists(player) {
  try { return Boolean(player && mp.players.exists(player)); } catch { return false; }
}

function positionOf(entity) {
  try {
    const position = entity?.position;
    return position ? { x: Number(position.x), y: Number(position.y), z: Number(position.z) } : null;
  } catch { return null; }
}

function safeCall(player, eventName, args = []) {
  if (!playerExists(player)) return;
  try { player.call(eventName, args); } catch {}
}

function notify(player, message, variant = "info") {
  const sender = variant === "error" ? chat.sendError
    : variant === "success" ? chat.sendSuccess
      : variant === "warning" ? chat.sendWarning
        : chat.sendInfo;
  try { sender(player, String(message)); } catch {
    safeCall(player, "client:notification", [variant, String(message)]);
  }
}

function parsePayload(raw, maximumBytes = 512) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const text = String(raw || "");
  if (!text || Buffer.byteLength(text, "utf8") > maximumBytes) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function getSite(siteId) {
  return config.sites[String(siteId || "").toLowerCase()] || null;
}

function getState(player) {
  const state = workers.get(Number(player?.id));
  return state && state.player === player && state.characterUuid === Number(getUuid(player) || 0) ? state : null;
}

function isShiftActive(player, siteId = null) {
  const state = getState(player);
  return Boolean(state && !state.closed && !state.terminationPending && (!siteId || state.site.id === String(siteId))
    && player.__activeJob === state.site.jobId);
}

function currentTarget(route) {
  if (!route) return null;
  if (route.phase === "pickup") return route.source;
  if (route.phase === "dropped") return route.droppedPosition;
  return route.destination;
}

function routeAction(route) {
  if (route?.phase === "settling") return "Выплата обрабатывается";
  if (route?.phase === "carry") return "Положить груз";
  if (route?.phase === "dropped") return "Поднять упавший груз";
  return "Взять груз";
}

function publicState(state) {
  const route = state?.route;
  const target = currentTarget(route);
  return {
    contractVersion: config.contractVersion,
    active: Boolean(state && route && !state.closed),
    siteId: state?.site.id || null,
    jobName: state?.site.name || "Грузчик",
    cargoId: route?.cargoId || null,
    revision: Number(route?.revision || 0),
    phase: route?.phase || null,
    carrying: route?.phase === "carry",
    payout: Number(route?.payout || 0),
    completed: Number(state?.completed || 0),
    action: routeAction(route),
    target: target ? {
      id: target.id || "dropped",
      x: Number(target.x),
      y: Number(target.y),
      z: Number(target.z),
      heading: Number(target.heading || 0),
      dimension: Number(target.dimension || 0),
      label: route.phase === "carry" ? "Точка разгрузки"
        : route.phase === "dropped" ? "Упавший груз" : "Точка погрузки",
    } : null,
    cargo: route ? {
      name: state.site.cargo.name,
      label: state.site.cargo.label,
      models: [...state.site.cargo.models],
      bone: state.site.cargo.bone,
      position: [...state.site.cargo.position],
      rotation: [...state.site.cargo.rotation],
      groundOffset: state.site.cargo.groundOffset,
      animation: config.animation,
    } : null,
  };
}

function syncCarryVisual(state) {
  if (!state || !playerExists(state.player)) return;
  const carrying = state.route?.phase === "carry" && !state.closed && !state.terminationPending;
  if (!carrying) {
    try { state.player.setVariable("cargoLoaderCarry", null); } catch {}
    if (state.carryAnimationActive) {
      try { state.player.stopAnimation?.(); } catch {}
      state.carryAnimationActive = false;
    }
    return;
  }

  const cargo = state.site.cargo;
  const descriptor = JSON.stringify({
    cargoId: state.route.cargoId,
    models: [...cargo.models],
    bone: cargo.bone,
    position: [...cargo.position],
    rotation: [...cargo.rotation],
  });
  try { state.player.setVariable("cargoLoaderCarry", descriptor); } catch {}
  try {
    state.player.playAnimation(
      config.animation.dictionary,
      config.animation.name,
      1,
      config.animation.flags
    );
    state.carryAnimationActive = true;
  } catch {}
}

function pushState(state) {
  if (!state || state.closed) return;
  syncCarryVisual(state);
  safeCall(state.player, "client:cargoLoader:state", [JSON.stringify(publicState(state))]);
}

function syncCash(player, cash) {
  const value = Math.max(0, Number(cash || 0));
  for (const target of [player, player?.character, player?.characterData]) {
    if (!target) continue;
    try { target.cash = value; } catch {}
  }
  try { player.setVariable("cash", value); } catch {}
  safeCall(player, "client:money:update", [value]);
  safeCall(player, "c:hud:update", [JSON.stringify({ player: { cash: value } })]);
}

function captureUniform(player) {
  const snapshot = { clothes: [], props: [] };
  for (let component = 0; component < 12; component += 1) {
    try {
      const value = player.getClothes(component);
      snapshot.clothes.push({
        component,
        drawable: Number(value?.drawable ?? value ?? 0),
        texture: Number(value?.texture ?? 0),
        palette: Number(value?.palette ?? 0),
      });
    } catch {}
  }
  for (let prop = 0; prop < 8; prop += 1) {
    try {
      const value = player.getProp(prop);
      snapshot.props.push({ prop, drawable: Number(value?.drawable ?? value ?? -1), texture: Number(value?.texture ?? 0) });
    } catch {}
  }
  return snapshot;
}

function isFemale(player) {
  const storedGender = String(player?.character?.gender || player?.characterData?.gender || "").toLowerCase();
  if (storedGender) return storedGender === "female";
  try {
    return (Number(player.model || 0) >>> 0) === (Number(mp.joaat("mp_f_freemode_01")) >>> 0);
  } catch { return false; }
}

function applyUniform(player, state) {
  if (!playerExists(player)) return;
  if (!state.uniformSnapshot) state.uniformSnapshot = captureUniform(player);
  const outfit = isFemale(player) ? config.uniform.female : config.uniform.male;
  try {
    [5, 7, 9, 10].forEach((component) => player.setClothes(component, 0, 0, 0));
    outfit.components.forEach(([component, drawable, texture]) => player.setClothes(component, drawable, texture, 0));
    player.setProp(outfit.hat[0], outfit.hat[1], outfit.hat[2]);
  } catch (error) {
    console.error("[CARGO LOADER] Uniform apply failed:", error?.message || error);
  }
}

async function restoreUniform(player, state) {
  if (!playerExists(player)) return false;
  const snapshot = state?.uniformSnapshot || null;
  if (state) state.uniformSnapshot = null;
  if (snapshot) {
    try {
      snapshot.clothes.forEach((value) => player.setClothes(value.component, value.drawable, value.texture, value.palette));
      snapshot.props.forEach((value) => value.drawable < 0
        ? player.clearProp(value.prop)
        : player.setProp(value.prop, value.drawable, value.texture));
    } catch {}
  }
  try {
    const result = await db.query("SELECT * FROM characters WHERE uuid = ? LIMIT 1", [Number(getUuid(player) || 0)]);
    const character = rows(result)?.[0] || player.character || player.characterData;
    if (character) await applyCharacterAppearance(player, character);
    await inventory.restoreEquipment(player);
    return true;
  } catch (error) {
    console.error("[CARGO LOADER] Uniform restore failed:", error?.message || error);
    return Boolean(snapshot);
  }
}

function createRoute(state, sourceId = null) {
  const site = state.site;
  let source;
  let destination;
  let distanceM;
  let payout;
  if (site.id === "port") {
    const leg = core.selectPortLeg(site.points, sourceId, { minimumDistanceM: site.route.minimumDistanceM });
    ({ source, destination, distanceM } = leg);
    payout = core.calculatePortPayout(distanceM, site.economy);
  } else {
    source = site.pickup;
    destination = site.dropoff;
    distanceM = core.distance(source, destination);
    payout = Math.max(0, Math.round(Number(site.economy.payout || 0)));
  }
  return {
    cargoId: `loader_${crypto.randomBytes(16).toString("hex")}`,
    revision: 1,
    phase: "pickup",
    source,
    destination,
    distanceM,
    payout,
    createdAt: Date.now(),
    pickedAt: null,
    droppedPosition: null,
    validTravelM: 0,
    suspiciousTravelM: 0,
  };
}

function resetTracking(state, position = positionOf(state?.player), now = Date.now(), resetMovementCredit = false) {
  state.lastPosition = position;
  state.lastSampleAt = now;
  if (resetMovementCredit) state.movementCreditM = config.antiCheat.movementBurstM;
}

function invalidateCargo(state, reason, now = Date.now()) {
  if (!state || state.closed || !state.route) return;
  const sourceId = state.site.id === "port" ? state.route.source.id : null;
  state.route = createRoute(state, sourceId);
  state.integrityBlockedUntil = now + 5000;
  resetTracking(state, positionOf(state.player), now, true);
  pushState(state);
  notify(state.player, reason || "Маршрут не подтверждён сервером. Возьмите новый груз.", "error");
}

function dropCargo(state, reason = null) {
  const route = state?.route;
  const position = positionOf(state?.player);
  if (!route || route.phase !== "carry" || !position) return false;
  route.phase = "dropped";
  route.revision += 1;
  route.droppedPosition = { ...position, id: "dropped", dimension: Number(state.player.dimension || 0) };
  resetTracking(state, position);
  pushState(state);
  if (reason) notify(state.player, reason, "warning");
  return true;
}

function sampleState(state, now = Date.now()) {
  if (!state || state.closed || state.terminationPending || !playerExists(state.player)) return;
  const player = state.player;
  const current = positionOf(player);
  if (!current) return;
  const elapsedMs = Math.max(1, now - Number(state.lastSampleAt || now));
  const traveledM = core.distance(current, state.lastPosition);
  const movement = core.consumeMovementCredit(state.movementCreditM, traveledM, elapsedMs, config.antiCheat);
  state.movementCreditM = movement.remainingM;
  const carrying = state.route?.phase === "carry";

  if (Number(player.dimension || 0) !== 0 || player.vehicle) {
    if (carrying) invalidateCargo(state, player.vehicle
      ? "Груз нельзя перевозить в транспорте. Вернитесь за новым."
      : "При смене измерения груз был списан.", now);
    else if (state.site.id === "construction" && state.completed > 0) {
      terminateShift(
        state,
        player.vehicle
          ? "Обратный путь на стройке нужно пройти пешком. Смена завершена."
          : "Смена измерения на обратном пути завершила рабочую смену.",
        player.vehicle ? "return-vehicle" : "return-dimension"
      );
    }
    else resetTracking(state, current, now);
    return;
  }

  if (!movement.ok) {
    if (carrying) {
      state.route.suspiciousTravelM += traveledM;
      invalidateCargo(state, "Слишком резкое перемещение: груз списан без выплаты.", now);
    } else {
      if (state.site.id === "construction" && state.completed > 0) {
        terminateShift(state, "Резкое перемещение на обратном пути завершило смену.", "return-teleport");
      } else {
        state.integrityBlockedUntil = now + 5000;
        resetTracking(state, current, now, true);
      }
    }
    return;
  }

  if (carrying && traveledM < Number.MAX_SAFE_INTEGER) state.route.validTravelM += traveledM;
  resetTracking(state, current, now);
}

function allowEvent(state, name, cooldown = config.eventCooldownMs) {
  if (!state || state.closed || state.terminationPending
    || state.pendingOperations >= config.maximumQueuedOperations) return false;
  const now = Date.now();
  const previous = Number(state.lastEventAt[name] || 0);
  if (now - previous < cooldown) return false;
  state.lastEventAt[name] = now;
  return true;
}

function serialize(state, operation) {
  if (!state || state.closed || state.terminationPending) return Promise.resolve(false);
  if (state.pendingOperations >= config.maximumQueuedOperations) {
    notify(state.player, "Слишком много действий. Подождите секунду.", "warning");
    return Promise.resolve(false);
  }
  state.pendingOperations += 1;
  const run = state.operationTail.catch(() => undefined).then(() => {
    if (state.closed || state.terminationPending) return false;
    return operation();
  });
  state.operationTail = run.finally(() => { state.pendingOperations = Math.max(0, state.pendingOperations - 1); });
  return state.operationTail;
}

function validateState(player, state) {
  if (!state || state.closed || state.terminationPending
    || !playerExists(player) || Number(getUuid(player) || 0) !== state.characterUuid) {
    throw new Error("Рабочая смена не активна.");
  }
  if (player.__activeJob !== state.site.jobId) throw new Error("Текущая работа изменилась.");
  if (Number(player.health ?? 100) <= 0) throw new Error("Персонаж не может работать в этом состоянии.");
  if (Number(player.dimension || 0) !== 0) throw new Error("Вернитесь в рабочую зону.");
  if (player.vehicle) throw new Error("Переносить груз можно только пешком.");
  if (Date.now() < Number(state.integrityBlockedUntil || 0)) throw new Error("Подождите после резкого перемещения.");
}

function validatePayload(route, payload) {
  return Boolean(route && payload
    && String(payload.cargoId || "") === route.cargoId
    && Number(payload.revision) === Number(route.revision));
}

async function settleRoute(state) {
  const route = state.route;
  route.phase = "settling";
  route.revision += 1;
  pushState(state);
  try {
    const trophyMultiplier = await jobRewardMultiplier.getMultiplier(state.player, state.site.jobId);
    const finalPayout = Math.round(Number(route.payout || 0) * trophyMultiplier);
    const result = await repository.settleDelivery(state.characterUuid, {
      cargoId: route.cargoId,
      jobId: state.site.jobId,
      siteId: state.site.id,
      sourceId: route.source.id,
      destinationId: route.destination.id,
      distanceM: route.distanceM,
      payout: finalPayout,
      startedAt: route.pickedAt || route.createdAt,
    });
    syncCash(state.player, result.cashAfter);
    if (!result.alreadySettled) {
      state.completed += 1;
      notify(state.player, `${state.site.cargo.label} доставлен. Получено: $${finalPayout}${trophyMultiplier > 1 ? ` · секретная пила x${trophyMultiplier}` : ""}.`, "success");
      logsDb.writeMoneyLog({
        source: state.site.id === "port" ? "job_port_loader" : "job_construction_loader",
        action: "cargo_delivery",
        currency: "cash",
        amount: finalPayout,
        balanceBefore: result.cashBefore,
        balanceAfter: result.cashAfter,
        target: state.player,
        comment: state.site.name,
        metadata: { cargoId: route.cargoId, distanceM: Math.round(route.distanceM) },
      }).catch(() => {});
      quests.recordProgress(state.player, {
        type: "job.money_earned",
        subjectId: state.site.jobId,
        idempotencyKey: `cargo-loader:${route.cargoId}`,
        amount: finalPayout,
        metadata: { jobId: state.site.jobId, cargoId: route.cargoId },
      }, { sync: true }).catch(() => {});
    }
    const nextSourceId = state.site.id === "port" ? route.destination.id : null;
    state.route = createRoute(state, nextSourceId);
    resetTracking(state);
    pushState(state);
    return true;
  } catch (error) {
    route.phase = "carry";
    route.revision += 1;
    state.route = route;
    pushState(state);
    throw error;
  }
}

async function interact(player, raw) {
  const state = getState(player);
  if (!allowEvent(state, "interact")) return false;
  const payload = parsePayload(raw);
  return serialize(state, async () => {
    try {
      sampleState(state);
      validateState(player, state);
      const route = state.route;
      if (!validatePayload(route, payload)) throw new Error("Маршрут уже обновился.");
      const target = currentTarget(route);
      if (core.distance(positionOf(player), target) > config.interactionRadius) throw new Error("Подойдите ближе к грузу.");

      if (route.phase === "pickup" || route.phase === "dropped") {
        const firstPickup = !route.pickedAt;
        route.phase = "carry";
        route.revision += 1;
        route.droppedPosition = null;
        if (firstPickup) {
          route.pickedAt = Date.now();
          route.validTravelM = 0;
          route.suspiciousTravelM = 0;
        }
        resetTracking(state, positionOf(player), Date.now(), firstPickup);
        pushState(state);
        notify(player, `Вы взяли ${state.site.cargo.name}. Несите груз к отмеченной точке.`, "info");
        return true;
      }

      if (route.phase !== "carry") throw new Error("Дождитесь завершения операции.");
      const travel = core.validateDeliveryTravel({
        directDistanceM: route.distanceM,
        elapsedMs: Date.now() - Number(route.pickedAt || Date.now()),
        validTravelM: route.validTravelM,
        suspiciousTravelM: route.suspiciousTravelM,
      }, config.antiCheat);
      if (!travel.ok) throw new Error("Маршрут груза не подтверждён сервером. Пройдите его полностью пешком.");
      return await settleRoute(state);
    } catch (error) {
      notify(player, error?.message || "Не удалось выполнить действие.", "error");
      return false;
    }
  });
}

async function handleJump(player, raw) {
  const state = getState(player);
  if (!allowEvent(state, "jump", 300)) return false;
  const payload = parsePayload(raw);
  return serialize(state, async () => {
    sampleState(state);
    if (!state.route || state.route.phase !== "carry" || !validatePayload(state.route, payload)) return false;
    return dropCargo(state, "Вы подпрыгнули и уронили груз. Поднимите его с земли.");
  });
}

function createState(player, site) {
  const now = Date.now();
  const state = {
    player,
    site,
    characterUuid: Number(getUuid(player)),
    shiftId: `loader_shift_${crypto.randomBytes(12).toString("hex")}`,
    route: null,
    completed: 0,
    lastPosition: positionOf(player),
    lastSampleAt: now,
    movementCreditM: config.antiCheat.movementBurstM,
    integrityBlockedUntil: 0,
    lastEventAt: Object.create(null),
    operationTail: Promise.resolve(),
    pendingOperations: 0,
    uniformSnapshot: null,
    terminationPending: false,
    carryAnimationActive: false,
    closed: false,
    stopPromise: null,
  };
  state.route = createRoute(state);
  return state;
}

function nearNpc(player, site) {
  return Boolean(playerExists(player) && !player.vehicle
    && Number(player.dimension || 0) === Number(site.npc.dimension || 0)
    && core.distance(positionOf(player), site.npc.position) <= Number(site.npc.colshapeRadius || 4.5) + 1.5);
}

async function joinSite(player, siteId) {
  const site = getSite(siteId);
  if (!site) return false;
  if (startsInFlight.has(player)) return false;
  startsInFlight.add(player);
  let finishStart;
  const startDone = new Promise((resolve) => { finishStart = resolve; });
  activeStarts.add(startDone);
  try {
    if (!runtime.active) throw new Error("Система работ перезапускается. Попробуйте ещё раз.");
    if (!schemaReady) throw new Error(schemaError ? "Работа грузчика временно недоступна." : "Система работ ещё запускается.");
    const characterUuid = Number(getUuid(player) || 0);
    if (!characterUuid) throw new Error("Персонаж не загружен.");
    if (!nearNpc(player, site)) throw new Error("Подойдите к бригадиру пешком.");
    const current = getState(player);
    if (current?.site.id === site.id) {
      notify(player, "Эта рабочая смена уже активна.", "warning");
      pushState(current);
      return true;
    }
    await employment.assignJob(player, site.jobId);
    const startStillValid = runtime.active
      && playerExists(player)
      && Number(getUuid(player) || 0) === characterUuid
      && player.__activeJob === site.jobId
      && nearNpc(player, site);
    if (!startStillValid) {
      await db.query(
        "DELETE FROM character_jobs WHERE character_uuid = ? AND job_id = ?",
        [characterUuid, site.jobId]
      ).catch(() => undefined);
      if (playerExists(player) && Number(getUuid(player) || 0) === characterUuid) {
        await employment.restorePlayer(player).catch(() => undefined);
      }
      throw new Error("Начало смены отменено: персонаж или ресурс изменили состояние.");
    }
    const state = createState(player, site);
    workers.set(player.id, state);
    player.__cargoLoaderShiftStartedForUuid = state.characterUuid;
    applyUniform(player, state);
    pushState(state);
    notify(player, `Смена начата: ${site.name}. Следуйте к точке погрузки.`, "success");
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось начать смену грузчика.", "error");
    return false;
  } finally {
    startsInFlight.delete(player);
    activeStarts.delete(startDone);
    finishStart();
  }
}

async function stopState(state) {
  if (!state) return true;
  if (state.stopPromise) return state.stopPromise;
  state.stopPromise = (async () => {
    state.closed = true;
    syncCarryVisual(state);
    await state.operationTail.catch(() => undefined);
    if (workers.get(state.player.id) === state) workers.delete(state.player.id);
    if (Number(state.player.__cargoLoaderShiftStartedForUuid || 0) === state.characterUuid) {
      state.player.__cargoLoaderShiftStartedForUuid = 0;
    }
    safeCall(state.player, "client:cargoLoader:clear");
    await restoreUniform(state.player, state);
    return true;
  })();
  return state.stopPromise;
}

async function stopRuntime(player) {
  const state = getState(player);
  if (!state) {
    safeCall(player, "client:cargoLoader:clear");
    return true;
  }
  return stopState(state);
}

async function leave(player) {
  const state = getState(player);
  const jobId = state?.site.jobId || (config.jobIds.includes(player?.__activeJob) ? player.__activeJob : null);
  if (!jobId) {
    notify(player, "Смена грузчика не активна.", "warning");
    safeCall(player, "client:cargoLoader:clear");
    return false;
  }
  try {
    const result = await employment.clearJob(player, jobId, { reason: "loader-leave" });
    if (!result.cleared) await stopRuntime(player);
    notify(player, "Смена грузчика завершена.", "success");
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось завершить смену.", "error");
    return false;
  }
}

function terminateShift(state, message, reason) {
  if (!state || state.closed || state.terminationPending) return;
  state.terminationPending = true;
  syncCarryVisual(state);
  const player = state.player;
  safeCall(player, "client:cargoLoader:clear");
  employment.clearJob(player, state.site.jobId, { reason: reason || "loader-terminated" })
    .then((result) => { if (!result.cleared) return stopState(state); })
    .then(() => { if (message) notify(player, message, "error"); })
    .catch(async (error) => {
      console.error("[CARGO LOADER] Termination failed:", error);
      await stopState(state).catch(() => undefined);
      try {
        await db.query("DELETE FROM character_jobs WHERE character_uuid = ? AND job_id = ?", [state.characterUuid, state.site.jobId]);
        if (playerExists(player)) await employment.restorePlayer(player);
      } catch (cleanupError) {
        console.error("[CARGO LOADER] Forced termination cleanup failed:", cleanupError);
      }
      if (message) notify(player, message, "error");
    });
}

registerEvent("server:cargoLoader:interact", (player, raw) => {
  interact(player, raw).catch((error) => console.error("[CARGO LOADER] Interaction failed:", error));
});

registerEvent("server:cargoLoader:jump", (player, raw) => {
  handleJump(player, raw).catch((error) => console.error("[CARGO LOADER] Jump drop failed:", error));
});

registerEvent("server:cargoLoader:state:request", (player) => {
  const state = getState(player);
  if (allowEvent(state, "state", 500)) pushState(state);
});

registerEvent("playerEnterVehicle", (player) => {
  const state = getState(player);
  if (!state || state.closed || state.terminationPending) return;
  if (state.route?.phase === "carry") {
    invalidateCargo(state, "Груз нельзя перевозить в транспорте. Вернитесь за новым.");
    return;
  }
  if (state.site.id === "construction" && state.completed > 0) {
    terminateShift(state, "Обратный путь на стройке нужно пройти пешком. Смена завершена.", "return-vehicle");
  }
});

registerEvent("playerDeath", (player) => {
  const state = getState(player);
  if (state) terminateShift(state, "После гибели смена грузчика завершена.", "player-death");
});

registerEvent("playerQuit", (player) => {
  const state = getState(player);
  if (!state) return;
  employment.clearJob(player, state.site.jobId, { reason: "player-quit" })
    .then((result) => { if (!result.cleared) return stopState(state); })
    .catch(async (error) => {
      console.error("[CARGO LOADER] Quit cleanup failed:", error);
      await stopState(state).catch(() => undefined);
      await db.query(
        "DELETE FROM character_jobs WHERE character_uuid = ? AND job_id = ?",
        [state.characterUuid, state.site.jobId]
      ).catch(() => undefined);
    });
});

registerEvent("twinkle:character:loaded", (player) => {
  const timer = setTimeout(() => {
    if (!runtime.active || !playerExists(player) || !config.jobIds.includes(player.__activeJob) || getState(player)) return;
    employment.clearJob(player, player.__activeJob, { reason: "session-login-reset" })
      .then(() => safeCall(player, "client:cargoLoader:clear"))
      .catch((error) => console.error("[CARGO LOADER] Stale shift cleanup failed:", error));
  }, 600);
  timer.unref?.();
  runtime.timers.push(timer);
});

for (const jobId of config.jobIds) {
  employment.registerRuntimeCleanup(jobId, (player) => stopRuntime(player), { replace: true });
}

addInterval(() => {
  const now = Date.now();
  for (const state of workers.values()) sampleState(state, now);
}, config.sampleIntervalMs);

previousShutdown
  .then(() => repository.ensureSchema())
  .then(() => {
    schemaReady = true;
    schemaError = null;
    console.log("[CARGO LOADER] Port and construction jobs are ready");
  })
  .catch((error) => {
    schemaReady = false;
    schemaError = error;
    console.error("[CARGO LOADER] Disabled because SQL schema is unavailable:", error);
  });

runtime.shutdown = () => {
  if (runtime.shutdownPromise) return runtime.shutdownPromise;
  runtime.shutdownPromise = (async () => {
    runtime.active = false;
    runtime.timers.splice(0).forEach((timer) => {
      try { clearTimeout(timer); clearInterval(timer); } catch {}
    });
    runtime.events.splice(0).forEach((entry) => {
      try { mp.events.remove?.(entry.name, entry.handler); } catch {}
    });
    await Promise.allSettled([...activeStarts]);
    const states = [...workers.values()];
    await Promise.allSettled(states.map(async (state) => {
      const player = state.player;
      await stopState(state);
      try {
        const result = await employment.clearJob(player, state.site.jobId, { reason: "shutdown" });
        if (!result.cleared) await employment.restorePlayer(player);
      } catch (error) {
        console.error(`[CARGO LOADER] Shutdown cleanup failed for ${state.characterUuid}:`, error);
        await db.query("DELETE FROM character_jobs WHERE character_uuid = ? AND job_id = ?", [state.characterUuid, state.site.jobId]);
        if (Number(getUuid(player)) === state.characterUuid) await employment.restorePlayer(player);
      }
    }));
    workers.clear();
  })();
  return runtime.shutdownPromise;
};

const publicApi = {
  getSite,
  interact,
  isShiftActive,
  joinSite,
  leave,
};
global.__twinkleCargoLoaderService = publicApi;
module.exports = publicApi;
