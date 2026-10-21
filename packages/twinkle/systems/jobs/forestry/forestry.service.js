"use strict";

const crypto = require("crypto");
const config = require("./forestry.config.js");
const repository = require("./forestry.repository.js");
const employment = require("../jobEmployment.service.js");
const jobRewardMultiplier = require("../jobRewardMultiplier.service.js");
const inventory = require("../../inventory/inventory.service.js");
const documents = require("../../documents/document.service.js");
const { DOCUMENT_ITEM_IDS } = require("../../documents/document.items.js");
const licenses = require("../../licenses/license.service.js");
const logsDb = require("../../../database/logs.js");
const quests = require("../../quests/quest.service.js");
const chat = require("../../chat/chat.service.js");
const db = require("../../../database/query.js");
const { applyCharacterAppearance } = require("../../../characters/appearance.js");
const { getUuid, rows } = require("../../../utils/player.js");

const previousForestryRuntime = global.__twinkleForestryRuntime;
const previousRuntimeShutdown = Promise.resolve()
  .then(() => previousForestryRuntime?.shutdown?.())
  .catch((error) => console.error("[FORESTRY] Previous runtime shutdown failed:", error));
const runtime = { active: true, events: [], timers: [], shutdown: null, shutdownPromise: null, vehicleSpawnReserved: false };
global.__twinkleForestryRuntime = runtime;

const workers = new Map();
const stateCreations = new WeakMap();
const trees = new Map();
const safeZoneState = new WeakMap();
let schemaReady = false;
let cycle = Date.now();
let stockSnapshot = { totalKg: 0 };

function playerExists(player) {
  try { return Boolean(player && mp.players.exists(player)); } catch { return false; }
}
function vehicleExists(vehicle) {
  try { return Boolean(vehicle && mp.vehicles.exists(vehicle)); } catch { return false; }
}
function positionOf(entity) {
  try { const p = entity?.position; return p ? { x: Number(p.x), y: Number(p.y), z: Number(p.z) } : null; } catch { return null; }
}
function distance(left, right) {
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y), Number(left.z) - Number(right.z));
}
function isInsideZone(position, dimension = 0) {
  const zone = config.zone;
  return Boolean(position && Number(dimension) === zone.dimension
    && position.x >= zone.minX && position.x <= zone.maxX && position.y >= zone.minY && position.y <= zone.maxY
    && position.z >= zone.minZ && position.z <= zone.maxZ);
}
function isInsideShiftArea(position, dimension = 0) {
  const zone = config.zone;
  const padding = Math.max(0, Number(config.shiftBoundaryPaddingM || 0));
  return Boolean(position && Number(dimension) === zone.dimension
    && position.x >= zone.minX - padding && position.x <= zone.maxX + padding
    && position.y >= zone.minY - padding && position.y <= zone.maxY + padding
    && position.z >= zone.minZ - padding && position.z <= zone.maxZ + padding);
}
const forestryCombatGuard = (player) => Boolean(runtime.active && playerExists(player)
  && isInsideZone(positionOf(player), player.dimension));
