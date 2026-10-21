"use strict";

const crypto = require("crypto");
const config = require("./armoredCollector.config.js");
const economy = require("./armoredCollector.economy.js");
const repository = require("./armoredCollector.repository.js");
const employment = require("../jobEmployment.service.js");
const jobRewardMultiplier = require("../jobRewardMultiplier.service.js");
const documents = require("../../documents/document.service.js");
const { DOCUMENT_ITEM_IDS } = require("../../documents/document.items.js");
const licenses = require("../../licenses/license.service.js");
const inventory = require("../../inventory/inventory.service.js");
const logsDb = require("../../../database/logs.js");
const db = require("../../../database/query.js");
const { applyCharacterAppearance } = require("../../../characters/appearance.js");
const { getAdminLevel, getUuid, rows } = require("../../../utils/player.js");

const previousArmoredCollectorRuntime = global.__twinkleArmoredCollectorRuntime;
const previousRuntimeShutdown = Promise.resolve()
  .then(() => previousArmoredCollectorRuntime?.shutdown?.())
  .catch((error) => console.error("[ARMORED COLLECTOR] Previous runtime shutdown failed:", error));

const runtime = { active: true, events: [], timers: [], shutdown: null, shutdownPromise: null, spawnReserved: false };
global.__twinkleArmoredCollectorRuntime = runtime;

const workers = new Map();
const startsInFlight = new WeakSet();
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
  runtime.timers.push(timer);
  return timer;
}

function playerExists(player) {
  try { return Boolean(player && mp.players.exists(player)); } catch { return false; }
}

function vehicleExists(vehicle) {
  try { return Boolean(vehicle && mp.vehicles.exists(vehicle)); } catch { return false; }
}

function positionOf(entity) {
  try {
    const position = entity?.position;
    return position ? { x: Number(position.x), y: Number(position.y), z: Number(position.z) } : null;
  } catch { return null; }
}

function distance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return Math.hypot(
    Number(left.x || 0) - Number(right.x || 0),
    Number(left.y || 0) - Number(right.y || 0),
    Number(left.z || 0) - Number(right.z || 0)
  );
}

function vehicleSpeed(vehicle) {
  try {
    const velocity = vehicle?.velocity;
    return velocity ? Math.hypot(Number(velocity.x || 0), Number(velocity.y || 0), Number(velocity.z || 0)) : 0;
  } catch { return 0; }
}

function safeCall(player, eventName, args = []) {
  if (!playerExists(player)) return;
  try { player.call(eventName, args); } catch {}
}

function notify(player, message, variant = "info") {
  safeCall(player, "client:armoredCollector:notify", [variant, String(message || ""), 5000]);
}

function parsePayload(raw, maximumBytes = 512) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const text = String(raw || "");
  if (Buffer.byteLength(text, "utf8") > maximumBytes) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function getState(player) {
  if (!player) return null;
  const state = workers.get(Number(player.id)) || null;
  return state && state.player === player && state.characterUuid === Number(getUuid(player)) ? state : null;
}

function isShiftActive(player) {
  const state = getState(player);
  return Boolean(state && !state.closed && state.characterUuid === Number(getUuid(player)));
}

