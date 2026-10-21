"use strict";

const crypto = require("crypto");
const config = require("./mining.config.js");
const repository = require("./mining.repository.js");
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

const previousMiningRuntime = global.__twinkleMiningRuntime;
const previousRuntimeShutdown = Promise.resolve()
  .then(() => previousMiningRuntime?.shutdown?.())
  .catch((error) => console.error("[MINING] Previous runtime shutdown failed:", error));
const runtime = { active: true, events: [], timers: [], shutdown: null, shutdownPromise: null, vehicleSpawnReserved: false };
global.__twinkleMiningRuntime = runtime;

const workers = new Map();
const stateCreations = new WeakMap();
const rocks = new Map();
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
const miningCombatGuard = (player) => Boolean(runtime.active && playerExists(player)
  && isInsideZone(positionOf(player), player.dimension));
global.__twinkleMiningCombatGuard = miningCombatGuard;
function safeCall(player, name, args = []) {
  if (!playerExists(player)) return;
  try { player.call(name, args); } catch {}
}
function notify(player, message, variant = "info") {
  const fn = variant === "error" ? chat.sendError : variant === "success" ? chat.sendSuccess : variant === "warning" ? chat.sendWarning : chat.sendInfo;
  try { fn(player, String(message)); } catch {}
}
function announceToWorkingMiners(message, color = "#f3c969") {
  for (const state of workers.values()) {
    if (!hasActiveMiningShift(state?.player, state)) continue;
    try {
      chat.sendToPlayer(state.player, String(message), color, { channelType: "server", author: "Шахта" });
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
function hasMiningShiftMarker(player) {
  const characterUuid = Number(getUuid(player) || 0);
  return Boolean(characterUuid > 0
    && player.__activeJob === "mining"
    && Number(player.__miningShiftStartedForUuid || 0) === characterUuid);
}
function hasActiveMiningShift(player, state = getState(player)) {
  return Boolean(state && hasMiningShiftMarker(player));
}
function getWorkingState(player) {
  const state = getState(player);
  return hasActiveMiningShift(player, state) ? state : null;
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
  if (state.entitlements.golden_pickaxe?.remainingMs > 0) return config.entitlements.golden_pickaxe;
  if (state.entitlements.drill?.remainingMs > 0) return config.entitlements.drill;
  return config.basicTool;
}
async function requireOwnedMiningTool(state) {
  const rentalCandidates = [config.entitlements.golden_pickaxe, config.entitlements.drill];
  for (const definition of rentalCandidates) {
    const entitlement = state.entitlements[definition.id];
    if (!(entitlement?.remainingMs > 0) || !entitlement.itemUid) continue;
    const owned = await inventory.getOwnedItemByUid(state.player, entitlement.itemUid, definition.itemId);
    if (owned) return definition;
  }

  if (state.basicToolUid) {
    const owned = await inventory.getOwnedItemByUid(state.player, state.basicToolUid, config.basicTool.itemId);
    if (owned && String(owned.documentKey || "") === config.basicTool.documentKey) return config.basicTool;
  }
  const basicItems = await inventory.getItemsById(state.player, config.basicTool.itemId);
  const basic = basicItems.find((item) => String(item.documentKey || "") === config.basicTool.documentKey
    && String(item.miningJobTool || "") === config.basicTool.id);
  if (basic?.uid) {
    state.basicToolUid = String(basic.uid);
    return config.basicTool;
  }
  throw new Error("Для добычи нужна рабочая кирка или арендованный бур в инвентаре.");
}
function currentYieldMultiplier(state, tool = activeTool(state)) {
  const stimulant = state.entitlements.stimulant?.remainingMs > 0 ? config.stimulant.yieldMultiplier : 1;
  return Math.min(config.yieldMultiplierCap, Number(tool.yieldMultiplier || 1) * stimulant);
}
function publicProfile(profile) {
  return { xp: profile.xp, level: profile.level, levelName: profile.levelName, kgMultiplier: profile.kgMultiplier,
    stonesMined: profile.stonesMined, kgSold: profile.kgSold, kgSpilled: profile.kgSpilled,
    haulTrips: profile.haulTrips, totalEarned: profile.totalEarned };
}
function publicCargo(cargo) {
  return cargo ? { id: cargo.id, kind: cargo.kind, resourceId: cargo.resourceId, resourceName: cargo.resourceName,
    kg: cargo.kg, payout: cargo.payout, destination: cargo.destination } : null;
}
function statePayload(state) {
  return {
    profile: publicProfile(state.profile),
    entitlements: Object.fromEntries(Object.entries(state.entitlements).map(([key, value]) => [key, { remainingMs: Math.max(0, Math.round(value.remainingMs)), payload: value.payload || {} }])),
    cargo: state.cargo?.kind === "ore" ? publicCargo(state.cargo) : null,
    haulCargo: state.cargo?.kind === "haul" ? publicCargo(state.cargo) : null,
    haulVehicle: state.vehicleConfig ? { id: state.vehicleConfig.id, expiresInMs: Math.max(0, state.leaseExpiresAt - Date.now()) } : null,
    gpsEnabled: state.entitlements.gps?.remainingMs > 0 && state.entitlements.gps?.payload?.enabled !== false,
    stock: { totalKg: Math.max(0, Number(stockSnapshot.totalKg || 0)) },
  };
}
function sendState(state) {
  if (playerExists(state.player)) safeCall(state.player, "client:mining:state", [JSON.stringify(statePayload(state))]);
}
async function refreshStock(broadcast = true) {
  stockSnapshot = await repository.getStock();
  if (broadcast) for (const state of workers.values()) sendState(state);
  return stockSnapshot;
}
function rockPayload(rock) {
  return { id: rock.id, slot: rock.slot, position: rock.position, heading: rock.heading,
    resourceId: rock.resource.id, resourceName: rock.resource.name, rarity: rock.resource.rarity,
    model: rock.resource.model, zOffset: rock.resource.zOffset, color: rock.resource.color,
    hp: Math.max(0, Math.round(rock.hp)), maxHp: rock.resource.hp, participants: rock.participants.size };
}
function canSeeRock(state, rock) {
  const gps = state?.entitlements?.gps;
  const gpsEnabled = gps?.remainingMs > 0 && gps?.payload?.enabled !== false;
  return Boolean(state && (gpsEnabled || distance(positionOf(state.player), rock.position) <= 120));
}
function broadcastRocks(player = null) {
  const send = (target) => {
    const state = getWorkingState(target);
    const payload = state ? [...rocks.values()].filter((rock) => canSeeRock(state, rock)).map(rockPayload) : [];
    safeCall(target, "client:mining:rocks:set", [JSON.stringify(payload)]);
  };
  if (player) return send(player);
  try { mp.players.forEach(send); } catch {}
}
function chooseWeightedResource() {
  const total = config.resources.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;
  return config.resources.find((item) => (roll -= item.chance) <= 0) || config.resources[0];
}
function spawnWave(size = config.refillWaveSize, announce = true) {
  if (!runtime.active || !schemaReady || rocks.size >= config.activeRockCap) return 0;
  const occupied = new Set([...rocks.values()].map((rock) => rock.slot));
  const candidates = config.rockPositions.filter((spot) => !occupied.has(spot.slot)
    && ![...rocks.values()].some((rock) => distance(spot, rock.position) < config.activeRockMinDistance));
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const limit = Math.min(Number(size), config.activeRockCap - rocks.size);
  const selected = [];
  for (const spot of candidates) {
    if (selected.every((other) => distance(spot, other) >= config.activeRockMinDistance)) selected.push(spot);
    if (selected.length >= limit) break;
  }
  const count = selected.length;
  for (const spot of selected) {
    const resource = chooseWeightedResource();
    const id = `${cycle}:${spot.slot}:${crypto.randomBytes(4).toString("hex")}`;
    rocks.set(id, { id, cycle, slot: spot.slot, position: { x: spot.x, y: spot.y, z: spot.z },
      heading: spot.heading, resource, hp: resource.hp, participants: new Map(), settling: false, createdAt: Date.now(),
      mode: "open", soloOwnerUuid: null, challengerAttemptedUuids: new Set(), competitiveAttemptedUuids: new Set(),
      competitionEndsAt: 0, competitionIdleSince: 0 });
  }
  if (count) {
    broadcastRocks();
    if (announce) announceToWorkingMiners(`Шахта обновилась: +${count} новых залежей, всего ${rocks.size}. Следующая волна через 5 минут.`);
  }
  return count;
}

function spawnScheduledWave() {
  const wanted = Math.max(1, Number(config.refillWaveSize || 1));
  const freeCapacity = Math.max(0, Number(config.activeRockCap || 0) - rocks.size);
  const rotateCount = Math.max(0, wanted - freeCapacity);
  if (rotateCount > 0) {
    const replaceable = [...rocks.values()]
      .filter((rock) => !rock.settling && rock.participants.size === 0)
      .filter((rock) => [...workers.values()].every((state) => distance(positionOf(state.player), rock.position) > 14))
      .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
    replaceable.slice(0, rotateCount).forEach((rock) => rocks.delete(rock.id));
  }
  cycle = Date.now();
  const spawned = spawnWave(wanted, true);
  if (!spawned) {
    broadcastRocks();
    announceToWorkingMiners(`Волна шахты обновлена: сейчас доступно ${rocks.size} залежей. Следующая через 5 минут.`);
  }
  return spawned;
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
  // Apply each documented miner outfit as one compatible set. Mixing torso,
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
    console.error("[MINING] Uniform restore failed:", error);
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
function makeState(player, profile, entitlements, cargo) {
  return { player, characterUuid: Number(getUuid(player)), profile, entitlements: entitlementMap(entitlements), cargo,
    cargoStartedAt: cargo?.kind === "ore" ? Date.now() : null,
    cargoOrigin: cargo?.kind === "ore" ? (cargo.metrics?.origin || positionOf(player)) : null,
    cargoTravelM: 0, cargoSuspiciousM: 0,
    challenge: null, operationTail: Promise.resolve(), pendingOperations: 0, inputWindowAt: 0, inputWindowCount: 0,
    lastTickAt: Date.now(), lastPosition: positionOf(player),
    lastPersistAt: Date.now(), persistPromise: null,
    uniformSnapshot: null, basicToolUid: null, vehicle: null, trailer: null, trailerAttached: false, vehicleConfig: null, leaseExpiresAt: 0,
    haulRoute: null, haulStage: null, haulNonce: 0, haulStartedAt: cargo?.kind === "haul" ? Date.now() : 0,
    haulTravelM: 0, haulSuspiciousM: 0, lastStatePush: 0, expiring: new Set(), missingVehicleCleanup: false,
    outsideZoneSince: 0, outsideZoneWarnings: new Set(), zoneTerminationPending: false, closed: false };
}
async function reconcileBasicTool(state, active) {
  if (!state?.characterUuid) throw new Error("Персонаж не загружен.");
  const result = await repository.reconcileBasicTool(state.characterUuid, active, state.basicToolUid);
  state.basicToolUid = active ? String(result.item?.uid || "") || null : null;
  if (active && !state.basicToolUid) throw new Error("Не удалось выдать рабочую кирку.");
  if (result.inventory && playerExists(state.player)) {
    await inventory.syncInventorySnapshot(state.player, result.inventory);
  }
  return result;
}
async function createState(player) {
  const existing = getState(player); if (existing) return existing;
  const inflight = stateCreations.get(player); if (inflight) return inflight;
  const characterUuid = Number(getUuid(player) || 0);
  if (!characterUuid) throw new Error("Персонаж не загружен.");
  const creation = Promise.all([repository.getProfile(characterUuid), repository.getEntitlements(characterUuid), repository.getActiveCargo(characterUuid)])
    .then(([profile, entitlements, cargo]) => {
      if (!runtime.active || !playerExists(player) || Number(getUuid(player) || 0) !== characterUuid) throw new Error("Игровая сессия изменилась.");
      const state = makeState(player, profile, entitlements, cargo); workers.set(Number(player.id), state); return state;
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
  safeCall(state.player, "client:mining:haul:clear");
}

function spawnAreaFree(vehicleConfig = null) {
  let free = true;
  try {
    mp.vehicles.forEach((vehicle) => {
      if (!free) return;
      if (distance(positionOf(vehicle), config.vehicleSpawn) < 7) free = false;
      if (vehicleConfig?.trailerModel && distance(positionOf(vehicle), config.trailerSpawn) < 7) free = false;
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
    vehicle.setVariable("miningRentalOwner", state.characterUuid);
    vehicle.setVariable("miningRentalRole", role);
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
  const eligible = config.haulDestinations.filter((point) => distance(config.salePoint, point) >= config.haul.minDestinationDistanceM);
  return eligible[Math.floor(Math.random() * eligible.length)] || null;
}
function sendHaulRoute(state) {
  if (!state?.vehicleConfig) return;
  const point = state.cargo?.kind === "haul" && state.cargo.destination ? state.cargo.destination : config.salePoint;
  state.haulRoute = { phase: state.cargo?.kind === "haul" ? "unload" : "load", point, radius: config.haulRadius, company: point.company || "Карьер" };
  safeCall(state.player, "client:mining:haul:route", [JSON.stringify(state.haulRoute)]);
}
async function spawnRental(state, vehicleConfig, remainingMs) {
  if (!runtime.active || state.closed || !playerExists(state.player)) return false;
  if (runtime.vehicleSpawnReserved || !spawnAreaFree(vehicleConfig)) throw new Error("Место выдачи занято. Освободите площадку.");
  runtime.vehicleSpawnReserved = true;
  let vehicle = null; let trailer = null;
  try {
    state.vehicleConfig = vehicleConfig;
    vehicle = mp.vehicles.new(mp.joaat(vehicleConfig.model), new mp.Vector3(config.vehicleSpawn.x, config.vehicleSpawn.y, config.vehicleSpawn.z), { heading: config.vehicleSpawn.heading, dimension: 0 });
    setRentalMetadata(vehicle, state, "tractor");
    if (vehicleConfig.trailerModel) {
      trailer = mp.vehicles.new(mp.joaat(vehicleConfig.trailerModel), new mp.Vector3(config.trailerSpawn.x, config.trailerSpawn.y, config.trailerSpawn.z), { heading: config.trailerSpawn.heading, dimension: 0 });
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
async function restoreRental(state) {
  const entry = leaseEntry(state);
  if (!entry) { if (state.vehicle || state.trailer || state.vehicleConfig) destroyRental(state); return; }
  const healthyRental = state.vehicleConfig && vehicleExists(state.vehicle)
    && (state.vehicleConfig.type !== "truck" || vehicleExists(state.trailer));
  if (healthyRental) { sendHaulRoute(state); return true; }
  if (state.vehicle || state.trailer || state.vehicleConfig) destroyRental(state);
  const vehicleConfig = findVehicleConfig(entry[1].payload?.vehicleId || entry[0].slice(5));
  if (!vehicleConfig) return;
  try { await spawnRental(state, vehicleConfig, entry[1].remainingMs); }
  catch (error) { notify(state.player, `Аренда сохранена. Не удалось выдать транспорт: ${error.message}`, "warning"); }
}
async function shopPayload(state) {
  const selectedTool = activeTool(state).id;
  const equipment = [...Object.values(config.entitlements), { id: "stimulant", name: "Стимулятор добычи x2", price: config.stimulant.price,
    durationMs: config.stimulant.durationMs, minLevel: 1, consumable: true }].map((item) => {
    const active = state.entitlements[item.id]?.remainingMs > 0;
    const reason = state.profile.level < item.minLevel ? `Доступно с ${item.minLevel} уровня` : active ? "Уже активно"
      : item.tool && selectedTool !== "basic_pickaxe" ? "Сначала завершите аренду текущего инструмента" : null;
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

async function openShop(player) {
  try {
    const state = getWorkingState(player);
    if (!state) throw new Error("Сначала начните смену шахтёра.");
    if (Number(player.dimension || 0) !== 0 || distance(positionOf(player), config.npc.position) > config.npc.colshapeRadius + 2) throw new Error("Подойдите к бригадиру шахты.");
    await requirePassport(player);
    safeCall(player, "client:mining:shop:open", [JSON.stringify(await shopPayload(state))]);
    return true;
  } catch (error) { notify(player, error.message || "Магазин недоступен.", "error"); return false; }
}
async function purchaseShop(player, raw) {
  const state = getWorkingState(player); if (!state) return notify(player, "Сначала начните смену шахтёра.", "error");
  return serialize(state, async () => {
    try {
      const payload = parsePayload(raw); const id = String(payload?.id || "");
      if (!id || !hasActiveMiningShift(player, state)) throw new Error("Смена шахтёра не активна.");
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
          if (state.cargo?.kind === "ore") throw new Error("Сначала сдайте породу в тачке.");
          if (state.vehicleConfig && vehicleExists(state.vehicle)) throw new Error("Транспорт уже выдан.");
          await spawnRental(state, vehicleConfig, existingLease.remainingMs);
          notify(player, "Арендованный транспорт восстановлен без повторной оплаты.", "success");
          sendState(state); safeCall(player, "client:mining:shop:update", [JSON.stringify(await shopPayload(state))]); return;
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
          const purchase = await inventory.purchaseItems(player, [{ itemId: config.stimulant.itemId, amount: 1 }], config.stimulant.price);
          if (!purchase?.ok) {
            const messages = { cash: "Недостаточно наличных.", weight: "Инвентарь перегружен.", slots: "В инвентаре нет свободного места." };
            throw new Error(messages[purchase?.reason] || "Не удалось купить стимулятор.");
          }
          syncCash(player, purchase.cash ?? purchase.balance);
          notify(player, "Стимулятор куплен. Используйте его из инвентаря, чтобы запустить добычу x2 на 10 минут.", "success");
          safeCall(player, "client:mining:shop:update", [JSON.stringify(await shopPayload(state))]); return;
        }
        const item = config.entitlements[id];
        if (!item) throw new Error("Неизвестный товар.");
        if (state.expiring.has(item.id)) throw new Error("Подождите завершения предыдущей аренды.");
        if (state.profile.level < item.minLevel) throw new Error(`Товар доступен с ${item.minLevel} уровня.`);
        if (state.entitlements[item.id]?.remainingMs > 0) throw new Error("Этот эффект уже активен.");
        const result = await repository.purchaseEntitlement(state.characterUuid, item, { source: "mining_shop" });
        syncCash(player, result.cashAfter);
        if (result.inventory) await inventory.syncInventorySnapshot(player, result.inventory);
        state.entitlements[item.id] = { remainingMs: item.durationMs, itemUid: result.itemUid || null, payload: result.payload || {} };
        notify(player, `${item.name} активирован. Время замораживается вне игры.`, "success");
      }
      sendState(state);
      broadcastRocks(player);
      safeCall(player, "client:mining:shop:update", [JSON.stringify(await shopPayload(state))]);
    } catch (error) { notify(player, error.message || "Покупка не выполнена.", "error"); }
  });
}

function randomSequence() {
  return Array.from({ length: config.challenge.length }, () => config.challenge.keys[Math.floor(Math.random() * config.challenge.keys.length)]);
}
function expectedDelay(index, tool) {
  return Math.max(config.challenge.minimumDelayMs, config.challenge.firstDelayMs * Number(tool.inputDelayMultiplier || 1) * Math.pow(config.challenge.acceleration, index));
}
function challengeSequencePayload(challenge) {
  // Reveal completed keys and the active key only. Future keys stay masked.
  return challenge.sequence.map((key, index) => index <= challenge.index ? key : "");
}
function challengeFeedbackPayload(challenge, rock, ackInputId, lastCorrect, extra = {}) {
  return {
    token: challenge.token,
    index: challenge.index,
    sequence: challengeSequencePayload(challenge),
    correct: challenge.correct,
    errors: challenge.errors,
    hp: Math.max(0, rock.hp),
    ackInputId,
    lastCorrect: Boolean(lastCorrect),
    ...extra,
  };
}
function pendingRockFor(state, exceptRockId = null) {
  return [...rocks.values()].find((rock) => rock.id !== exceptRockId && Number(rock.participants.get(state.characterUuid)?.damageDealt || 0) > 0) || null;
}
function activeChallengesForRock(rockId) {
  return [...workers.values()].filter((state) => state.challenge?.rockId === rockId);
}
function activateRockCompetition(rock, challengerUuid, now = Date.now()) {
  if (!rock || rock.mode === "competitive") return;
  rock.mode = "competitive";
  rock.competitionEndsAt = now + config.competitionWindowMs;
  rock.competitionIdleSince = 0;
  if (!rock.competitiveAttemptedUuids) rock.competitiveAttemptedUuids = new Set();
  rock.competitiveAttemptedUuids.add(Number(challengerUuid));
  // Every attempt already running when the first challenger scores becomes
  // that player's sole competitive attempt. A solo owner between attempts
  // still receives one final competitive attempt.
  for (const activeState of activeChallengesForRock(rock.id)) {
    rock.competitiveAttemptedUuids.add(Number(activeState.characterUuid));
  }
}
function removeParticipantFromRock(state) {
  if (!state?.challenge) return;
  const rock = rocks.get(state.challenge.rockId);
  const participant = rock?.participants.get(state.characterUuid);
  // Cancelling after one good key must not be a perfect-accuracy shortcut.
  // Keep earned damage, but count every abandoned step as an error.
  if (participant && participant.damageDealt > 0) {
    const abandoned = Math.max(0, state.challenge.sequence.length - state.challenge.index);
    participant.attempts += abandoned;
    participant.errors += abandoned;
  }
  challengeStop(state, "cancelled");
  if (rock && Number(rock.participants.get(state.characterUuid)?.damageDealt || 0) <= 0) rock.participants.delete(state.characterUuid);
  if (rock?.mode === "solo" && Number(rock.soloOwnerUuid) === Number(state.characterUuid)
    && !rock.participants.has(state.characterUuid) && activeChallengesForRock(rock.id).length === 0) {
    rock.mode = "open"; rock.soloOwnerUuid = null; rock.challengerAttemptedUuids = new Set();
  }
  if (rock?.mode === "competitive" && activeChallengesForRock(rock.id).length === 0) rock.competitionIdleSince = Date.now();
  if (rock) try { broadcastRockUpdate(rock); } catch {}
}
function broadcastRockUpdate(rock) {
  const payload = JSON.stringify(rockPayload(rock));
  for (const state of workers.values()) if (playerExists(state.player) && hasActiveMiningShift(state.player, state) && canSeeRock(state, rock)) {
    safeCall(state.player, "client:mining:rock:update", [payload]);
  }
}
async function beginRock(player, raw) {
  const state = getWorkingState(player); if (!state) return notify(player, "Сначала начните смену шахтёра.", "error");
  return serialize(state, async () => {
    try {
      const rock = rocks.get(String(parsePayload(raw)?.rockId || ""));
      if (!rock || rock.settling || rock.hp <= 0) throw new Error("Эта порода уже исчерпана.");
      if (!hasActiveMiningShift(player, state)) throw new Error("Смена шахтёра не активна.");
      if (state.cargo) throw new Error("Сначала доставьте или потеряйте текущий груз.");
      if (state.challenge) throw new Error("Мини-игра уже запущена.");
      const pendingRock = pendingRockFor(state, rock.id);
      if (pendingRock) throw new Error("Сначала завершите добычу породы, в которой уже участвовали.");
      if (player.vehicle) throw new Error("Выйдите из транспорта.");
      if (Number(player.dimension || 0) !== config.zone.dimension || !isInsideZone(positionOf(player), player.dimension)) throw new Error("Вы вне рабочей зоны.");
      if (distance(positionOf(player), rock.position) > config.interactionRadius) throw new Error("Подойдите ближе к породе.");
      await requirePassport(player);
      const tool = await requireOwnedMiningTool(state);
      const now = Date.now();
      if (rocks.get(rock.id) !== rock || rock.settling || rock.hp <= 0) throw new Error("Эта порода уже исчерпана.");
      for (const [uuid, participant] of rock.participants) {
        if (now - participant.lastActivityAt > config.participantIdleMs && participant.damageDealt <= 0) rock.participants.delete(uuid);
      }
      const activeParticipants = activeChallengesForRock(rock.id).length;
      if (activeParticipants >= config.maxParticipants) throw new Error("У этой породы уже слишком много шахтёров.");
      if (rock.mode === "competitive") {
        if (now >= Number(rock.competitionEndsAt || 0)) throw new Error("Соревнование по этой породе уже завершается.");
        if (!rock.competitiveAttemptedUuids) rock.competitiveAttemptedUuids = new Set();
        if (rock.competitiveAttemptedUuids.has(Number(state.characterUuid))
          || rock.challengerAttemptedUuids?.has(Number(state.characterUuid))) {
          throw new Error("В соревновании на этом камне уже использована одна попытка. Выберите новый камень.");
        }
        if (rock.competitiveAttemptedUuids.size >= config.maxParticipants) throw new Error("В соревновании уже занято максимум мест.");
        rock.competitiveAttemptedUuids.add(Number(state.characterUuid));
        rock.competitionIdleSince = 0;
      } else if (rock.mode === "open") {
        rock.mode = "solo"; rock.soloOwnerUuid = Number(state.characterUuid); rock.challengerAttemptedUuids = new Set();
      } else if (Number(rock.soloOwnerUuid) !== Number(state.characterUuid)) {
        if (!rock.challengerAttemptedUuids) rock.challengerAttemptedUuids = new Set();
        if (rock.challengerAttemptedUuids.has(Number(state.characterUuid))) {
          throw new Error("Вы уже использовали одну соревновательную попытку на этом камне.");
        }
        rock.challengerAttemptedUuids.add(Number(state.characterUuid));
      }
      const sequence = randomSequence(); const token = crypto.randomBytes(16).toString("hex");
      state.challenge = { token, rockId: rock.id, sequence, index: 0, correct: 0, errors: 0, startedAt: now,
        lastInputAt: now, deadlineAt: now + config.challenge.ttlMs, tool, intervalRatios: [], timingSuspicion: 0,
        competitionCandidate: rock.mode === "solo" && Number(rock.soloOwnerUuid) !== Number(state.characterUuid) };
      const prior = rock.participants.get(state.characterUuid);
      rock.participants.set(state.characterUuid, prior || { characterUuid: state.characterUuid, attempts: 0, correct: 0, errors: 0,
        damageDealt: 0, yieldDamageTotal: 0, yieldSamples: 0, levelMultiplier: state.profile.kgMultiplier, lastActivityAt: now });
      broadcastRockUpdate(rock);
      try { player.freezePosition(true); } catch {}
      safeCall(player, "client:mining:challenge:start", [JSON.stringify({ token, rockId: rock.id, resourceName: rock.resource.name,
        hp: rock.hp, maxHp: rock.resource.hp, sequence: challengeSequencePayload(state.challenge), ttlMs: config.challenge.ttlMs,
        firstDelayMs: expectedDelay(0, tool), minimumDelayMs: config.challenge.minimumDelayMs,
        acceleration: config.challenge.acceleration, tool: tool.id, index: 0, correct: 0, errors: 0 })]);
    } catch (error) { notify(player, error.message || "Нельзя начать добычу.", "error"); }
  });
}

function challengeStop(state, reason = "cancelled") {
  state.challenge = null;
  try { if (playerExists(state.player)) state.player.freezePosition(false); } catch {}
  safeCall(state.player, "client:mining:challenge:stop", [String(reason)]);
}
function allocationForRock(rock) {
  // Zero correct inputs are not a paid participation. Otherwise a player can
  // intentionally wait for TIMEOUT and farm the guaranteed share.
  const participants = [...rock.participants.values()].filter((entry) => entry.damageDealt > 0 && entry.correct > 0);
  const scored = participants.map((entry) => {
    const accuracy = entry.correct / Math.max(1, entry.attempts);
    const score = Math.max(0.01, entry.damageDealt * (0.55 + accuracy * 0.45));
    return { ...entry, accuracy, score };
  });
  const scoreTotal = scored.reduce((sum, entry) => sum + entry.score, 0);
  const floor = Math.min(config.minShare, 1 / Math.max(1, scored.length));
  const distributable = Math.max(0, 1 - floor * scored.length);
  const extractedFraction = Math.max(0, Math.min(1, Number(rock.settleFraction ?? 1)));
  const baseKg = (rock.resource.kg[0] + Math.random() * (rock.resource.kg[1] - rock.resource.kg[0])) * extractedFraction;
  return scored.map((entry) => {
    const share = floor + distributable * entry.score / Math.max(0.01, scoreTotal);
    const quality = 0.55 + 0.45 * entry.accuracy;
    const yieldMultiplier = entry.yieldSamples > 0 ? entry.yieldDamageTotal / entry.yieldSamples : 1;
    const kg = Math.max(0.01, Number((baseKg * share * quality * yieldMultiplier * Number(entry.levelMultiplier || 1)).toFixed(2)));
    return { characterUuid: entry.characterUuid, share, accuracy: entry.accuracy, yieldMultiplier,
      kg, payout: Math.round(kg * rock.resource.pricePerKg),
      xp: Math.max(1, Math.round(rock.resource.xp * share * quality * extractedFraction)) };
  });
}
async function finalizeRock(rock, retry = false) {
  if (!rock || (rock.settling && !retry)) return;
  rock.settling = true;
  if (!retry) {
    for (const activeState of activeChallengesForRock(rock.id)) challengeStop(activeState, "depleted");
  }
  try {
    if (!rock.finalAllocations) rock.finalAllocations = allocationForRock(rock);
    const result = await repository.settleRock(rock, rock.finalAllocations);
    const cargoByUuid = new Map((result.cargo || []).map((cargo) => [cargo.characterUuid, cargo]));
    for (const participant of rock.participants.values()) {
      const player = playerByUuid(participant.characterUuid); const state = player ? getState(player) : null;
      if (state?.challenge?.rockId === rock.id) challengeStop(state, "depleted");
      const cargo = cargoByUuid.get(participant.characterUuid);
      if (state && cargo) {
        state.cargo = cargo; state.cargoStartedAt = Date.now(); state.cargoOrigin = rock.position;
        state.cargoTravelM = 0; state.cargoSuspiciousM = 0;
        safeCall(player, "client:mining:cargo:set", [JSON.stringify(publicCargo(cargo))]); sendState(state);
        notify(player, `Получено ${cargo.kg.toFixed(2)} кг: ${cargo.resourceName}. Доставьте тачку к точке сбыта.`, "success");
      } else if (state && participant.damageDealt <= 0) {
        notify(player, "Добыча не получена: не выполнено ни одной правильной клавиши.", "warning");
      } else if (state) notify(player, "Вы участвовали, но не можете взять груз: завершите текущую доставку.", "warning");
    }
    rocks.delete(rock.id);
    try { mp.players.forEach((player) => safeCall(player, "client:mining:rock:remove", [rock.id])); } catch {}
  } catch (error) {
    console.error("[MINING] Rock settlement failed:", error);
    rock.settleAttempts = Number(rock.settleAttempts || 0) + 1;
    const delays = [1000, 3000, 8000];
    if (rock.settleAttempts <= delays.length) {
      addTimeout(() => finalizeRock(rock, true), delays[rock.settleAttempts - 1]);
    } else {
      rock.settling = false; rock.settleAttempts = 0; rock.finalAllocations = null; rock.hp = 1; rock.settleFraction = null;
      rock.mode = "solo"; rock.competitionEndsAt = 0; rock.competitionIdleSince = 0;
      rock.challengerAttemptedUuids = new Set(); rock.competitiveAttemptedUuids = new Set();
      rock.soloOwnerUuid = Number([...rock.participants.values()].find((entry) => entry.damageDealt > 0)?.characterUuid || 0) || null;
      broadcastRockUpdate(rock);
      for (const participant of rock.participants.values()) {
        const player = playerByUuid(participant.characterUuid);
        if (player) notify(player, "Фиксация породы временно не удалась. Сделайте ещё один удар — награда не потеряна.", "warning");
      }
    }
  }
}
async function inputRock(player, raw, receivedAt = Date.now()) {
  const state = getWorkingState(player); if (!state) return;
  return serialize(state, async () => {
    const challenge = state.challenge; const payload = parsePayload(raw);
    if (!challenge || !payload) return;
    const rock = rocks.get(challenge.rockId);
    const requestedIndex = Number(payload.index);
    const inputId = String(payload.inputId || "").slice(0, 128);
    if (String(payload.token || "") !== challenge.token || !inputId) return;
    if (challenge.lastAck?.inputId === inputId) {
      safeCall(player, "client:mining:challenge:feedback", [JSON.stringify(challenge.lastAck.payload)]);
      return;
    }
    if (!rock || rock.settling || receivedAt > challenge.deadlineAt) return removeParticipantFromRock(state);
    if (player.vehicle || Number(player.dimension || 0) !== config.zone.dimension || distance(positionOf(player), rock.position) > config.interactionRadius + 0.8) return removeParticipantFromRock(state);
    if (requestedIndex !== challenge.index) {
      safeCall(player, "client:mining:challenge:feedback", [JSON.stringify(
        challengeFeedbackPayload(challenge, rock, inputId, false, { resync: true })
      )]);
      return;
    }
    const expected = expectedDelay(challenge.index, challenge.tool);
    const elapsed = receivedAt - challenge.lastInputAt;
    const maximum = expected * 2.75 + 650;
    const firstInput = challenge.index === 0;
    const participant = rock.participants.get(state.characterUuid); if (!participant) return removeParticipantFromRock(state);
    if (elapsed < config.challenge.serverMinIntervalMs) {
      const throttled = challengeFeedbackPayload(challenge, rock, inputId, false, { resync: true, reason: "too_fast" });
      challenge.lastAck = { inputId, payload: throttled };
      safeCall(player, "client:mining:challenge:feedback", [JSON.stringify(throttled)]);
      return;
    }
    challenge.lastInputAt = receivedAt; challenge.index += 1; participant.attempts += 1; participant.lastActivityAt = receivedAt;
    const submittedKey = String(payload.key || "").toUpperCase();
    const correct = submittedKey === challenge.sequence[requestedIndex];
    // A fast correct press must never be shown as a wrong key. Token, step,
    // global TTL and the per-second input window remain server-authoritative;
    // very regular intervals are telemetry only and do not punish high-FPS or
    // low-ping players.
    // The first step includes asynchronous CEF startup time. Give it the
    // global TTL instead of misclassifying a correct key on a slow client.
    const timingAccepted = firstInput || elapsed <= maximum;
    if (correct && timingAccepted && submittedKey !== "TIMEOUT") {
      challenge.intervalRatios.push(elapsed / Math.max(1, expected));
    }
    if (challenge.intervalRatios.length >= 8) {
      const sample = challenge.intervalRatios.slice(-8); const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
      const deviation = Math.sqrt(sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sample.length);
      if (deviation < 0.012) challenge.timingSuspicion += 1;
    }
    if (correct && timingAccepted) {
      if (challenge.competitionCandidate && rock.mode !== "competitive") {
        activateRockCompetition(rock, state.characterUuid, receivedAt);
      }
      challenge.correct += 1; participant.correct += 1;
      const applied = Math.min(rock.hp, Math.max(1, Number(challenge.tool.damage || 8)));
      rock.hp -= applied; participant.damageDealt += applied;
      participant.yieldDamageTotal += currentYieldMultiplier(state, challenge.tool) * applied;
      participant.yieldSamples += applied;
    } else { challenge.errors += 1; participant.errors += 1; }
    broadcastRockUpdate(rock);
    const feedback = challengeFeedbackPayload(challenge, rock, inputId, correct && timingAccepted);
    challenge.lastAck = { inputId, payload: feedback };
    safeCall(player, "client:mining:challenge:feedback", [JSON.stringify(feedback)]);
    if (rock.hp <= 0) { rock.settleFraction = 1; return finalizeRock(rock); }
    if (challenge.index >= challenge.sequence.length || receivedAt >= challenge.deadlineAt) {
      const competitive = rock.mode === "competitive";
      removeParticipantFromRock(state);
      notify(player, competitive
        ? "Попытка завершена. В соревновании этот камень повторно добывать нельзя."
        : "Подход завершён. Пока вы работаете один, нажмите E и продолжайте добычу.");
    }
  });
}

async function sellOre(player) {
  const state = getWorkingState(player); if (!state) return notify(player, "Сначала начните смену шахтёра.", "error");
  return serialize(state, async () => {
    try {
      const cargo = state.cargo;
      if (!cargo || cargo.kind !== "ore") throw new Error("У вас нет породы для продажи.");
      if (player.vehicle || Number(player.dimension || 0) !== 0 || distance(positionOf(player), config.salePoint) > config.sellRadius) throw new Error("Доставьте тачку к точке сбыта пешком.");
      if (state.cargoStartedAt) {
        const direct = distance(state.cargoOrigin, config.salePoint);
        if (Date.now() - state.cargoStartedAt < Math.max(4000, direct / 4 * 1000)
          || state.cargoTravelM < Math.max(5, direct * 0.35) || state.cargoSuspiciousM > Math.max(20, direct * 0.6)) {
          throw new Error("Маршрут тачки не подтверждён сервером.");
        }
      }
      const trophyEntitlementMultiplier = await jobRewardMultiplier.getMultiplier(player, "mining");
      const productionMultiplier = Math.max(1, Math.min(config.yieldMultiplierCap, Number(cargo.metrics?.yieldMultiplier || 1)));
      const trophyMultiplier = trophyEntitlementMultiplier > 1 ? Math.max(1, config.yieldMultiplierCap / productionMultiplier) : 1;
      const finalPayout = Math.round(Number(cargo.payout || 0) * trophyMultiplier);
      const result = await repository.sellOre(state.characterUuid, cargo.id, finalPayout);
      state.profile = result.profile; state.cargo = null; state.cargoStartedAt = null;
      await refreshStock(true);
      syncCash(player, result.cashAfter); safeCall(player, "client:mining:cargo:clear"); sendState(state);
      if (!result.alreadySettled) {
        notify(player, `Порода сдана. Выплата: $${finalPayout.toLocaleString("ru-RU")}${trophyEntitlementMultiplier > 1 ? " · секретная пила · общий предел x3" : ""}.`, "success");
        logsDb.writeMoneyLog({ source: "job_mining", action: "ore_sale", currency: "cash", amount: finalPayout,
          balanceBefore: result.cashBefore, balanceAfter: result.cashAfter, target: player,
          comment: `${cargo.resourceName}, ${cargo.kg} кг`, metadata: { cargoId: cargo.id } }).catch(() => {});
        quests.recordProgress(player, { type: "job.money_earned", subjectId: "mining", idempotencyKey: `mining:ore:${cargo.id}`,
          amount: finalPayout, metadata: { jobId: "mining", cargoId: cargo.id, trophyEntitlementMultiplier,
            appliedTrophyMultiplier: trophyMultiplier, productionMultiplier } }, { sync: true }).catch(() => {});
        if (result.newLevel > result.oldLevel) notify(player, `Новый уровень шахтёра: ${result.newLevel}!`, "success");
      }
    } catch (error) { notify(player, error.message || "Не удалось сдать породу.", "error"); }
  });
}
async function spillOre(player, options = {}) {
  const state = getWorkingState(player); if (!state) return;
  return serialize(state, async () => {
    const cargo = state.cargo;
    if (!cargo || cargo.kind !== "ore" || (player.vehicle && !options.force)) return;
    const result = await repository.spillOre(state.characterUuid, cargo.id);
    if (!result.spilled) return;
    state.cargo = null; state.cargoStartedAt = null;
    safeCall(player, "client:mining:cargo:clear"); sendState(state);
    notify(player, `Вы рассыпали ${cargo.kg.toFixed(2)} кг породы. Груз потерян.`, "error");
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
  safeCall(state.player, "client:mining:haul:stage:cancel", [String(reason || "Операция прервана")]);
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
      const directDistance = distance(config.salePoint, destination); const routeDistance = directDistance * config.haul.roadDistanceMultiplier;
      const currentStock = await refreshStock(false);
      const minimumStockKg = Math.max(1, Number(config.haul.minimumStockKg || 1));
      if (Number(currentStock.totalKg || 0) < minimumStockKg) {
        throw new Error(`На общем складе ${Number(currentStock.totalKg || 0).toFixed(1)} кг породы. Для рейса нужно хотя бы ${minimumStockKg} кг.`);
      }
      const [minKg, maxKg] = state.vehicleConfig.capacityKg;
      const targetKg = Math.round(minKg + Math.random() * (maxKg - minKg));
      const weightKg = Math.max(minimumStockKg, Math.min(targetKg, Math.floor(Number(currentStock.totalKg || 0))));
      const trophyMultiplier = await jobRewardMultiplier.getMultiplier(player, "mining");
      const payout = Math.max(config.haul.minimumPay, Math.round((config.haul.basePay + routeDistance / 1000 * config.haul.payPerKm
        + weightKg * config.haul.payPerKg) * state.vehicleConfig.payoutMultiplier * trophyMultiplier));
      if (state.haulNonce !== nonce || state.haulStage !== stage || !haulAligned(player, state)) return cancelHaulStage(state, "Операция прервана.");
      state.cargo = await repository.createHaul(state.characterUuid, state.vehicleConfig.id, destination, weightKg, payout, config.haul.xp,
        { plannedDistanceM: routeDistance, directDistanceM: directDistance });
      await refreshStock(true);
      state.haulStartedAt = Date.now(); state.haulTravelM = 0; state.haulSuspiciousM = 0;
      notify(player, `Загружено ${weightKg.toLocaleString("ru-RU")} кг общей породы. Следуйте к точке разгрузки.`, "success");
    } else {
      const cargo = state.cargo;
      if (!cargo || cargo.kind !== "haul") throw new Error("Груз породы не найден.");
      const planned = Math.max(1, Number(cargo.metrics?.plannedDistanceM || distance(config.salePoint, cargo.destination) * config.haul.roadDistanceMultiplier));
      const integritySpeedMps = Math.min(38, config.haul.maxPlausibleSpeedMps);
      const minimumTime = Math.max(20, planned / integritySpeedMps) * 1000;
      if (Date.now() - state.haulStartedAt < minimumTime || state.haulTravelM < planned * 0.75
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
        logsDb.writeMoneyLog({ source: "job_mining", action: "ore_haul", currency: "cash", amount: cargo.payout,
          balanceBefore: result.cashBefore, balanceAfter: result.cashAfter, target: player,
          comment: `Рейс породы ${cargo.id}`, metadata: { cargoId: cargo.id } }).catch(() => {});
        quests.recordProgress(player, { type: "job.money_earned", subjectId: "mining", idempotencyKey: `mining:haul:${cargo.id}`,
          amount: cargo.payout, metadata: { jobId: "mining", cargoId: cargo.id } }, { sync: true }).catch(() => {});
      }
    }
    state.haulStage = null; safeCall(player, "client:mining:haul:stage:complete"); sendHaulRoute(state); sendState(state);
  } catch (error) {
    state.haulStage = null; safeCall(player, "client:mining:haul:stage:cancel", [error.message || "Операция не выполнена"]);
    if (!String(error.message).includes("route_integrity_failed")) notify(player, error.message || "Операция не выполнена.", "error");
  }
}
async function beginHaulStage(player) {
  const state = getWorkingState(player); if (!state) return notify(player, "Сначала начните смену шахтёра.", "error");
  return serialize(state, async () => {
    try {
      if (state.profile.level < 6) throw new Error("Перевозка породы доступна с 6 уровня.");
      if (!state.vehicleConfig || !vehicleExists(state.vehicle)) throw new Error("Сначала арендуйте рабочий транспорт.");
      if (Date.now() >= state.leaseExpiresAt && state.cargo?.kind !== "haul") throw new Error("Срок аренды транспорта истёк.");
      if (state.challenge || state.haulStage) throw new Error("Другая операция уже выполняется.");
      if (pendingRockFor(state)) throw new Error("Сначала завершите породу, в добыче которой уже участвовали.");
      await requirePassport(player); await requireVehicleLicense(player, state.vehicleConfig);
      const expectedPhase = state.cargo?.kind === "haul" ? "unload" : "load";
      if (state.cargo && state.cargo.kind !== "haul") throw new Error("Сначала сдайте породу в тачке.");
      if (expectedPhase === "load") {
        const currentStock = await refreshStock(false);
        const minimumStockKg = Math.max(1, Number(config.haul.minimumStockKg || 1));
        if (Number(currentStock.totalKg || 0) < minimumStockKg) {
          throw new Error(`Погрузка пуста: шахтёры сдали только ${Number(currentStock.totalKg || 0).toFixed(1)} кг породы из ${minimumStockKg} кг.`);
        }
      }
      if (!state.haulRoute || state.haulRoute.phase !== expectedPhase || !haulAligned(player, state)) throw new Error("Поставьте транспорт точно в метку и остановитесь.");
      state.haulStage = expectedPhase === "load" ? "loading" : "unloading";
      state.haulNonce += 1; const nonce = state.haulNonce;
      const durationMs = state.haulStage === "loading" ? config.haul.loadingMs : config.haul.unloadingMs;
      safeCall(player, "client:mining:haul:stage:start", [JSON.stringify({ title: state.haulStage === "loading" ? "Погрузка породы" : "Разгрузка породы", durationMs })]);
      addTimeout(() => serialize(state, () => completeHaulStage(state, nonce), { silent: true }).catch((error) => console.error("[MINING] Haul stage failed:", error)), durationMs);
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
    sendState(state); if (type === "gps") broadcastRocks(state.player);
  } catch (error) { console.error(`[MINING] Entitlement ${type} expiry failed:`, error); }
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
  }, { silent: true }).catch((error) => console.error("[MINING] Loaded lease expiry failed:", error))
    .finally(() => state.expiring.delete(type));
}
function sampleTravel(state, elapsedMs) {
  const playerPosition = positionOf(state.player); const previous = state.lastPosition;
  state.lastPosition = playerPosition;
  if (!previous || !playerPosition) return;
  const segment = distance(previous, playerPosition);
  if (state.cargo?.kind === "ore" && !state.player.vehicle) {
    const plausible = 12 * elapsedMs / 1000 + 5;
    if (segment <= plausible) state.cargoTravelM += segment; else state.cargoSuspiciousM += segment;
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
    safeCall(player, "client:mining:safeZone", [true]);
  } else if (inside && previous) {
    try {
      player.health = Math.max(Number(player.health || 0), previous.health);
      player.armour = Math.max(Number(player.armour || 0), previous.armour);
    } catch {}
    previous.health = Math.max(previous.health, Math.max(0, Number(player.health || 0)));
    previous.armour = Math.max(previous.armour, Math.max(0, Number(player.armour || 0)));
    suppressSafeZoneWeapon(player, previous);
  } else if (!inside && previous) {
    safeZoneState.delete(player); safeCall(player, "client:mining:safeZone", [false]);
    if (previous.suppressedWeapons?.size) inventory.restoreEquipment(player).then(() => {
      if (miningCombatGuard(player)) suppressSafeZoneWeapon(player, safeZoneState.get(player));
    }).catch((error) => console.error("[MINING] Weapon restore after safe zone failed:", error));
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
  }, { silent: true }).catch((error) => console.error("[MINING] Missing rental cleanup failed:", error))
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
    notify(state.player, "Вы далеко от шахты. Вернитесь в течение 5 минут, иначе смена завершится автоматически.", "warning");
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
    terminateWorkerOutsideZone(state).catch((error) => console.error("[MINING] Zone timeout failed:", error));
  }
}
function tick() {
  const now = Date.now();
  for (const state of workers.values()) {
    if (state.closed || !playerExists(state.player)) continue;
    const elapsed = Math.max(0, Math.min(5000, now - state.lastTickAt)); state.lastTickAt = now;
    for (const [type, value] of Object.entries(state.entitlements)) {
      value.remainingMs = Math.max(0, Number(value.remainingMs) - elapsed);
      if (value.remainingMs <= 0) {
        if (type.startsWith("haul:") && state.cargo?.kind === "haul") expireLoadedHaul(state, type);
        else expireEntitlement(state, type, value).catch(() => {});
      }
    }
    if (state.challenge && now > state.challenge.deadlineAt) removeParticipantFromRock(state);
    if (state.haulStage && !haulAligned(state.player, state)) cancelHaulStage(state, "Транспорт покинул зону операции.");
    updateShiftBoundary(state, now);
    if (state.zoneTerminationPending) continue;
    sampleTravel(state, elapsed);
    if (state.vehicleConfig && (!vehicleExists(state.vehicle) || (state.vehicleConfig.type === "truck" && !vehicleExists(state.trailer)))) cleanupMissingVehicle(state);
    const lease = leaseEntry(state);
    if (state.vehicleConfig && !lease && state.cargo?.kind !== "haul") destroyRental(state);
    persistEntitlements(state).catch(() => {});
    if (now - state.lastStatePush >= 5000) { state.lastStatePush = now; sendState(state); broadcastRocks(state.player); }
  }
  for (const rock of rocks.values()) {
    if (rock.settling || rock.mode !== "competitive") continue;
    if (activeChallengesForRock(rock.id).length > 0) { rock.competitionIdleSince = 0; continue; }
    if (!rock.competitionIdleSince) rock.competitionIdleSince = now;
    const idleFinished = now - rock.competitionIdleSince >= config.competitionIdleSettleMs;
    const windowFinished = now >= Number(rock.competitionEndsAt || 0);
    if (!idleFinished && !windowFinished) continue;
    const extracted = Math.max(0, Number(rock.resource.hp) - Number(rock.hp));
    if (extracted <= 0) continue;
    rock.settleFraction = Math.max(0, Math.min(1, extracted / Math.max(1, Number(rock.resource.hp))));
    finalizeRock(rock).catch((error) => console.error("[MINING] Partial competition settlement failed:", error));
  }
}

async function joinMiningJob(player) {
  let assigned = false;
  let state = null;
  try {
    if (!schemaReady) throw new Error("Шахта запускается. Попробуйте через несколько секунд.");
    if (Number(player.dimension || 0) !== 0 || distance(positionOf(player), config.npc.position) > config.npc.colshapeRadius + 2) throw new Error("Подойдите к бригадиру шахты.");
    await requirePassport(player);
    const activeState = getState(player);
    if (activeState && player.__activeJob === "mining") {
      player.__miningShiftStartedForUuid = Number(getUuid(player) || 0);
      await reconcileBasicTool(activeState, true);
      applyUniform(player, activeState); broadcastRocks(player); sendState(activeState);
      if (activeState.cargo?.kind === "ore") safeCall(player, "client:mining:cargo:set", [JSON.stringify(publicCargo(activeState.cargo))]);
      await restoreRental(activeState);
      if (activeState.vehicleConfig) sendHaulRoute(activeState);
      notify(player, "Смена шахтёра уже активна.", "info");
      return true;
    }
    await employment.assignJob(player, "mining");
    assigned = true;
    state = await createState(player);
    await reconcileBasicTool(state, true);
    player.__miningShiftStartedForUuid = Number(getUuid(player) || 0);
    applyUniform(player, state); broadcastRocks(player); sendState(state);
    if (state.cargo?.kind === "ore") safeCall(player, "client:mining:cargo:set", [JSON.stringify(publicCargo(state.cargo))]);
    await restoreRental(state);
    if (state.vehicleConfig) sendHaulRoute(state);
    notify(player, "Смена шахтёра начата. Новая порода появляется каждые 5 минут.", "success");
    return true;
  } catch (error) {
    if (assigned) {
      try { await employment.clearJob(player, "mining", { reason: "start-failed" }); } catch {}
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
        const result = await repository.reconcileBasicTool(characterUuid, false);
        if (result.inventory && playerExists(player)) await inventory.syncInventorySnapshot(player, result.inventory);
      } catch (error) { console.error("[MINING] Orphan basic tool cleanup failed:", error); }
    }
    return true;
  }
  const reason = String(options.reason || "");
  const forced = ["playerQuit", "shutdown", "hot-reload", "character-reload", "zone-timeout", "session-login-reset"].includes(reason);
  const pendingShare = Boolean(pendingRockFor(state));
  if (!forced && pendingShare) {
    notify(player, "Сначала завершите породу, в добыче которой уже участвовали.", "error");
    return false;
  }
  if (!forced && state.cargo) {
    notify(player, state.cargo.kind === "haul" ? "Сначала завершите рейс с породой." : "Сначала сдайте или потеряйте породу в тачке.", "error");
    return false;
  }
  await state.operationTail.catch(() => undefined);
  if (state.challenge) removeParticipantFromRock(state);
  if (state.haulStage) cancelHaulStage(state, "Смена завершена.");
  if (reason === "zone-timeout") await cancelCargoAndRental(state, "mining-zone-timeout");
  await persistEntitlements(state, true).catch((error) => console.error("[MINING] Final persistence failed:", error));
  await reconcileBasicTool(state, false).catch((error) => console.error("[MINING] Basic tool cleanup failed:", error));
  await restoreUniform(player, state); destroyRental(state);
  safeCall(player, "client:mining:cleanup");
  state.closed = true;
  if (workers.get(Number(player.id)) === state) workers.delete(Number(player.id));
  if (!["shutdown", "hot-reload"].includes(reason)) player.__miningShiftStartedForUuid = 0;
  return true;
}
async function terminateWorkerOutsideZone(state) {
  if (!state || state.closed || state.zoneTerminationPending || workers.get(Number(state.player.id)) !== state) return false;
  state.zoneTerminationPending = true;
  notify(state.player, "Вы не вернулись к шахте за 5 минут. Смена завершается.", "error");
  try {
    const result = await employment.clearJob(state.player, "mining", { reason: "zone-timeout" });
    if (!result.cleared) {
      await stopWorker(state.player, { reason: "zone-timeout" });
      await employment.restorePlayer(state.player);
    }
    notify(state.player, "Смена шахтёра завершена из-за отсутствия в рабочей зоне.", "warning");
    return true;
  } catch (error) {
    state.zoneTerminationPending = false;
    state.outsideZoneSince = Date.now();
    state.outsideZoneWarnings.clear();
    notify(state.player, "Не удалось автоматически завершить смену. Повторная проверка через 5 минут.", "error");
    throw error;
  }
}
async function leaveMiningJob(player) {
  const state = getState(player);
  if (state?.cargo) {
    notify(player, state.cargo.kind === "haul" ? "Завершите рейс породы перед увольнением." : "Сдайте или потеряйте породу перед увольнением.", "error");
    return false;
  }
  try {
    const result = await employment.clearJob(player, "mining");
    if (result.cleared) notify(player, "Смена шахтёра завершена.", "success");
    return Boolean(result.cleared);
  } catch (error) { notify(player, error.message || "Не удалось завершить смену.", "error"); return false; }
}
async function restoreMiningWorker(player) {
  if (!runtime.active || !schemaReady || !playerExists(player) || !hasMiningShiftMarker(player) || getState(player)) return;
  try {
    const state = await createState(player); await reconcileBasicTool(state, true); applyUniform(player, state); broadcastRocks(player); sendState(state);
    if (state.cargo?.kind === "ore") safeCall(player, "client:mining:cargo:set", [JSON.stringify(publicCargo(state.cargo))]);
    const nearForeman = Number(player.dimension || 0) === 0 && distance(positionOf(player), config.npc.position) <= config.npc.colshapeRadius + 2;
    if (nearForeman) {
      await restoreRental(state); if (state.vehicleConfig) sendHaulRoute(state);
    } else if (leaseEntry(state)) {
      notify(player, "Аренда и активный рейс сохранены. Вернитесь к бригадиру, чтобы восстановить транспорт без оплаты.", "info");
    }
  } catch (error) { console.error("[MINING] Worker restore failed:", error); }
}
async function cancelCargoAndRental(state, reason) {
  if (state.cargo?.kind === "ore") {
    await repository.spillOre(state.characterUuid, state.cargo.id); state.cargo = null;
    safeCall(state.player, "client:mining:cargo:clear");
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
  if (!state) throw new Error("Аренду можно передать или выбросить только во время смены шахтёра.");
  const type = String(item?.miningRentalType || item?.entitlementType || "");
  if (!config.entitlements[type]) throw new Error("Неизвестная аренда.");
  return serialize(state, async () => {
    if (state.challenge) throw new Error("Сначала завершите добычу камня.");
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
    if (type === "gps") broadcastRocks(player);
    notify(player, `Аренда превращена в переносимый ваучер. Осталось ${Math.ceil(result.remainingMs / 60000)} мин.`, "info");
    return result;
  });
}

const miningInventoryBridge = { releaseRentalItem };
global.twinkleMining = miningInventoryBridge;

registerEvent("server:mining:shop:purchase", (player, raw) => {
  const state = getWorkingState(player); if (!allowAction(state, "shop", 500)) return;
  purchaseShop(player, raw).catch((error) => console.error("[MINING] Shop handler failed:", error));
});
registerEvent("server:mining:rock:begin", (player, raw) => {
  const state = getWorkingState(player); if (!allowAction(state, "rock_begin", 300)) return;
  beginRock(player, raw).catch((error) => console.error("[MINING] Rock begin failed:", error));
});
registerEvent("server:mining:rock:input", (player, raw) => {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 512) return;
  const state = getWorkingState(player); if (!state) return;
  const now = Date.now();
  if (now - state.inputWindowAt >= 1000) { state.inputWindowAt = now; state.inputWindowCount = 0; }
  state.inputWindowCount += 1; if (state.inputWindowCount > 32) return;
  inputRock(player, raw, now).catch((error) => console.error("[MINING] Rock input failed:", error));
});
registerEvent("server:mining:rock:cancel", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "rock_cancel", 250)) return;
  serialize(state, () => removeParticipantFromRock(state), { silent: true }).catch(() => {});
});
registerEvent("server:mining:cargo:sell", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "sell", 900)) return;
  sellOre(player).catch((error) => console.error("[MINING] Sale failed:", error));
});
registerEvent("server:mining:cargo:spill", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "spill", 1200)) return;
  spillOre(player).catch((error) => console.error("[MINING] Spill failed:", error));
});
registerEvent("server:mining:haul:stage", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "haul_stage", 600)) return;
  beginHaulStage(player).catch((error) => console.error("[MINING] Haul stage failed:", error));
});
registerEvent("server:mining:gps:toggle", (player) => {
  const state = getWorkingState(player); if (!allowAction(state, "gps_toggle", 600)) return;
  serialize(state, async () => {
    try {
      const gps = state.entitlements.gps;
      if (!gps?.remainingMs) throw new Error("Сначала арендуйте GPS-перехватчик.");
      const enabled = gps.payload?.enabled === false;
      const payload = { ...(gps.payload || {}), enabled };
      const result = await repository.saveEntitlement(state.characterUuid, "gps", gps.remainingMs, payload);
      if (!result?.ok) throw new Error("Не удалось изменить состояние GPS.");
      gps.remainingMs = Number(result.remainingMs || gps.remainingMs);
      gps.itemUid = result.itemUid || gps.itemUid;
      gps.payload = payload;
      if (result.inventory) await inventory.syncInventorySnapshot(player, result.inventory);
      sendState(state); broadcastRocks(player);
      notify(player, enabled ? "GPS шахты включён: камни снова показаны." : "GPS шахты выключен через навигатор.", "success");
    } catch (error) { notify(player, error.message || "Не удалось переключить GPS.", "error"); }
  }, { silent: true }).catch((error) => console.error("[MINING] GPS toggle failed:", error));
});
registerEvent("playerDamage", (player) => {
  const snapshot = safeZoneState.get(player); if (!snapshot || !isInsideZone(positionOf(player), player.dimension)) return;
  try { player.health = Math.max(Number(player.health || 0), snapshot.health); player.armour = Math.max(Number(player.armour || 0), snapshot.armour); } catch {}
});
registerEvent("playerWeaponChange", (player, _oldWeapon, newWeapon) => {
  if (!miningCombatGuard(player)) return;
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
  if (state.challenge) removeParticipantFromRock(state);
  cancelHaulStage(state, "Вы погибли.");
  serialize(state, () => cancelCargoAndRental(state, "player_died"), { silent: true })
    .catch((error) => console.error("[MINING] Death cleanup failed:", error));
});
registerEvent("vehicleDeath", (vehicle) => {
  for (const state of workers.values()) if (state.vehicle === vehicle || state.trailer === vehicle) {
    cancelHaulStage(state, "Рабочий транспорт уничтожен.");
    serialize(state, () => cancelCargoAndRental(state, "work_vehicle_destroyed"), { silent: true })
      .catch((error) => console.error("[MINING] Vehicle death cleanup failed:", error));
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
    notify(player, "Этот рабочий транспорт арендован другим шахтёром.", "error");
    return;
  }
  const state = getState(player);
  if (state?.cargo?.kind === "ore") {
    try { player.removeFromVehicle?.(); } catch {}
    notify(player, "С тачкой нельзя садиться в транспорт. Груз останется у вас.", "warning");
  }
});
registerEvent("playerQuit", (player) => {
  const state = getState(player); if (!state) return;
  stopWorker(player, { reason: "playerQuit" }).catch((error) => console.error("[MINING] Quit cleanup failed:", error));
});
registerEvent("twinkle:character:loaded", (player) => {
  player.__miningShiftStartedForUuid = 0;
  safeCall(player, "client:mining:cleanup");
  addTimeout(() => {
    broadcastRocks(player);
    if (!playerExists(player) || player.__activeJob !== "mining" || hasMiningShiftMarker(player)) return;
    employment.clearJob(player, "mining", { reason: "session-login-reset" })
      .then((result) => {
        if (result.cleared) notify(player, "Прошлая смена закрыта. Подойдите к бригадиру, чтобы начать новую.", "info");
      })
      .catch((error) => console.error("[MINING] Login shift reset failed:", error));
  }, 500);
});