global.__twinkleForestryCombatGuard = forestryCombatGuard;
function safeCall(player, name, args = []) {
  if (!playerExists(player)) return;
  try { player.call(name, args); } catch {}
}
function syncHeldVisual(state, kind = null, tool = null) {
  const player = state?.player;
  if (!playerExists(player)) return;
  let descriptor = null;
  let animation = null;
  if (kind === "logs") {
    descriptor = {
      kind: "logs", model: config.cargoVisual.models[0], bone: config.cargoVisual.bone,
      position: [...config.cargoVisual.position], rotation: [...config.cargoVisual.rotation],
    };
    animation = config.cargoVisual.animation;
  } else if (kind === "tool" && tool) {
    const golden = tool.id === "golden_axe";
    descriptor = golden
      ? { kind: "tool", model: "prop_tool_fireaxe", bone: 57005, position: [0.11, 0.03, -0.02], rotation: [-79, 11, 31] }
      : { kind: "tool", model: "prop_tool_consaw", bone: 57005, position: [0.09, 0.01, -0.02], rotation: [-93, 7, 24] };
    animation = golden
      ? { dictionary: "melee@large_wpn@streamed_core", name: "ground_attack_on_spot", flags: 49 }
      : { dictionary: "amb@world_human_const_drill@male@drill@base", name: "base", flags: 49 };
  }
  try { player.setVariable("forestryHeldProp", descriptor ? JSON.stringify(descriptor) : null); } catch {}
  if (animation) {
    try { player.playAnimation(animation.dictionary, animation.name, 1, animation.flags); } catch {}
  } else {
    try { player.stopAnimation?.(); } catch {}
  }
}
function notify(player, message, variant = "info") {
  const fn = variant === "error" ? chat.sendError : variant === "success" ? chat.sendSuccess : variant === "warning" ? chat.sendWarning : chat.sendInfo;
  try { fn(player, String(message)); } catch {}
}
function securityViolation(state, code, data = {}) {
  if (!state || !playerExists(state.player)) return;
  const now = Date.now();
  state.securityScore = Math.max(0, Number(state.securityScore || 0)) + 1;
  if (now - Number(state.lastSecurityLogAt || 0) < 5000) return;
  state.lastSecurityLogAt = now;
  logsDb.writeLog({
    type: "forestry/security",
    level: state.securityScore >= 4 ? "warning" : "info",
    player: state.player,
    message: String(code || "invalid_action"),
    data: { score: state.securityScore, ...data },
  }).catch(() => {});
}
function announceToWorkingLumberjacks(message, color = "#f3c969") {
  for (const state of workers.values()) {
    if (!hasActiveForestryShift(state?.player, state)) continue;
    try {
      chat.sendToPlayer(state.player, String(message), color, { channelType: "server", author: "Лесопилка" });
    } catch {}
  }
}
function parsePayload(raw, maximumBytes = 512) {
  if (typeof raw === "object" && raw !== null) return raw;
  const text = String(raw || "");
  if (!text || Buffer.byteLength(text, "utf8") > maximumBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}
function registerEvent(name, handler) {
  const guarded = (...args) => runtime.active && handler(...args);
  runtime.events.push({ name, handler: guarded });
  mp.events.add(name, guarded);
  return guarded;
}
function addInterval(handler, interval) {
  const timer = setInterval(() => runtime.active && handler(), interval);
  timer.unref?.(); runtime.timers.push(timer); return timer;
}
function addTimeout(handler, delay) {
  const timer = setTimeout(() => {
    const index = runtime.timers.indexOf(timer); if (index >= 0) runtime.timers.splice(index, 1);
    if (runtime.active) handler();
  }, delay);
  timer.unref?.(); runtime.timers.push(timer); return timer;
}
function syncCash(player, amount) {
  const cash = Math.max(0, Number(amount || 0));
  for (const target of [player, player?.character, player?.characterData]) {
    if (!target) continue;
    try { target.cash = cash; } catch {}
  }
  try { player.setVariable?.("cash", cash); } catch {}
  safeCall(player, "client:money:update", [cash]);
  safeCall(player, "c:hud:update", [JSON.stringify({ player: { cash } })]);
}
function getState(player) {
  const state = workers.get(Number(player?.id));
  return state && state.player === player && state.characterUuid === Number(getUuid(player) || 0) ? state : null;
}
function hasForestryShiftMarker(player) {
  const characterUuid = Number(getUuid(player) || 0);
  return Boolean(characterUuid > 0
    && player.__activeJob === "forestry"
    && Number(player.__forestryShiftStartedForUuid || 0) === characterUuid);
}
function hasActiveForestryShift(player, state = getState(player)) {
  return Boolean(state && hasForestryShiftMarker(player));
}
function getWorkingState(player) {
  const state = getState(player);
  return hasActiveForestryShift(player, state) ? state : null;
}
function playerByUuid(uuid) {
  let found = null;
  try { mp.players.forEach((player) => { if (!found && playerExists(player) && Number(getUuid(player) || 0) === Number(uuid)) found = player; }); } catch {}
  return found;
}
function serialize(state, operation, options = {}) {
  if (!state || state.closed) return Promise.resolve();
  if (state.pendingOperations >= 64) {
    if (!options.silent) notify(state.player, "Слишком много запросов. Подождите секунду.", "error");
    return Promise.resolve();
  }
  state.pendingOperations += 1;
  const current = state.operationTail.catch(() => undefined).then(() => runtime.active && !state.closed ? operation() : undefined);
  state.operationTail = current.finally(() => { state.pendingOperations = Math.max(0, state.pendingOperations - 1); });
  return current;
}
async function requirePassport(player) {
  const [physical, record] = await Promise.all([documents.hasDocumentItem(player, DOCUMENT_ITEM_IDS.identity), documents.getIdentityDocument(player)]);
  if (!physical || !record) throw new Error("Для работы нужна оформленная ID-карта в инвентаре.");
}
async function requireVehicleLicense(player, vehicleConfig) {
  const [owned, physical] = await Promise.all([licenses.hasLicense(player, vehicleConfig.license), licenses.hasLicenseDocumentItem(player, vehicleConfig.license)]);
  let valid = owned && physical;
  if (!valid && vehicleConfig.license === "cdl_b") valid = (await licenses.hasLicense(player, "cdl_a")) && (await licenses.hasLicenseDocumentItem(player, "cdl_a"));
  if (!valid) throw new Error(`Нужны действующие права ${vehicleConfig.license.toUpperCase()} (или выше) и документ в инвентаре.`);
}

function entitlementMap(entries) {
  const result = {};
  for (const entry of entries || []) if (entry.remainingMs > 0) {
    result[entry.type] = { remainingMs: entry.remainingMs, itemUid: entry.itemUid, payload: entry.payload || {} };
  }
  return result;
}
function activeTool(state) {
  if (state.entitlements.golden_axe?.remainingMs > 0) return config.entitlements.golden_axe;
  if (state.entitlements.chainsaw?.remainingMs > 0) return config.entitlements.chainsaw;
  return null;
}
async function requireOwnedForestryTool(state) {
  const definition = activeTool(state);
  if (!definition) throw new Error("Арендуйте бензопилу или золотой топор у бригадира.");
  const entitlement = state.entitlements[definition.id];
  if (!entitlement?.itemUid) throw new Error("Рабочий инструмент отсутствует в инвентаре.");
  const owned = await inventory.getOwnedItemByUid(state.player, entitlement.itemUid, definition.itemId);
  if (!owned || String(owned.documentKey || "") !== "forestry:entitlement:" + definition.id) {
    throw new Error("Экземпляр рабочего инструмента недействителен.");
  }
  return definition;
}
function currentYieldMultiplier(state, tool = activeTool(state)) {
  const stimulant = state.entitlements.stimulant?.remainingMs > 0 ? config.stimulant.yieldMultiplier : 1;
  return Math.min(config.yieldMultiplierCap, Number(tool.yieldMultiplier || 1) * stimulant);
}
function publicProfile(profile) {
  return { xp: profile.xp, level: profile.level, levelName: profile.levelName, yieldMultiplier: profile.yieldMultiplier,
    treesCut: profile.treesCut, logsDelivered: profile.logsDelivered, logsLost: profile.logsLost,
    haulTrips: profile.haulTrips, fastDeliveries: profile.fastDeliveries,
    totalEarned: profile.totalEarned, secretSawClaimed: profile.secretSawClaimed };
}
function publicCargo(cargo) {
  return cargo ? { id: cargo.id, kind: cargo.kind, resourceId: cargo.resourceId, resourceName: cargo.resourceName,
    kg: cargo.kg, payout: cargo.payout, destination: cargo.destination } : null;
}
function statePayload(state) {
  return {
    profile: publicProfile(state.profile),
    entitlements: Object.fromEntries(Object.entries(state.entitlements).map(([key, value]) => [key, { remainingMs: Math.max(0, Math.round(value.remainingMs)), payload: value.payload || {} }])),
    cargo: state.cargo?.kind === "logs" ? publicCargo(state.cargo) : null,
    haulCargo: state.cargo?.kind === "haul" ? publicCargo(state.cargo) : null,
    haulVehicle: state.vehicleConfig ? { id: state.vehicleConfig.id, expiresInMs: Math.max(0, state.leaseExpiresAt - Date.now()) } : null,
    gpsEnabled: true,
    stock: { totalUnits: Math.max(0, Number(stockSnapshot.totalKg || 0)) },
  };
}
function sendState(state) {
  if (playerExists(state.player)) safeCall(state.player, "client:forestry:state", [JSON.stringify(statePayload(state))]);
}
async function refreshStock(broadcast = true) {
  stockSnapshot = await repository.getStock();
  if (broadcast) for (const state of workers.values()) sendState(state);
  return stockSnapshot;
}
function treePayload(tree) {
  return { id: tree.id, slot: tree.slot, position: tree.position, heading: tree.heading,
    resourceId: tree.resource.id, resourceName: tree.resource.name, color: tree.resource.color,
    locked: false };
}
function canSeeTree(state, tree) {
  if (!state || !tree || !hasActiveForestryShift(state.player, state)) return false;
  const expiresAt = Number(state.treeCooldowns?.get(Number(tree.slot)) || 0);
  if (expiresAt > Date.now()) return false;
  if (expiresAt) state.treeCooldowns.delete(Number(tree.slot));
  return true;
}
function broadcastTrees(player = null) {
  const send = (target) => {
    const state = getWorkingState(target);
    const origin = positionOf(target);
    const payload = state ? [...trees.values()]
      .filter((tree) => canSeeTree(state, tree))
      .sort((left, right) => distance(origin, left.position) - distance(origin, right.position))
      .slice(0, Math.max(1, Number(config.clientTreeWindowSize || 24)))
      .map(treePayload) : [];
    const byteLimit = Math.max(1024, Number(config.clientTreePacketBytes || 6000));
    let encoded = JSON.stringify(payload);
    while (payload.length > 1 && Buffer.byteLength(encoded, "utf8") > byteLimit) {
      payload.pop();
      encoded = JSON.stringify(payload);
    }
    if (Buffer.byteLength(encoded, "utf8") > byteLimit) {
      console.error(`[FORESTRY] Tree sync payload exceeds ${byteLimit} bytes; sending an empty safe packet.`);
      encoded = "[]";
    }
    safeCall(target, "client:forestry:trees:set", [encoded]);
    if (state) {
      state.lastTreeSyncAt = Date.now();
      state.lastTreeSyncPosition = { x: Number(origin.x), y: Number(origin.y), z: Number(origin.z) };
    }
  };
  if (player) return send(player);
  try { mp.players.forEach(send); } catch {}
}
function chooseWeightedResource() {
  const total = config.treeTypes.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;
  return config.treeTypes.find((item) => (roll -= item.chance) <= 0) || config.treeTypes[0];
}
function spawnWave(size = config.refillWaveSize, announce = true) {
  if (!runtime.active || !schemaReady || trees.size >= config.activeTreeCap) return 0;
  const occupied = new Set([...trees.values()].map((tree) => tree.slot));
  const candidates = config.treePositions.filter((spot) => !occupied.has(spot.slot)
    && ![...trees.values()].some((tree) => distance(spot, tree.position) < config.activeTreeMinDistance));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const limit = Math.min(Number(size), config.activeTreeCap - trees.size);
  const selected = [];
  for (const spot of candidates) {
    if (selected.every((other) => distance(spot, other) >= config.activeTreeMinDistance)) selected.push(spot);
    if (selected.length >= limit) break;
  }
  const count = selected.length;
  for (const spot of selected) {
    const resource = chooseWeightedResource();
    const id = `${cycle}:${spot.slot}:${crypto.randomBytes(4).toString("hex")}`;
    trees.set(id, { id, cycle, slot: spot.slot, position: { x: spot.x, y: spot.y, z: spot.z },
      heading: spot.heading, resource, createdAt: Date.now() });
  }
  if (count) {
    broadcastTrees();
    if (announce) announceToWorkingLumberjacks(`Лесопилка обновилась: +${count} новых залежей, всего ${trees.size}. Следующая волна через 5 минут.`);
  }
  return count;
}

function captureUniform(player) {
  const snapshot = { clothes: [], props: [] };
  for (let component = 0; component < 12; component += 1) {
    try { const v = player.getClothes(component); snapshot.clothes.push({ component, drawable: Number(v?.drawable ?? v ?? 0), texture: Number(v?.texture ?? 0), palette: Number(v?.palette ?? 0) }); } catch {}
  }
  for (let prop = 0; prop < 8; prop += 1) {
    try { const v = player.getProp(prop); snapshot.props.push({ prop, drawable: Number(v?.drawable ?? v ?? -1), texture: Number(v?.texture ?? 0) }); } catch {}
  }
  return snapshot;
}
function applyUniform(player, state) {
  if (!playerExists(player)) return;
  if (!state.uniformSnapshot) state.uniformSnapshot = captureUniform(player);
  const storedGender = String(player.character?.gender || player.characterData?.gender || "").toLowerCase();
  const female = storedGender === "female" || (Number(player.model || 0) >>> 0) === (Number(mp.joaat?.("mp_f_freemode_01") || 0) >>> 0);
  // Apply each documented lumberjack outfit as one compatible set. Mixing torso,
  // undershirt and top drawables is what makes freemode arms/torso disappear.
  const clothes = female ? [[3, 44, 0], [4, 34, 0], [6, 27, 0], [8, 36, 1], [11, 48, 0]]
    : [[3, 41, 0], [4, 9, 7], [6, 27, 0], [8, 59, 0], [11, 56, 0]];
  try {
    [5, 7, 9, 10].forEach((component) => player.setClothes(component, 0, 0, 0));
    clothes.forEach(([component, drawable, texture]) => player.setClothes(component, drawable, texture, 0));
  } catch {}
  try { player.setProp(0, female ? 45 : 0, 0); } catch {}
}
async function restoreUniform(player, state) {
  if (!playerExists(player)) return false;
  const snapshot = state?.uniformSnapshot || null;
  if (state) state.uniformSnapshot = null;
  if (snapshot) try {
    snapshot.clothes.forEach((v) => player.setClothes(v.component, v.drawable, v.texture, v.palette));
    snapshot.props.forEach((v) => v.drawable < 0 ? player.clearProp(v.prop) : player.setProp(v.prop, v.drawable, v.texture));
  } catch {}

  try {
    const result = await db.query("SELECT * FROM characters WHERE uuid = ? LIMIT 1", [Number(getUuid(player) || 0)]);
    const character = rows(result)?.[0] || player.character || player.characterData;
    if (character) await applyCharacterAppearance(player, character);
    await inventory.restoreEquipment(player);
    return true;
  } catch (error) {
    console.error("[FORESTRY] Uniform restore failed:", error);
    return Boolean(snapshot);
  }
}
async function persistEntitlements(state, force = false) {
  if (!state || state.closed || (!force && Date.now() - state.lastPersistAt < 15000)) return;
  if (state.persistPromise) await state.persistPromise.catch(() => undefined);
  const snapshot = Object.entries(state.entitlements).map(([type, value]) => ({ type, remainingMs: Math.max(0, Math.round(value.remainingMs)), payload: value.payload || {} }));
  state.lastPersistAt = Date.now();
  state.persistPromise = Promise.all(snapshot.map((v) => repository.saveEntitlement(state.characterUuid, v.type, v.remainingMs, v.payload)))
    .finally(() => { state.persistPromise = null; });
  return state.persistPromise;
}
function makeState(player, profile, entitlements, cargo, treeCooldowns = new Map()) {
  const restoredHaulDistance = cargo?.kind === "haul" && cargo.destination
    ? distance(positionOf(player), cargo.destination) * Number(config.haul.roadDistanceMultiplier || 1)
    : 0;
  return { player, characterUuid: Number(getUuid(player)), profile, entitlements: entitlementMap(entitlements), cargo,
    cargoStartedAt: cargo?.kind === "logs" ? Date.now() : null,
    // A restored carried load starts a fresh, server-observed route from the login position.
    // Reusing the historical tree origin would make a legitimate relog impossible to validate.
    cargoOrigin: cargo?.kind === "logs" ? positionOf(player) : null,
    cargoTravelM: 0, cargoSuspiciousM: 0,
    treeCooldowns,
    challenge: null, operationTail: Promise.resolve(), pendingOperations: 0, inputWindowAt: 0, inputWindowCount: 0,
    lastTickAt: Date.now(), lastPosition: positionOf(player),
    lastTreeSyncAt: 0, lastTreeSyncPosition: null,
    lastPersistAt: Date.now(), persistPromise: null,
    uniformSnapshot: null, vehicle: null, trailer: null, trailerAttached: false, vehicleConfig: null, leaseExpiresAt: 0,
    haulRoute: null, haulStage: null, haulNonce: 0, haulStartedAt: cargo?.kind === "haul" ? Date.now() : 0,
    haulRequiredTravelM: cargo?.kind === "haul" ? Math.max(0, restoredHaulDistance * 0.72) : 0,
    haulMinimumTimeMs: cargo?.kind === "haul" ? Math.max(4000, restoredHaulDistance / Math.min(38, config.haul.maxPlausibleSpeedMps) * 1000) : 0,
    haulTravelM: 0, haulSuspiciousM: 0, lastStatePush: 0, expiring: new Set(), missingVehicleCleanup: false,
    rentalRestoreRetryCount: 0, rentalRestoreRetryScheduled: false,
    outsideZoneSince: 0, outsideZoneWarnings: new Set(), zoneTerminationPending: false, closed: false };
}
async function reconcileBasicTool(state, _active) {
  if (!state?.characterUuid) throw new Error("Персонаж не загружен.");
  const result = await repository.reconcileSecretSaw(state.characterUuid, Boolean(state.profile?.secretSawClaimed));
  if (result.inventory && playerExists(state.player)) {
    await inventory.syncInventorySnapshot(state.player, result.inventory);
  }
  return result;
}
function reconcileWorkerInventory(state) {
  if (!state || state.closed) return;
  serialize(state, async () => {
    const entries = await repository.getEntitlements(state.characterUuid);
    if (state.closed || !playerExists(state.player)) return;
    state.entitlements = entitlementMap(entries);
    await inventory.syncCurrentInventory(state.player).catch(() => false);
    sendState(state);
  }, { silent: true }).catch((error) => console.error("[FORESTRY] Deferred inventory reconciliation failed:", error));
  reconcileBasicTool(state, true).catch((error) => console.error("[FORESTRY] Deferred trophy reconciliation failed:", error));
}
async function createState(player) {
  const existing = getState(player); if (existing) return existing;
  const inflight = stateCreations.get(player); if (inflight) return inflight;
  const characterUuid = Number(getUuid(player) || 0);
  if (!characterUuid) throw new Error("Персонаж не загружен.");
  const creation = Promise.all([
    repository.getProfile(characterUuid),
    repository.getEntitlements(characterUuid, { reconcile: false }),
    repository.getActiveCargo(characterUuid),
    repository.getRecentTreeCooldowns(characterUuid, config.treeRespawnMs),
  ])
    .then(([profile, entitlements, cargo, treeCooldowns]) => {
      if (!runtime.active || !playerExists(player) || Number(getUuid(player) || 0) !== characterUuid) throw new Error("Игровая сессия изменилась.");
      const state = makeState(player, profile, entitlements, cargo, treeCooldowns);
      workers.set(Number(player.id), state);
      for (const [slot, expiresAt] of treeCooldowns) {
        const tree = [...trees.values()].find((entry) => Number(entry.slot) === Number(slot));
        if (tree) addTimeout(() => respawnTreeForPlayer(state, tree), Math.max(50, Number(expiresAt) - Date.now() + 50));
      }
      return state;
    }).finally(() => { if (stateCreations.get(player) === creation) stateCreations.delete(player); });
  stateCreations.set(player, creation); return creation;
}
function leaseEntry(state) {
  return Object.entries(state.entitlements).find(([type, value]) => type.startsWith("haul:") && value.remainingMs > 0) || null;
}
function findVehicleConfig(id) { return config.haulVehicles.find((entry) => entry.id === String(id || "")) || null; }
function destroyRental(state) {
  for (const entity of [state?.trailer, state?.vehicle]) try { if (vehicleExists(entity)) entity.destroy(); } catch {}
  if (!state) return;
  state.vehicle = null; state.trailer = null; state.trailerAttached = false; state.vehicleConfig = null; state.leaseExpiresAt = 0;
  state.haulRoute = null; state.haulStage = null; state.haulNonce += 1;
  safeCall(state.player, "client:forestry:haul:clear");
}

function spawnAreaFree(vehicleConfig = null, spawnPoints = null) {
  const vehiclePoint = spawnPoints?.vehicle || config.vehicleSpawn;
  const trailerPoint = spawnPoints?.trailer || config.trailerSpawn;
  let free = true;
  try {
    mp.vehicles.forEach((vehicle) => {
      if (!free) return;
      if (distance(positionOf(vehicle), vehiclePoint) < 7) free = false;
      if (vehicleConfig?.trailerModel && distance(positionOf(vehicle), trailerPoint) < 7) free = false;
    });
  } catch {}
  return free;
}
function setRentalMetadata(vehicle, state, role) {
  const trailer = role === "trailer";
  const fuel = Number(state.vehicleConfig.fuel || 100);
  const consumption = Number(state.vehicleConfig.fuelConsumption || (state.vehicleConfig.type === "truck" ? 2.5 : 1.7));
  try {
    vehicle.ownerType = "player"; vehicle.ownerId = state.characterUuid;
    vehicle.locked = false; vehicle.engine = !trailer;
    vehicle.fuel = fuel; vehicle.fuelMax = fuel; vehicle.fuelConsumption = consumption;
  } catch {}
  try {
    vehicle.setVariable("forestryRentalOwner", state.characterUuid);
    vehicle.setVariable("forestryRentalRole", role);
    vehicle.setVariable("ownerType", "player"); vehicle.setVariable("ownerId", state.characterUuid);
    vehicle.setVariable("locked", false); vehicle.setVariable("engine", !trailer);
    if (!trailer) {
      vehicle.setVariable("fuel", fuel); vehicle.setVariable("fuelMax", fuel);
      vehicle.setVariable("fuelType", "diesel"); vehicle.setVariable("fuelConsumption", consumption);
      vehicle.setVariable("mileage", 0);
    }
  } catch {}
}
function chooseHaulDestination() {
  const eligible = config.haulDestinations.filter((point) => distance(config.unloadPoint, point) >= config.haul.minDestinationDistanceM);
  return eligible[Math.floor(Math.random() * eligible.length)] || null;
}
function sendHaulRoute(state) {
  if (!state?.vehicleConfig) return;
  const point = state.cargo?.kind === "haul" && state.cargo.destination ? state.cargo.destination : config.unloadPoint;
  state.haulRoute = { phase: state.cargo?.kind === "haul" ? "unload" : "load", point, radius: config.haulRadius, company: point.company || "Склад древесины" };
  safeCall(state.player, "client:forestry:haul:route", [JSON.stringify(state.haulRoute)]);
}
function recoverySpawnPoints(state) {
  const position = positionOf(state?.player);
  if (!position) return null;
  const heading = Number(state.player?.heading || 0);
  const radians = heading * Math.PI / 180;
  const forward = { x: -Math.sin(radians), y: Math.cos(radians) };
  return {
    vehicle: { ...position, heading },
    trailer: { x: position.x - forward.x * 12, y: position.y - forward.y * 12, z: position.z, heading },
  };
}
async function spawnRental(state, vehicleConfig, remainingMs, spawnPoints = null) {
  if (!runtime.active || state.closed || !playerExists(state.player)) return false;
  const points = spawnPoints || { vehicle: config.vehicleSpawn, trailer: config.trailerSpawn };
  if (runtime.vehicleSpawnReserved || !spawnAreaFree(vehicleConfig, points)) throw new Error("Место выдачи занято. Освободите площадку.");
  runtime.vehicleSpawnReserved = true;
  let vehicle = null; let trailer = null;
  try {
    state.vehicleConfig = vehicleConfig;
    vehicle = mp.vehicles.new(mp.joaat(vehicleConfig.model), new mp.Vector3(points.vehicle.x, points.vehicle.y, points.vehicle.z), { heading: points.vehicle.heading, dimension: 0 });
    setRentalMetadata(vehicle, state, "tractor");
    if (vehicleConfig.trailerModel) {
      trailer = mp.vehicles.new(mp.joaat(vehicleConfig.trailerModel), new mp.Vector3(points.trailer.x, points.trailer.y, points.trailer.z), { heading: points.trailer.heading, dimension: 0 });
      setRentalMetadata(trailer, state, "trailer");
    }
    state.vehicle = vehicle; state.trailer = trailer; state.trailerAttached = false;
    state.leaseExpiresAt = Date.now() + Math.max(0, Number(remainingMs));
    try { vehicle.locked = false; state.player.putIntoVehicle(vehicle, 0); } catch {}
    sendHaulRoute(state); return true;
  } catch (error) {
    try { if (trailer && vehicleExists(trailer)) trailer.destroy(); } catch {}
    try { if (vehicle && vehicleExists(vehicle)) vehicle.destroy(); } catch {}
    state.vehicleConfig = null; throw error;
  } finally { runtime.vehicleSpawnReserved = false; }
}
async function restoreRental(state, options = {}) {
  const entry = leaseEntry(state);
  if (!entry) { if (state.vehicle || state.trailer || state.vehicleConfig) destroyRental(state); return; }
  const healthyRental = state.vehicleConfig && vehicleExists(state.vehicle)
    && (state.vehicleConfig.type !== "truck" || vehicleExists(state.trailer));
  if (healthyRental) { sendHaulRoute(state); return true; }
  if (state.vehicle || state.trailer || state.vehicleConfig) destroyRental(state);
  const vehicleConfig = findVehicleConfig(entry[1].payload?.vehicleId || entry[0].slice(5));
  if (!vehicleConfig) return;
  const spawnPoints = options.nearPlayer ? recoverySpawnPoints(state) : null;
  try {
    await spawnRental(state, vehicleConfig, entry[1].remainingMs, spawnPoints);
    state.rentalRestoreRetryCount = 0;
  }
  catch (error) {
    notify(state.player, `Аренда сохранена. Не удалось выдать транспорт: ${error.message}`, "warning");
    if (options.retry && state.cargo?.kind === "haul" && !state.rentalRestoreRetryScheduled
      && state.rentalRestoreRetryCount < 30) {
      state.rentalRestoreRetryScheduled = true;
      state.rentalRestoreRetryCount += 1;
      addTimeout(() => {
        state.rentalRestoreRetryScheduled = false;
        if (!state.closed && state.cargo?.kind === "haul" && !vehicleExists(state.vehicle)) {
          restoreRental(state, { nearPlayer: true, retry: true }).catch(() => {});
        }
      }, 10000);
    }
  }
}
async function shopPayload(state) {
  const selectedTool = activeTool(state)?.id || "";
  const equipment = [...Object.values(config.entitlements), { id: "stimulant", name: "Стимулятор добычи x2", price: config.stimulant.price,
    durationMs: config.stimulant.durationMs, minLevel: config.stimulant.minLevel, consumable: true }].map((item) => {
    const active = state.entitlements[item.id]?.remainingMs > 0;
    const reason = state.profile.level < item.minLevel ? `Доступно с ${item.minLevel} уровня` : active ? "Уже активно"
      : item.tool && selectedTool && selectedTool !== item.id ? "Сначала завершите аренду текущего инструмента" : null;
    return { id: item.id, name: item.name, price: item.price, durationMinutes: Math.round(item.durationMs / 60000), minLevel: item.minLevel,
      consumable: Boolean(item.consumable), available: !reason, reason };
  });
  const vehicleResults = await Promise.all(config.haulVehicles.map(async (item) => {
    const accepted = item.license === "cdl_b" ? ["cdl_b", "cdl_a"] : [item.license];
    const checks = await Promise.all(accepted.map(async (id) => (await licenses.hasLicense(state.player, id)) && (await licenses.hasLicenseDocumentItem(state.player, id))));
    const reasons = [];
    if (state.profile.level < item.minLevel) reasons.push(`Нужен ${item.minLevel} уровень`);
    if (!checks.some(Boolean)) reasons.push(`Нужны права ${item.license.toUpperCase()} и документ`);
    const lease = state.entitlements[`haul:${item.id}`];
    const anyLease = leaseEntry(state);
    if (anyLease && !lease) reasons.push("Транспорт уже арендован");
    return { id: item.id, name: item.name, model: item.model, type: item.type, price: item.price, minLevel: item.minLevel,
      license: item.license, durationMinutes: Math.round(item.durationMs / 60000), current: Boolean(lease),
      remainingMs: Math.max(0, Number(lease?.remainingMs || 0)), expiresInMs: Math.max(0, Number(lease?.remainingMs || 0)), available: !reasons.length, reasons };
  }));
  return {
    profile: publicProfile(state.profile),
    cash: Math.max(0, Number(state.player?.cash ?? state.player?.character?.cash ?? state.player?.characterData?.cash ?? 0)),
    active: statePayload(state).entitlements,
    equipment,
    vehicles: vehicleResults,
  };
}

async function openShop(player, initialTab = "equipment") {
  try {
    const state = getWorkingState(player);
    if (!state) throw new Error("Сначала начните смену лесоруба.");
    if (Number(player.dimension || 0) !== 0 || distance(positionOf(player), config.npc.position) > config.npc.colshapeRadius + 2) throw new Error("Подойдите к бригадиру лесопилки.");
    await requirePassport(player);
    safeCall(player, "client:forestry:shop:open", [JSON.stringify({
      ...(await shopPayload(state)),
      initialTab: initialTab === "haul" ? "haul" : "equipment",
    })]);
    return true;
  } catch (error) { notify(player, error.message || "Магазин недоступен.", "error"); return false; }
}
async function purchaseShop(player, raw) {
  const state = getWorkingState(player); if (!state) return notify(player, "Сначала начните смену лесоруба.", "error");
  return serialize(state, async () => {
    try {
      const payload = parsePayload(raw); const id = String(payload?.id || "");
      if (!id || !hasActiveForestryShift(player, state)) throw new Error("Смена лесоруба не активна.");
      if (Number(player.dimension || 0) !== 0 || distance(positionOf(player), config.npc.position) > config.npc.colshapeRadius + 2) throw new Error("Покупки доступны у бригадира.");
      await requirePassport(player);
      const vehicleConfig = findVehicleConfig(id);
      if (vehicleConfig) {
        if (state.missingVehicleCleanup) throw new Error("Дождитесь завершения проверки рабочего транспорта.");
        if (state.expiring.has(`haul:${vehicleConfig.id}`)) throw new Error("Подождите завершения предыдущей аренды.");
        if (state.profile.level < vehicleConfig.minLevel) throw new Error(`Транспорт доступен с ${vehicleConfig.minLevel} уровня.`);
        if (state.challenge) throw new Error("Сначала завершите текущую операцию.");
        await requireVehicleLicense(player, vehicleConfig);
        const existingLease = state.entitlements[`haul:${vehicleConfig.id}`];
        if (existingLease?.remainingMs > 0) {
          if (state.cargo?.kind === "logs") throw new Error("Сначала отнесите брёвна на разгрузку.");
          if (state.vehicleConfig && vehicleExists(state.vehicle)) throw new Error("Транспорт уже выдан.");
          await spawnRental(state, vehicleConfig, existingLease.remainingMs);
          notify(player, "Арендованный транспорт восстановлен без повторной оплаты.", "success");
          sendState(state); safeCall(player, "client:forestry:shop:update", [JSON.stringify(await shopPayload(state))]); return;
        }
        if (state.cargo) throw new Error("Сначала завершите текущую доставку.");
        if (leaseEntry(state)) throw new Error("У вас уже есть другой транспорт в аренде.");
        if (runtime.vehicleSpawnReserved || !spawnAreaFree(vehicleConfig)) throw new Error("Место выдачи транспорта занято.");
        const definition = { id: `haul:${vehicleConfig.id}`, price: vehicleConfig.price, durationMs: vehicleConfig.durationMs };
        const result = await repository.purchaseEntitlement(state.characterUuid, definition, { vehicleId: vehicleConfig.id });
        syncCash(player, result.cashAfter);
        state.entitlements[definition.id] = { remainingMs: definition.durationMs, itemUid: result.itemUid || null, payload: result.payload || { vehicleId: vehicleConfig.id } };
        await spawnRental(state, vehicleConfig, definition.durationMs);
        notify(player, `${vehicleConfig.name} арендован на ${Math.round(vehicleConfig.durationMs / 60000)} минут.`, "success");
      } else {
        if (id === "stimulant") {
          if (state.profile.level < Number(config.stimulant.minLevel || 1)) {
            throw new Error(`Стимулятор доступен с ${config.stimulant.minLevel} уровня.`);
          }
          const purchase = await inventory.purchaseItems(player, [{ itemId: config.stimulant.itemId, amount: 1 }], config.stimulant.price);
          if (!purchase?.ok) {
            const messages = { cash: "Недостаточно наличных.", weight: "Инвентарь перегружен.", slots: "В инвентаре нет свободного места." };
            throw new Error(messages[purchase?.reason] || "Не удалось купить стимулятор.");
          }
          syncCash(player, purchase.cash ?? purchase.balance);
          notify(player, "Стимулятор куплен. Используйте его из инвентаря: x2 к добыче на 5 минут.", "success");
          safeCall(player, "client:forestry:shop:update", [JSON.stringify(await shopPayload(state))]); return;
        }
        const item = config.entitlements[id];
        if (!item) throw new Error("Неизвестный товар.");
        if (state.expiring.has(item.id)) throw new Error("Подождите завершения предыдущей аренды.");
        if (state.profile.level < item.minLevel) throw new Error(`Товар доступен с ${item.minLevel} уровня.`);
        if (state.entitlements[item.id]?.remainingMs > 0) throw new Error("Этот эффект уже активен.");
        const result = await repository.purchaseEntitlement(state.characterUuid, item, { source: "forestry_shop" });
        syncCash(player, result.cashAfter);
        if (result.inventory) await inventory.syncInventorySnapshot(player, result.inventory);
        state.entitlements[item.id] = { remainingMs: item.durationMs, itemUid: result.itemUid || null, payload: result.payload || {} };
        notify(player, `${item.name} активирован. Время замораживается вне игры.`, "success");
      }
      sendState(state);
      broadcastTrees(player);
      safeCall(player, "client:forestry:shop:update", [JSON.stringify(await shopPayload(state))]);
    } catch (error) { notify(player, error.message || "Покупка не выполнена.", "error"); }
  });
}

function pendingTreeFor(state, exceptTreeId = null) {
  return state?.challenge && state.challenge.treeId !== exceptTreeId ? trees.get(state.challenge.treeId) || null : null;
}
function roundValue(range, fallback) {
  const values = Array.isArray(range) ? range : [fallback, fallback];
  const min = Number(values[0] ?? fallback);
  const max = Number(values[1] ?? min);
  return min + Math.random() * Math.max(0, max - min);
}
function prepareRound(state, challenge, now = Date.now()) {
  const ping = Math.max(0, Math.min(360, Number(state.player?.ping || 0)));
  let speed = roundValue(config.minigame.speed, 1);
  const accelerated = Math.random() < Number(config.minigame.accelerationChance || 0);
  if (accelerated) speed *= roundValue(config.minigame.acceleration, 1.25);
  challenge.roundStartsAt = now + Number(config.minigame.roundLeadMs || 850);
  challenge.round = Math.max(0, Number(challenge.round || 0));
  challenge.targetCenter = roundValue([0.25, 0.75], 0.5);
  challenge.targetWidth = roundValue(config.minigame.targetWidth, 0.16);
  challenge.speed = speed;
  challenge.accelerated = accelerated;
  challenge.phase = Math.random();
  challenge.direction = Math.random() < 0.5 ? -1 : 1;
  challenge.clientStartDelayMs = Math.max(150, Number(config.minigame.roundLeadMs || 850) - ping / 2);
  return challenge;
}
function cursorPosition(challenge, at) {
  const elapsedSeconds = Math.max(0, Number(at) - Number(challenge.roundStartsAt || 0)) / 1000;
  const cycle = ((Number(challenge.phase || 0) + elapsedSeconds * Number(challenge.speed || 1)) % 2 + 2) % 2;
  const triangle = cycle <= 1 ? cycle : 2 - cycle;
  return challenge.direction < 0 ? 1 - triangle : triangle;
}
function challengePayload(challenge, tree, ackInputId = "", lastHit = null, extra = {}) {
  return {
    token: challenge.token,
    treeId: tree.id,
    treeName: tree.resource.name,
    round: challenge.round,
    hits: challenge.hits,
    misses: challenge.misses,
    attempts: challenge.attempts,
    hitsRequired: Number(config.minigame.hitsRequired || 3),
    maxAttempts: Number(config.minigame.maxAttempts || 6),
    ttlMs: Math.max(0, challenge.deadlineAt - Date.now()),
    targetCenter: challenge.targetCenter,
    targetWidth: challenge.targetWidth,
    speed: challenge.speed,
    phase: challenge.phase,
    direction: challenge.direction,
    clientStartDelayMs: challenge.clientStartDelayMs,
    accelerated: Boolean(challenge.accelerated),
    tool: challenge.tool.id,
    ackInputId,
    lastHit,
    ...extra,
  };
}
function challengeStop(state, reason = "cancelled") {
  if (state) state.challenge = null;
  syncHeldVisual(state);
  try { if (playerExists(state?.player)) state.player.freezePosition(false); } catch {}
  if (state?.player) safeCall(state.player, "client:forestry:challenge:stop", [String(reason)]);
}
function removeParticipantFromTree(state) {
  challengeStop(state, "cancelled");
}
function respawnTreeForPlayer(state, tree) {
  if (!runtime.active || !state || state.closed || !playerExists(state.player)) return;
  const expiresAt = Number(state.treeCooldowns?.get(Number(tree.slot)) || 0);
  if (expiresAt > Date.now()) {
    addTimeout(() => respawnTreeForPlayer(state, tree), expiresAt - Date.now() + 50);
    return;
  }
  state.treeCooldowns?.delete(Number(tree.slot));
  if (hasActiveForestryShift(state.player, state) && trees.get(tree.id) === tree) {
    // Rebuild the nearby window instead of appending a possibly distant tree.
    broadcastTrees(state.player);
  }
}
async function beginTree(player, raw) {
  const state = getWorkingState(player);
  if (!state) return notify(player, "Сначала начните смену лесоруба.", "error");
  return serialize(state, async () => {
    try {
      const tree = trees.get(String(parsePayload(raw)?.treeId || ""));
      if (!tree || !canSeeTree(state, tree)) throw new Error("Это дерево восстанавливается для вас.");
      if (!hasActiveForestryShift(player, state)) throw new Error("Смена лесоруба не активна.");
      if (state.cargo) throw new Error("Сначала доставьте или потеряйте текущие брёвна.");
      if (state.challenge) throw new Error("Мини-игра уже запущена.");
      if (player.vehicle) throw new Error("Выйдите из транспорта.");
      if (Number(player.dimension || 0) !== config.zone.dimension || !isInsideZone(positionOf(player), player.dimension)) {
        throw new Error("Вы вне рабочей зоны.");
      }
      if (distance(positionOf(player), tree.position) > config.interactionRadius) throw new Error("Подойдите ближе к дереву.");
      const now = Date.now();
      await requirePassport(player);
      const tool = await requireOwnedForestryTool(state);
      const challenge = prepareRound(state, {
        token: crypto.randomBytes(16).toString("hex"),
        treeId: tree.id,
        round: 0,
        hits: 0,
        misses: 0,
        attempts: 0,
        startedAt: now,
        deadlineAt: now + Number(config.minigame.ttlMs || 24000),
        lastInputAt: 0,
        lastAck: null,
        tool,
      }, now);
      state.challenge = challenge;
      syncHeldVisual(state, "tool", tool);
      try { player.freezePosition(true); } catch {}
      safeCall(player, "client:forestry:challenge:start", [JSON.stringify(challengePayload(challenge, tree))]);
    } catch (error) {
      notify(player, error.message || "Нельзя начать рубку.", "error");
    }
  });
}
function buildTreeAllocation(state, tree, challenge) {
  const accuracy = challenge.hits / Math.max(1, challenge.attempts);
  const quality = 0.75 + Math.min(0.25, accuracy * 0.25);
  const baseBundles = roundValue(tree.resource.bundles, 1);
  const effectiveYield = currentYieldMultiplier(state, challenge.tool);
  const bundles = Math.max(0.5, Number((baseBundles * quality * effectiveYield * Number(state.profile.yieldMultiplier || 1)).toFixed(2)));
  const routeDistance = distance(tree.position, config.unloadPoint);
  const payout = Math.max(1, Math.round((Number(config.economy.basePay || 60)
    + routeDistance * Number(config.economy.payPerMeter || 1.3)) * bundles));
  return {
    characterUuid: state.characterUuid,
    share: 1,
    accuracy,
    yieldMultiplier: effectiveYield,
    kg: bundles,
    payout,
    xp: Math.max(1, Math.round(Number(tree.resource.xp || config.economy.xpPerTree || 8))),
  };
}
async function finalizeTree(state, tree) {
  if (!state?.challenge || !tree || state.challenge.finalizing) return;
  const challenge = state.challenge;
  challenge.finalizing = true;
  try {
    if (playerExists(state.player)) {
      if (state.player.vehicle || Number(state.player.dimension || 0) !== config.zone.dimension
        || distance(positionOf(state.player), tree.position) > config.interactionRadius + 0.8) {
        throw new Error("Позиция у дерева не подтверждена.");
      }
      challenge.tool = await requireOwnedForestryTool(state);
    }
    const allocation = buildTreeAllocation(state, tree, challenge);
    const settlementTree = {
      ...tree,
      // The resource node is personal. A per-cut id preserves database idempotency
      // without making two players compete for the same catalog tree.
      id: `${tree.id}:${state.characterUuid}:${challenge.token.slice(0, 16)}`,
    };
    const result = await repository.settleTree(settlementTree, [allocation]);
    const cargo = (result.cargo || []).find((entry) => Number(entry.characterUuid) === Number(state.characterUuid));
    if (!cargo) throw new Error("Не удалось зарезервировать брёвна: у вас уже есть активный груз.");
    challengeStop(state, "completed");
    const cooldownUntil = Date.now() + Number(config.treeRespawnMs || 120000);
    const cluster = [...trees.values()].filter((entry) => distance(entry.position, tree.position) <= Number(config.treeClusterRadiusM || 0));
    for (const clusteredTree of cluster.length ? cluster : [tree]) {
      state.treeCooldowns.set(Number(clusteredTree.slot), cooldownUntil);
      safeCall(state.player, "client:forestry:tree:remove", [clusteredTree.id]);
      addTimeout(() => respawnTreeForPlayer(state, clusteredTree), Number(config.treeRespawnMs || 120000) + 50);
    }
    state.cargo = cargo;
    if (cargo.profile) state.profile = cargo.profile;
    if (cargo.inventory) await inventory.syncInventorySnapshot(state.player, cargo.inventory)
      .catch((error) => console.error("[FORESTRY] Trophy inventory sync failed:", error));
    state.cargoStartedAt = Date.now();
    state.cargoOrigin = tree.position;
    state.cargoTravelM = 0;
    state.cargoSuspiciousM = 0;
    syncHeldVisual(state, "logs");
    safeCall(state.player, "client:forestry:cargo:set", [JSON.stringify(publicCargo(cargo))]);
    sendState(state);
    notify(state.player, "Дерево срублено. Отнесите брёвна к разгрузке; прыжок приведёт к потере.", "success");
    if (cargo.trophyAwarded) {
      notify(state.player, "1000 срубленных деревьев! Секретная пила добавлена в инвентарь и даёт x3 на обычных работах.", "success");
    }
  } catch (error) {
    challenge.finalizing = false;
    challengeStop(state, "failed");
    notify(state.player, error.message || "Результат рубки не зафиксирован.", "error");
  }
}
async function inputTree(player, raw, receivedAt = Date.now()) {
  const state = getWorkingState(player);
  if (!state) return;
  return serialize(state, async () => {
    const challenge = state.challenge;
    const payload = parsePayload(raw);
    if (!challenge || !payload) return;
    const tree = trees.get(challenge.treeId);
    const inputId = String(payload.inputId || "").slice(0, 128);
    if (!tree || challenge.finalizing || String(payload.token || "") !== challenge.token || !inputId) return;
    if (challenge.lastAck?.inputId === inputId) {
      safeCall(player, "client:forestry:challenge:feedback", [JSON.stringify(challenge.lastAck.payload)]);
      return;
    }
    if (receivedAt > challenge.deadlineAt || player.vehicle || Number(player.dimension || 0) !== config.zone.dimension
      || distance(positionOf(player), tree.position) > config.interactionRadius + 0.8) {
      return removeParticipantFromTree(state);
    }
    if (Number(payload.round) !== Number(challenge.round)) {
      securityViolation(state, "minigame_round_mismatch", { expected: challenge.round, received: payload.round });
      safeCall(player, "client:forestry:challenge:feedback", [JSON.stringify(challengePayload(challenge, tree, inputId, false, { resync: true }))]);
      return;
    }
    if (challenge.lastInputAt && receivedAt - challenge.lastInputAt < 120) {
      securityViolation(state, "minigame_input_spam", { intervalMs: receivedAt - challenge.lastInputAt });
      return;
    }
    const earliest = Number(challenge.roundStartsAt || 0) + Number(config.minigame.minInputMs || 140);
    const ping = Math.max(0, Math.min(360, Number(player.ping || 0)));
    const evaluatedAt = receivedAt - ping / 2;
    const position = cursorPosition(challenge, evaluatedAt);
    const tolerance = Math.min(0.085, Number(config.minigame.latencyTolerance || 0.055) + ping / 1000 * Number(challenge.speed || 1) * 0.12);
    const hit = evaluatedAt >= earliest
      && Math.abs(position - Number(challenge.targetCenter || 0.5)) <= Number(challenge.targetWidth || 0.16) / 2 + tolerance;
    challenge.lastInputAt = receivedAt;
    challenge.attempts += 1;
    if (hit) challenge.hits += 1;
    else challenge.misses += 1;
    if (challenge.hits >= Number(config.minigame.hitsRequired || 3)) {
      const finalPayload = challengePayload(challenge, tree, inputId, true, { completed: true, cursorPosition: position });
      challenge.lastAck = { inputId, payload: finalPayload };
      safeCall(player, "client:forestry:challenge:feedback", [JSON.stringify(finalPayload)]);
      return finalizeTree(state, tree);
    }
    if (challenge.attempts >= Number(config.minigame.maxAttempts || 6)) {
      const failedPayload = challengePayload(challenge, tree, inputId, hit, { failed: true, cursorPosition: position });
      safeCall(player, "client:forestry:challenge:feedback", [JSON.stringify(failedPayload)]);
      challengeStop(state, "attempts_exhausted");
      notify(player, "Не удалось сделать три точных пропила. Попробуйте снова.", "warning");
      return;
    }
    challenge.round += 1;
    prepareRound(state, challenge, receivedAt);
    const feedback = challengePayload(challenge, tree, inputId, hit, { cursorPosition: position });
    challenge.lastAck = { inputId, payload: feedback };
    safeCall(player, "client:forestry:challenge:feedback", [JSON.stringify(feedback)]);
  });
}
async function deliverLogs(player) {
  const state = getWorkingState(player);
  if (!state) return notify(player, "Сначала начните смену лесоруба.", "error");
  return serialize(state, async () => {
    try {
      const cargo = state.cargo;
      if (!cargo || cargo.kind !== "logs") throw new Error("У вас нет брёвен для разгрузки.");
      if (player.vehicle || Number(player.dimension || 0) !== config.zone.dimension
        || distance(positionOf(player), config.unloadPoint) > config.unloadRadius) {
        throw new Error("Доставьте брёвна к точке разгрузки пешком.");
      }
      const direct = Math.max(1, distance(state.cargoOrigin || cargo.metrics?.origin, config.unloadPoint));
      const elapsedSeconds = Math.max(0, (Date.now() - Number(state.cargoStartedAt || Date.now())) / 1000);
      const physicalMinimumSeconds = Math.max(4, direct / 6);
      if (elapsedSeconds < physicalMinimumSeconds
        || state.cargoTravelM < Math.max(5, direct * 0.72)
        || state.cargoSuspiciousM > Math.max(12, direct * 0.12)) {
        securityViolation(state, "logs_route_integrity_failed", {
          direct, elapsedSeconds, cargoTravelM: state.cargoTravelM, cargoSuspiciousM: state.cargoSuspiciousM,
        });
        throw new Error("Маршрут брёвен не подтверждён сервером.");
      }

      const targetSeconds = Number(config.economy.speedBonusLeadSeconds || 12)
        + direct / Math.max(0.5, Number(config.economy.targetWalkSpeedMps || 2.35));
      const fastRatio = elapsedSeconds <= targetSeconds * 0.75
        ? 1
        : elapsedSeconds >= targetSeconds ? 0 : (targetSeconds - elapsedSeconds) / (targetSeconds * 0.25);
      const bonusRate = Math.max(0, Math.min(1, fastRatio)) * Number(config.economy.speedBonusMax || 0.15);
      const basePayout = Math.max(0, Number(cargo.payout || 0));
      const trophyEntitlementMultiplier = await jobRewardMultiplier.getMultiplier(player, "forestry");
      const productionMultiplier = Math.max(1, Math.min(config.yieldMultiplierCap,
        Number(cargo.metrics?.yieldMultiplier || 1)));
      const trophyMultiplier = trophyEntitlementMultiplier > 1
        ? Math.max(1, config.yieldMultiplierCap / productionMultiplier)
        : 1;
      const speedBonus = Math.round(basePayout * bonusRate);
      const payout = Math.max(0, Math.round((basePayout + speedBonus) * trophyMultiplier));

      const result = await repository.deliverLogs(state.characterUuid, cargo.id, {
        payout,
        fastDelivery: speedBonus > 0,
      });
      state.profile = result.profile;
      state.cargo = null;
      state.cargoStartedAt = null;
      state.cargoOrigin = null;
      state.cargoTravelM = 0;
      state.cargoSuspiciousM = 0;
      syncHeldVisual(state);
      if (result.inventory) await inventory.syncInventorySnapshot(player, result.inventory);
      await refreshStock(true);
      syncCash(player, result.cashAfter);
      safeCall(player, "client:forestry:cargo:clear");
      sendState(state);

      if (!result.alreadySettled) {
        const effectiveSpeedBonus = Math.round(speedBonus * trophyMultiplier);
        const bonusText = effectiveSpeedBonus > 0 ? " · быстрый бонус $" + effectiveSpeedBonus : "";
        const trophyText = trophyEntitlementMultiplier > 1 ? " · секретная пила · общий предел x3" : "";
        notify(player, "Брёвна разгружены. Выплата: $" + payout.toLocaleString("ru-RU") + bonusText + trophyText + ".", "success");
        logsDb.writeMoneyLog({
          source: "job_forestry",
          action: "logs_delivery",
          currency: "cash",
          amount: payout,
          balanceBefore: result.cashBefore,
          balanceAfter: result.cashAfter,
          target: player,
          comment: cargo.resourceName + ", " + Number(cargo.kg).toFixed(2) + " ед.",
          metadata: { cargoId: cargo.id, basePayout, speedBonus: effectiveSpeedBonus,
            trophyEntitlementMultiplier, appliedTrophyMultiplier: trophyMultiplier, productionMultiplier, elapsedSeconds, targetSeconds },
        }).catch(() => {});
        quests.recordProgress(player, {
          type: "job.money_earned",
          subjectId: "forestry",
          idempotencyKey: "forestry:logs:" + cargo.id,
          amount: payout,
          metadata: { jobId: "forestry", cargoId: cargo.id },
        }, { sync: true }).catch(() => {});
        if (result.newLevel > result.oldLevel) notify(player, "Новый уровень лесоруба: " + result.newLevel + "!", "success");
      }
    } catch (error) {
      notify(player, error.message || "Не удалось разгрузить брёвна.", "error");
    }
  });
}
async function loseLogs(player, options = {}) {
  const state = getWorkingState(player); if (!state) return;
  return serialize(state, async () => {
    const cargo = state.cargo;
    if (!cargo || cargo.kind !== "logs" || (player.vehicle && !options.force)) return;
    const result = await repository.loseLogs(state.characterUuid, cargo.id);
    if (!result.spilled) return;
    state.cargo = null; state.cargoStartedAt = null; state.cargoOrigin = null;
    state.cargoTravelM = 0; state.cargoSuspiciousM = 0;
    syncHeldVisual(state);
    safeCall(player, "client:forestry:cargo:clear"); sendState(state);
    notify(player, `Вы прыгнули и потеряли брёвна.`, "error");
  });
}

function currentHaulEntity(state) { return state.vehicleConfig?.type === "truck" ? state.trailer : state.vehicle; }
function isDriver(player, state) {
  if (!vehicleExists(state.vehicle) || player.vehicle !== state.vehicle) return false;
  try { return Number(player.seat) === 0 || state.vehicle.getOccupant?.(0) === player; } catch { return false; }
}
function isAssignedTrailerAttached(state) {
  if (state.vehicleConfig?.type !== "truck") return true;
  if (!vehicleExists(state.vehicle) || !vehicleExists(state.trailer)) return false;
  if (Number(state.vehicle.dimension || 0) !== Number(state.trailer.dimension || 0)) return false;
  if (distance(positionOf(state.vehicle), positionOf(state.trailer)) > 16) return false;
  let matched = false;
  let detached = false;
  try {
    if (state.vehicle.trailer === state.trailer) matched = true;
    else if (state.vehicle.trailer === null) detached = true;
    else if (state.vehicle.trailer !== undefined) return false;
  } catch {}
  try {
    if (state.trailer.traileredBy === state.vehicle) matched = true;
    else if (state.trailer.traileredBy === null) detached = true;
    else if (state.trailer.traileredBy !== undefined) return false;
  } catch {}
  if (matched) return (state.trailerAttached = true);
  if (detached) { state.trailerAttached = false; return false; }
  return state.trailerAttached === true;
}
function vehicleSpeed(vehicle) {
  try { const v = vehicle.velocity; return v ? Math.hypot(Number(v.x), Number(v.y), Number(v.z)) : 0; } catch { return 0; }
}
function haulAligned(player, state) {
  const entity = currentHaulEntity(state); const route = state.haulRoute;
  if (!route || !isDriver(player, state) || !vehicleExists(entity)) return false;
  if (Number(state.vehicle.dimension || 0) !== 0 || Number(entity.dimension || 0) !== 0) return false;
  if (state.trailer && !isAssignedTrailerAttached(state)) return false;
  if (state.trailer && distance(positionOf(state.vehicle), positionOf(state.trailer)) > 25) return false;
  return distance(positionOf(entity), route.point) <= config.haulRadius && vehicleSpeed(state.vehicle) <= 2.5;
}

function cancelHaulStage(state, reason) {
  if (!state.haulStage) return;
  state.haulStage = null; state.haulNonce += 1;
  safeCall(state.player, "client:forestry:haul:stage:cancel", [String(reason || "Операция прервана")]);
}
async function completeHaulStage(state, nonce) {
  if (!state.haulStage || state.haulNonce !== nonce || !playerExists(state.player)) return;
  const player = state.player;
  const stage = state.haulStage;
  if (!haulAligned(player, state)) return cancelHaulStage(state, "Транспорт покинул зону операции.");
  try {
    await requirePassport(player); await requireVehicleLicense(player, state.vehicleConfig);
    if (state.haulNonce !== nonce || state.haulStage !== stage || !haulAligned(player, state)) return cancelHaulStage(state, "Операция прервана.");
    if (stage === "loading") {
      if (state.cargo) throw new Error("Другой груз уже активен.");
      const destination = chooseHaulDestination(); if (!destination) throw new Error("Нет доступных точек разгрузки.");
      const directDistance = distance(config.unloadPoint, destination); const routeDistance = directDistance * config.haul.roadDistanceMultiplier;
      const currentStock = await refreshStock(false);
      const minimumStockKg = Math.max(1, Number(config.haul.minimumStockKg || 1));
      if (Number(currentStock.totalKg || 0) < minimumStockKg) {
        throw new Error(`На общем складе ${Number(currentStock.totalKg || 0).toFixed(1)} кг древесины. Для рейса нужно хотя бы ${minimumStockKg} кг.`);
      }
      const [minKg, maxKg] = state.vehicleConfig.capacityKg;
      const targetKg = Math.round(minKg + Math.random() * (maxKg - minKg));
      const weightKg = Math.max(minimumStockKg, Math.min(targetKg, Math.floor(Number(currentStock.totalKg || 0))));
      const trophyMultiplier = await jobRewardMultiplier.getMultiplier(player, "forestry");
      const payout = Math.max(config.haul.minimumPay, Math.round((config.haul.basePay + routeDistance / 1000 * config.haul.payPerKm
        + weightKg * config.haul.payPerKg) * state.vehicleConfig.payoutMultiplier * trophyMultiplier));
      if (state.haulNonce !== nonce || state.haulStage !== stage || !haulAligned(player, state)) return cancelHaulStage(state, "Операция прервана.");
      state.cargo = await repository.createHaul(state.characterUuid, state.vehicleConfig.id, destination, weightKg, payout, config.haul.xp,
        { plannedDistanceM: routeDistance, directDistanceM: directDistance });
      await refreshStock(true);
      state.haulStartedAt = Date.now(); state.haulTravelM = 0; state.haulSuspiciousM = 0;
      state.haulRequiredTravelM = routeDistance * 0.75;
      state.haulMinimumTimeMs = Math.max(20, routeDistance / Math.min(38, config.haul.maxPlausibleSpeedMps)) * 1000;
      notify(player, `Загружено ${weightKg.toLocaleString("ru-RU")} ед. древесины. Следуйте к точке разгрузки.`, "success");
    } else {
      const cargo = state.cargo;
      if (!cargo || cargo.kind !== "haul") throw new Error("Груз древесины не найден.");
      const planned = Math.max(1, Number(cargo.metrics?.plannedDistanceM || distance(config.unloadPoint, cargo.destination) * config.haul.roadDistanceMultiplier));
      const minimumTime = Math.max(0, Number(state.haulMinimumTimeMs || 0));
      const requiredTravel = Math.max(5, Number(state.haulRequiredTravelM || planned * 0.75));
      if (Date.now() - state.haulStartedAt < minimumTime || state.haulTravelM < requiredTravel
        || state.haulSuspiciousM > Math.max(80, planned * 0.08)) {
        await repository.cancelActiveHaul(state.characterUuid, "route_integrity_failed");
        await refreshStock(true);
        state.cargo = null; sendHaulRoute(state); sendState(state);
        throw new Error("route_integrity_failed: сервер обнаружил невозможный маршрут.");
      }
      if (state.haulNonce !== nonce || state.haulStage !== stage || !haulAligned(player, state)) return cancelHaulStage(state, "Операция прервана.");
      const result = await repository.deliverHaul(state.characterUuid, cargo.id);
      state.profile = result.profile; state.cargo = null; syncCash(player, result.cashAfter);
      if (!result.alreadySettled) {
        notify(player, `Рейс завершён. Выплата: $${Number(cargo.payout).toLocaleString("ru-RU")}. Возвращайтесь за новым грузом.`, "success");
        logsDb.writeMoneyLog({ source: "job_forestry", action: "timber_haul", currency: "cash", amount: cargo.payout,
          balanceBefore: result.cashBefore, balanceAfter: result.cashAfter, target: player,
          comment: `Рейс древесины ${cargo.id}`, metadata: { cargoId: cargo.id } }).catch(() => {});
        quests.recordProgress(player, { type: "job.money_earned", subjectId: "forestry", idempotencyKey: `forestry:haul:${cargo.id}`,
          amount: cargo.payout, metadata: { jobId: "forestry", cargoId: cargo.id } }, { sync: true }).catch(() => {});
      }
    }
    state.haulStage = null; safeCall(player, "client:forestry:haul:stage:complete"); sendHaulRoute(state); sendState(state);
  } catch (error) {
    state.haulStage = null; safeCall(player, "client:forestry:haul:stage:cancel", [error.message || "Операция не выполнена"]);
    if (!String(error.message).includes("route_integrity_failed")) notify(player, error.message || "Операция не выполнена.", "error");
  }
}
async function beginHaulStage(player) {
  const state = getWorkingState(player); if (!state) return notify(player, "Сначала начните смену лесоруба.", "error");
  return serialize(state, async () => {
    try {
      if (state.profile.level < 6) throw new Error("Перевозка древесины доступна с 6 уровня.");
      if (!state.vehicleConfig || !vehicleExists(state.vehicle)) throw new Error("Сначала арендуйте рабочий транспорт.");
      if (Date.now() >= state.leaseExpiresAt && state.cargo?.kind !== "haul") throw new Error("Срок аренды транспорта истёк.");
      if (state.challenge || state.haulStage) throw new Error("Другая операция уже выполняется.");
      if (pendingTreeFor(state)) throw new Error("Сначала завершите древесину, в добыче которой уже участвовали.");
      await requirePassport(player); await requireVehicleLicense(player, state.vehicleConfig);
      const expectedPhase = state.cargo?.kind === "haul" ? "unload" : "load";
      if (state.cargo && state.cargo.kind !== "haul") throw new Error("Сначала отнесите брёвна на разгрузку.");
      if (expectedPhase === "load") {
        const currentStock = await refreshStock(false);
        const minimumStockKg = Math.max(1, Number(config.haul.minimumStockKg || 1));
        if (Number(currentStock.totalKg || 0) < minimumStockKg) {
          throw new Error(`Погрузка пуста: лесорубы сдали только ${Number(currentStock.totalKg || 0).toFixed(1)} кг древесины из ${minimumStockKg} кг.`);
        }
      }
      if (!state.haulRoute || state.haulRoute.phase !== expectedPhase || !haulAligned(player, state)) throw new Error("Поставьте транспорт точно в метку и остановитесь.");
      state.haulStage = expectedPhase === "load" ? "loading" : "unloading";
      state.haulNonce += 1; const nonce = state.haulNonce;
      const durationMs = state.haulStage === "loading" ? config.haul.loadingMs : config.haul.unloadingMs;
      safeCall(player, "client:forestry:haul:stage:start", [JSON.stringify({ title: state.haulStage === "loading" ? "Погрузка древесины" : "Разгрузка древесины", durationMs })]);
      addTimeout(() => serialize(state, () => completeHaulStage(state, nonce), { silent: true }).catch((error) => console.error("[FORESTRY] Haul stage failed:", error)), durationMs);
    } catch (error) { notify(player, error.message || "Нельзя начать операцию.", "error"); }
  });
}

async function expireEntitlement(state, type, value) {
  if (state.expiring.has(type)) return;
  state.expiring.add(type);
  try {
    const result = await repository.expireEntitlement(state.characterUuid, type, value?.payload);
    if (state.entitlements[type] !== value) return;
    if (!result?.ok && result?.reason === "stale_generation") {
      state.entitlements = entitlementMap(await repository.getEntitlements(state.characterUuid));
      sendState(state); return;
    }
    if (!result?.ok && result?.reason !== "missing") throw new Error(`expiry_${result?.reason || "failed"}`);
    if (result?.inventory && playerExists(state.player)) await inventory.syncInventorySnapshot(state.player, result.inventory);
    delete state.entitlements[type];
    if (type.startsWith("haul:") && state.cargo?.kind !== "haul") destroyRental(state);
    sendState(state);
  } catch (error) { console.error(`[FORESTRY] Entitlement ${type} expiry failed:`, error); }
  finally { state.expiring.delete(type); }
}
function expireLoadedHaul(state, type) {
  if (state.expiring.has(type)) return;
  state.expiring.add(type); cancelHaulStage(state, "Срок аренды истёк.");
  serialize(state, async () => {
    await repository.cancelActiveHaul(state.characterUuid, "lease_expired_loaded");
    await refreshStock(true);
    await repository.expireEntitlement(state.characterUuid, type, state.entitlements[type]?.payload);
    state.cargo = null; delete state.entitlements[type]; destroyRental(state); sendState(state);
    notify(state.player, "Срок аренды истёк во время рейса. Груз аннулирован без выплаты.", "error");
  }, { silent: true }).catch((error) => console.error("[FORESTRY] Loaded lease expiry failed:", error))
    .finally(() => state.expiring.delete(type));
}
function sampleTravel(state, elapsedMs) {
  const playerPosition = positionOf(state.player); const previous = state.lastPosition;
  state.lastPosition = playerPosition;
  if (!previous || !playerPosition) return;
  const segment = distance(previous, playerPosition);
  if (state.cargo?.kind === "logs" && !state.player.vehicle) {
    const plausible = 6.8 * elapsedMs / 1000 + 1.5;
    if (segment <= plausible) state.cargoTravelM += segment;
    else {
      state.cargoSuspiciousM += segment;
      securityViolation(state, "logs_movement_speed", { segment, elapsedMs, plausible });
    }
  }
  if (state.cargo?.kind === "haul" && isDriver(state.player, state)) {
    const entity = currentHaulEntity(state); const current = positionOf(entity);
    if (!current) return;
    const last = state.lastHaulPosition; state.lastHaulPosition = current;
    if (!last) return;
    const travelled = distance(last, current);
    if (state.trailer && (!isAssignedTrailerAttached(state) || distance(positionOf(state.vehicle), positionOf(state.trailer)) > 25)) {
      state.haulSuspiciousM += travelled + 100;
      return;
    }
    const plausible = Math.min(38, config.haul.maxPlausibleSpeedMps) * elapsedMs / 1000 * 1.25 + 10;
    if (travelled <= plausible) state.haulTravelM += travelled; else state.haulSuspiciousM += travelled;
  } else state.lastHaulPosition = positionOf(currentHaulEntity(state));
}
function suppressSafeZoneWeapon(player, snapshot = safeZoneState.get(player)) {
  if (!snapshot || !playerExists(player)) return;
  let weaponHash = 0;
  try { weaponHash = Number(player.weapon || 0) >>> 0; } catch {}
  const unarmedHash = Number(mp.joaat("weapon_unarmed")) >>> 0;
  if (!weaponHash || weaponHash === unarmedHash) return;
  if (!snapshot.suppressedWeapons) snapshot.suppressedWeapons = new Set();
  snapshot.suppressedWeapons.add(weaponHash);
  try { player.removeWeapon(weaponHash); } catch {}
}
function updateSafeZone(player) {
  if (!playerExists(player)) return;
  const inside = isInsideZone(positionOf(player), player.dimension);
  const previous = safeZoneState.get(player);
  if (inside && !previous) {
    const snapshot = { health: Math.max(0, Number(player.health || 0)), armour: Math.max(0, Number(player.armour || 0)), suppressedWeapons: new Set() };
    safeZoneState.set(player, snapshot); suppressSafeZoneWeapon(player, snapshot);
    safeCall(player, "client:forestry:safeZone", [true]);
  } else if (inside && previous) {
    try {
      player.health = Math.max(Number(player.health || 0), previous.health);
      player.armour = Math.max(Number(player.armour || 0), previous.armour);
    } catch {}
    previous.health = Math.max(previous.health, Math.max(0, Number(player.health || 0)));
    previous.armour = Math.max(previous.armour, Math.max(0, Number(player.armour || 0)));
    suppressSafeZoneWeapon(player, previous);
  } else if (!inside && previous) {
    safeZoneState.delete(player); safeCall(player, "client:forestry:safeZone", [false]);
    if (previous.suppressedWeapons?.size) inventory.restoreEquipment(player).then(() => {
      if (forestryCombatGuard(player)) suppressSafeZoneWeapon(player, safeZoneState.get(player));
    }).catch((error) => console.error("[FORESTRY] Weapon restore after safe zone failed:", error));
  }
}
function securityTick() {
  try { mp.players.forEach(updateSafeZone); } catch {}
}
function cleanupMissingVehicle(state) {
  if (state.missingVehicleCleanup) return;
  const missingVehicle = state.vehicle;
  const missingTrailer = state.trailer;
  cancelHaulStage(state, "Рабочий транспорт потерян.");
  state.missingVehicleCleanup = true;
  serialize(state, async () => {
    const requiredTrailerExists = state.vehicleConfig?.type !== "truck" || vehicleExists(state.trailer);
    if (state.vehicle !== missingVehicle || state.trailer !== missingTrailer || (vehicleExists(state.vehicle) && requiredTrailerExists)) return;
    if (state.cargo?.kind === "haul") {
      await repository.cancelActiveHaul(state.characterUuid, "work_vehicle_missing");
      await refreshStock(true);
      state.cargo = null;
    }
    const lease = leaseEntry(state);
    if (lease) await repository.expireEntitlement(state.characterUuid, lease[0], lease[1]?.payload);
    if (lease) delete state.entitlements[lease[0]];
    destroyRental(state); sendState(state);
    notify(state.player, "Рабочий транспорт потерян. Активный рейс отменён.", "error");
  }, { silent: true }).catch((error) => console.error("[FORESTRY] Missing rental cleanup failed:", error))
    .finally(() => { state.missingVehicleCleanup = false; });
}
function isAuthorizedHaulAwayFromMine(state) {
  if (!state?.vehicleConfig || !leaseEntry(state) || !vehicleExists(state.vehicle)) return false;
  if (Number(state.player.dimension || 0) !== config.zone.dimension
    || Number(state.vehicle.dimension || 0) !== config.zone.dimension) return false;
  return state.player.vehicle === state.vehicle || distance(positionOf(state.player), positionOf(state.vehicle)) <= 25;
}
function updateShiftBoundary(state, now) {
  const onDuty = isInsideShiftArea(positionOf(state.player), state.player.dimension)
    || isAuthorizedHaulAwayFromMine(state);
  if (onDuty) {
    if (state.outsideZoneSince) notify(state.player, "Вы вернулись в рабочую зону. Завершение смены отменено.", "success");
    state.outsideZoneSince = 0;
    state.outsideZoneWarnings.clear();
    return;
  }

  if (!state.outsideZoneSince) {
    state.outsideZoneSince = now;
    state.outsideZoneWarnings.clear();
    state.outsideZoneWarnings.add("started");
    notify(state.player, "Вы далеко от лесопилки. Вернитесь в течение 5 минут, иначе смена завершится автоматически.", "warning");
    return;
  }

  const remainingMs = Math.max(0, Number(config.shiftOutsideTimeoutMs || 0) - (now - state.outsideZoneSince));
  const warnings = [
    { key: "3m", at: 3 * 60 * 1000, text: "До автоматического завершения смены осталось 3 минуты." },
    { key: "1m", at: 60 * 1000, text: "До автоматического завершения смены осталась 1 минута." },
    { key: "30s", at: 30 * 1000, text: "До автоматического завершения смены осталось 30 секунд." },
  ];
  for (const warning of warnings) {
    if (remainingMs <= warning.at && !state.outsideZoneWarnings.has(warning.key)) {
      state.outsideZoneWarnings.add(warning.key);
      notify(state.player, warning.text, "warning");
    }
  }
  if (remainingMs <= 0 && !state.zoneTerminationPending) {
    terminateWorkerOutsideZone(state).catch((error) => console.error("[FORESTRY] Zone timeout failed:", error));
  }
}
function tick() {
  const now = Date.now();
  for (const state of workers.values()) {
    if (state.closed || !playerExists(state.player)) continue;
    const elapsed = Math.max(0, Math.min(5000, now - state.lastTickAt));
    state.lastTickAt = now;
    for (const [type, value] of Object.entries(state.entitlements)) {
      value.remainingMs = Math.max(0, Number(value.remainingMs) - elapsed);
      if (value.remainingMs <= 0) {
        if (type.startsWith("haul:") && state.cargo?.kind === "haul") expireLoadedHaul(state, type);
        else expireEntitlement(state, type, value).catch(() => {});
      }
    }
    if (state.challenge && now > state.challenge.deadlineAt) {
      removeParticipantFromTree(state);
      notify(state.player, "Время мини-игры истекло.", "warning");
    }
    if (state.haulStage && !haulAligned(state.player, state)) cancelHaulStage(state, "Транспорт покинул зону операции.");
    updateShiftBoundary(state, now);
    if (state.zoneTerminationPending) continue;
    sampleTravel(state, elapsed);
    if (state.vehicleConfig && (!vehicleExists(state.vehicle)
      || (state.vehicleConfig.type === "truck" && !vehicleExists(state.trailer)))) cleanupMissingVehicle(state);
    const lease = leaseEntry(state);
    if (state.vehicleConfig && !lease && state.cargo?.kind !== "haul") destroyRental(state);
    persistEntitlements(state).catch(() => {});
    if (now - state.lastStatePush >= 5000) {
      state.lastStatePush = now;
      sendState(state);
    }
    const treeSyncPosition = positionOf(state.player);
    const treeSyncMoved = !state.lastTreeSyncPosition
      || distance(treeSyncPosition, state.lastTreeSyncPosition) >= Number(config.clientTreeSyncDistanceM || 35);
    if (treeSyncMoved || now - Number(state.lastTreeSyncAt || 0) >= Number(config.clientTreeSyncIntervalMs || 5000)) {
      broadcastTrees(state.player);
    }
  }
}
async function joinForestryJob(player) {
  let assigned = false;
  let state = null;
  try {
    if (!schemaReady) throw new Error("Лесопилка запускается. Попробуйте через несколько секунд.");
    if (Number(player.dimension || 0) !== 0 || distance(positionOf(player), config.npc.position) > config.npc.colshapeRadius + 2) throw new Error("Подойдите к бригадиру лесопилки.");
    await requirePassport(player);
    const activeState = getState(player);
    if (activeState && player.__activeJob === "forestry") {
      player.__forestryShiftStartedForUuid = Number(getUuid(player) || 0);
      applyUniform(player, activeState); broadcastTrees(player); sendState(activeState);
      if (activeState.cargo?.kind === "logs") {
        syncHeldVisual(activeState, "logs");
        safeCall(player, "client:forestry:cargo:set", [JSON.stringify(publicCargo(activeState.cargo))]);
      } else syncHeldVisual(activeState);
      await restoreRental(activeState);
      if (activeState.vehicleConfig) sendHaulRoute(activeState);
      reconcileWorkerInventory(activeState);
      notify(player, "Смена лесоруба уже активна.", "info");
      return true;
    }
    await employment.assignJob(player, "forestry");
    assigned = true;
    state = await createState(player);
    player.__forestryShiftStartedForUuid = Number(getUuid(player) || 0);
    applyUniform(player, state); broadcastTrees(player); sendState(state);
    if (state.cargo?.kind === "logs") {
      syncHeldVisual(state, "logs");
      safeCall(player, "client:forestry:cargo:set", [JSON.stringify(publicCargo(state.cargo))]);
    } else syncHeldVisual(state);
    await restoreRental(state);
    if (state.vehicleConfig) sendHaulRoute(state);
    reconcileWorkerInventory(state);
    notify(player, "Смена лесоруба начата. Арендуйте инструмент у бригадира и следуйте к отмеченным деревьям.", "success");
    return true;
  } catch (error) {
    if (assigned) {
      try { await employment.clearJob(player, "forestry", { reason: "start-failed" }); } catch {}
    }
    notify(player, error.message || "Не удалось начать смену.", "error");
    return false;
  }
}
async function stopWorker(player, options = {}) {
  const state = getState(player);
  if (!state) {
    const characterUuid = Number(getUuid(player) || 0);
    if (characterUuid) {
      try {
        const profile = await repository.getProfile(characterUuid);
        const result = await repository.reconcileSecretSaw(characterUuid, profile.secretSawClaimed);
        if (result.inventory && playerExists(player)) await inventory.syncInventorySnapshot(player, result.inventory);
      } catch (error) { console.error("[FORESTRY] Trophy reconciliation failed:", error); }
    }
    return true;
  }
  const reason = String(options.reason || "");
  const forced = ["playerQuit", "shutdown", "hot-reload", "character-reload", "zone-timeout", "session-login-reset"].includes(reason);
  const pendingShare = Boolean(pendingTreeFor(state));
  if (!forced && pendingShare) {
    notify(player, "Сначала завершите древесину, в добыче которой уже участвовали.", "error");
    return false;
  }
  if (!forced && state.cargo) {
    notify(player, state.cargo.kind === "haul" ? "Сначала завершите рейс с древесиной." : "Сначала разгрузите или потеряйте брёвна.", "error");
    return false;
  }
  await state.operationTail.catch(() => undefined);
  if (state.challenge) removeParticipantFromTree(state);
  if (state.haulStage) cancelHaulStage(state, "Смена завершена.");
  if (["playerQuit", "character-reload", "session-login-reset"].includes(reason) && state.cargo?.kind === "logs") {
    await repository.loseLogs(state.characterUuid, state.cargo.id).catch((error) => console.error("[FORESTRY] Logout cargo loss failed:", error));
    state.cargo = null;
    syncHeldVisual(state);
  }
  if (reason === "zone-timeout") await cancelCargoAndRental(state, "forestry-zone-timeout");
  await persistEntitlements(state, true).catch((error) => console.error("[FORESTRY] Final persistence failed:", error));
  await reconcileBasicTool(state, false).catch((error) => console.error("[FORESTRY] Trophy reconciliation failed:", error));
  syncHeldVisual(state);
  await restoreUniform(player, state); destroyRental(state);
  safeCall(player, "client:forestry:cleanup");
  state.closed = true;
  if (workers.get(Number(player.id)) === state) workers.delete(Number(player.id));
  if (!["shutdown", "hot-reload"].includes(reason)) player.__forestryShiftStartedForUuid = 0;
  return true;
}
async function terminateWorkerOutsideZone(state) {
  if (!state || state.closed || state.zoneTerminationPending || workers.get(Number(state.player.id)) !== state) return false;
  state.zoneTerminationPending = true;
  notify(state.player, "Вы не вернулись к лесопилке за 5 минут. Смена завершается.", "error");
  try {
    const result = await employment.clearJob(state.player, "forestry", { reason: "zone-timeout" });
    if (!result.cleared) {
      await stopWorker(state.player, { reason: "zone-timeout" });
      await employment.restorePlayer(state.player);
    }
    notify(state.player, "Смена лесоруба завершена из-за отсутствия в рабочей зоне.", "warning");
    return true;
  } catch (error) {
    state.zoneTerminationPending = false;
    state.outsideZoneSince = Date.now();
    state.outsideZoneWarnings.clear();
    notify(state.player, "Не удалось автоматически завершить смену. Повторная проверка через 5 минут.", "error");
    throw error;
  }
}
async function leaveForestryJob(player) {
  const state = getState(player);
  if (state?.cargo) {
    notify(player, state.cargo.kind === "haul" ? "Завершите рейс древесины перед увольнением." : "Сдайте или потеряйте древесину перед увольнением.", "error");
    return false;
  }
  try {
    const result = await employment.clearJob(player, "forestry");
    if (result.cleared) notify(player, "Смена лесоруба завершена.", "success");
    return Boolean(result.cleared);
  } catch (error) { notify(player, error.message || "Не удалось завершить смену.", "error"); return false; }
}
async function restoreForestryWorker(player) {
  if (!runtime.active || !schemaReady || !playerExists(player) || !hasForestryShiftMarker(player) || getState(player)) return;
  try {
    const state = await createState(player); await reconcileBasicTool(state, true); applyUniform(player, state); broadcastTrees(player); sendState(state);
    if (state.cargo?.kind === "logs") {
      syncHeldVisual(state, "logs");
      safeCall(player, "client:forestry:cargo:set", [JSON.stringify(publicCargo(state.cargo))]);
    } else syncHeldVisual(state);
    const nearForeman = Number(player.dimension || 0) === 0 && distance(positionOf(player), config.npc.position) <= config.npc.colshapeRadius + 2;
    if (nearForeman || state.cargo?.kind === "haul") {
      await restoreRental(state, {
        nearPlayer: !nearForeman && state.cargo?.kind === "haul",
        retry: state.cargo?.kind === "haul",
      });
      if (state.vehicleConfig) sendHaulRoute(state);
    } else if (leaseEntry(state)) {
      notify(player, "Аренда и активный рейс сохранены. Вернитесь к бригадиру, чтобы восстановить транспорт без оплаты.", "info");
    }
  } catch (error) { console.error("[FORESTRY] Worker restore failed:", error); }
}
async function cancelCargoAndRental(state, reason) {
  if (state.cargo?.kind === "logs") {
    await repository.loseLogs(state.characterUuid, state.cargo.id); state.cargo = null;
    syncHeldVisual(state);
    safeCall(state.player, "client:forestry:cargo:clear");
  } else if (state.cargo?.kind === "haul") {
    await repository.cancelActiveHaul(state.characterUuid, reason); state.cargo = null;
    await refreshStock(true);
  }
  const lease = leaseEntry(state);
  if (lease) { await repository.expireEntitlement(state.characterUuid, lease[0], lease[1]?.payload); delete state.entitlements[lease[0]]; }
  destroyRental(state); sendState(state);
}

function allowAction(state, key, delay) {
  if (!state) return false;
  if (!state.actionTimes) state.actionTimes = Object.create(null);
  const now = Date.now(); if (now - Number(state.actionTimes[key] || 0) < delay) return false;
  state.actionTimes[key] = now; return true;
}

async function releaseRentalItem(player, item) {
  const state = getWorkingState(player);
  if (!state) throw new Error("Аренду можно передать или выбросить только во время смены лесоруба.");
  const type = String(item?.forestryRentalType || item?.entitlementType || "");
  if (!config.entitlements[type]) throw new Error("Неизвестная аренда.");
  return serialize(state, async () => {
    if (state.challenge) throw new Error("Сначала завершите добычу дерева.");
    const entitlement = state.entitlements[type];
    if (!entitlement?.remainingMs) throw new Error("Эта аренда уже завершена.");
    const result = await repository.releaseEntitlementToVoucher(
      state.characterUuid,
      type,
      item?.uid,
      item?.leaseToken || entitlement.payload?._leaseToken || ""
    );
    delete state.entitlements[type];
    await inventory.syncInventorySnapshot(player, result.inventory);
    sendState(state);
    notify(player, `Аренда превращена в переносимый ваучер. Осталось ${Math.ceil(result.remainingMs / 60000)} мин.`, "info");
    return result;
  });
}

const forestryInventoryBridge = { releaseRentalItem };
global.twinkleForestry = forestryInventoryBridge;

registerEvent("server:forestry:shop:purchase", (player, raw) => {
  const state = getWorkingState(player); if (!allowAction(state, "shop", 500)) return;
  purchaseShop(player, raw).catch((error) => console.error("[FORESTRY] Shop handler failed:", error));
});
registerEvent("server:forestry:tree:begin", (player, raw) => {
  const state = getWorkingState(player); if (!allowAction(state, "tree_begin", 300)) return;
  beginTree(player, raw).catch((error) => console.error("[FORESTRY] Tree begin failed:", error));
});
registerEvent("server:forestry:tree:input", (player, raw) => {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 512) return;
  const state = getWorkingState(player); if (!state) return;
  const now = Date.now();
  if (now - state.inputWindowAt >= 1000) { state.inputWindowAt = now; state.inputWindowCount = 0; }
  state.inputWindowCount += 1; if (state.inputWindowCount > 32) return;
  inputTree(player, raw, now).catch((error) => console.error("[FORESTRY] Tree input failed:", error));
});
registerEvent("server:forestry:tree:cancel", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "tree_cancel", 250)) return;
  serialize(state, () => removeParticipantFromTree(state), { silent: true }).catch(() => {});
});
registerEvent("server:forestry:cargo:sell", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "sell", 900)) return;
  deliverLogs(player).catch((error) => console.error("[FORESTRY] Sale failed:", error));
});
registerEvent("server:forestry:cargo:spill", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "spill", 1200)) return;
  loseLogs(player).catch((error) => console.error("[FORESTRY] Spill failed:", error));
});
registerEvent("server:forestry:haul:stage", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "haul_stage", 600)) return;
  beginHaulStage(player).catch((error) => console.error("[FORESTRY] Haul stage failed:", error));
});
registerEvent("playerDamage", (player) => {
  const snapshot = safeZoneState.get(player); if (!snapshot || !isInsideZone(positionOf(player), player.dimension)) return;
  try { player.health = Math.max(Number(player.health || 0), snapshot.health); player.armour = Math.max(Number(player.armour || 0), snapshot.armour); } catch {}
});
registerEvent("playerWeaponChange", (player, _oldWeapon, newWeapon) => {
  if (!forestryCombatGuard(player)) return;
  const snapshot = safeZoneState.get(player);
  const weaponHash = Number(newWeapon || player.weapon || 0) >>> 0;
  const unarmedHash = Number(mp.joaat("weapon_unarmed")) >>> 0;
  if (snapshot && weaponHash && weaponHash !== unarmedHash) {
    if (!snapshot.suppressedWeapons) snapshot.suppressedWeapons = new Set();
    snapshot.suppressedWeapons.add(weaponHash);
    try { player.removeWeapon(weaponHash); } catch {}
  }
});
registerEvent("playerDeath", (player) => {
  const state = getState(player); if (!state) return;
  if (state.challenge) removeParticipantFromTree(state);
  cancelHaulStage(state, "Вы погибли.");
  serialize(state, () => cancelCargoAndRental(state, "player_died"), { silent: true })
    .catch((error) => console.error("[FORESTRY] Death cleanup failed:", error));
});
registerEvent("vehicleDeath", (vehicle) => {
  for (const state of workers.values()) if (state.vehicle === vehicle || state.trailer === vehicle) {
    cancelHaulStage(state, "Рабочий транспорт уничтожен.");
    serialize(state, () => cancelCargoAndRental(state, "work_vehicle_destroyed"), { silent: true })
      .catch((error) => console.error("[FORESTRY] Vehicle death cleanup failed:", error));
    break;
  }
});
registerEvent("trailerAttached", (vehicle, trailer) => {
  for (const state of workers.values()) if ((state.vehicle === vehicle && state.trailer === trailer) || (state.vehicle === trailer && state.trailer === vehicle)) {
    state.trailerAttached = true;
    break;
  }
});
registerEvent("trailerDetached", (vehicle, trailer) => {
  for (const state of workers.values()) if ((state.vehicle === vehicle && state.trailer === trailer) || (state.vehicle === trailer && state.trailer === vehicle)) {
    state.trailerAttached = false;
    break;
  }
});
registerEvent("playerEnterVehicle", (player, vehicle) => {
  const ownerState = [...workers.values()].find((state) => state.vehicle === vehicle || state.trailer === vehicle);
  if (ownerState && ownerState.player !== player) {
    try { player.removeFromVehicle?.(); } catch {}
    notify(player, "Этот рабочий транспорт арендован другим лесорубом.", "error");
    return;
  }
  const state = getState(player);
  if (state?.cargo?.kind === "logs") {
    try { player.removeFromVehicle?.(); } catch {}
    notify(player, "С тачкой нельзя садиться в транспорт. Груз останется у вас.", "warning");
  }
});
registerEvent("playerQuit", (player) => {
  const state = getState(player); if (!state) return;
  stopWorker(player, { reason: "playerQuit" }).catch((error) => console.error("[FORESTRY] Quit cleanup failed:", error));
});
registerEvent("twinkle:character:loaded", (player) => {
  player.__forestryShiftStartedForUuid = 0;
  try { player.setVariable("forestryHeldProp", null); player.stopAnimation?.(); } catch {}
  safeCall(player, "client:forestry:cleanup");
  const characterUuid = Number(getUuid(player) || 0);
  if (characterUuid) repository.loseActiveLogs(characterUuid)
    .catch((error) => console.error("[FORESTRY] Stale carried logs cleanup failed:", error));
  addTimeout(() => {
    broadcastTrees(player);
    if (!playerExists(player) || player.__activeJob !== "forestry" || hasForestryShiftMarker(player)) return;
    employment.clearJob(player, "forestry", { reason: "session-login-reset" })
      .then((result) => {
        if (result.cleared) notify(player, "Прошлая смена закрыта. Подойдите к бригадиру, чтобы начать новую.", "info");
      })
      .catch((error) => console.error("[FORESTRY] Login shift reset failed:", error));
  }, 500);
});