function allowEvent(state, key, cooldownMs) {
  if (!state || state.closed) return false;
  const now = Date.now();
  const previous = Number(state.lastEventAt[key] || 0);
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

function rotationBucket(now = Date.now()) {
  return Math.floor(Number(now) / config.refreshMs);
}

function rotationRevision(now = Date.now()) {
  return String(rotationBucket(now));
}

function routesForBucket(bucket) {
  return config.pickups
    .map((route) => ({
      route,
      order: crypto.createHash("sha256").update(`armored:${bucket}:${route.id}`).digest("hex"),
    }))
    .sort((left, right) => left.order.localeCompare(right.order))
    .slice(0, config.offersPerRotation)
    .map((entry) => entry.route);
}

function buildRoute(route, profile, now = Date.now()) {
  const firstLeg = distance(config.vehicle.spawn, route.position);
  const secondLeg = distance(route.position, config.unload.position);
  const routeDistanceM = Math.round((firstLeg + secondLeg) * config.economy.roadDistanceMultiplier);
  const metrics = economy.routeMetrics(routeDistanceM);
  const minimum = economy.calculatePayout({
    ...metrics, elapsedSeconds: metrics.targetSeconds, level: profile.level,
  });
  const maximum = economy.calculatePayout({
    ...metrics, elapsedSeconds: metrics.targetSeconds * 0.65, level: profile.level,
  });
  const bucket = rotationBucket(now);
  const pickup = { ...route.position, label: route.name, address: route.name };
  const unload = { ...config.unload.position, label: config.unload.name, address: config.unload.name, name: config.unload.name };
  return {
    routeId: route.id,
    title: route.name,
    pickup,
    unload,
    dropoff: unload,
    distanceToPickupM: Math.round(firstLeg * config.economy.roadDistanceMultiplier),
    distanceM: metrics.distanceM,
    routeDistanceM: metrics.distanceM,
    bags: metrics.bags,
    bagCount: metrics.bags,
    targetSeconds: metrics.targetSeconds,
    estimatedDurationSeconds: metrics.targetSeconds,
    basePay: minimum.basePay,
    levelBonus: minimum.levelBonus,
    veteranBonus: minimum.veteranBonus,
    speedBonus: Math.max(0, maximum.fastBonus),
    maxPayout: maximum.finalPayout,
    estimatedPayout: { minimum: minimum.finalPayout, maximum: maximum.finalPayout },
    availableUntil: (bucket + 1) * config.refreshMs,
    expiresAt: (bucket + 1) * config.refreshMs,
  };
}

function publicActiveRoute(active) {
  if (!active) return null;
  const phase = ["to_unload", "to_dropoff", "unloading"].includes(active.stage) ? "unload" : "pickup";
  const point = phase === "unload" ? active.route.unload : active.route.pickup;
  return {
    runId: active.runId,
    routeId: active.route.routeId,
    title: active.route.title,
    stage: active.stage,
    phase,
    point,
    pickup: active.route.pickup,
    unload: active.route.unload,
    distanceM: active.route.distanceM,
    routeDistanceM: active.route.distanceM,
    bags: active.route.bags,
    bagCount: active.route.bags,
    bagsLoaded: active.bagsLoaded,
    carrying: active.carrying,
    cancelFee: economy.cancellationFee(active),
    selectedAt: active.selectedAt,
    targetSeconds: active.route.targetSeconds,
    estimatedDurationSeconds: active.route.targetSeconds,
    estimatedPayout: active.route.estimatedPayout,
  };
}

function tabletLocation(location) {
  return {
    x: Number(location?.x || 0),
    y: Number(location?.y || 0),
    z: Number(location?.z || 0),
    heading: Number(location?.heading || 0),
    dimension: Math.max(0, Number(location?.dimension || 0)),
    label: String(location?.label || location?.name || "Точка маршрута"),
    address: String(location?.address || location?.label || location?.name || "Los Santos"),
  };
}

function tabletRoute(route, state) {
  const disabledReasons = [];
  if (state.activeRoute) disabledReasons.push("Сначала завершите текущий маршрут");
  if (!vehicleExists(state.vehicle)) disabledReasons.push("Служебный броневик недоступен");
  if (vehicleExists(state.vehicle) && !isOwnVehicleDriver(state)) disabledReasons.push("Сядьте за руль своего броневика");
  if (!isNear(state.vehicle, config.vehicle.spawn, config.interaction.selectAtBaseRadius)) {
    disabledReasons.push("Вернитесь на базу Gruppe 6");
  }
  return {
    routeId: route.routeId,
    title: route.title,
    pickup: tabletLocation(route.pickup),
    dropoff: tabletLocation(route.unload),
    unload: tabletLocation(route.unload),
    distanceToPickupM: route.distanceToPickupM,
    distanceM: route.distanceM,
    routeDistanceM: route.routeDistanceM,
    bags: route.bags,
    bagCount: route.bagCount,
    targetSeconds: route.targetSeconds,
    estimatedDurationSeconds: route.estimatedDurationSeconds,
    basePay: route.basePay,
    levelBonus: route.levelBonus,
    veteranBonus: route.veteranBonus,
    speedBonus: route.speedBonus,
    maxPayout: route.maxPayout,
    estimatedPayout: route.estimatedPayout,
    availableUntil: route.availableUntil,
    expiresAt: route.expiresAt,
    canSelect: disabledReasons.length === 0,
    disabledReasons,
  };
}

function tabletActiveRoute(active, state) {
  if (!active) return null;
  const runtimeRoute = publicActiveRoute(active);
  const stage = active.stage === "to_unload" ? "to_dropoff"
    : active.stage === "collecting" && active.carrying ? "loading_vehicle"
      : active.stage;
  const target = runtimeRoute.phase === "unload" ? active.route.unload : active.route.pickup;
  return {
    runId: active.runId,
    routeId: active.route.routeId,
    title: active.route.title,
    stage,
    phase: runtimeRoute.phase,
    point: tabletLocation(target),
    pickup: tabletLocation(active.route.pickup),
    unload: tabletLocation(active.route.unload),
    targetLabel: String(target.label || target.name || active.route.title),
    distanceToTargetM: Math.round(distance(positionOf(state.player), target)),
    loadedBags: active.bagsLoaded,
    totalBags: active.route.bags,
    bagsLoaded: active.bagsLoaded,
    carrying: active.carrying,
    selectedAt: active.selectedAt,
    targetSeconds: active.route.targetSeconds,
    distanceM: active.route.distanceM,
    routeDistanceM: active.route.routeDistanceM,
    bags: active.route.bags,
    bagCount: active.route.bagCount,
    estimatedDurationSeconds: active.route.estimatedDurationSeconds,
    estimatedPayout: active.route.estimatedPayout,
    basePay: active.route.basePay,
    potentialSpeedBonus: active.route.speedBonus,
    potentialPayout: active.route.maxPayout,
    cancelFee: economy.cancellationFee(active),
    bonusDeadlineAt: active.selectedAt + active.route.targetSeconds * 1000,
  };
}

function buildTabletPayload(state, errorMessage = "") {
  const now = Date.now();
  const bucket = rotationBucket(now);
  if (state.rotationBucket !== bucket) {
    state.rotationBucket = bucket;
    state.usedRouteIds.clear();
  }
  const progress = economy.levelProgress(state.profile.xp);
  const routes = routesForBucket(bucket)
    .filter((route) => !state.usedRouteIds.has(route.id))
    .map((route) => tabletRoute(buildRoute(route, state.profile, now), state));
  const levelXpCurrent = Math.max(0, progress.xp - progress.currentLevelXp);
  const levelXpRequired = progress.nextLevelXp > progress.currentLevelXp
    ? progress.nextLevelXp - progress.currentLevelXp
    : null;
  return {
    available: Boolean(schemaReady && !state.closed),
    revision: String(bucket),
    serverNow: now,
    refreshIntervalMs: config.refreshMs,
    nextRefreshAt: (bucket + 1) * config.refreshMs,
    status: schemaReady ? "ready" : (schemaError ? "error" : "loading"),
    ...(errorMessage ? { errorMessage: String(errorMessage) } : {}),
    shift: {
      active: !state.closed,
      startedAt: state.startedAt,
      vehicleLabel: config.vehicle.label,
    },
    profile: {
      level: progress.level,
      xp: progress.xp,
      currentLevelXp: levelXpCurrent,
      nextLevelXp: levelXpRequired,
      levelXpCurrent,
      levelXpRequired,
      completedRoutes: state.profile.completedRoutes,
      totalEarned: state.profile.totalEarned,
      levelPayPercent: Math.round(economy.levelPayRate(progress.level) * 100),
      levelBonus: {
        unlockLevel: config.economy.level10Unlock,
        amount: config.economy.level10FlatBonus,
        kind: "cash",
        unlocked: progress.level >= config.economy.level10Unlock,
      },
    },
    levelPayScale: economy.levelPayScale(),
    activeRoute: tabletActiveRoute(state.activeRoute, state),
    request: { pending: false, errorMessage: errorMessage ? String(errorMessage) : "" },
    routes,
  };
}

function pushTablet(state, errorMessage = "") {
  if (!state || state.closed) return;
  const payload = buildTabletPayload(state, errorMessage);
  safeCall(state.player, "client:armoredCollector:tablet:update", [JSON.stringify(payload)]);
  pushShiftState(state);
}

function pushShiftState(state) {
  if (!state || state.closed) return;
  safeCall(state.player, "client:armoredCollector:shiftState", [JSON.stringify({
    active: true,
    shiftId: state.shiftId,
    vehicleRemoteId: vehicleExists(state.vehicle) ? Number(state.vehicle.id) : -1,
    vehicleLabel: config.vehicle.label,
    startedAt: state.startedAt,
    route: publicActiveRoute(state.activeRoute),
    carrying: Boolean(state.activeRoute?.carrying),
    tabletAvailable: true,
  })]);
}

function pushRoute(state) {
  if (!state || state.closed) return;
  if (!state.activeRoute) return safeCall(state.player, "client:armoredCollector:clearRoute");
  safeCall(state.player, "client:armoredCollector:setRoute", [JSON.stringify(publicActiveRoute(state.activeRoute))]);
}

function pushCarry(state) {
  if (!state || state.closed) return;
  const active = state.activeRoute;
  safeCall(state.player, "client:armoredCollector:setCarry", [JSON.stringify({
    active: Boolean(active?.carrying),
    carrying: Boolean(active?.carrying),
    model: "prop_money_bag_01",
    bone: 57005,
    position: [0.12, 0, -0.05],
    rotation: [0, 270, 60],
    animation: { dictionary: "anim@heists@narcotics@trash", name: "idle", flags: 49 },
  })]);
}

function syncCash(player, cash) {
  const value = Math.max(0, Number(cash || 0));
  player.cash = value;
  if (player.character) player.character.cash = value;
  if (player.characterData) player.characterData.cash = value;
  try { player.setVariable("cash", value); } catch {}
  safeCall(player, "client:money:update", [value]);
  safeCall(player, "c:hud:update", [JSON.stringify({ player: { cash: value } })]);
}

async function requireEligibility(player) {
  if (!schemaReady) {
    throw new Error(schemaError ? "Работа инкассатора временно недоступна." : "Система инкассации запускается.");
  }
  if (!playerExists(player) || !getUuid(player)) throw new Error("Персонаж не загружен.");
  const [identity, identityItem, cdlB, cdlA, cdlBItem, cdlAItem] = await Promise.all([
    documents.getIdentityDocument(player),
    documents.hasDocumentItem(player, DOCUMENT_ITEM_IDS.identity),
    licenses.hasLicense(player, "cdl_b"),
    licenses.hasLicense(player, "cdl_a"),
    licenses.hasLicenseDocumentItem(player, "cdl_b"),
    licenses.hasLicenseDocumentItem(player, "cdl_a"),
  ]);
  if (!identity || !identityItem) throw new Error("Для смены нужна действующая ID-карта в инвентаре.");
  if (!((cdlB && cdlBItem) || (cdlA && cdlAItem))) {
    throw new Error("Для смены нужны действующие права CDL B или CDL A в инвентаре.");
  }
}

function isNear(player, point, radius) {
  return Number(player?.dimension || 0) === Number(point?.dimension || 0) &&
    distance(positionOf(player), point) <= Number(radius || 0);
}

function isOwnVehicleDriver(state) {
  if (!state || !vehicleExists(state.vehicle) || state.player.vehicle !== state.vehicle) return false;
  const seat = Number(state.player.seat);
  if (Number.isFinite(seat) && seat !== 0 && seat !== -1) return false;
  try {
    if (typeof state.vehicle.getOccupant === "function") {
      const driver = state.vehicle.getOccupant(0) || state.vehicle.getOccupant(-1);
      if (driver) return driver === state.player;
    }
  } catch { return false; }
  return Number.isFinite(seat) && (seat === 0 || seat === -1);
}

function spawnAreaFree() {
  let clear = true;
  try {
    mp.vehicles.forEach((vehicle) => {
      if (clear && vehicleExists(vehicle) && distance(positionOf(vehicle), config.vehicle.spawn) < config.vehicle.spawnClearRadius) clear = false;
    });
  } catch { return false; }
  return clear;
}

function setVehicleMetadata(vehicle, state) {
  const plate = `GR6${String(state.characterUuid).slice(-4)}`.slice(0, 8);
  try {
    vehicle.armoredCollectorVehicle = true;
    vehicle.armoredCollectorOwnerUuid = state.characterUuid;
    vehicle.ownerType = "player";
    vehicle.ownerId = state.characterUuid;
    vehicle.numberPlate = plate;
    vehicle.locked = false;
    vehicle.engine = true;
    vehicle.fuel = config.vehicle.fuel;
    vehicle.fuelMax = config.vehicle.fuel;
    vehicle.fuelConsumption = 1.8;
  } catch {}
  try {
    vehicle.setVariable("armoredCollectorVehicle", true);
    vehicle.setVariable("armoredCollectorOwnerUuid", state.characterUuid);
    vehicle.setVariable("armoredCollectorShiftId", state.shiftId);
    vehicle.setVariable("ownerType", "player");
    vehicle.setVariable("ownerId", state.characterUuid);
    vehicle.setVariable("job", config.jobId);
    vehicle.setVariable("locked", false);
    vehicle.setVariable("engine", true);
    vehicle.setVariable("fuel", config.vehicle.fuel);
    vehicle.setVariable("fuelMax", config.vehicle.fuel);
    vehicle.setVariable("fuelType", "diesel");
    vehicle.setVariable("fuelConsumption", 1.8);
  } catch {}
}

function spawnWorkVehicle(state) {
  if (runtime.spawnReserved || !spawnAreaFree()) throw new Error("Место выдачи фургона занято. Освободите площадку.");
  runtime.spawnReserved = true;
  let vehicle = null;
  try {
    const spawn = config.vehicle.spawn;
    vehicle = mp.vehicles.new(mp.joaat(config.vehicle.model), new mp.Vector3(spawn.x, spawn.y, spawn.z), {
      heading: spawn.heading,
      dimension: spawn.dimension,
      color: [[20, 70, 35], [20, 70, 35]],
    });
    state.vehicle = vehicle;
    setVehicleMetadata(vehicle, state);
    try { state.player.putIntoVehicle(vehicle, 0); } catch {}
    setTimeout(() => {
      if (runtime.active && !state.closed && playerExists(state.player) && vehicleExists(vehicle)) {
        if (!state.player.vehicle) try { state.player.putIntoVehicle(vehicle, 0); } catch {}
        pushTablet(state);
      }
    }, 350);
    return vehicle;
  } catch (error) {
    try { if (vehicle && vehicleExists(vehicle)) vehicle.destroy(); } catch {}
    state.vehicle = null;
    throw error;
  } finally {
    runtime.spawnReserved = false;
  }
}

function captureUniform(player) {
  const snapshot = { clothes: [], props: [] };
  for (let component = 0; component < 12; component += 1) {
    try {
      const value = player.getClothes(component);
      snapshot.clothes.push({ component, drawable: Number(value?.drawable ?? value ?? 0), texture: Number(value?.texture ?? 0), palette: Number(value?.palette ?? 0) });
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

function applyUniform(player, state) {
  if (!playerExists(player)) return;
  if (!state.uniformSnapshot) state.uniformSnapshot = captureUniform(player);
  const female = String(player.character?.gender || player.characterData?.gender || "").toLowerCase() === "female";
  const clothes = female
    ? [[3, 44, 0], [4, 34, 0], [6, 27, 0], [8, 35, 0], [9, 15, 2], [11, 48, 0]]
    : [[3, 41, 0], [4, 35, 0], [6, 25, 0], [8, 58, 0], [9, 12, 2], [11, 55, 0]];
  try {
    [5, 7, 10].forEach((component) => player.setClothes(component, 0, 0, 0));
    clothes.forEach(([component, drawable, texture]) => player.setClothes(component, drawable, texture, 0));
  } catch {}
  try { player.setProp(0, female ? 45 : 46, 0); } catch {}
}

async function restoreUniform(player, state) {
  if (!playerExists(player)) return;
  const snapshot = state?.uniformSnapshot;
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
    // Component 9 is not part of the generic appearance defaults. Restore it
    // explicitly from the saved outfit (or clear it), otherwise the Gruppe 6
    // vest can survive the model/outfit refresh after a shift.
    let savedVest = null;
    try {
      const parsedClothes = typeof character?.clothes === "string"
        ? JSON.parse(character.clothes || "{}")
        : (character?.clothes || {});
      savedVest = (parsedClothes.components || parsedClothes)?.[9]
        || (parsedClothes.components || parsedClothes)?.["9"]
        || null;
    } catch {}
    player.setClothes(
      9,
      Number(savedVest?.drawable ?? savedVest?.drawableId ?? savedVest?.id ?? 0),
      Number(savedVest?.texture ?? savedVest?.textureId ?? 0),
      Number(savedVest?.palette ?? 0)
    );
    await inventory.restoreEquipment(player);
  } catch (error) {
    console.error("[ARMORED COLLECTOR] Uniform restore failed:", error);
  }
}

function createState(player, profile, completedRouteIds = [], bucket = rotationBucket()) {
  const startedAt = Date.now();
  const characterUuid = Number(getUuid(player));
  return {
    player,
    characterUuid,
    profile,
    startedAt,
    shiftId: `acs_${characterUuid}_${startedAt}`,
    rotationBucket: bucket,
    usedRouteIds: new Set(completedRouteIds),
    activeRoute: null,
    vehicle: null,
    outsideVehicleSince: 0,
    outsideWarnings: new Set(),
    lastPosition: positionOf(player),
    lastSampleAt: Date.now(),
    suspiciousTravelEvents: 0,
    integrityBlockedUntil: 0,
    lastEventAt: Object.create(null),
    operationTail: Promise.resolve(),
    uniformSnapshot: null,
    terminationPending: false,
    stopPromise: null,
    closed: false,
  };
}

function destroyVehicle(state) {
  const vehicle = state?.vehicle;
  if (state) state.vehicle = null;
  try { if (vehicle && vehicleExists(vehicle)) vehicle.destroy(); } catch {}
}

async function stopRuntime(player, options = {}) {
  const state = getState(player);
  if (!state) {
    safeCall(player, "client:armoredCollector:clear");
    return true;
  }
  return stopState(state, options);
}

async function stopState(state, options = {}) {
  if (!state) return true;
  if (state.stopPromise) return state.stopPromise;
  state.stopPromise = (async () => {
    state.closed = true;
    await state.operationTail.catch(() => undefined);
    state.activeRoute = null;
    destroyVehicle(state);
    await restoreUniform(state.player, state);
    safeCall(state.player, "client:armoredCollector:clear");
    if (workers.get(Number(state.player.id)) === state) workers.delete(Number(state.player.id));
    return true;
  })();
  return state.stopPromise;
}

async function joinArmoredCollector(player) {
  if (startsInFlight.has(player)) return false;
  startsInFlight.add(player);
  let assigned = false;
  let state = null;
  try {
    await previousRuntimeShutdown;
    if (!isNear(player, config.npc.position, config.npc.colshapeRadius + 1.5)) throw new Error("Подойдите к диспетчеру Gruppe 6.");
    if (player.vehicle) throw new Error("Выйдите из транспорта, чтобы начать смену.");
    if (isShiftActive(player)) {
      pushTablet(getState(player));
      notify(player, "Смена инкассатора уже активна.", "info");
      return true;
    }
    await requireEligibility(player);
    if (!spawnAreaFree()) throw new Error("Место выдачи фургона занято. Освободите площадку.");
    await employment.assignJob(player, config.jobId);
    assigned = true;
    const characterUuid = Number(getUuid(player));
    let bucket = rotationBucket();
    const [profile, initialCompletedRouteIds] = await Promise.all([
      repository.getProfile(characterUuid),
      repository.getCompletedRouteIds(characterUuid, bucket),
    ]);
    let completedRouteIds = initialCompletedRouteIds;
    const latestBucket = rotationBucket();
    if (latestBucket !== bucket) {
      bucket = latestBucket;
      completedRouteIds = await repository.getCompletedRouteIds(characterUuid, bucket);
    }
    state = createState(player, profile, completedRouteIds, bucket);
    workers.set(Number(player.id), state);
    applyUniform(player, state);
    spawnWorkVehicle(state);
    pushTablet(state);
    pushRoute(state);
    pushCarry(state);
    notify(player, "Смена начата. Выберите маршрут в приложении инкассатора.", "success");
    return true;
  } catch (error) {
    if (state) await stopRuntime(player, { reason: "start-failed" });
    if (assigned) {
      try { await employment.clearJob(player, config.jobId, { reason: "start-failed" }); } catch {}
    }
    notify(player, error?.message || "Не удалось начать смену.", "error");
    return false;
  } finally {
    startsInFlight.delete(player);
  }
}

async function leaveArmoredCollector(player, options = {}) {
  try {
    const state = getState(player);
    if (state?.activeRoute && options.force !== true) {
      throw new Error("Сначала отмените активный маршрут в планшете. За отмену будет списан штраф.");
    }
    const result = await employment.clearJob(player, config.jobId, { reason: options.reason || "job-leave" });
    if (!result.cleared) await stopRuntime(player, { reason: options.reason || "job-leave" });
    if (!options.silent) notify(player, "Смена инкассатора завершена.", "success");
    return true;
  } catch (error) {
    notify(player, error?.message || "Не удалось завершить смену.", "error");
    return false;
  }
}

async function cancelRoute(player, raw) {
  const state = getState(player);
  if (!allowEvent(state, "cancelRoute", 1500)) return;
  const payload = parsePayload(raw);
  return serialize(state, async () => {
    try {
      const active = state.activeRoute;
      if (!active) throw new Error("Активного маршрута нет.");
      const expectedRouteId = String(payload.routeId || "").slice(0, 32);
      const expectedRunId = String(payload.runId || "").slice(0, 48);
      if (expectedRouteId !== active.route.routeId || expectedRunId !== active.runId) {
        throw new Error("Маршрут уже изменился. Обновите приложение.");
      }

      const requestedFee = economy.cancellationFee(active);
      const result = await repository.cancelRun(state.characterUuid, {
        runId: active.runId,
        routeId: active.route.routeId,
        rotationBucket: active.rotationBucket,
        bagsLoaded: active.bagsLoaded,
        distanceM: active.route.distanceM,
        targetSeconds: active.route.targetSeconds,
        basePay: active.route.basePay,
        startedAt: active.selectedAt,
      }, requestedFee);

      const cancelledRouteId = active.route.routeId;
      state.usedRouteIds.add(cancelledRouteId);
      state.activeRoute = null;
      state.suspiciousTravelEvents = 0;
      state.integrityBlockedUntil = 0;
      syncCash(player, result.cashAfter);
      pushCarry(state);
      pushRoute(state);
      pushTablet(state);

      if (!result.alreadyCancelled && result.chargedFee > 0) {
        logsDb.writeMoneyLog({
          source: "job_armored_collector",
          action: "route_cancellation_fee",
          currency: "cash",
          amount: -Number(result.chargedFee || 0),
          balanceBefore: result.cashBefore,
          balanceAfter: result.cashAfter,
          target: player,
          targetUuid: state.characterUuid,
          comment: `Отмена маршрута ${cancelledRouteId}`,
          metadata: {
            runId: active.runId,
            requestedFee: result.requestedFee,
            chargedFee: result.chargedFee,
            bagsLoaded: active.bagsLoaded,
          },
        }).catch((error) => console.error("[ARMORED COLLECTOR] Cancellation money log failed:", error));
      }

      if (result.resultStatus === "completed") {
        notify(player, "Маршрут уже был завершён. Повторное действие не выполнено.", "warning");
      } else if (result.alreadyCancelled) {
        notify(player, "Маршрут уже отменён. Повторное списание не выполнено.", "warning");
      } else if (result.chargedFee < result.requestedFee) {
        notify(player, `Маршрут отменён. Списан доступный остаток: $${result.chargedFee} из штрафа $${result.requestedFee}.`, "warning");
      } else {
        notify(player, `Маршрут отменён. Списан штраф: $${result.chargedFee}.`, "warning");
      }
    } catch (error) {
      pushTablet(state, error?.message || "Не удалось отменить маршрут.");
      notify(player, error?.message || "Не удалось отменить маршрут.", "error");
    }
  });
}

function ensureRouteIntegrity(state) {
  if (getAdminLevel(state.player) > 0) {
    state.suspiciousTravelEvents = 0;
    state.integrityBlockedUntil = 0;
    state.lastPosition = positionOf(state.player);
    state.lastSampleAt = Date.now();
    return true;
  }
  const remainingMs = Number(state.integrityBlockedUntil || 0) - Date.now();
  if (remainingMs > 0) {
    throw new Error(`Обнаружено резкое перемещение. Маршрут сохранён; повторите действие через ${Math.ceil(remainingMs / 1000)} сек.`);
  }
  state.suspiciousTravelEvents = 0;
  state.integrityBlockedUntil = 0;
  return true;
}

async function selectRoute(player, raw) {
  const state = getState(player);
  if (!allowEvent(state, "selectRoute", 800)) return;
  const payload = parsePayload(raw);
  try {
    if (state.activeRoute) throw new Error("Сначала завершите текущий маршрут.");
    if (!isOwnVehicleDriver(state)) throw new Error("Выбор маршрута доступен за рулём своего фургона.");
    if (!isNear(state.vehicle, config.vehicle.spawn, config.interaction.selectAtBaseRadius)) {
      throw new Error("Новый маршрут можно выбрать только на базе Gruppe 6.");
    }
    const bucket = rotationBucket();
    if (String(payload.revision || "") !== String(bucket)) throw new Error("Список маршрутов обновился. Обновите приложение.");
    const routeId = String(payload.routeId || "").slice(0, 32);
    if (state.usedRouteIds.has(routeId)) throw new Error("Этот маршрут уже выполнен в текущей ротации.");
    const template = routesForBucket(bucket).find((route) => route.id === routeId);
    if (!template) throw new Error("Маршрут больше недоступен.");
    const route = buildRoute(template, state.profile);
    state.activeRoute = {
      runId: `acr_${crypto.randomBytes(16).toString("hex")}`,
      rotationBucket: bucket,
      route,
      stage: "to_pickup",
      selectedAt: Date.now(),
      bagsLoaded: 0,
      carrying: false,
      lastBagPickedAt: 0,
    };
    state.suspiciousTravelEvents = 0;
    state.integrityBlockedUntil = 0;
    state.lastPosition = positionOf(player);
    state.lastSampleAt = Date.now();
    pushRoute(state);
    pushTablet(state);
    notify(player, "Маршрут принят. GPS построен до точки инкассации.", "success");
  } catch (error) {
    pushTablet(state, error?.message || "Не удалось выбрать маршрут.");
    notify(player, error?.message || "Не удалось выбрать маршрут.", "error");
  }
}

async function pickupBag(player) {
  const state = getState(player);
  if (!allowEvent(state, "pickupBag", 1250)) return;
  try {
    const active = state.activeRoute;
    if (!active || !["to_pickup", "collecting"].includes(active.stage)) throw new Error("Нет активной точки инкассации.");
    ensureRouteIntegrity(state);
    if (active.carrying) throw new Error("Сначала загрузите текущий мешок в фургон.");
    if (active.bagsLoaded >= active.route.bags) throw new Error("Все мешки уже загружены.");
    if (player.vehicle) throw new Error("Выйдите из фургона и подойдите к точке.");
    if (!isNear(player, active.route.pickup, config.interaction.pickupRadius)) throw new Error("Подойдите ближе к точке инкассации.");
    if (!vehicleExists(state.vehicle) || distance(positionOf(state.vehicle), active.route.pickup) > config.interaction.pickupVehicleRadius) {
      throw new Error("Подгоните свой служебный фургон к точке.");
    }
    if (vehicleSpeed(state.vehicle) > config.interaction.maximumVehicleSpeedMps) throw new Error("Остановите фургон.");
    const firstLegM = distance(config.vehicle.spawn, active.route.pickup) * config.economy.roadDistanceMultiplier;
    const earliestArrival = active.selectedAt + firstLegM / config.interaction.hardMinimumTravelMps * 1000;
    if (getAdminLevel(player) < 1 && Date.now() < earliestArrival) {
      throw new Error("Слишком быстрое прибытие: дождитесь проверки маршрута.");
    }
    active.stage = "collecting";
    active.carrying = true;
    active.lastBagPickedAt = Date.now();
    pushCarry(state);
    pushRoute(state);
    pushTablet(state);
  } catch (error) { notify(player, error?.message || "Не удалось взять мешок.", "error"); }
}

async function loadBag(player) {
  const state = getState(player);
  if (!allowEvent(state, "loadBag", 1250)) return;
  try {
    const active = state.activeRoute;
    if (!active || active.stage !== "collecting" || !active.carrying) throw new Error("У вас нет мешка для погрузки.");
    ensureRouteIntegrity(state);
    if (player.vehicle) throw new Error("Загрузите мешок в фургон снаружи.");
    if (!vehicleExists(state.vehicle) || distance(positionOf(player), positionOf(state.vehicle)) > config.interaction.loadVehicleRadius) {
      throw new Error("Подойдите к своему служебному фургону.");
    }
    if (distance(positionOf(state.vehicle), active.route.pickup) > config.interaction.pickupVehicleRadius) {
      throw new Error("Фургон должен оставаться у точки инкассации.");
    }
    if (vehicleSpeed(state.vehicle) > config.interaction.maximumVehicleSpeedMps) throw new Error("Остановите фургон.");
    if (Date.now() - active.lastBagPickedAt < 1200) throw new Error("Дождитесь завершения анимации погрузки.");
    active.carrying = false;
    active.bagsLoaded += 1;
    active.stage = active.bagsLoaded >= active.route.bags ? "to_unload" : "collecting";
    pushCarry(state);
    pushRoute(state);
    pushTablet(state);
    notify(player, active.stage === "to_unload"
      ? "Все мешки загружены. GPS перестроен до хранилища Gruppe 6."
      : `Мешок загружен: ${active.bagsLoaded}/${active.route.bags}.`, "success");
  } catch (error) { notify(player, error?.message || "Не удалось загрузить мешок.", "error"); }
}

async function unload(player) {
  const state = getState(player);
  if (!allowEvent(state, "unload", 1500)) return;
  return serialize(state, async () => {
    try {
      const active = state.activeRoute;
      if (!active || active.stage !== "to_unload") throw new Error("В фургоне нет полного груза для разгрузки.");
      ensureRouteIntegrity(state);
      if (active.carrying || active.bagsLoaded !== active.route.bags) throw new Error("Сначала загрузите все мешки.");
      if (player.vehicle) throw new Error("Выйдите из фургона для разгрузки.");
      if (!isNear(player, config.unload.position, config.interaction.unloadRadius)) throw new Error("Подойдите к зоне разгрузки.");
      if (!vehicleExists(state.vehicle) || distance(positionOf(state.vehicle), config.unload.position) > config.interaction.unloadVehicleRadius) {
        throw new Error("Пригоните свой служебный фургон к разгрузке.");
      }
      if (vehicleSpeed(state.vehicle) > config.interaction.maximumVehicleSpeedMps) throw new Error("Остановите фургон.");
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - active.selectedAt) / 1000));
      const minimumSeconds = active.route.distanceM / config.interaction.hardMinimumTravelMps + active.route.bags * 2.4;
      if (getAdminLevel(player) < 1 && elapsedSeconds < minimumSeconds) {
        throw new Error("Маршрут пройден за невозможное время.");
      }
      active.stage = "unloading";
      pushRoute(state);
      pushTablet(state);
      const trophyMultiplier = await jobRewardMultiplier.getMultiplier(player, "armored_collector");
      const result = await repository.settleRun(state.characterUuid, {
        runId: active.runId,
        routeId: active.route.routeId,
        rotationBucket: active.rotationBucket,
        bags: active.route.bags,
        distanceM: active.route.distanceM,
        targetSeconds: active.route.targetSeconds,
        elapsedSeconds,
        startedAt: active.selectedAt,
        suspicious: false,
        payoutMultiplier: trophyMultiplier,
      });
      if (result.resultStatus === "cancelled") throw new Error("Этот маршрут уже был отменён и не может быть оплачен.");
      const completedRouteId = active.route.routeId;
      state.profile = result.profile;
      state.usedRouteIds.add(completedRouteId);
      state.activeRoute = null;
      state.suspiciousTravelEvents = 0;
      state.integrityBlockedUntil = 0;
      syncCash(player, result.cashAfter);
      pushCarry(state);
      pushRoute(state);
      pushTablet(state);
      if (!result.alreadySettled) {
        logsDb.writeMoneyLog({
          source: "job_armored_collector",
          action: "route_payout",
          currency: "cash",
          amount: result.payout.finalPayout,
          balanceBefore: result.cashBefore,
          balanceAfter: result.cashAfter,
          target: player,
          targetUuid: state.characterUuid,
          comment: `Маршрут ${completedRouteId}`,
          metadata: { runId: active.runId, ...result.payout, elapsedSeconds },
        }).catch((error) => console.error("[ARMORED COLLECTOR] Money log failed:", error));
      }
      const levelText = result.profile.level > Number(result.oldLevel || result.profile.level)
        ? ` Новый уровень: ${result.profile.level}.`
        : "";
      notify(player, result.alreadySettled
        ? "Этот маршрут уже был оплачен в текущей ротации. Повторная выплата не начислена."
        : `Маршрут завершён: $${result.payout.finalPayout}, +${result.payout.xpEarned} XP.${levelText}`, result.alreadySettled ? "warning" : "success");
    } catch (error) {
      if (state.activeRoute?.stage === "unloading") {
        state.activeRoute.stage = "to_unload";
        pushRoute(state);
        pushTablet(state, error?.message || "Не удалось разгрузить фургон.");
      }
      notify(player, error?.message || "Не удалось разгрузить фургон.", "error");
    }
  });
}