registerEvent("mining:item:useStimulant", (player, item, token) => {
  if (!inventory.isInternalItemUseToken(token)) return;
  const state = getWorkingState(player);
  if (!state) return notify(player, "Стимулятор можно использовать только во время смены шахтёра.", "error");
  if (!allowAction(state, "use_stimulant", 1000)) return;
  serialize(state, async () => {
    try {
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
      sendState(state); notify(player, "Стимулятор активирован: добыча x2 на 10 минут.", "success");
    } catch (error) { notify(player, error.message || "Не удалось использовать стимулятор.", "error"); }
  });
});

registerEvent("mining:item:useRentalVoucher", (player, item, token) => {
  if (!inventory.isInternalItemUseToken(token)) return;
  const state = getWorkingState(player);
  if (!state) return notify(player, "Активировать ваучер можно только во время смены шахтёра.", "error");
  if (!allowAction(state, "use_rental_voucher", 1000)) return;
  serialize(state, async () => {
    try {
      const type = String(item?.rentalType || "");
      const definition = config.entitlements[type];
      if (!definition) throw new Error("Неизвестный ваучер аренды.");
      if (state.profile.level < Number(definition.minLevel || 1)) throw new Error(`Эта аренда доступна с ${definition.minLevel} уровня.`);
      if (state.challenge) throw new Error("Сначала завершите добычу камня.");
      const result = await repository.redeemRentalVoucher(state.characterUuid, item);
      await inventory.syncInventorySnapshot(player, result.inventory);
      state.entitlements[type] = { remainingMs: result.remainingMs, itemUid: result.item?.uid || null, payload: result.payload || {} };
      sendState(state); if (type === "gps") broadcastRocks(player);
      notify(player, `${definition.name} активирован из ваучера на ${Math.ceil(result.remainingMs / 60000)} мин.`, "success");
    } catch (error) { notify(player, error.message || "Не удалось активировать ваучер.", "error"); }
  });
});