registerEvent("forestry:item:useStimulant", (player, item, token) => {
  if (!inventory.isInternalItemUseToken(token)) return;
  const state = getWorkingState(player);
  if (!state) return notify(player, "Стимулятор можно использовать только во время смены лесоруба.", "error");
  if (!allowAction(state, "use_stimulant", 1000)) return;
  serialize(state, async () => {
    try {
      if (state.profile.level < Number(config.stimulant.minLevel || 5)) {
        throw new Error(`Стимулятор доступен с ${config.stimulant.minLevel} уровня лесоруба.`);
      }
      if (state.entitlements.stimulant?.remainingMs > 0) throw new Error("Стимулятор уже действует.");
      if (state.expiring.has("stimulant")) throw new Error("Подождите завершения предыдущего эффекта.");
      let activated = null;
      let persisted = null;
      try {
        activated = await repository.activateEffectFromInventory(
          state.characterUuid,
          "stimulant",
          config.stimulant.durationMs,
          { source: "inventory" },
          item?.uid,
          config.stimulant.itemId
        );
      }
      catch (error) {
        persisted = (await repository.getEntitlements(state.characterUuid)).find((entry) => entry.type === "stimulant" && entry.remainingMs > 0);
        if (!persisted) throw error;
      }
      if (activated?.inventory) await inventory.syncInventorySnapshot(player, activated.inventory);
      else if (persisted) await inventory.syncCurrentInventory(player).catch(() => false);
      state.entitlements.stimulant = {
        remainingMs: Number(activated?.remainingMs || persisted?.remainingMs || config.stimulant.durationMs),
        payload: activated?.payload || persisted?.payload || { source: "inventory" },
      };
      sendState(state); notify(player, "Стимулятор активирован: добыча x2 на 5 минут.", "success");
    } catch (error) { notify(player, error.message || "Не удалось использовать стимулятор.", "error"); }
  });
});