async function terminateShift(state, reason, message) {
  if (!state || state.closed || state.terminationPending) return;
  state.terminationPending = true;
  notify(state.player, message, "error");
  try {
    await employment.clearJob(state.player, config.jobId, { reason });
    if (getState(state.player) === state) await stopRuntime(state.player, { reason });
  } catch (error) {
    state.terminationPending = false;
    console.error("[ARMORED COLLECTOR] Automatic shift termination failed:", error);
  }
}

function sampleState(state, now) {
  if (!state || state.closed || !playerExists(state.player)) return;
  if (!vehicleExists(state.vehicle)) {
    terminateShift(state, "work-vehicle-missing", "Служебный фургон утрачен. Смена завершена.");
    return;
  }

  if (state.player.vehicle === state.vehicle) {
    if (state.outsideVehicleSince) safeCall(state.player, "client:armoredCollector:clearVehicleLeaveTimer");
    state.outsideVehicleSince = 0;
    state.outsideWarnings.clear();
  } else {
    if (!state.outsideVehicleSince) {
      state.outsideVehicleSince = now;
      safeCall(state.player, "client:armoredCollector:vehicleLeaveTimer", [JSON.stringify({
        startedAt: state.outsideVehicleSince,
        expiresAt: state.outsideVehicleSince + config.vehicleAbsenceTimeoutMs,
      })]);
    }
    const absentMs = now - state.outsideVehicleSince;
    for (const [threshold, label] of [[4 * 60 * 1000, "1 минута"], [4.5 * 60 * 1000, "30 секунд"]]) {
      if (absentMs >= threshold && !state.outsideWarnings.has(threshold)) {
        state.outsideWarnings.add(threshold);
        notify(state.player, `Вернитесь в свой фургон. До завершения смены: ${label}.`, "warning");
      }
    }
    if (absentMs >= config.vehicleAbsenceTimeoutMs) {
      terminateShift(state, "vehicle-absence-timeout", "Вы были вне своего служебного фургона больше 5 минут. Смена завершена.");
      return;
    }
  }

  const currentPosition = positionOf(state.player);
  const elapsed = Math.max(0.001, (now - state.lastSampleAt) / 1000);
  const traveled = distance(currentPosition, state.lastPosition);
  if (state.activeRoute && getAdminLevel(state.player) < 1
    && traveled > 100 && traveled / elapsed > config.interaction.maximumPlausibleTravelMps) {
    state.suspiciousTravelEvents += 1;
    state.integrityBlockedUntil = Math.max(Number(state.integrityBlockedUntil || 0), now + 10_000);
  }
  state.lastPosition = currentPosition;
  state.lastSampleAt = now;

  const bucket = rotationBucket(now);
  if (bucket !== state.rotationBucket) pushTablet(state);
}