employment.registerRuntimeCleanup("mining", (player, context) => stopWorker(player, { reason: context?.reason || "job-change" }), { replace: true });

addInterval(securityTick, 150);
addInterval(tick, 1000);
addInterval(spawnScheduledWave, config.waveMs);
addInterval(() => {
  if (rocks.size > 0) announceToWorkingMiners(`На шахте доступно залежей: ${rocks.size}. GPS-перехватчик покажет их на карте.`, "#e7c45c");
}, config.publicAnnouncementMs);

runtime.shutdown = () => {
  if (runtime.shutdownPromise) return runtime.shutdownPromise;
  runtime.shutdownPromise = (async () => {
    runtime.active = false;
    for (const timer of runtime.timers.splice(0)) try { clearTimeout(timer); clearInterval(timer); } catch {}
    for (const event of runtime.events.splice(0)) try { mp.events.remove?.(event.name, event.handler); } catch {}
    await Promise.allSettled([...workers.values()].map((state) => stopWorker(state.player, { reason: "shutdown" })));
    workers.clear(); rocks.clear();
    if (global.__twinkleMiningCombatGuard === miningCombatGuard) delete global.__twinkleMiningCombatGuard;
    if (global.twinkleMining === miningInventoryBridge) delete global.twinkleMining;
  })();
  return runtime.shutdownPromise;
};

previousRuntimeShutdown.then(async () => {
  if (!runtime.active) return;
  await repository.ensureSchema(); schemaReady = true; cycle = Date.now();
  await refreshStock(false);
  spawnWave(config.initialWaveSize, false);
  try { mp.players.forEach((player) => { broadcastRocks(player); restoreMiningWorker(player); }); } catch {}
  console.log(`[MINING] Runtime ready: ${rocks.size} rocks, ${config.haulDestinations.length} haul destinations.`);
}).catch((error) => console.error("[MINING] Initialization failed:", error));

module.exports = { isInsideZone, isShiftActive: hasActiveMiningShift, joinMiningJob, leaveMiningJob, openShop };