registerEvent("forestry:item:useRentalVoucher", (player, item, token) => {
  if (!inventory.isInternalItemUseToken(token)) return;
  const state = getWorkingState(player);
  if (!state) return notify(player, "Активировать ваучер можно только во время смены лесоруба.", "error");
  if (!allowAction(state, "use_rental_voucher", 1000)) return;
  serialize(state, async () => {
    try {
      const type = String(item?.rentalType || "");
      const definition = config.entitlements[type];
      if (!definition) throw new Error("Неизвестный ваучер аренды.");
      if (state.profile.level < Number(definition.minLevel || 1)) throw new Error(`Эта аренда доступна с ${definition.minLevel} уровня.`);
      if (state.challenge) throw new Error("Сначала завершите добычу дерева.");
      const result = await repository.redeemRentalVoucher(state.characterUuid, item);
      await inventory.syncInventorySnapshot(player, result.inventory);
      state.entitlements[type] = { remainingMs: result.remainingMs, itemUid: result.item?.uid || null, payload: result.payload || {} };
      sendState(state);
      notify(player, `${definition.name} активирован из ваучера на ${Math.ceil(result.remainingMs / 60000)} мин.`, "success");
    } catch (error) { notify(player, error.message || "Не удалось активировать ваучер.", "error"); }
  });
});