registerEvent("server:armoredCollector:interact", (player, raw) => {
  const payload = parsePayload(raw);
  const action = String(payload.action || raw || "").toLowerCase();
  if (["leave", "stop", "quit"].includes(action) || (!action && isShiftActive(player))) {
    leaveArmoredCollector(player).catch((error) => console.error("[ARMORED COLLECTOR] Leave failed:", error));
  } else {
    joinArmoredCollector(player).catch((error) => console.error("[ARMORED COLLECTOR] Join failed:", error));
  }
});

registerEvent("server:armoredCollector:tablet:request", (player) => {
  const state = getState(player);
  if (!allowEvent(state, "tablet", 400)) return;
  pushTablet(state);
  pushRoute(state);
});

registerEvent("server:armoredCollector:selectRoute", (player, raw) => {
  selectRoute(player, raw).catch((error) => console.error("[ARMORED COLLECTOR] Select route failed:", error));
});
registerEvent("server:armoredCollector:cancelRoute", (player, raw) => {
  cancelRoute(player, raw).catch((error) => console.error("[ARMORED COLLECTOR] Cancel route failed:", error));
});
registerEvent("server:armoredCollector:pickupBag", (player) => {
  pickupBag(player).catch((error) => console.error("[ARMORED COLLECTOR] Pickup failed:", error));
});
registerEvent("server:armoredCollector:loadBag", (player) => {
  loadBag(player).catch((error) => console.error("[ARMORED COLLECTOR] Load failed:", error));
});
registerEvent("server:armoredCollector:unload", (player) => {
  unload(player).catch((error) => console.error("[ARMORED COLLECTOR] Unload failed:", error));
});

registerEvent("playerDeath", (player) => {
  const state = getState(player);
  if (state) terminateShift(state, "player-death", "После гибели персонажа смена инкассатора завершена.");
});

registerEvent("vehicleDeath", (vehicle) => {
  for (const state of workers.values()) {
    if (state.vehicle === vehicle) {
      terminateShift(state, "vehicle-destroyed", "Служебный фургон уничтожен. Смена завершена.");
      break;
    }
  }
});

registerEvent("playerQuit", (player) => {
  const state = getState(player);
  if (!state) return;
  employment.clearJob(player, config.jobId, { reason: "playerQuit" })
    .then(() => { if (getState(player) === state) return stopRuntime(player, { reason: "playerQuit" }); })
    .catch((error) => console.error("[ARMORED COLLECTOR] Quit cleanup failed:", error));
});

registerEvent("twinkle:character:loaded", (player) => {
  setTimeout(() => {
    if (!runtime.active || !playerExists(player) || player.__activeJob !== config.jobId || getState(player)) return;
    employment.clearJob(player, config.jobId, { reason: "session-login-reset" })
      .then(() => safeCall(player, "client:armoredCollector:clear"))
      .catch((error) => console.error("[ARMORED COLLECTOR] Stale shift cleanup failed:", error));
  }, 600);
});