employment.registerRuntimeCleanup("forestry", (player, context) => stopWorker(player, { reason: context?.reason || "job-change" }), { replace: true });

addInterval(securityTick, 150);
addInterval(tick, 1000);
addInterval(() => {
  if (trees.size > 0) announceToWorkingLumberjacks("Доступно деревьев: " + trees.size + ". Все точки отмечены на карте.", "#77c980");
}, config.publicAnnouncementMs);

runtime.shutdown = () => {
  if (runtime.shutdownPromise) return runtime.shutdownPromise;
  runtime.shutdownPromise = (async () => {
    runtime.active = false;
    for (const timer of runtime.timers.splice(0)) try { clearTimeout(timer); clearInterval(timer); } catch {}
    for (const event of runtime.events.splice(0)) try { mp.events.remove?.(event.name, event.handler); } catch {}
    await Promise.allSettled([...workers.values()].map((state) => stopWorker(state.player, { reason: "shutdown" })));
    const weaponRestores = [];
    try {
      mp.players.forEach((player) => {
        if (!safeZoneState.get(player)) return;
        safeZoneState.delete(player);
        safeCall(player, "client:forestry:safeZone", [false]);
        weaponRestores.push(inventory.restoreEquipment(player));
      });
    } catch {}
    await Promise.allSettled(weaponRestores);
    workers.clear(); trees.clear();
    if (global.__twinkleForestryCombatGuard === forestryCombatGuard) delete global.__twinkleForestryCombatGuard;
    if (global.twinkleForestry === forestryInventoryBridge) delete global.twinkleForestry;
  })();
  return runtime.shutdownPromise;
};

previousRuntimeShutdown.then(async () => {
  if (!runtime.active) return;
  await repository.ensureSchema(); schemaReady = true; cycle = Date.now();
  await repository.reconcileWarehouseStock();
  await refreshStock(false);
  spawnWave(config.initialWaveSize, false);
  try { mp.players.forEach((player) => { broadcastTrees(player); restoreForestryWorker(player); }); } catch {}
  console.log(`[FORESTRY] Runtime ready: ${trees.size} trees, ${config.haulDestinations.length} haul destinations.`);
}).catch((error) => console.error("[FORESTRY] Initialization failed:", error));

module.exports = { isInsideZone, isShiftActive: hasActiveForestryShift, joinForestryJob, leaveForestryJob, openShop };