employment.registerRuntimeCleanup(config.jobId, (player, context) =>
  stopRuntime(player, { reason: context?.reason || "employment-change" }), { replace: true });

addInterval(() => {
  const now = Date.now();
  for (const state of workers.values()) sampleState(state, now);
}, config.sampleIntervalMs);

previousRuntimeShutdown
  .then(() => repository.ensureSchema())
  .then(() => {
    schemaReady = true;
    schemaError = null;
    console.log(`[ARMORED COLLECTOR] Ready: ${config.offersPerRotation} routes per ${config.refreshMs / 60000} minutes`);
  })
  .catch((error) => {
    schemaReady = false;
    schemaError = error;
    console.error("[ARMORED COLLECTOR] Disabled because SQL schema is unavailable:", error);
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

    const states = [...workers.values()];
    const results = await Promise.allSettled(states.map(async (state) => {
      const player = state.player;
      await stopState(state, { reason: "shutdown" });
      if (Number(getUuid(player)) !== state.characterUuid) {
        await db.query(
          "DELETE FROM character_jobs WHERE character_uuid = ? AND job_id = ?",
          [state.characterUuid, config.jobId]
        );
        return;
      }
      try {
        const cleared = await employment.clearJob(player, config.jobId, { reason: "shutdown" });
        if (!cleared.cleared) await employment.restorePlayer(player);
      } catch (error) {
        console.error(`[ARMORED COLLECTOR] Employment shutdown cleanup failed for ${state.characterUuid}:`, error);
        await db.query(
          "DELETE FROM character_jobs WHERE character_uuid = ? AND job_id = ?",
          [state.characterUuid, config.jobId]
        );
        if (Number(getUuid(player)) === state.characterUuid) await employment.restorePlayer(player);
      }
    }));
    results.forEach((result) => {
      if (result.status === "rejected") console.error("[ARMORED COLLECTOR] Worker shutdown cleanup failed:", result.reason);
    });
    workers.clear();
  })();
  return runtime.shutdownPromise;
};

module.exports = {
  buildTabletPayload,
  isShiftActive,
  joinArmoredCollector,
  leaveArmoredCollector,
};
