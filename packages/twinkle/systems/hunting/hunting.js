"use strict";

const inventory = require("../inventory/inventory.service.js");
const hudNeeds = require("../hud/hudNeeds.service.js");
const licenses = require("../licenses/license.service.js");
const huntingRepository = require("./hunting.repository.js");
const db = require("../../database/query.js");
const logs = require("../../database/logs.js");
const {
  canControlVehicle,
  getVehicleStorageKey,
} = require("../vehicle/vehicle.owner.js");

try {
  global.__twinkleHuntingRuntime?.shutdown?.("reload");
} catch (error) {
  console.error("[HUNTING] Previous runtime shutdown failed:", error);
}

const huntingRuntime = {
  active: true,
  intervals: [],
  events: [],
  commands: [],
  safeZoneShape: null,
  shutdown: null,
};
global.__twinkleHuntingRuntime = huntingRuntime;
const huntingRuntimeSessionId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;

function registerInterval(callback, delay) {
  const handle = setInterval(callback, delay);
  huntingRuntime.intervals.push(handle);
  return handle;
}

function registerServerEvent(eventName, handler) {
  const guardedHandler = (...args) => {
    if (!huntingRuntime.active) return undefined;
    return handler(...args);
  };
  mp.events.add(eventName, guardedHandler);
  huntingRuntime.events.push({ eventName, handler: guardedHandler });
  return guardedHandler;
}

function registerServerCommand(commandName, handler) {
  const name = String(commandName || "").trim().toLowerCase();
  const guardedHandler = (player, fullText = "", args = []) => {
    if (!huntingRuntime.active) return undefined;
    const parsedArgs = Array.isArray(args) && args.length
      ? args.map((arg) => String(arg))
      : String(fullText || "").trim().split(/\s+/).filter(Boolean);
    return handler(player, fullText, ...parsedArgs);
  };
  if (!name) return null;

  if (typeof mp.registerCommand !== "function") {
    throw new Error("Project command registry is unavailable");
  }

  mp.registerCommand(name, guardedHandler);
  huntingRuntime.commands.push({ name, handler: guardedHandler });
  return guardedHandler;
}

/*
 * Все координаты, радиусы и состав животных редактируются здесь.
 * Клиент получает эту конфигурацию с сервера и сам создаёт цветные зоны на карте.
 */
const HUNTING_CONFIG = {
  carcassLifetimeMs: 5 * 60 * 1000,
  spoiledCarcassLifetimeMs: 30 * 1000,
  processedCarcassLifetimeMs: 2 * 60 * 60 * 1000,
  animalMaxHealth: 6,
  processingAttempts: 3,
  knifeDurabilityLoss: 5,
  moveIntervalMs: 3000,
  carrySyncIntervalMs: 1000,
  slotWatchdogIntervalMs: 5000,
  respawnRetryMs: 5000,
  animalDamageIntervalMs: 500,
  animalDamageCooldownMs: 1700,
  interactionDistance: 3.2,
  tentInteractionDistance: 5.5,
  shotDistance: 420,
  vehicleLoadDistance: 5.0,
  jumpDropChance: 0.55,
  packedCarcassModel: "prop_big_bag_01",
  tentModel: "prop_skid_tent_01",
  tentCapacityKg: 90,
  vehicleCapacityKg: 120,
  huntingWeapons: ["weapon_musket", "weapon_sniperrifle"],
  knifeWeapons: ["weapon_knife"],
  unarmedWeapons: ["weapon_unarmed"],
  knifeItem: "hunting_knife",
  processingItems: [
    { itemId: "hunting_rope", amount: 1 },
    { itemId: "hunting_bag", amount: 1 },
  ],
  sellerSafeZone: {
    name: "Безопасная зона охотника",
    center: { x: -674.157, y: 5838.050, z: 17.340 },
    radius: 45,
    color: [65, 220, 105, 205],
    mapColor: 2,
  },
};

const MASK_SUIT_DURATION_MS = 20 * 60 * 1000;
const MASK_SUIT_OUTFIT = {
  model: mp.joaat("mp_m_freemode_01"),
  components: [
    { component: 4, drawable: 97, texture: 1, palette: 0 },
    { component: 11, drawable: 251, texture: 1, palette: 0 },
  ],
  props: [
    { prop: 0, drawable: 104, texture: 1 },
  ],
};
const MASK_SUIT_FEMALE_OUTFIT = {
  model: mp.joaat("mp_f_freemode_01"),
  components: [
    { component: 4, drawable: 31, texture: 3, palette: 0 },
    { component: 11, drawable: 49, texture: 2, palette: 0 },
  ],
  props: [
    { prop: 0, drawable: 13, texture: 0 },
  ],
};

function getMaskSuitOutfit(player) {
  const model = Number(player?.model);
  if (model === Number(MASK_SUIT_OUTFIT.model)) return MASK_SUIT_OUTFIT;
  if (model === Number(MASK_SUIT_FEMALE_OUTFIT.model)) return MASK_SUIT_FEMALE_OUTFIT;
  return null;
}

function normalizeClothesSnapshot(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return {
      drawable: Number(value[0] ?? -1),
      texture: Number(value[1] ?? 0),
      palette: Number(value[2] ?? 0),
    };
  }
  if (typeof value === "object") {
    return {
      drawable: Number(value.drawable ?? value.drawableId ?? value.id ?? -1),
      texture: Number(value.texture ?? value.textureId ?? 0),
      palette: Number(value.palette ?? value.paletteId ?? 0),
    };
  }
  return null;
}

function captureMaskSuitAppearance(player) {
  if (!player || player.__huntingMaskAppearance) return;
  const outfit = getMaskSuitOutfit(player) || MASK_SUIT_OUTFIT;
  const snapshot = { components: {}, props: {}, complete: true };
  outfit.components.forEach(({ component }) => {
    try {
      const value = typeof player.getClothes === "function" ? player.getClothes(component) : null;
      const normalized = normalizeClothesSnapshot(value);
      if (!normalized || normalized.drawable < 0) snapshot.complete = false;
      else snapshot.components[component] = normalized;
    } catch {
      snapshot.complete = false;
    }
  });
  outfit.props.forEach(({ prop }) => {
    try {
      const value = typeof player.getProp === "function" ? player.getProp(prop) : null;
      const normalized = normalizeClothesSnapshot(value);
      if (!normalized) snapshot.complete = false;
      else snapshot.props[prop] = normalized;
    } catch {
      snapshot.complete = false;
    }
  });
  player.__huntingMaskAppearance = snapshot;
}

function applyMaskSuitAppearance(player) {
  if (!player) return false;
  const outfit = getMaskSuitOutfit(player);
  if (!outfit) return false;
  try {
    outfit.components.forEach((item) => {
      player.setClothes(item.component, item.drawable, item.texture, item.palette);
    });
    outfit.props.forEach((item) => {
      player.setProp(item.prop, item.drawable, item.texture);
    });
    return true;
  } catch (error) {
    console.error("[HUNTING] Failed to apply mask suit outfit:", error);
    return false;
  }
}

async function restoreMaskSuitAppearance(player) {
  if (!player) return;
  const snapshot = player.__huntingMaskAppearance;
  let restored = Boolean(snapshot?.complete);
  if (restored) {
    try {
      Object.entries(snapshot.components || {}).forEach(([component, item]) => {
        player.setClothes(Number(component), item.drawable, item.texture, item.palette);
      });
      Object.entries(snapshot.props || {}).forEach(([prop, item]) => {
        if (item.drawable < 0) player.clearProp(Number(prop));
        else player.setProp(Number(prop), item.drawable, item.texture);
      });
    } catch (error) {
      restored = false;
      console.error("[HUNTING] Failed to restore captured clothes:", error);
    }
  }

  if (!restored) {
    try {
      const adminClothes = require("../admin/admin.clothes.js");
      await adminClothes.applySavedClothes(player);
    } catch (error) {
      console.error("[HUNTING] Failed to restore saved clothes:", error);
    }
  }
  player.__huntingMaskAppearance = null;
}

function getMaskSuitRemainingMs(item, now = Date.now()) {
  const stored = Number.isFinite(Number(item?.maskRemainingMs))
    ? Math.max(0, Number(item.maskRemainingMs))
    : MASK_SUIT_DURATION_MS;
  const activatedAt = Math.max(0, Number(item?.maskActivatedAt || 0));
  return activatedAt > 0
    ? Math.max(0, stored - Math.max(0, now - activatedAt))
    : stored;
}

function formatMaskSuitTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function disableMaskSuit(player, reason = "removed") {
  if (!player) return false;

  player.__huntingMaskSuit = false;
  player.__huntingMaskSuitUid = null;
  player.__huntingMaskSuitUntil = 0;
  try { player.setVariable("huntingMaskSuit", false); } catch {}
  await restoreMaskSuitAppearance(player);

  if (reason === "removed") {
    notify(player, "Маскхалат снят. Остаток прочности сохранён.");
  } else if (reason === "missing") {
    notify(player, "Маскировка отключена: активного маскхалата больше нет в инвентаре.");
  }
  return true;
}

const ZONES = [
  {
    id: "normal",
    name: "Обычная зона",
    subtitle: "Пугливые животные",
    behavior: "skittish",
    center: { x: -1362.958, y: 4466.606, z: 24.195 },
    radius: 300,
    minZ: -20,
    maxZ: 180,
    color: [45, 135, 255, 210],
    mapColor: 3,
    population: 5,
    roamRadius: 110,
    testSpawn: false,
    respawnDelay: [8000, 18000],
    spawnPoints: [
      { x: -1374.958, y: 4466.606, z: 24.195, heading: 55.549 },
      { x: -1368.958, y: 4466.606, z: 24.195, heading: 55.549 },
      { x: -1362.958, y: 4466.606, z: 24.195, heading: 55.549 },
      { x: -1356.958, y: 4466.606, z: 24.195, heading: 55.549 },
      { x: -1350.958, y: 4466.606, z: 24.195, heading: 55.549 },
      { x: -1390.958, y: 4485.606, z: 24.195, heading: 122.0 },
      { x: -1339.958, y: 4481.606, z: 24.195, heading: 238.0 },
      { x: -1381.958, y: 4437.606, z: 24.195, heading: 35.0 },
      { x: -1344.958, y: 4441.606, z: 24.195, heading: 310.0 },
      { x: -1361.958, y: 4501.606, z: 24.195, heading: 182.0 },
    ],
    species: [
      { id: "deer", name: "Олень", model: "a_c_deer", carcassWeight: 22, rarityWeight: 28 },
      { id: "wild_pig", name: "Дикая свинья", model: "a_c_pig", carcassWeight: 18, rarityWeight: 23 },
      { id: "dove", name: "Горлица", model: "a_c_pigeon", carcassWeight: 1.2, rarityWeight: 18 },
      { id: "rabbit", name: "Заяц", model: "a_c_rabbit_01", carcassWeight: 3, rarityWeight: 23 },
      { id: "cormorant", name: "Баклан", model: "a_c_cormorant", carcassWeight: 2.2, rarityWeight: 8 },
    ],
  },
  {
    id: "dangerous",
    name: "Опасная зона",
    subtitle: "Агрессивные животные",
    behavior: "aggressive",
    center: { x: -1014.989, y: 4557.296, z: 125.990 },
    radius: 270,
    minZ: -20,
    maxZ: 220,
    color: [235, 55, 65, 215],
    mapColor: 1,
    population: 4,
    roamRadius: 145,
    testSpawn: false,
    respawnDelay: [12000, 24000],
    spawnPoints: [
      { x: -1023.989, y: 4557.296, z: 125.990, heading: 55.440 },
      { x: -1017.989, y: 4557.296, z: 125.990, heading: 55.440 },
      { x: -1011.989, y: 4557.296, z: 125.990, heading: 55.440 },
      { x: -1005.989, y: 4557.296, z: 125.990, heading: 55.440 },
      { x: -1040.989, y: 4577.296, z: 125.990, heading: 80.0 },
      { x: -987.989, y: 4572.296, z: 125.990, heading: 260.0 },
      { x: -1033.989, y: 4528.296, z: 125.990, heading: 20.0 },
      { x: -992.989, y: 4530.296, z: 125.990, heading: 335.0 },
    ],
    species: [
      { id: "wolf", name: "Волк", model: "a_c_husky", carcassWeight: 20, rarityWeight: 32 },
      { id: "coyote", name: "Койот", model: "a_c_coyote", carcassWeight: 12, rarityWeight: 31 },
      { id: "boar", name: "Кабан", model: "a_c_boar", carcassWeight: 28, rarityWeight: 31 },
      { id: "hawk", name: "Ястреб", model: "a_c_chickenhawk", carcassWeight: 2.5, rarityWeight: 6 },
    ],
  },
  {
    id: "reserve",
    name: "Заповедник",
    subtitle: "Редкие и экзотические животные",
    behavior: "aggressive",
    center: { x: -661.117, y: 5375.205, z: 55.683 },
    radius: 340,
    minZ: -20,
    maxZ: 260,
    color: [170, 70, 230, 215],
    mapColor: 7,
    population: 4,
    roamRadius: 175,
    testSpawn: false,
    respawnDelay: [15000, 30000],
    spawnPoints: [
      { x: -670.117, y: 5375.205, z: 55.683, heading: -10.359 },
      { x: -664.117, y: 5375.205, z: 55.683, heading: -10.359 },
      { x: -658.117, y: 5375.205, z: 55.683, heading: -10.359 },
      { x: -652.117, y: 5375.205, z: 55.683, heading: -10.359 },
      { x: -691.117, y: 5395.205, z: 55.683, heading: 105.0 },
      { x: -631.117, y: 5392.205, z: 55.683, heading: 255.0 },
      { x: -684.117, y: 5342.205, z: 55.683, heading: 42.0 },
      { x: -637.117, y: 5345.205, z: 55.683, heading: 320.0 },
    ],
    species: [
      { id: "chimp", name: "Шимпанзе", model: "a_c_chimp", carcassWeight: 22, rarityWeight: 3, exotic: true },
      { id: "lion", name: "Белый тигр", model: "a_c_mtlion", carcassWeight: 35, rarityWeight: 2, exotic: true },
      { id: "panther", name: "Пантера", model: "a_c_panther", carcassWeight: 25, rarityWeight: 1, exotic: true },
      { id: "hawk", name: "Ястреб", model: "a_c_chickenhawk", carcassWeight: 2.5, rarityWeight: 14, exotic: true },
    ],
  },
];

const ACTIONS = {
  process: {
    from: "raw",
    to: "carried",
    title: "Разделка, связывание и упаковка туши",
    success: "Туша упакована. Подойдите к любой машине и нажмите E.",
    cycleMs: 1650,
    targetWidth: 0.19,
  },
};

const SPECIES_VALUES = {
  dove: 180,
  rabbit: 220,
  cormorant: 210,
  deer: 650,
  wild_pig: 580,
  wolf: 720,
  coyote: 620,
  boar: 760,
  hawk: 480,
  chimp: 1450,
  lion: 1900,
  panther: 2100,
};

const QUEST_SPECIES = [];
ZONES.forEach((zone) => {
  zone.species.forEach((species) => {
    if (!QUEST_SPECIES.some((entry) => entry.species.id === species.id)) {
      QUEST_SPECIES.push({ zoneId: zone.id, species });
    }
  });
});

// 60 фиксированных заданий: не повторяются, пока игрок не пройдёт весь пул.
const QUEST_POOL = Array.from({ length: 60 }, (_, index) => {
  const entry = QUEST_SPECIES[index % QUEST_SPECIES.length];
  const variant = Math.floor(index / QUEST_SPECIES.length);
  const requireZone = variant % 2 === 1;
  const minWeightMultiplier = [0, 0.85, 0.95, 1.05, 1.1][variant % 5];
  const minWeight = minWeightMultiplier > 0
    ? Math.round(Number(entry.species.carcassWeight || 10) * minWeightMultiplier * 10) / 10
    : 0;

  return {
    id: `hunt_${String(index + 1).padStart(2, "0")}_${entry.species.id}`,
    speciesId: entry.species.id,
    speciesName: entry.species.name,
    zoneId: requireZone ? entry.zoneId : null,
    minWeight,
  };
});

const zonesById = new Map(ZONES.map((zone) => [zone.id, zone]));
const huntingWeaponHashes = new Set(HUNTING_CONFIG.huntingWeapons.map((name) => normalizeHash(mp.joaat(name))));
const knifeWeaponHashes = new Set(HUNTING_CONFIG.knifeWeapons.map((name) => normalizeHash(mp.joaat(name))));
const unarmedWeaponHashes = new Set(HUNTING_CONFIG.unarmedWeapons.map((name) => normalizeHash(mp.joaat(name))));
const animals = new Map();
const carcasses = new Map();
const recentHits = new Map();
const recentPlayerHits = new Map();
const respawnTimers = new Map();
const profiles = new Map();
const tents = new Map();
const playerOperationChains = new Map();

let nextCarcassId = 1;
let profileBootstrapPromise = Promise.resolve();

function runPlayerHuntingOperation(player, label, operation) {
  const playerId = Number(player?.id);
  if (!Number.isInteger(playerId) || typeof operation !== "function") {
    return Promise.resolve(false);
  }

  const previous = playerOperationChains.get(playerId) || Promise.resolve();
  let current = null;
  current = previous
    .catch(() => {})
    .then(async () => {
      if (!huntingRuntime.active || !player || !mp.players.exists(player)) return false;
      return operation();
    })
    .catch((error) => {
      console.error(`[HUNTING] Operation failed | player=${playerId} label=${label}:`, error);
      return false;
    })
    .finally(() => {
      if (playerOperationChains.get(playerId) === current) {
        playerOperationChains.delete(playerId);
      }
    });

  playerOperationChains.set(playerId, current);
  return current;
}

function normalizeHash(value) {
  return Number(value || 0) >>> 0;
}

function weaponHashesMatch(left, right) {
  const a = normalizeHash(left);
  const b = normalizeHash(right);
  return Boolean(a && b && (a === b || (Math.fround(a) >>> 0) === (Math.fround(b) >>> 0)));
}

function weaponHashSetHas(set, value) {
  for (const candidate of set) {
    if (weaponHashesMatch(candidate, value)) return true;
  }
  return false;
}

function getPlayerOwnerId(player) {
  if (!player) return "";

  try {
    const cachedOwnerId = String(player.__huntingOwnerIdCache || "");
    if (cachedOwnerId.startsWith("static:")) return cachedOwnerId;

    const staticId = Number(
      player.static_id ||
      player.staticId ||
      player.uuid ||
      player.characterId ||
      player.character?.static_id ||
      player.characterData?.static_id ||
      player.getVariable?.("static_id") ||
      player.getVariable?.("staticId") ||
      0
    );

    if (staticId > 0) {
      player.__huntingOwnerIdCache = `static:${staticId}`;
      return player.__huntingOwnerIdCache;
    }

    if (!player.__huntingOwnerSessionId) {
      player.__huntingOwnerSessionId = `${Date.now()}:${player.id}:${randomInt(100000, 999999)}`;
    }

    player.__huntingOwnerIdCache = `session:${player.__huntingOwnerSessionId}`;
    return player.__huntingOwnerIdCache;
  } catch {
    return "";
  }
}

function getPlayerStaticId(player) {
  const ownerId = getPlayerOwnerId(player);
  return ownerId.startsWith("static:") ? Number(ownerId.slice(7)) : 0;
}

function isCarcassOwner(player, carcass) {
  if (!player || !carcass) return false;
  return String(carcass.ownerStaticId || "") === getPlayerOwnerId(player);
}

function randomInt(min, max) {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function getSpeciesHitsRequired() {
  return HUNTING_CONFIG.animalMaxHealth;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function chooseWeighted(list) {
  const total = list.reduce((sum, item) => sum + Math.max(0, Number(item.rarityWeight || 0)), 0);
  let roll = Math.random() * total;

  for (const item of list) {
    roll -= Math.max(0, Number(item.rarityWeight || 0));
    if (roll <= 0) return item;
  }

  return list[list.length - 1];
}

function getDistance(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;

  const dx = Number(a.x || 0) - Number(b.x || 0);
  const dy = Number(a.y || 0) - Number(b.y || 0);
  const dz = Number(a.z || 0) - Number(b.z || 0);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function getVehicleSpeed(vehicle) {
  if (!vehicle) return 0;

  try {
    const nativeSpeed = Number(vehicle.getSpeed?.());
    if (Number.isFinite(nativeSpeed)) return Math.max(0, nativeSpeed);
  } catch {}

  const velocity = vehicle.velocity;
  if (!velocity) return 0;
  const x = Number(velocity.x || 0);
  const y = Number(velocity.y || 0);
  const z = Number(velocity.z || 0);
  return Math.sqrt(x * x + y * y + z * z);
}

function getMovingVehicleThreat(animal) {
  if (!animal?.ped) return null;
  let nearest = null;
  let nearestDistance = 60;
  try {
    mp.vehicles.forEach((vehicle) => {
      if (!entityExists(vehicle, "vehicle")) return;
      if (Number(vehicle.dimension || 0) !== Number(animal.ped.dimension || 0)) return;
      const speed = getVehicleSpeed(vehicle);
      if (speed < 2.5) return;
      const distance = getDistance(vehicle.position, animal.ped.position);
      const detectionRadius = Math.min(60, 45 + speed * 1.25);
      if (distance > detectionRadius || distance >= nearestDistance) return;
      let driver = null;
      try { driver = vehicle.getOccupant?.(0) || null; } catch {}
      if (!driver || !mp.players.exists(driver)) return;
      nearest = { vehicle, driver, speed, distance };
      nearestDistance = distance;
    });
  } catch {}
  return nearest;
}

function isInsideZone(position, zone, extraRadius = 0) {
  if (!position || !zone) return false;
  if (Number(position.z) < zone.minZ || Number(position.z) > zone.maxZ) return false;

  const dx = Number(position.x) - zone.center.x;
  const dy = Number(position.y) - zone.center.y;
  const radius = zone.radius + Number(extraRadius || 0);

  return dx * dx + dy * dy <= radius * radius;
}

function isInsideSellerSafeZone(position, extraRadius = 0) {
  const safeZone = HUNTING_CONFIG.sellerSafeZone;
  if (!position || !safeZone?.center) return false;

  const dx = Number(position.x || 0) - Number(safeZone.center.x);
  const dy = Number(position.y || 0) - Number(safeZone.center.y);
  const dz = Math.abs(Number(position.z || 0) - Number(safeZone.center.z));
  const radius = Number(safeZone.radius || 0) + Number(extraRadius || 0);

  return dz <= 35 && dx * dx + dy * dy <= radius * radius;
}

function entityExists(entity, type) {
  try {
    if (!entity) return false;
    if (type === "ped") return mp.peds.exists(entity);
    if (type === "object") return mp.objects.exists(entity);
    if (type === "vehicle") return mp.vehicles.exists(entity);
    return false;
  } catch {
    return false;
  }
}

function notify(player, message) {
  try {
    if (player && mp.players.exists(player)) {
      player.call("hunting:notify", [String(message)]);
    }
  } catch {}
}

function huntingAudit(event, player = null, data = {}, level = "info") {
  const actor = player ? {
    uuid: getPlayerStaticId(player) || null,
    name: String(player.name || player.rpName || `Player ${player.id}`),
  } : null;
  logs.writeLog({
    type: "hunting",
    level,
    player: actor,
    message: String(event),
    data: {
      event: String(event),
      playerId: player ? Number(player.id) : null,
      ...data,
    },
  }).catch((error) => {
    console.error(`[HUNTING] Persistent log failed (${event}):`, error);
  });
}

function broadcast(eventName, payload) {
  if (!huntingRuntime.active) return;
  try {
    mp.players.call(eventName, [typeof payload === "string" ? payload : JSON.stringify(payload)]);
  } catch (error) {
    console.error(`[HUNTING] Broadcast ${eventName} failed:`, error);
  }
}

function sendAnimalHealthToDebugAdmins(animal) {
  if (!animal) return;
  const payload = JSON.stringify({
    entityId: animal.entityId,
    hits: animal.hits,
    hitsRequired: animal.hitsRequired,
    healthPercent: getAnimalHealthPercent(animal),
    spoiled: Boolean(animal.spoiled),
  });
  mp.players.forEach((player) => {
    if (!player?.__huntingDebugEsp || getAdminLevel(player) < 1) return;
    try { player.call("hunting:animalHealth", [payload]); } catch {}
  });
}

async function ensureHuntingProfile(player) {
  if (!player) return huntingRepository.createDefaultProfile();

  const staticId = getPlayerStaticId(player);
  if (!staticId) {
    if (player.__huntingProfile) return player.__huntingProfile;
    player.__huntingProfile = huntingRepository.createDefaultProfile();
    return player.__huntingProfile;
  }

  await profileBootstrapPromise;
  if (profiles.has(staticId)) {
    player.__huntingProfile = profiles.get(staticId);
    return player.__huntingProfile;
  }
  if (player.__huntingProfile) {
    profiles.set(staticId, player.__huntingProfile);
    return player.__huntingProfile;
  }
  if (!profiles.has(staticId)) {
    profiles.set(staticId, await huntingRepository.loadProfile(staticId));
  }
  player.__huntingProfile = profiles.get(staticId);
  return player.__huntingProfile;
}

async function saveHuntingProfile(player) {
  const profile = player?.__huntingProfile;
  const staticId = getPlayerStaticId(player);
  if (!profile || !staticId) return false;
  profile.lastSeenAt = Date.now();
  profiles.set(staticId, profile);
  return huntingRepository.saveProfile(staticId, profile);
}

function isHuntingSessionActive(player, profile = player?.__huntingProfile) {
  return Boolean(
    profile?.active &&
    player?.__huntingStartedThisSession === true &&
    player?.__huntingRuntimeSessionId === huntingRuntimeSessionId
  );
}

function getHuntingState(player) {
  const profile = player?.__huntingProfile || huntingRepository.createDefaultProfile();
  const activeThisSession = isHuntingSessionActive(player, profile);
  const quest = activeThisSession && profile.currentQuest
    ? {
        ...profile.currentQuest,
        description: describeQuest(profile.currentQuest),
      }
    : null;
  return {
    active: Boolean(activeThisSession),
    mode: activeThisSession ? profile.mode || null : null,
    quest,
    completedCount: Number(profile.completedCount || 0),
    rareUnlocked: Boolean(profile.rareUnlocked),
  };
}

function getPlayerRestriction(player, requireInactive = true) {
  if (!player) return "Персонаж не загружен.";
  if (player.vehicle) return "Начать охоту можно только пешком.";
  if (Number(player.dimension || 0) !== 0) return "В этом игровом измерении охота недоступна.";

  const flags = [
    "handcuffed", "cuffed", "isCuffed", "inHandcuffs",
    "jailed", "inJail", "inPrison", "prisoner",
  ];
  for (const flag of flags) {
    try {
      if (player[flag] || player.getVariable?.(flag)) {
        return flag.toLowerCase().includes("cuff") || flag === "handcuffed"
          ? "Нельзя начать охоту в наручниках."
          : "Нельзя начать охоту, находясь в заключении.";
      }
    } catch {}
  }

  const jobActive = Boolean(
    player.onDuty ||
    player.jobActive ||
    player.isWorking ||
    player.getVariable?.("onDuty") ||
    player.getVariable?.("jobActive") ||
    player.getVariable?.("isWorking")
  );
  if (jobActive) return "Сначала завершите текущую рабочую смену.";
  if (global.__twinkleGlobalEventBlocksHunting) return "Во время текущего события охота недоступна.";

  if (
    requireInactive &&
    isHuntingSessionActive(player, player.__huntingProfile)
  ) {
    return "Охота уже активна.";
  }
  return null;
}

async function hasHuntingLicense(player) {
  try {
    if (await licenses.hasLicense(player, "hunting")) return true;
  } catch (error) {
    console.error("[HUNTING] License check failed:", error);
    notify(player, "Не удалось проверить лицензию на охоту.");
    return false;
  }

  notify(player, "Для охоты нужна лицензия: охота.");
  return false;
}

async function prepareHuntingSessionForStart(player, profile) {
  if (!player || !profile || player.__huntingLoginCleanupComplete === true) return;

  const staticId = getPlayerStaticId(player);
  const staleTent = staticId > 0 ? tents.get(staticId) : null;
  const previous = JSON.parse(JSON.stringify(profile));
  profile.active = false;
  profile.mode = null;
  profile.currentQuest = null;
  profile.tent = null;
  profile.pendingTentReturn = null;
  try {
    await saveHuntingProfile(player);
  } catch (error) {
    restoreProfileSnapshot(profile, previous);
    throw error;
  }
  if (staleTent) destroyTent(staleTent, "start_session_cleanup");
  player.__huntingLoginCleanupComplete = true;
  player.__huntingStartedThisSession = false;
  player.__huntingRuntimeSessionId = null;
}

function restoreProfileSnapshot(profile, snapshot) {
  if (!profile || !snapshot) return;
  Object.keys(profile).forEach((key) => delete profile[key]);
  Object.assign(profile, JSON.parse(JSON.stringify(snapshot)));
}

function isFreshBag(item, now = Date.now()) {
  return String(item?.itemId || item?.id) === "hunting_carcass_bag" &&
    Number(item.freshUntil || 0) > Number(now);
}

function bagMatchesQuest(item, quest) {
  if (!isFreshBag(item) || !quest) return false;
  if (String(item.speciesId) !== String(quest.speciesId)) return false;
  if (quest.zoneId && String(item.zoneId) !== String(quest.zoneId)) return false;
  if (Number(quest.minWeight || 0) > Number(item.huntingWeight || item.weight || 0)) return false;
  return true;
}

async function takeMatchingBag(player, matcher = isFreshBag, options = {}) {
  await inventory.spoilExpiredHuntingBags(player);
  const fromInventory = await inventory.takeFirstMatchingItem(
    player,
    "hunting_carcass_bag",
    matcher
  );
  if (fromInventory.ok) return { ...fromInventory, source: "inventory" };

  const profile = await ensureHuntingProfile(player);
  let vehicleEntries = Object.entries(profile.vehicleBags || {});
  if (options.nearbyVehicleOnly) {
    const nearbyKeys = new Set();
    try {
      mp.vehicles.forEach((vehicle) => {
        if (
          entityExists(vehicle, "vehicle") &&
          Number(vehicle.dimension || 0) === Number(player.dimension || 0) &&
          getDistance(player.position, vehicle.position) <= HUNTING_CONFIG.vehicleLoadDistance + 1 &&
          canControlVehicle(player, vehicle)
        ) {
          nearbyKeys.add(getVehicleStorageKey(vehicle));
        }
      });
    } catch {}
    vehicleEntries = vehicleEntries.filter(([storageKey]) => nearbyKeys.has(storageKey));
  }

  for (const [storageKey, bags] of vehicleEntries) {
    if (!Array.isArray(bags)) continue;
    const index = bags.findIndex(matcher);
    if (index < 0) continue;
    const [item] = bags.splice(index, 1);
    await saveHuntingProfile(player);
    return { ok: true, item, source: `vehicle:${storageKey}` };
  }

  if (options.includeTent !== false && Array.isArray(profile.tent?.bags)) {
    const index = profile.tent.bags.findIndex(matcher);
    if (index >= 0) {
      const [item] = profile.tent.bags.splice(index, 1);
      await saveHuntingProfile(player);
      return { ok: true, item, source: "tent" };
    }
  }

  return { ok: false, reason: "missing" };
}

async function restoreTakenBag(player, taken) {
  if (!taken?.ok || !taken.item) return false;

  if (taken.source === "inventory") {
    const restored = await inventory.addItemInstance(
      player,
      taken.item.itemId || taken.item.id,
      taken.item
    );
    return Boolean(restored.ok);
  }

  const profile = await ensureHuntingProfile(player);
  if (String(taken.source || "").startsWith("vehicle:")) {
    const storageKey = String(taken.source).slice("vehicle:".length);
    if (!Array.isArray(profile.vehicleBags[storageKey])) profile.vehicleBags[storageKey] = [];
    profile.vehicleBags[storageKey].push(taken.item);
    await saveHuntingProfile(player);
    return true;
  }

  if (taken.source === "tent" && profile.tent?.deployed) {
    if (!Array.isArray(profile.tent.bags)) profile.tent.bags = [];
    profile.tent.bags.push(taken.item);
    await saveHuntingProfile(player);
    const tent = tents.get(getPlayerStaticId(player));
    if (tent) syncTent(tent);
    return true;
  }

  const restored = await inventory.addItemInstance(
    player,
    taken.item.itemId || taken.item.id,
    taken.item
  );
  return Boolean(restored.ok);
}

async function addPlayerCash(player, amount) {
  const staticId = getPlayerStaticId(player);
  const value = Math.max(0, Math.round(Number(amount || 0)));
  if (!staticId || value <= 0) return false;

  await db.query("UPDATE characters SET cash = cash + ? WHERE uuid = ?", [value, staticId]);
  const current = Number(
    player?.character?.cash ??
    player?.characterData?.cash ??
    player?.getVariable?.("cash") ??
    0
  );
  const next = current + value;
  applyPlayerCashState(player, next);
  return true;
}

function applyPlayerCashState(player, cash) {
  const next = Math.max(0, Number(cash || 0));
  if (player.character) player.character.cash = next;
  if (player.characterData) player.characterData.cash = next;
  try { player.setVariable("cash", next); } catch {}
  try { player.call("c:hud:update", [JSON.stringify({ player: { cash: next } })]); } catch {}
}

function playTradeAnimation(player) {
  try {
    player.playAnimation("mp_common", "givetake1_a", 1, 49);
    setTimeout(() => {
      try {
        if (mp.players.exists(player)) player.stopAnimation();
      } catch {}
    }, 1800);
  } catch {}
}

function waitForHuntingAction(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(durationMs || 0))));
}

function stopHuntingActionAnimation(player) {
  if (!player) return;
  player.__huntingActionAnimation = null;
  try {
    if (mp.players.exists(player)) player.stopAnimation();
  } catch {}
}

function playHuntingActionAnimation(player, dict, name, durationMs = 0, flags = 49) {
  if (!player || !mp.players.exists(player)) return false;
  const token = `${Date.now()}:${Math.random()}`;
  player.__huntingActionAnimation = token;
  try { player.playAnimation(String(dict), String(name), 1, Number(flags)); } catch { return false; }
  if (durationMs > 0) {
    setTimeout(() => {
      if (!player || player.__huntingActionAnimation !== token) return;
      stopHuntingActionAnimation(player);
    }, Number(durationMs));
  }
  return true;
}

async function startFreeHunt(player) {
  const profile = await ensureHuntingProfile(player);
  if (
    isHuntingSessionActive(player, profile) &&
    Date.now() - Number(player.__huntingLastStartAt || 0) < 2000
  ) return true;
  try {
    await prepareHuntingSessionForStart(player, profile);
  } catch (error) {
    notify(player, "Не удалось подготовить профиль охоты. Попробуйте ещё раз.");
    return false;
  }
  const restriction = getPlayerRestriction(player, true);
  if (restriction) {
    console.warn(`[HUNTING] Start rejected | player=${player?.id} reason=${restriction}`);
    huntingAudit("hunt_start_rejected", player, { reason: restriction }, "warning");
    notify(player, restriction);
    return false;
  }
  if (!await hasHuntingLicense(player)) return false;
  if (profile.currentQuest) return notify(player, "Сначала завершите активное задание."), false;

  const previous = JSON.parse(JSON.stringify(profile));
  profile.active = true;
  profile.mode = "free";
  player.__huntingStartedThisSession = true;
  player.__huntingRuntimeSessionId = huntingRuntimeSessionId;
  try {
    await saveHuntingProfile(player);
  } catch (error) {
    restoreProfileSnapshot(profile, previous);
    player.__huntingStartedThisSession = false;
    player.__huntingRuntimeSessionId = null;
    notify(player, "Не удалось сохранить начало охоты. Попробуйте ещё раз.");
    huntingAudit("hunt_start_save_failed", player, { message: String(error?.message || error) }, "error");
    return false;
  }
  player.__huntingLastStartAt = Date.now();
  syncPlayer(player);
  notify(player, "Свободная охота начата. Зоны показаны на карте.");
  console.log(`[HUNTING] Free hunt started | player=${player.id} static=${getPlayerStaticId(player)}`);
  huntingAudit("hunt_started_free", player);
  return true;
}

function describeQuest(quest) {
  if (!quest) return "";
  const details = [];
  if (quest.zoneId) details.push(`зона: ${zonesById.get(quest.zoneId)?.name || quest.zoneId}`);
  if (Number(quest.minWeight || 0) > 0) details.push(`вес от ${quest.minWeight} кг`);
  return `Добудьте тушу «${quest.speciesName}»${details.length ? ` (${details.join(", ")})` : ""}.`;
}

async function assignQuest(player) {
  const profile = await ensureHuntingProfile(player);
  if (
    isHuntingSessionActive(player, profile) && profile.currentQuest &&
    Date.now() - Number(player.__huntingLastStartAt || 0) < 2000
  ) return true;
  try {
    await prepareHuntingSessionForStart(player, profile);
  } catch (error) {
    notify(player, "Не удалось подготовить профиль охоты. Попробуйте ещё раз.");
    return false;
  }
  const restriction = getPlayerRestriction(player, true);
  if (restriction) {
    console.warn(`[HUNTING] Quest start rejected | player=${player?.id} reason=${restriction}`);
    huntingAudit("quest_start_rejected", player, { reason: restriction }, "warning");
    notify(player, restriction);
    return false;
  }
  if (profile.currentQuest) return notify(player, "У вас уже есть активное задание."), false;

  const previous = JSON.parse(JSON.stringify(profile));
  if (!Array.isArray(profile.issuedQuestIds)) profile.issuedQuestIds = [];
  let available = QUEST_POOL.filter((quest) => !profile.issuedQuestIds.includes(quest.id));
  if (available.length === 0) {
    profile.issuedQuestIds = [];
    available = QUEST_POOL.slice();
  }

  profile.currentQuest = { ...randomFrom(available), startedAt: Date.now() };
  profile.issuedQuestIds.push(profile.currentQuest.id);
  profile.active = true;
  profile.mode = "quest";
  profile.lastSeenAt = Date.now();
  player.__huntingStartedThisSession = true;
  player.__huntingRuntimeSessionId = huntingRuntimeSessionId;
  try {
    const hasLicense = await licenses.hasLicense(player, "hunting");
    const hasDocument = hasLicense
      ? await licenses.hasLicenseDocumentItem(player, "hunting")
      : false;
    if (!hasLicense || !hasDocument) {
      const staticId = getPlayerStaticId(player);
      await licenses.issueQuestLicense(player, "hunting", {
        transactionWork: (connection) => huntingRepository.saveProfile(staticId, profile, connection),
      });
      profiles.set(staticId, profile);
    } else {
      await saveHuntingProfile(player);
    }
  } catch (error) {
    restoreProfileSnapshot(profile, previous);
    player.__huntingStartedThisSession = false;
    player.__huntingRuntimeSessionId = null;
    notify(player, "Не удалось сохранить задание. Попробуйте ещё раз.");
    huntingAudit("quest_start_save_failed", player, { message: String(error?.message || error) }, "error");
    return false;
  }
  player.__huntingLastStartAt = Date.now();
  syncPlayer(player);
  notify(player, `Задание получено: ${describeQuest(profile.currentQuest)}`);
  console.log(`[HUNTING] Quest assigned | player=${player.id} quest=${profile.currentQuest.id}`);
  huntingAudit("quest_assigned", player, { questId: profile.currentQuest.id });
  return true;
}

async function completeOrFailQuest(player, source = "submit") {
  const profile = await ensureHuntingProfile(player);
  const quest = profile.currentQuest;
  if (!quest) return notify(player, "Активного задания нет."), false;

  const bag = await takeMatchingBag(player, (item) => bagMatchesQuest(item, quest));
  profile.active = false;
  profile.mode = null;
  profile.currentQuest = null;
  player.__huntingStartedThisSession = false;
  player.__huntingRuntimeSessionId = null;
  // Hide the current-session task and zone overlays even if a later reward or
  // persistence operation fails.
  syncPlayer(player);

  if (!bag.ok) {
    await saveHuntingProfile(player);
    syncPlayer(player);
    notify(player, "Не выполнены условия задания. Охота завершена.");
    console.log(`[HUNTING] Quest failed | player=${player.id} quest=${quest.id} source=${source}`);
    huntingAudit("quest_failed", player, { questId: quest.id, source }, "warning");
    return false;
  }

  profile.completedQuestIds.push(quest.id);
  profile.completedCount = Number(profile.completedCount || 0) + 1;
  profile.rareUnlocked = profile.completedCount >= 5;
  const stimulantGranted = await inventory.addItem(player, "hunting_stimulant", 1);
  if (!stimulantGranted) {
    profile.pendingStimulants = Number(profile.pendingStimulants || 0) + 1;
  }
  const rewardCash = 450 + Math.round(Number(bag.item.huntingWeight || 0) * 8);
  let cashGranted = false;
  try {
    cashGranted = await addPlayerCash(player, rewardCash);
  } catch (error) {
    console.error("[HUNTING] Quest cash reward deferred:", error);
  }
  if (!cashGranted) profile.pendingCash = Number(profile.pendingCash || 0) + rewardCash;
  await saveHuntingProfile(player);
  playTradeAnimation(player);
  syncPlayer(player);
  notify(
    player,
    `Задание выполнено.${stimulantGranted ? " Получен стимулятор." : " Стимулятор будет выдан после освобождения места."}${profile.rareUnlocked ? " Редкое снаряжение разблокировано." : ""}`
  );
  console.log(`[HUNTING] Quest completed | player=${player.id} quest=${quest.id} source=${source}`);
  huntingAudit("quest_completed", player, { questId: quest.id, source });
  return true;
}

async function finishHunt(player) {
  const profile = await ensureHuntingProfile(player);
  if (!isHuntingSessionActive(player, profile)) {
    player.__huntingStartedThisSession = false;
    player.__huntingRuntimeSessionId = null;
    syncPlayer(player);
    notify(player, "Активной охоты нет.");
    return false;
  }
  if (profile.currentQuest) return completeOrFailQuest(player, "finish");

  profile.active = false;
  profile.mode = null;
  player.__huntingStartedThisSession = false;
  player.__huntingRuntimeSessionId = null;
  try {
    await saveHuntingProfile(player);
  } catch (error) {
    console.error("[HUNTING] Hunt finish save failed:", error);
    huntingAudit("hunt_finish_save_failed", player, {
      message: String(error?.message || error),
    }, "error");
  } finally {
    // Ending a game session must not depend on database availability.
    syncPlayer(player);
  }
  notify(player, "Охота завершена. Зоны скрыты.");
  console.log(`[HUNTING] Hunt finished | player=${player.id}`);
  huntingAudit("hunt_finished", player);
  return true;
}

async function sellCarcassBag(player, coefficient = 1, buyerId = "hunting_seller") {
  const carriedCarcass = carcasses.get(Number(player?.__huntingCarcassId));
  const preferredInventoryUid = carriedCarcass?.carrier === player
    ? String(carriedCarcass.inventoryItemUid || "")
    : "";
  const nearbyStorageKeys = [];
  try {
    mp.vehicles.forEach((vehicle) => {
      if (
        entityExists(vehicle, "vehicle") &&
        Number(vehicle.dimension || 0) === Number(player.dimension || 0) &&
        getDistance(player.position, vehicle.position) <= HUNTING_CONFIG.vehicleLoadDistance + 1 &&
        canControlVehicle(player, vehicle)
      ) {
        nearbyStorageKeys.push(getVehicleStorageKey(vehicle));
      }
    });
  } catch {}

  const sale = await inventory.sellHuntingBag(
    player,
    [...new Set(nearbyStorageKeys.filter(Boolean))],
    SPECIES_VALUES,
    coefficient,
    preferredInventoryUid
  );
  if (!sale?.ok) {
    if (sale?.reason === "missing") notify(player, "Свежих мешков с тушей не найдено.");
    else notify(player, "Продажа не выполнена: данные и деньги не изменены.");
    return false;
  }

  const profile = await ensureHuntingProfile(player);
  if (sale.profile && typeof sale.profile === "object") {
    restoreProfileSnapshot(profile, sale.profile);
    profiles.set(getPlayerStaticId(player), profile);
  }
  applyPlayerCashState(player, sale.cash);
  playTradeAnimation(player);
  notify(player, `Туша «${sale.item.speciesName}» продана за $${sale.price}.`);
  console.log(`[HUNTING] Bag sold | player=${player.id} buyer=${buyerId} species=${sale.item.speciesId} price=${sale.price} source=${sale.source}`);
  huntingAudit("carcass_sold", player, {
    buyerId,
    speciesId: sale.item.speciesId,
    price: sale.price,
    source: sale.source,
  });
  return true;
}

function getStorageWeight(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + Math.max(
      0,
      Number(item.huntingWeight || item.weight || 0) * Math.max(1, Number(item.amount || 1))
    ),
    0
  );
}

function spoilStoredBags(items, now = Date.now()) {
  let changed = 0;
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!isFreshBag(item, now) && String(item.itemId || item.id) === "hunting_carcass_bag") {
      item.itemId = "hunting_spoiled_carcass";
      item.id = "hunting_spoiled_carcass";
      item.name = `Испорченная туша «${item.speciesName || "животного"}»`;
      item.spoiledAt = Number(now);
      changed += 1;
    }
  });
  return changed;
}

async function putOrTakeVehicleBag(player, vehicle) {
  if (!entityExists(vehicle, "vehicle") || player.vehicle) return notify(player, "Подойдите к автомобилю пешком."), false;
  if (Number(vehicle.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(player.position, vehicle.position) > HUNTING_CONFIG.vehicleLoadDistance) return false;
  if (!canControlVehicle(player, vehicle)) {
    notify(player, "К чужому багажнику доступа нет.");
    return false;
  }

  const profile = await ensureHuntingProfile(player);
  const key = getVehicleStorageKey(vehicle);
  if (!key) return false;
  if (!Array.isArray(profile.vehicleBags[key])) profile.vehicleBags[key] = [];
  const stored = profile.vehicleBags[key];
  spoilStoredBags(stored);

  await inventory.spoilExpiredHuntingBags(player);
  const carried = await inventory.takeFirstMatchingItem(player, "hunting_carcass_bag", isFreshBag);
  if (carried.ok) {
    if (getStorageWeight(stored) + Number(carried.item.huntingWeight || carried.item.weight || 0) > HUNTING_CONFIG.vehicleCapacityKg) {
      await inventory.addItemInstance(player, "hunting_carcass_bag", carried.item);
      notify(player, "В багажнике недостаточно свободного веса.");
      return false;
    }

    stored.push(carried.item);
    try {
      await saveHuntingProfile(player);
    } catch (error) {
      stored.pop();
      await inventory.addItemInstance(player, "hunting_carcass_bag", carried.item);
      throw error;
    }
    notify(player, `Мешок «${carried.item.speciesName}» помещён в багажник.`);
    console.log(`[HUNTING] Bag moved to trunk | player=${player.id} storage=${key} bag=${carried.item.uid}`);
    return true;
  }

  const item = stored[0];
  if (!item) return notify(player, "В багажнике нет охотничьих туш, а в инвентаре нет свежего мешка."), false;
  const added = await inventory.addItemInstance(player, item.itemId || item.id, item);
  if (!added.ok) return notify(player, "Освободите место и вес в инвентаре."), false;
  stored.shift();
  try {
    await saveHuntingProfile(player);
  } catch (error) {
    stored.unshift(item);
    await inventory.removeItem(player, added.item.uid, 1);
    throw error;
  }
  notify(player, `Мешок «${item.speciesName}» забран из багажника.`);
  console.log(`[HUNTING] Bag removed from trunk | player=${player.id} storage=${key} bag=${item.uid}`);
  return true;
}

async function foldTentWithContents(player, tent) {
  if (
    !tent || player.vehicle ||
    (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) ||
    Number(tent.ownerStaticId) !== getPlayerStaticId(player)
  ) {
    return notify(player, "Свернуть можно только свою палатку пешком."), false;
  }
  if (Number(tent.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(player.position, tent.position) > HUNTING_CONFIG.tentInteractionDistance) return false;

  const profile = await ensureHuntingProfile(player);
  const data = profile.tent;
  if (!data?.deployed) return false;
  if (!Array.isArray(data.bags)) data.bags = [];
  spoilStoredBags(data.bags);
  if (data.bags.length > 0) {
    notify(player, "Освободите палатку перед сбором. Откройте её коротким нажатием E и перенесите туши в инвентарь.");
    return false;
  }

  const durability = Math.max(0, Number(data.durability || 1) - 1);
  const bags = data.bags.map((bag) => ({ ...bag }));
  const nextProfile = JSON.parse(JSON.stringify(profile));
  nextProfile.tent = null;
  nextProfile.pendingTentReturn = null;
  nextProfile.lastSeenAt = Date.now();

  const folded = await inventory.foldHuntingTentWithContents(
    player,
    nextProfile,
    bags,
    durability,
    Number(data.placedAt || 0)
  );
  if (!folded?.ok) {
    const reason = folded?.reason === "weight"
      ? "Недостаточно допустимого веса в инвентаре."
      : folded?.reason === "slots"
        ? "Недостаточно свободных ячеек в инвентаре."
        : "Не удалось безопасно свернуть палатку.";
    notify(player, `${reason} Палатка и содержимое оставлены на месте.`);
    return false;
  }

  Object.assign(profile, folded.profile || nextProfile);
  profiles.set(getPlayerStaticId(player), profile);
  destroyTent(tent, "folded_with_contents");
  notify(
    player,
    durability > 0
      ? `Палатка свёрнута. В инвентарь перенесено мешков: ${bags.length}. Прочность палатки: ${durability}/5.`
      : `Палатка износилась. В инвентарь перенесено мешков: ${bags.length}.`
  );
  return true;
}

async function withdrawTentBagToHands(player, tent, profile, data) {
  const item = data?.bags?.[0];
  if (!item) return false;
  if (player.__huntingCarcassId) return notify(player, "Вы уже несёте один мешок."), false;

  const now = Date.now();
  const spoiled = String(item.itemId || item.id) === "hunting_spoiled_carcass";
  const carcass = {
    id: nextCarcassId++,
    animalEntityId: -1,
    entity: null,
    entityType: null,
    zoneId: String(item.zoneId || "stored"),
    species: {
      id: String(item.speciesId || "stored_animal"),
      name: String(item.speciesName || "животное"),
      exotic: Boolean(item.exotic),
    },
    spoiled,
    stage: "bagged",
    position: {
      x: Number(player.position.x),
      y: Number(player.position.y),
      z: Number(player.position.z),
    },
    createdAt: now,
    expiresAt: Math.max(now + 30000, Number(item.freshUntil || now + HUNTING_CONFIG.processedCarcassLifetimeMs)),
    dimension: Number(player.dimension || 0),
    ownerPlayer: player,
    ownerStaticId: getPlayerOwnerId(player),
    carrier: null,
    vehicle: null,
    lockedBy: null,
    attemptsUsed: 0,
    killKind: "stored_bag",
    bagItem: { ...item },
    processingComplete: false,
  };

  if (!transformToBag(carcass)) {
    notify(player, "Не удалось создать мешок в игровом мире. Попробуйте ещё раз.");
    return false;
  }

  data.bags.shift();
  try {
    await saveHuntingProfile(player);
  } catch (error) {
    data.bags.unshift(item);
    destroyCarcassEntity(carcass);
    throw error;
  }

  carcasses.set(carcass.id, carcass);
  syncTent(tent);
  const pickedUp = await pickUpCarcass(player, carcass);
  if (!pickedUp) {
    data.bags.unshift(item);
    carcasses.delete(carcass.id);
    destroyCarcassEntity(carcass);
    try { await saveHuntingProfile(player); } catch {}
    syncTent(tent);
    return false;
  }
  huntingAudit("bag_withdrawn_from_tent", player, {
    carcassId: carcass.id,
    speciesId: carcass.species.id,
  });
  return true;
}

async function putTakeOrFoldTent(player, tent) {
  if (!tent || Number(tent.ownerStaticId) !== getPlayerStaticId(player)) {
    return notify(player, "С чужой палаткой взаимодействовать нельзя."), false;
  }
  if (Number(tent.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(player.position, tent.position) > HUNTING_CONFIG.tentInteractionDistance) return false;

  const profile = await ensureHuntingProfile(player);
  const data = profile.tent;
  if (!data?.deployed) return false;
  if (!Array.isArray(data.bags)) data.bags = [];
  spoilStoredBags(data.bags);

  await inventory.spoilExpiredHuntingBags(player);
  return openTentInventory(player, tent, profile, data);
}

function buildTentEnvironment(tent, data) {
  const bags = Array.isArray(data?.bags) ? data.bags : [];
  const items = {};
  const slots = Array.from({ length: 50 }, () => null);
  bags.slice(0, slots.length).forEach((bag, index) => {
    const uid = String(bag?.uid || `tent:${tent.ownerStaticId}:${index}`);
    slots[index] = uid;
    items[uid] = {
      ...bag,
      uid,
      itemId: String(bag?.itemId || bag?.id || "hunting_carcass_bag"),
      amount: 1,
      stackable: false,
      actions: ["info"],
    };
  });
  return {
    type: "hunting_tent",
    title: `Палатка · ${bags.length} меш. · ${Math.round(getStorageWeight(bags))}/${HUNTING_CONFIG.tentCapacityKg} кг`,
    ownerStaticId: Number(tent.ownerStaticId),
    slots,
    items,
  };
}

function buildVehicleEnvironment(vehicle, storageKey, storedItems) {
  const stored = Array.isArray(storedItems) ? storedItems : [];
  const items = {};
  const slots = Array.from({ length: 50 }, () => null);
  stored.slice(0, slots.length).forEach((item, index) => {
    const uid = String(item?.uid || `vehicle:${storageKey}:${index}`);
    slots[index] = uid;
    items[uid] = {
      ...item,
      uid,
      itemId: String(item?.itemId || item?.id || ""),
      amount: Math.max(1, Number(item?.amount || 1)),
      stackable: Boolean(item?.stackable),
      actions: ["info"],
    };
  });
  const plate = String(vehicle?.numberPlate || vehicle?.getVariable?.("numberPlate") || "")
    .trim()
    .toUpperCase();
  return {
    type: "hunting_vehicle",
    title: `Багажник${plate ? ` · ${plate}` : ""} · ${stored.length} предм. · ${Math.round(getStorageWeight(stored))}/${HUNTING_CONFIG.vehicleCapacityKg} кг`,
    vehicleId: Number(vehicle?.id ?? -1),
    slots,
    items,
  };
}

async function createInventoryBagVisual(player, item) {
  if (
    !player || !item || player.__huntingCarcassId ||
    String(item.itemId || item.id) !== "hunting_carcass_bag" ||
    Number(item.freshUntil || 0) <= Date.now()
  ) return false;
  const now = Date.now();
  const carcass = {
    id: nextCarcassId++,
    animalEntityId: -1,
    entity: null,
    entityType: null,
    zoneId: String(item.zoneId || "stored"),
    species: {
      id: String(item.speciesId || "stored_animal"),
      name: String(item.speciesName || "животное"),
      exotic: Boolean(item.exotic),
    },
    spoiled: false,
    stage: "bagged",
    position: {
      x: Number(player.position.x),
      y: Number(player.position.y),
      z: Number(player.position.z),
    },
    createdAt: now,
    expiresAt: Math.max(now + 30000, Number(item.freshUntil || now + HUNTING_CONFIG.processedCarcassLifetimeMs)),
    dimension: Number(player.dimension || 0),
    ownerPlayer: player,
    ownerStaticId: getPlayerOwnerId(player),
    carrier: null,
    vehicle: null,
    lockedBy: null,
    attemptsUsed: 0,
    killKind: "inventory_bag",
    bagItem: { ...item },
    inventoryItemUid: String(item.uid || ""),
    processingComplete: false,
  };
  if (!transformToBag(carcass)) return false;
  carcasses.set(carcass.id, carcass);
  const picked = await pickUpCarcass(player, carcass);
  if (!picked) removeCarcass(carcass, "inventory_visual_failed");
  return Boolean(picked);
}

async function openTentInventory(player, tent, profile = null, data = null) {
  if (!tent || Number(tent.ownerStaticId) !== getPlayerStaticId(player)) {
    return notify(player, "Инвентарь чужой палатки недоступен."), false;
  }
  if (player.vehicle || Number(tent.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(player.position, tent.position) > HUNTING_CONFIG.tentInteractionDistance) return false;
  const resolvedProfile = profile || await ensureHuntingProfile(player);
  const resolvedData = data || resolvedProfile.tent;
  if (!resolvedData?.deployed) return false;
  if (!Array.isArray(resolvedData.bags)) resolvedData.bags = [];
  spoilStoredBags(resolvedData.bags);
  player.__huntingOpenTentOwner = Number(tent.ownerStaticId);
  player.__huntingOpenVehicleId = null;
  player.__huntingOpenVehicleKey = null;
  await inventory.openInventory(player, buildTentEnvironment(tent, resolvedData));
  return true;
}

async function openVehicleInventory(player, vehicle, profile = null) {
  if (!entityExists(vehicle, "vehicle") || player.vehicle) {
    return notify(player, "Подойдите к багажнику пешком."), false;
  }
  if (Number(vehicle.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(player.position, vehicle.position) > HUNTING_CONFIG.vehicleLoadDistance + 1) return false;
  if (!canControlVehicle(player, vehicle)) {
    return notify(player, "Чужой багажник недоступен."), false;
  }
  const storageKey = getVehicleStorageKey(vehicle);
  if (!storageKey) return false;
  const resolvedProfile = profile || await ensureHuntingProfile(player);
  if (!resolvedProfile.vehicleBags || typeof resolvedProfile.vehicleBags !== "object") {
    resolvedProfile.vehicleBags = {};
  }
  if (!Array.isArray(resolvedProfile.vehicleBags[storageKey])) {
    resolvedProfile.vehicleBags[storageKey] = [];
  }
  spoilStoredBags(resolvedProfile.vehicleBags[storageKey]);
  player.__huntingOpenTentOwner = null;
  player.__huntingOpenVehicleId = Number(vehicle.id);
  player.__huntingOpenVehicleKey = storageKey;
  await inventory.openInventory(
    player,
    buildVehicleEnvironment(vehicle, storageKey, resolvedProfile.vehicleBags[storageKey])
  );
  return true;
}

async function handleTentInventoryMove(player, move) {
  const from = move?.from || {};
  const to = move?.to || {};
  const usesEnvironment = from.source === "environment" || to.source === "environment";
  if (!usesEnvironment) return false;
  if (
    !player || player.vehicle ||
    !((from.source === "environment" && to.source === "inventory") ||
      (from.source === "inventory" && to.source === "environment"))
  ) {
    notify(player, "В палатку можно переносить только мешки с тушами.");
    return true;
  }

  const staticId = getPlayerStaticId(player);
  const tent = tents.get(staticId);
  if (
    !tent || Number(player.__huntingOpenTentOwner) !== staticId ||
    Number(tent.ownerStaticId) !== staticId ||
    Number(tent.dimension || 0) !== Number(player.dimension || 0) ||
    getDistance(player.position, tent.position) > HUNTING_CONFIG.tentInteractionDistance
  ) {
    notify(player, "Вы отошли от палатки. Доступ закрыт.");
    try { player.call("inventory:client:close", []); } catch {}
    player.__huntingOpenTentOwner = null;
    return true;
  }

  const direction = from.source === "environment" ? "take" : "put";
  const sourceIndex = Math.floor(Number(from.index));
  const result = await inventory.transferHuntingTentBag(
    player,
    direction,
    sourceIndex,
    HUNTING_CONFIG.tentCapacityKg,
    direction === "put" ? String(from.uid || "") : ""
  );
  if (!result.ok) {
    const messages = {
      slots: "В инвентаре нет свободной ячейки.",
      weight: "Недостаточно свободного веса в инвентаре.",
      capacity: "Палатка заполнена по весу.",
      bag: "В палатку разрешено класть только свежий мешок с тушей.",
      missing: "Этот мешок уже был перемещён.",
    };
    notify(player, messages[result.reason] || "Не удалось переместить мешок.");
    return true;
  }

  const profile = await ensureHuntingProfile(player);
  Object.assign(profile, result.profile || {});
  profiles.set(staticId, profile);
  tent.profile = profile;
  tent.profileTent = profile.tent;
  syncTent(tent);
  if (direction === "take") await createInventoryBagVisual(player, result.item);
  await openTentInventory(player, tent, profile, profile.tent);
  huntingAudit("tent_inventory_transfer", player, {
    direction,
    bagUid: result.item?.uid || null,
  });
  return true;
}

async function handleVehicleInventoryMove(player, move) {
  const from = move?.from || {};
  const to = move?.to || {};
  const usesEnvironment = from.source === "environment" || to.source === "environment";
  if (!usesEnvironment) return false;
  if (
    !player || player.vehicle ||
    !((from.source === "environment" && to.source === "inventory") ||
      (from.source === "inventory" && to.source === "environment"))
  ) {
    notify(player, "Переносите предметы между инвентарём и багажником.");
    return true;
  }

  const vehicleId = Number(player.__huntingOpenVehicleId);
  const storageKey = String(player.__huntingOpenVehicleKey || "");
  const vehicle = mp.vehicles.at(vehicleId);
  if (
    !entityExists(vehicle, "vehicle") || !storageKey ||
    getVehicleStorageKey(vehicle) !== storageKey ||
    Number(vehicle.dimension || 0) !== Number(player.dimension || 0) ||
    getDistance(player.position, vehicle.position) > HUNTING_CONFIG.vehicleLoadDistance + 1 ||
    !canControlVehicle(player, vehicle)
  ) {
    notify(player, "Вы отошли от доступного багажника. Доступ закрыт.");
    try { player.call("inventory:client:close", []); } catch {}
    player.__huntingOpenVehicleId = null;
    player.__huntingOpenVehicleKey = null;
    return true;
  }

  const direction = from.source === "environment" ? "take" : "put";
  const sourceIndex = Math.floor(Number(from.index));
  const result = await inventory.transferHuntingVehicleBag(
    player,
    storageKey,
    direction,
    sourceIndex,
    HUNTING_CONFIG.vehicleCapacityKg,
    String(from.uid || "")
  );
  if (!result.ok) {
    const messages = {
      slots: "В инвентаре нет свободной ячейки.",
      weight: "Недостаточно свободного веса в инвентаре.",
      capacity: "Багажник заполнен по весу.",
      capacity_slots: "В багажнике нет свободной ячейки.",
      item: "Этот предмет нельзя положить в багажник.",
      missing: "Этот предмет уже был перемещён.",
      profile: "Профиль охоты ещё не загружен.",
    };
    notify(player, messages[result.reason] || "Не удалось переместить предмет.");
    return true;
  }

  const profile = await ensureHuntingProfile(player);
  Object.assign(profile, result.profile || {});
  profiles.set(getPlayerStaticId(player), profile);
  if (
    direction === "take" &&
    String(result.item?.itemId || result.item?.id || "") === "hunting_carcass_bag"
  ) await createInventoryBagVisual(player, result.item);
  await openVehicleInventory(player, vehicle, profile);
  huntingAudit("vehicle_inventory_transfer", player, {
    direction,
    vehicleId,
    bagUid: result.item?.uid || null,
    speciesId: result.item?.speciesId || null,
  });
  return true;
}

registerServerEvent("hunting:item:useTent", (player, item) => runPlayerHuntingOperation(player, "use_tent", async () => {
  let removedTentItem = false;
  let profile = null;
  let sourceTentItem = null;
  try {
    if (!player || player.vehicle || Number(player.dimension || 0) !== 0) {
      return notify(player, "Палатку можно установить только пешком в открытом мире.");
    }
    profile = await ensureHuntingProfile(player);
    if (profile.tent?.deployed || tents.has(getPlayerStaticId(player))) {
      return notify(player, "У вас уже установлена палатка.");
    }

    playHuntingActionAnimation(
      player,
      "amb@world_human_gardener_plant@male@base",
      "base",
      1900,
      1
    );
    await waitForHuntingAction(1800);
    if (!huntingRuntime.active || !player || !mp.players.exists(player) || player.vehicle) return false;

    const heading = Number(player.heading || 0);
    const radians = heading * Math.PI / 180;
    const position = {
      x: Number(player.position.x) - Math.sin(radians) * 1.8,
      y: Number(player.position.y) + Math.cos(radians) * 1.8,
      z: Number(player.position.z),
    };
    const consumed = await inventory.consumeItemByUid(player, item?.uid, "hunting_tent", 1);
    removedTentItem = Boolean(consumed?.ok);
    sourceTentItem = consumed?.item || null;
    if (!consumed?.ok) return notify(player, "Палатка не найдена в инвентаре.");
    if (!huntingRuntime.active) {
      await inventory.addItemInstance(player, "hunting_tent", sourceTentItem || {});
      removedTentItem = false;
      return false;
    }

    profile.tent = {
      deployed: true,
      position,
      heading,
      dimension: Number(player.dimension || 0),
      durability: Math.max(1, Number(sourceTentItem?.durability || sourceTentItem?.maxDurability || 5)),
      bags: [],
      placedAt: Date.now(),
    };
    await saveHuntingProfile(player);
    if ((removedTentItem = !spawnTentForProfile(player, profile))) {
      profile.tent = null;
      await saveHuntingProfile(player);
      await inventory.addItemInstance(player, "hunting_tent", sourceTentItem || {});
      removedTentItem = false;
      return notify(player, "Не удалось установить палатку. Предмет возвращён.");
    }
    notify(player, "Палатка установлена. Короткое E открывает хранилище, удержание E сворачивает пустую палатку.");
  } catch (error) {
    console.error("[HUNTING] useTent error:", error);
    if (profile?.tent?.deployed) profile.tent = null;
    if (removedTentItem && player && mp.players.exists(player)) {
      try {
        const restored = await inventory.addItemInstance(player, "hunting_tent", sourceTentItem || {});
        if (restored?.ok) {
          notify(player, "Не удалось сохранить палатку. Предмет возвращён в инвентарь.");
        }
      } catch (restoreError) {
        console.error("[HUNTING] Tent refund failed:", restoreError);
      }
    }
  }
}));

registerServerEvent("hunting:item:useCamo", (player, item) => runPlayerHuntingOperation(player, "use_camo", async () => {
  const consumed = await inventory.consumeItemByUid(player, item?.uid, "hunting_camo", 1);
  if (!consumed?.ok) return notify(player, "Маскировочный комплект не найден в инвентаре.");
  player.__huntingCamoUntil = Date.now() + 20 * 60 * 1000;
  try { player.setVariable("huntingCamoUntil", player.__huntingCamoUntil); } catch {}
  notify(player, "Маскировка активна на 20 минут.");
}));

registerServerEvent("hunting:item:useStimulant", (player, item) => runPlayerHuntingOperation(player, "use_stimulant", async () => {
  playHuntingActionAnimation(player, "mp_suicide", "pill", 1500, 49);
  await waitForHuntingAction(1200);
  if (!huntingRuntime.active || !player || !mp.players.exists(player)) return false;
  const consumed = await inventory.consumeItemByUid(player, item?.uid, "hunting_stimulant", 1);
  if (!consumed?.ok) return notify(player, "Охотничий стимулятор не найден в инвентаре.");
  player.__huntingStimulantUntil = Date.now() + 2 * 60 * 1000;
  try {
    const maximum = Math.max(100, Number(player.maxHealth || 100));
    const restoredHealth = Math.min(maximum, Number(player.health || 100) + 20);
    player.setVariable("huntingStimulantUntil", player.__huntingStimulantUntil);
    hudNeeds.setHealth(player, restoredHealth).catch((error) => {
      console.error("[HUNTING] Stimulant health save failed:", error?.message || error);
    });
  } catch {}
  notify(player, "Стимулятор восстановил 20 HP. Визуальная слышимость животных активна на 2 минуты.");
}));

registerServerEvent("hunting:item:useMaskSuit", (player, item) => runPlayerHuntingOperation(player, "use_mask_suit", async () => {
  const uid = String(item?.uid || "");

  if (player.__huntingMaskSuit) {
    if (uid !== String(player.__huntingMaskSuitUid || "")) {
      return notify(player, "Сначала снимите активный маскхалат.");
    }
    const removed = await inventory.toggleMaskSuit(player, uid);
    if (!removed?.ok || removed.equipped) {
      return notify(player, "Не удалось снять маскхалат: освободите место в инвентаре.");
    }
    await disableMaskSuit(player, "removed");
    return;
  }

  const equipped = await inventory.toggleMaskSuit(player, uid);
  if (!equipped?.ok) return notify(player, "Маскхалат не найден или его нельзя надеть.");
  if (equipped.broken) return notify(player, "Маскхалат окончательно износился и был удалён.");
  if (!equipped.equipped) return;

  captureMaskSuitAppearance(player);
  const customClothesApplied = applyMaskSuitAppearance(player);
  player.__huntingMaskSuit = true;
  player.__huntingMaskSuitUid = uid;
  player.__huntingMaskSuitUntil = 0;
  try { player.setVariable("huntingMaskSuit", true); } catch {}
  notify(
    player,
    `Маскхалат надет. Прочность: ${equipped.durability}/${equipped.maxDurability}.${customClothesApplied ? "" : " Бонус активен, но для текущей модели не найден комплект одежды."}`
  );
}));

registerServerEvent("hunting:storageInteract", (player, vehicleId, tentOwnerStaticId) => runPlayerHuntingOperation(player, "storage", async () => {
  try {
    const tentOwner = Number(tentOwnerStaticId);
    if (tentOwner > 0) {
      const tent = tents.get(tentOwner);
      if (tent && getDistance(player.position, tent.position) <= HUNTING_CONFIG.tentInteractionDistance) {
        await putTakeOrFoldTent(player, tent);
        return;
      }
    }

    const vehicle = mp.vehicles.at(Number(vehicleId));
    if (vehicle) {
      await openVehicleInventory(player, vehicle);
    }
  } catch (error) {
    console.error("[HUNTING] storageInteract error:", error);
  }
}));

registerServerEvent("hunting:tentHoldStart", (player, tentOwnerStaticId) => {
  const ownerStaticId = Number(tentOwnerStaticId);
  const tent = tents.get(ownerStaticId);
  if (
    !tent ||
    player.vehicle ||
    (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) ||
    ownerStaticId !== getPlayerStaticId(player) ||
    Number(tent.dimension || 0) !== Number(player.dimension || 0) ||
    getDistance(player.position, tent.position) > HUNTING_CONFIG.tentInteractionDistance
  ) {
    player.__huntingTentHold = null;
    return;
  }
  player.__huntingTentHold = { ownerStaticId, startedAt: Date.now() };
});

registerServerEvent("hunting:tentHoldCancel", (player) => {
  player.__huntingTentHold = null;
});

registerServerEvent("hunting:tentFoldAll", (player, tentOwnerStaticId) => {
  const hold = player.__huntingTentHold;
  player.__huntingTentHold = null;
  const ownerStaticId = Number(tentOwnerStaticId);
  const requestedAt = Date.now();
  return runPlayerHuntingOperation(player, "tent_fold_all", async () => {
    const elapsed = requestedAt - Number(hold?.startedAt || 0);
    if (!hold || Number(hold.ownerStaticId) !== ownerStaticId || elapsed < 1000 || elapsed > 10000) {
      return notify(player, "Удерживайте E не менее одной секунды рядом со своей палаткой.");
    }
    await foldTentWithContents(player, tents.get(ownerStaticId));
  });
});

function publicZones() {
  return ZONES.map((zone) => ({
    id: zone.id,
    name: zone.name,
    subtitle: zone.subtitle,
    behavior: zone.behavior,
    center: zone.center,
    radius: zone.radius,
    minZ: zone.minZ,
    maxZ: zone.maxZ,
    color: zone.color,
    mapColor: zone.mapColor,
  }));
}

function serializeAnimal(animal) {
  const position = getAnimalPosition(animal);

  return {
    entityId: animal.entityId,
    debugId: animal.debugId,
    zoneId: animal.zoneId,
    speciesId: animal.species.id,
    speciesName: animal.species.name,
    behavior: animal.behavior,
    exotic: Boolean(animal.species.exotic),
    modelHash: normalizeHash(mp.joaat(animal.species.model)),
    position,
  };
}

function getAnimalPosition(animal) {
  if (!animal) return null;

  if (entityExists(animal.ped, "ped")) {
    animal.lastPosition = {
      x: Number(animal.ped.position.x),
      y: Number(animal.ped.position.y),
      z: Number(animal.ped.position.z),
    };
    animal.dimension = Number(animal.ped.dimension || 0);
  }

  const position = animal.lastPosition || animal.home;
  return position ? {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z),
  } : null;
}

function getAnimalHealthPercent(animal) {
  const required = Math.max(1, Number(animal?.hitsRequired || 1));
  const hits = Math.max(0, Number(animal?.hits || 0));
  return Math.max(0, Math.round((1 - hits / required) * 100));
}

function getAnimalDebugId(zoneId, slotId) {
  const zoneIndex = ZONES.findIndex((zone) => zone.id === zoneId);
  const localSlot = Number(String(slotId).split(":").pop());
  const previousPopulation = ZONES
    .slice(0, Math.max(0, zoneIndex))
    .reduce((total, zone) => total + Number(zone.population || 0), 0);

  return previousPopulation + (Number.isFinite(localSlot) ? localSlot : 0) + 1;
}

function getRandomRoamTarget(animal, zone) {
  const homeDx = Number(animal.home.x) - Number(zone.center.x);
  const homeDy = Number(animal.home.y) - Number(zone.center.y);
  const homeDistance = Math.sqrt(homeDx * homeDx + homeDy * homeDy);
  const allowedRadius = Math.max(
    18,
    Math.min(Number(zone.roamRadius || 100), Number(zone.radius || 100) - homeDistance - 18)
  );

  const angle = Math.random() * Math.PI * 2;
  const distance = 12 + Math.random() * Math.max(6, allowedRadius - 12);

  return {
    x: Number(animal.home.x) + Math.cos(angle) * distance,
    y: Number(animal.home.y) + Math.sin(angle) * distance,
    z: Number(animal.home.z),
  };
}

function serializeCarcass(carcass) {
  const position = getCarcassPosition(carcass);

  return {
    id: carcass.id,
    animalEntityId: carcass.animalEntityId,
    entityId: carcass.entity ? carcass.entity.id : null,
    entityType: carcass.entityType,
    zoneId: carcass.zoneId,
    speciesId: carcass.species.id,
    speciesName: carcass.species.name,
    exotic: Boolean(carcass.species.exotic),
    spoiled: Boolean(carcass.spoiled),
    stage: carcass.stage,
    carrierId: carcass.carrier && mp.players.exists(carcass.carrier) ? carcass.carrier.id : null,
    vehicleId: entityExists(carcass.vehicle, "vehicle") ? carcass.vehicle.id : null,
    position,
    dimension: Number(carcass.dimension || 0),
    ownerPlayerId: carcass.ownerPlayer && mp.players.exists(carcass.ownerPlayer)
      ? carcass.ownerPlayer.id
      : null,
    ownerKey: String(carcass.ownerStaticId || ""),
    expiresAt: carcass.expiresAt,
    attemptsUsed: Number(carcass.attemptsUsed || 0),
    attemptsMax: HUNTING_CONFIG.processingAttempts,
  };
}

function getCarcassPosition(carcass) {
  if (!carcass) return null;

  if (carcass.entity && entityExists(carcass.entity, carcass.entityType)) {
    carcass.position = {
      x: Number(carcass.entity.position.x),
      y: Number(carcass.entity.position.y),
      z: Number(carcass.entity.position.z),
    };
  }

  return carcass.position ? {
    x: Number(carcass.position.x),
    y: Number(carcass.position.y),
    z: Number(carcass.position.z),
  } : null;
}

function isPlayerNearCarcass(player, carcass, extraDistance = 0) {
  const position = getCarcassPosition(carcass);
  if (!player || !position) return false;
  if (Number(player.dimension || 0) !== Number(carcass.dimension || 0)) return false;

  const dx = Number(player.position.x) - Number(position.x);
  const dy = Number(player.position.y) - Number(position.y);
  const dz = Math.abs(Number(player.position.z) - Number(position.z));
  return Math.hypot(dx, dy) <= HUNTING_CONFIG.interactionDistance + Number(extraDistance || 0) &&
    dz <= 8;
}

function serializeTent(tent) {
  return {
    ownerStaticId: Number(tent.ownerStaticId || 0),
    ownerPlayerId: tent.ownerPlayer && mp.players.exists(tent.ownerPlayer)
      ? Number(tent.ownerPlayer.id)
      : null,
    entityId: entityExists(tent.entity, "object") ? Number(tent.entity.id) : null,
    position: { ...tent.position },
    dimension: Number(tent.dimension || 0),
    bagCount: Array.isArray(tent.profileTent?.bags) ? tent.profileTent.bags.length : 0,
    capacityKg: HUNTING_CONFIG.tentCapacityKg,
  };
}

function syncTent(tent) {
  broadcast("hunting:tentState", serializeTent(tent));
}

function destroyTent(tent, reason = "removed") {
  if (!tent) return;
  try {
    if (entityExists(tent.entity, "object")) tent.entity.destroy();
  } catch {}
  tents.delete(Number(tent.ownerStaticId));
  broadcast("hunting:tentRemoved", {
    ownerStaticId: Number(tent.ownerStaticId),
    reason,
  });
}

function spawnTentForProfile(player, profile, explicitStaticId = 0) {
  if (!huntingRuntime.active) return null;
  const staticId = Math.max(0, Number(explicitStaticId || getPlayerStaticId(player)));
  const data = profile?.tent;
  if (!staticId || !data?.deployed || !data.position) return null;

  const existing = tents.get(staticId);
  if (existing && entityExists(existing.entity, "object")) {
    if (player) existing.ownerPlayer = player;
    existing.profile = profile;
    existing.profileTent = data;
    syncTent(existing);
    return existing;
  }

  let entity = null;
  try {
    entity = mp.objects.new(
      mp.joaat(HUNTING_CONFIG.tentModel),
      new mp.Vector3(data.position.x, data.position.y, data.position.z),
      {
        rotation: new mp.Vector3(0, 0, Number(data.heading || 0)),
        dimension: Number(data.dimension || 0),
      }
    );
    entity.setVariable("huntingTent", true);
    entity.setVariable("huntingTentOwner", staticId);
  } catch (error) {
    console.error("[HUNTING] Failed to spawn tent:", error);
    return null;
  }

  const tent = {
    ownerStaticId: staticId,
    ownerPlayer: player || null,
    profile,
    entity,
    position: { ...data.position },
    dimension: Number(data.dimension || 0),
    profileTent: data,
  };
  tents.set(staticId, tent);
  syncTent(tent);
  return tent;
}

registerServerEvent("hunting:tentGrounded", async (player, ownerStaticId, entityId, x, y, z) => {
  try {
    const staticId = Math.max(0, Number(ownerStaticId || 0));
    const tent = tents.get(staticId);
    if (!tent || !entityExists(tent.entity, "object")) return;
    if (!player || !mp.players.exists(player)) return;
    if (getPlayerStaticId(player) !== staticId) return;
    if (Number(tent.entity.id) !== Number(entityId)) return;
    if (Number(tent.dimension || 0) !== Number(player.dimension || 0)) return;
    if (tent.groundSyncPending || tent.groundSyncComplete) return;

    const next = { x: Number(x), y: Number(y), z: Number(z) };
    if (![next.x, next.y, next.z].every(Number.isFinite)) return;
    if (Math.hypot(next.x - tent.position.x, next.y - tent.position.y) > 0.35) return;
    if (Math.abs(next.z - tent.position.z) > 80) return;
    if (Math.hypot(next.x - player.position.x, next.y - player.position.y) > 8) return;
    if (Math.abs(next.z - player.position.z) > 5) return;

    tent.groundSyncPending = true;
    try {
      const placedAt = Number(tent.profileTent?.placedAt || tent.profile?.tent?.placedAt || 0);
      const updated = await inventory.updateHuntingTentPosition(player, placedAt, next);
      if (!updated?.ok) return;
      if (!huntingRuntime.active || !player || !mp.players.exists(player)) return;
      if (tents.get(staticId) !== tent || !entityExists(tent.entity, "object")) return;

      Object.assign(tent.profile, updated.profile);
      profiles.set(staticId, tent.profile);
      tent.profileTent = tent.profile.tent;
      tent.position = { ...next };
      tent.entity.position = new mp.Vector3(next.x, next.y, next.z);
      tent.groundSyncComplete = true;
      syncTent(tent);
    } finally {
      tent.groundSyncPending = false;
    }
  } catch (error) {
    console.error("[HUNTING] tentGrounded error:", error);
  }
});

async function bootstrapStoredProfiles() {
  const entries = await huntingRepository.loadAllProfiles();
  if (!huntingRuntime.active) return;
  const now = Date.now();

  for (const entry of entries) {
    if (!huntingRuntime.active) return;
    const staticId = Number(entry.staticId);
    const profile = entry.profile;
    profiles.set(staticId, profile);

    if (!profile.tent?.deployed || !profile.tent.position) continue;

    if (now - Number(profile.lastSeenAt || now) > 2 * 60 * 60 * 1000) {
      profile.pendingTentReturn = {
        durability: Math.max(1, Number(profile.tent.durability || 1)),
      };
      profile.tent = null;
      await huntingRepository.saveProfile(staticId, profile);
      console.log(`[HUNTING] Offline tent queued for return | static=${staticId}`);
      continue;
    }

    spawnTentForProfile(null, profile, staticId);
  }

  console.log(`[HUNTING] Profiles bootstrapped | count=${entries.length} tents=${tents.size}`);
}

profileBootstrapPromise = bootstrapStoredProfiles().catch((error) => {
  console.error("[HUNTING] Profile bootstrap failed:", error);
});

function syncPlayer(player) {
  if (
    !player ||
    !mp.players.exists(player) ||
    player.__huntingCharacterReady !== true ||
    player.__huntingLoginCleanupComplete !== true ||
    getPlayerStaticId(player) <= 0
  ) return;

  player.call("hunting:setup", [JSON.stringify({
    serverNow: Date.now(),
    carcassLifetimeMs: HUNTING_CONFIG.carcassLifetimeMs,
    sellerSafeZone: HUNTING_CONFIG.sellerSafeZone,
    zones: publicZones(),
    hunt: getHuntingState(player),
    localOwnerKey: getPlayerOwnerId(player),
    animals: Array.from(animals.values()).map(serializeAnimal),
    carcasses: Array.from(carcasses.values()).map(serializeCarcass),
    tents: Array.from(tents.values()).map(serializeTent),
  })]);
}

// A module hot-reload does not emit playerReady for already connected players.
// Hunting is deliberately session-scoped, so an old in-memory flag must never
// resurrect zones or the task HUD after the runtime has been reloaded.
setTimeout(() => {
  if (!huntingRuntime.active) return;
  try {
    mp.players.forEach((player) => {
      const characterWasReady = (
        player.__huntingCharacterReady === true &&
        getPlayerStaticId(player) > 0
      );
      player.__huntingStartedThisSession = false;
      player.__huntingRuntimeSessionId = null;
      player.__huntingLoginCleanupComplete = false;
      if (characterWasReady) {
        setTimeout(() => {
          if (!huntingRuntime.active || !player || !mp.players.exists(player)) return;
          try { mp.events.call("hunting:characterReady", player); } catch {}
        }, 0);
      }
    });
  } catch {}
}, 0);

function syncCarcass(carcass) {
  broadcast("hunting:carcassState", serializeCarcass(carcass));
}

function getSlotKey(zoneId, slotId) {
  const rawSlotId = String(slotId ?? "0");
  return rawSlotId.includes(":") ? rawSlotId : `${zoneId}:${rawSlotId}`;
}

function getAnimalInSlot(zoneId, slotId) {
  const slotKey = getSlotKey(zoneId, slotId);

  for (const animal of animals.values()) {
    if (animal.alive && getSlotKey(animal.zoneId, animal.slotId) === slotKey) {
      return animal;
    }
  }

  return null;
}

function destroyAnimalPed(animal) {
  if (!animal?.ped) return;

  try {
    if (entityExists(animal.ped, "ped")) animal.ped.destroy();
  } catch {}

  animal.ped = null;
}

function chooseSpawnPoint(zone, slotIndex, randomizeSpawnPoint) {
  if (!randomizeSpawnPoint && zone.testSpawn) {
    return zone.spawnPoints[slotIndex % zone.spawnPoints.length];
  }

  const occupied = Array.from(animals.values())
    .filter((animal) => animal.alive && animal.zoneId === zone.id)
    .map((animal) => getAnimalPosition(animal))
    .filter(Boolean);
  const candidates = zone.spawnPoints
    .map((point) => ({ point, roll: Math.random() }))
    .sort((a, b) => a.roll - b.roll)
    .map((entry) => entry.point);

  return candidates.find((point) => (
    occupied.every((position) => getDistance(position, point) >= 4.5)
  )) || candidates[0];
}

function spawnAnimal(zoneId, slotId, randomizeSpawnPoint = false) {
  const zone = zonesById.get(zoneId);
  if (!zone || !zone.spawnPoints.length || !zone.species.length) return null;

  const canonicalSlotId = getSlotKey(zoneId, slotId);
  const existing = getAnimalInSlot(zoneId, canonicalSlotId);
  if (existing && entityExists(existing.ped, "ped")) return existing;

  if (existing) {
    animals.delete(Number(existing.entityId));
    broadcast("hunting:animalRemoved", JSON.stringify({ entityId: existing.entityId }));
    destroyAnimalPed(existing);
  }

  const slotIndex = Math.max(0, Number(canonicalSlotId.split(":").pop()) || 0);
  const species = zone.testSpawn
    ? zone.species[slotIndex % zone.species.length]
    : chooseWeighted(zone.species);
  const home = chooseSpawnPoint(zone, slotIndex, randomizeSpawnPoint);
  const position = new mp.Vector3(home.x, home.y, home.z);
  let ped = null;

  try {
    ped = mp.peds.new(
      mp.joaat(species.model),
      position,
      {
        dynamic: true,
        frozen: false,
        // Live animals use the scripted hunting damage pipeline. Native
        // vehicle/ped damage is disabled to prevent drive-by farming and DB.
        invincible: true,
      }
    );

    ped.dimension = 0;
    ped.heading = Number.isFinite(Number(home.heading))
      ? Number(home.heading)
      : Math.random() * 360;
  } catch (error) {
    console.error(`[HUNTING] Failed to spawn ${species.model}:`, error);
    return null;
  }

  const animal = {
    ped,
    entityId: Number(ped.id),
    slotId: canonicalSlotId,
    debugId: getAnimalDebugId(zoneId, canonicalSlotId),
    zoneId,
    behavior: zone.behavior,
    species,
    home: { ...home },
    lastPosition: { x: Number(home.x), y: Number(home.y), z: Number(home.z) },
    dimension: 0,
    hits: 0,
    hitsRequired: getSpeciesHitsRequired(species.id),
    spoiled: false,
    alive: true,
    controllerId: null,
    nextReactionAt: 0,
    nextGunshotReactionAt: 0,
    nextRoamAt: Date.now() + randomInt(1500, 4500),
  };

  try {
    ped.setVariable("huntingAnimal", true);
    ped.setVariable("huntingZone", zoneId);
  } catch {}

  animals.set(animal.entityId, animal);
  assignAnimalController(animal);
  broadcast("hunting:animalSpawned", serializeAnimal(animal));
  return animal;
}

function scheduleRespawn(zoneId, slotId, forcedDelay = null) {
  const zone = zonesById.get(zoneId);
  if (!zone) return;

  const slotKey = getSlotKey(zoneId, slotId);
  if (respawnTimers.has(slotKey)) return;

  const hasForcedDelay = forcedDelay !== null &&
    forcedDelay !== undefined &&
    Number.isFinite(Number(forcedDelay));
  const delay = hasForcedDelay
    ? Math.max(250, Number(forcedDelay))
    : randomInt(zone.respawnDelay[0], zone.respawnDelay[1]);

  const timer = setTimeout(() => {
    respawnTimers.delete(slotKey);

    const existing = getAnimalInSlot(zoneId, slotKey);
    if (existing && entityExists(existing.ped, "ped")) return;

    const spawned = spawnAnimal(zoneId, slotKey, true);
    if (!spawned) {
      console.error(`[HUNTING] Respawn failed for slot ${slotKey}; retry scheduled.`);
      scheduleRespawn(zoneId, slotKey, HUNTING_CONFIG.respawnRetryMs);
    }
  }, delay);

  respawnTimers.set(slotKey, timer);
}

function createCarcassPed(animal, position, dimension, heading) {
  try {
    const ped = mp.peds.new(
      mp.joaat(animal.species.model),
      new mp.Vector3(position.x, position.y, position.z),
      {
        dynamic: true,
        frozen: false,
        invincible: false,
      }
    );

    ped.dimension = Number(dimension || 0);
    ped.heading = Number(heading || 0);
    return ped;
  } catch (error) {
    console.error(`[HUNTING] Failed to create carcass ped for ${animal.species.id}:`, error);
    return null;
  }
}

function destroyCarcassEntity(carcass) {
  if (!carcass || !carcass.entity) return;

  try {
    if (entityExists(carcass.entity, carcass.entityType)) {
      carcass.entity.destroy();
    }
  } catch {}

  carcass.entity = null;
  carcass.entityType = null;
}

function removeCarcass(carcass, reason = "expired") {
  if (!carcass || !carcasses.has(carcass.id)) return;

  if (carcass.lockedBy && mp.players.exists(carcass.lockedBy)) {
    const lockedPlayer = carcass.lockedBy;
    if (lockedPlayer.__huntingChallenge?.consumedItems?.length) {
      runPlayerHuntingOperation(lockedPlayer, "carcass_removed_refund", async () => {
        await cancelProcessing(
          lockedPlayer,
          `carcass_${reason}`,
          "Туша исчезла. Верёвка и мешок возвращены."
        );
      });
    } else {
      releaseChallenge(lockedPlayer);
      lockedPlayer.call("hunting:minigameFinish", [false]);
      lockedPlayer.call("hunting:tttFinish", [false]);
      lockedPlayer.call("hunting:processingChoiceClose", []);
    }
    carcass.lockedBy = null;
  }

  if (carcass.carrier && mp.players.exists(carcass.carrier)) {
    carcass.carrier.__huntingCarcassId = null;
  }

  if (entityExists(carcass.vehicle, "vehicle") && carcass.vehicle.__huntingCarcasses instanceof Set) {
    carcass.vehicle.__huntingCarcasses.delete(carcass.id);
  }

  destroyCarcassEntity(carcass);
  carcasses.delete(carcass.id);
  broadcast("hunting:carcassRemoved", JSON.stringify({ id: carcass.id, reason }));
  console.log(
    `[HUNTING] Carcass removed | carcass=${carcass.id} species=${carcass.species?.id || "unknown"} reason=${reason}`
  );
  huntingAudit("carcass_removed", null, {
    carcassId: Number(carcass.id),
    speciesId: String(carcass.species?.id || "unknown"),
    ownerStaticId: Number(carcass.ownerStaticId || 0) || null,
    reason: String(reason),
  }, reason === "expired" ? "warning" : "info");
}

function killAnimal(animal, killer, killKind = "unknown") {
  if (!animal || !animal.alive) return;

  const animalEntityId = Number(animal.entityId);
  const position = getAnimalPosition(animal) || {
    x: Number(animal.home?.x || 0),
    y: Number(animal.home?.y || 0),
    z: Number(animal.home?.z || 0),
  };
  const dimension = entityExists(animal.ped, "ped")
    ? Number(animal.ped.dimension || 0)
    : Number(animal.dimension || 0);
  const heading = entityExists(animal.ped, "ped")
    ? Number(animal.ped.heading || animal.home?.heading || 0)
    : Number(animal.home?.heading || 0);

  animal.alive = false;
  animals.delete(animalEntityId);
  broadcast("hunting:animalRemoved", JSON.stringify({ entityId: animalEntityId }));
  destroyAnimalPed(animal);

  const carcassEntity = createCarcassPed(animal, position, dimension, heading);

  const carcass = {
    id: nextCarcassId++,
    animalEntityId,
    entity: carcassEntity,
    entityType: carcassEntity ? "ped" : null,
    zoneId: animal.zoneId,
    species: animal.species,
    spoiled: animal.spoiled,
    stage: "raw",
    position,
    createdAt: Date.now(),
    expiresAt: Date.now() + (animal.spoiled
      ? HUNTING_CONFIG.spoiledCarcassLifetimeMs
      : HUNTING_CONFIG.carcassLifetimeMs),
    dimension,
    ownerPlayer: killer && mp.players.exists(killer) ? killer : null,
    ownerStaticId: getPlayerOwnerId(killer),
    carrier: null,
    vehicle: null,
    lockedBy: null,
    attemptsUsed: 0,
    killKind: String(killKind || "unknown"),
  };

  if (carcassEntity) {
    try {
      carcassEntity.setVariable("huntingCarcass", true);
      carcassEntity.setVariable("huntingCarcassId", carcass.id);
    } catch {}
    try {
      // Туша должна быть мёртвой в authoritative server state. Раньше смерть
      // ставилась только native-вызовом на клиенте и при дальней синхронизации
      // ped мог снова встать, хотя kill уже был зарегистрирован.
      carcassEntity.health = 0;
    } catch {}
  }

  carcasses.set(carcass.id, carcass);
  broadcast("hunting:animalKilled", serializeCarcass(carcass));

  console.log(
    `[HUNTING] Kill registered | animal=${animalEntityId} carcass=${carcass.id} species=${animal.species.id} owner=${carcass.ownerStaticId || "none"} kind=${carcass.killKind} spoiled=${carcass.spoiled} position=${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}`
  );
  huntingAudit("animal_killed", killer, {
    animalEntityId,
    carcassId: carcass.id,
    speciesId: animal.species.id,
    killKind: carcass.killKind,
    spoiled: Boolean(carcass.spoiled),
    position,
  }, carcass.spoiled ? "warning" : "info");

  if (animal.spoiled) {
    notify(killer, `${animal.species.name}: туша испорчена неподходящим способом и исчезнет через 30 секунд.`);
  } else {
    notify(killer, `${animal.species.name} добыт. Туша исчезнет через 5 минут.`);
  }

  scheduleRespawn(animal.zoneId, animal.slotId);
}

function getAttackProfile(weaponHash, inventoryItemId = "") {
  const hash = normalizeHash(weaponHash);

  if (!hash || weaponHashSetHas(unarmedWeaponHashes, hash)) {
    return { damage: 2, maxDistance: 3.4, cooldownMs: 420, kind: "unarmed", preservesCarcass: false };
  }

  if (weaponHashSetHas(knifeWeaponHashes, hash)) {
    return { damage: 2, maxDistance: 3.8, cooldownMs: 280, kind: "knife", preservesCarcass: false };
  }

  if (weaponHashSetHas(huntingWeaponHashes, hash)) return {
    damage: String(inventoryItemId) === "hunting_rifle_scoped" ? 6 : 3,
    maxDistance: HUNTING_CONFIG.shotDistance,
    cooldownMs: 110,
    kind: String(inventoryItemId) === "hunting_rifle_scoped"
      ? "hunting_rifle_scoped"
      : "hunting_rifle",
    preservesCarcass: true,
  };

  return {
    damage: 2,
    maxDistance: HUNTING_CONFIG.shotDistance,
    cooldownMs: 350,
    kind: "illegal_weapon",
    preservesCarcass: false,
  };
}

function reactToHit(animal, attacker, forced = false) {
  if (!animal || !attacker || !mp.players.exists(attacker)) return;

  assignAnimalController(animal, attacker);
  if (forced) animal.soundFleeUntil = 0;

  if (animal.behavior === "aggressive" && attacker.__huntingProfile?.active) {
    const targetChanged = Number(animal.attackTargetId) !== Number(attacker.id);
    animal.attackTargetId = Number(attacker.id);
    animal.attackTargetUntil = Date.now() + (forced ? 15000 : 8000);
    if (targetChanged || forced) {
      animal.lastAttackContactAt = 0;
      animal.nextAttackDamageAt = Math.max(
        Number(animal.nextAttackDamageAt || 0),
        Date.now() + 650
      );
    }
  }

  broadcast("hunting:animalReact", {
    entityId: animal.entityId,
    attackerId: attacker.id,
    behavior: animal.behavior,
    forced: Boolean(forced),
  });
}

function getAnimalAttackDamage(animal) {
  const damageBySpecies = {
    hawk: 7,
    coyote: 9,
    wolf: 11,
    chimp: 10,
    boar: 13,
    lion: 16,
    panther: 15,
  };

  return damageBySpecies[String(animal?.species?.id || "")] || 8;
}

function applyAnimalAttackDamage(animal, player, now = Date.now()) {
  if (!animal?.alive || animal.behavior !== "aggressive") return false;
  if (!player || !mp.players.exists(player) || player.vehicle) return false;
  if (!player.__huntingProfile?.active) return false;
  if (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) return false;
  if (Number(animal.attackTargetId) !== Number(player.id)) return false;
  if (now > Number(animal.attackTargetUntil || 0)) return false;
  if (now - Number(animal.lastAttackContactAt || 0) > 800) return false;
  if (now < Number(animal.nextAttackDamageAt || 0)) return false;
  // Несколько животных могут атаковать одновременно, но не должны складывать
  // урон в один кадр до того, как игрок вообще увидит анимацию нападения.
  if (now < Number(player.__huntingNextAnimalDamageAt || 0)) return false;
  if (!entityExists(animal.ped, "ped")) return false;
  if (Number(animal.ped.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(animal.ped.position, player.position) > 3.15) return false;

  let damage = getAnimalAttackDamage(animal);
  const armour = Math.max(0, Number(player.armour || 0));
  const armourDamage = Math.min(armour, damage);

  if (armourDamage > 0) {
    player.armour = Math.max(0, armour - armourDamage);
    damage -= armourDamage;
  }

  if (damage > 0) {
    hudNeeds.setHealth(
      player,
      Math.max(0, Number(player.health || 0) - damage),
      { persist: false }
    );
  }

  animal.nextAttackDamageAt = now + HUNTING_CONFIG.animalDamageCooldownMs;
  animal.lastAttackContactAt = 0;
  player.__huntingNextAnimalDamageAt = now + 1350;
  return true;
}

registerServerEvent("hunting:animalAttackContact", (controller, entityId, targetPlayerId) => {
  try {
    const animal = animals.get(Number(entityId));
    const target = getPlayerById(targetPlayerId);
    if (!animal?.alive || animal.behavior !== "aggressive" || !target) return;
    if (!target.__huntingProfile?.active) return;
    if (!entityExists(animal.ped, "ped")) return;
    if (Number(animal.attackTargetId) !== Number(target.id)) return;
    if (Number(animal.ped.dimension || 0) !== Number(target.dimension || 0)) return;
    if (getDistance(animal.ped.position, target.position) > 3.15) return;

    const assignedController = animal.ped.controller;
    const assignedControllerId = assignedController && typeof assignedController === "object"
      ? Number(assignedController.id)
      : Number(assignedController);
    if (
      Number.isFinite(assignedControllerId) &&
      assignedControllerId >= 0 &&
      assignedControllerId !== Number(controller.id)
    ) return;

    animal.lastAttackContactAt = Date.now();
  } catch (error) {
    console.error("[HUNTING] animalAttackContact error:", error);
  }
});

registerServerEvent("hunting:animalGrounded", (controller, entityId, x, y, z) => {
  try {
    const animal = animals.get(Number(entityId));
    if (!animal?.alive || !entityExists(animal.ped, "ped")) return;
    if (!controller || !mp.players.exists(controller)) return;
    if (Number(animal.ped.dimension || 0) !== Number(controller.dimension || 0)) return;

    const assignedController = animal.ped.controller;
    const assignedControllerId = assignedController && typeof assignedController === "object"
      ? Number(assignedController.id)
      : Number(assignedController);
    if (
      Number.isFinite(assignedControllerId) &&
      assignedControllerId >= 0 &&
      assignedControllerId !== Number(controller.id)
    ) return;

    const next = { x: Number(x), y: Number(y), z: Number(z) };
    if (![next.x, next.y, next.z].every(Number.isFinite)) return;
    const current = getAnimalPosition(animal);
    if (!current) return;
    const horizontalDelta = Math.hypot(next.x - current.x, next.y - current.y);
    if (horizontalDelta > 2 || Math.abs(next.z - current.z) > 80) return;
    if (getDistance(controller.position, current) > 350) return;

    animal.ped.position = new mp.Vector3(next.x, next.y, next.z);
    animal.home = { ...animal.home, z: next.z };
    animal.lastPosition = next;
  } catch (error) {
    console.error("[HUNTING] animalGrounded error:", error);
  }
});

registerServerEvent("hunting:bagGrounded", (player, carcassId, x, y, z) => {
  try {
    const carcass = carcasses.get(Number(carcassId));
    if (!carcass || carcass.entityType !== "object" || carcass.stage !== "bagged") return;
    if (!isCarcassOwner(player, carcass) || !entityExists(carcass.entity, "object")) return;
    if (Number(carcass.dimension || 0) !== Number(player.dimension || 0)) return;
    if (carcass.bagGroundSyncComplete) return;
    const next = { x: Number(x), y: Number(y), z: Number(z) };
    if (![next.x, next.y, next.z].every(Number.isFinite)) return;
    const current = carcass.position || carcass.entity.position;
    if (!current || Math.hypot(next.x - current.x, next.y - current.y) > 3) return;
    if (Math.abs(next.z - Number(current.z)) > 80) return;
    if (getDistance(player.position, current) > 15) return;
    carcass.position = next;
    carcass.entity.position = new mp.Vector3(next.x, next.y, next.z);
    carcass.bagGroundSyncComplete = true;
  } catch (error) {
    console.error("[HUNTING] bagGrounded error:", error);
  }
});

function getNearestPlayerForAnimal(animal, maxDistance, requireActiveHunt = true) {
  if (!animal?.ped) return null;

  let nearest = null;
  const baseDetectionDistance = Number(maxDistance || 0);
  let nearestDistance = baseDetectionDistance;

  mp.players.forEach((player) => {
    if (!player || !mp.players.exists(player)) return;
    if (requireActiveHunt && !player.__huntingProfile?.active) return;
    if (Number(player.dimension || 0) !== Number(animal.ped.dimension || 0)) return;
    if (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) return;

    const distance = getDistance(player.position, animal.ped.position);
    const camouflaged = Date.now() < Number(player.__huntingCamoUntil || 0) ||
      Boolean(player.__huntingMaskSuit);
    const detectionDistance = baseDetectionDistance * (camouflaged ? 0.58 : 1);
    if (distance > detectionDistance || distance >= nearestDistance) return;

    nearest = player;
    nearestDistance = distance;
  });

  return nearest;
}

function getPlayerById(playerId) {
  let matched = null;

  mp.players.forEach((player) => {
    if (!matched && Number(player?.id) === Number(playerId)) matched = player;
  });

  return matched;
}

function assignAnimalController(animal, preferredPlayer = null) {
  if (!animal?.alive || !entityExists(animal.ped, "ped")) return null;

  const preferredIsValid = preferredPlayer &&
    mp.players.exists(preferredPlayer) &&
    Number(preferredPlayer.dimension || 0) === Number(animal.ped.dimension || 0) &&
    (!Number.isFinite(Number(preferredPlayer.health)) || Number(preferredPlayer.health) > 0);
  const controller = preferredIsValid
    ? preferredPlayer
    : getNearestPlayerForAnimal(animal, 340, false);

  if (!controller) return null;

  try {
    if (animal.ped.controller !== controller) {
      animal.ped.controller = controller;
    }
    animal.controllerId = controller.id;
  } catch (error) {
    console.error("[HUNTING] Failed to assign animal controller:", error);
    return null;
  }

  return controller;
}

function releaseChallenge(player) {
  if (!player) return;

  const challenge = player.__huntingChallenge;
  const choice = player.__huntingProcessingChoice;
  const carcassId = challenge?.carcassId ?? choice?.carcassId;
  const carcass = carcassId !== undefined
    ? carcasses.get(Number(carcassId))
    : null;
  if (carcass && carcass.lockedBy === player) {
    carcass.lockedBy = null;
  }

  player.__huntingChallenge = null;
  player.__huntingProcessingChoice = null;
  stopHuntingActionAnimation(player);
}

function failChallenge(player, reason, message = null, countAttempt = true) {
  const challenge = player && player.__huntingChallenge;
  const choice = player && player.__huntingProcessingChoice;
  const carcassId = challenge?.carcassId ?? choice?.carcassId;
  const carcass = carcassId !== undefined
    ? carcasses.get(Number(carcassId))
    : null;

  releaseChallenge(player);

  try {
    if (player && mp.players.exists(player)) {
      player.call("hunting:minigameFinish", [false]);
      player.call("hunting:tttFinish", [false]);
      player.call("hunting:processingChoiceClose", []);
      if (message) notify(player, message);
    }
  } catch {}

  if (!carcass || !countAttempt || carcass.spoiled) return;

  carcass.attemptsUsed = Math.min(
    HUNTING_CONFIG.processingAttempts,
    Number(carcass.attemptsUsed || 0) + 1
  );

  if (carcass.attemptsUsed >= HUNTING_CONFIG.processingAttempts) {
    carcass.spoiled = true;
    carcass.expiresAt = Date.now() + HUNTING_CONFIG.spoiledCarcassLifetimeMs;
    notify(player, "Все три попытки использованы. Туша испорчена и исчезнет через 30 секунд.");
  } else if (!message) {
    notify(
      player,
      `Попытка не удалась. Осталось: ${HUNTING_CONFIG.processingAttempts - carcass.attemptsUsed}.`
    );
  }

  console.log(
    `[HUNTING] Processing failed | player=${player?.id} carcass=${carcass.id} reason=${reason} attempts=${carcass.attemptsUsed}/${HUNTING_CONFIG.processingAttempts}`
  );
  huntingAudit("processing_failed", player, {
    carcassId: carcass.id,
    reason,
    attemptsUsed: carcass.attemptsUsed,
  }, "warning");
  syncCarcass(carcass);
}

async function cancelProcessing(player, reason, message = null) {
  if (!player) return false;
  const challenge = player.__huntingChallenge;
  const choice = player.__huntingProcessingChoice;
  if (!challenge && !choice) {
    try {
      if (mp.players.exists(player)) {
        player.call("hunting:tttFinish", [false]);
        player.call("hunting:processingChoiceClose", []);
      }
    } catch {}
    return true;
  }

  if (challenge?.cancelPending) return false;
  if (challenge?.consumedItems?.length && !challenge.refunded) {
    challenge.cancelPending = true;
    const refunded = await inventory.addItems(player, challenge.consumedItems);
    if (!refunded) {
      challenge.cancelPending = false;
      notify(player, "Не удалось вернуть верёвку и мешок: освободите место и повторите закрытие.");
      try {
        if (mp.players.exists(player)) {
          player.call("hunting:tttState", [JSON.stringify({
            token: String(challenge.token || ""),
            board: Array.isArray(challenge.board) ? challenge.board : Array(9).fill(""),
          })]);
        }
      } catch {}
      return false;
    }
    challenge.refunded = true;
  }

  releaseChallenge(player);
  try {
    if (mp.players.exists(player)) {
      player.call("hunting:tttFinish", [false]);
      player.call("hunting:processingChoiceClose", []);
      if (message) notify(player, message);
    }
  } catch {}
  console.log(`[HUNTING] Processing cancelled | player=${player.id} reason=${reason}`);
  return true;
}

function startProcessingChoice(player, carcass) {
  if (carcass.lockedBy && carcass.lockedBy !== player) {
    return notify(player, "Эту тушу уже обрабатывает другой охотник.");
  }

  releaseChallenge(player);
  carcass.lockedBy = player;
  player.__huntingProcessingChoice = {
    carcassId: carcass.id,
    expiresAt: Date.now() + 30000,
  };
  playHuntingActionAnimation(
    player,
    "amb@medic@standing@kneel@base",
    "base",
    0,
    1
  );

  player.call("hunting:processingChoice", [JSON.stringify({
    carcassId: carcass.id,
    speciesName: carcass.species.name,
    attemptsUsed: Number(carcass.attemptsUsed || 0),
    attemptsMax: HUNTING_CONFIG.processingAttempts,
  })]);
}

const TIC_TAC_TOE_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getBoardWinner(board) {
  for (const [a, b, c] of TIC_TAC_TOE_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function getProcessingBagOverrides(carcass) {
  const baseWeight = Math.max(1, Number(carcass.species.carcassWeight || 10));
  const huntingWeight = Math.round(baseWeight * (0.85 + Math.random() * 0.3) * 10) / 10;
  const harvestedAt = Date.now();

  return {
    name: `Мешок с тушей «${carcass.species.name}»`,
    speciesId: carcass.species.id,
    speciesName: carcass.species.name,
    zoneId: carcass.zoneId,
    huntingWeight,
    weight: huntingWeight,
    harvestedAt,
    freshUntil: harvestedAt + HUNTING_CONFIG.processedCarcassLifetimeMs,
    ownerStaticId: carcass.ownerStaticId,
  };
}

async function finishProcessingSuccess(player, carcass, requirements, mode) {
  if (!carcass || !carcasses.has(carcass.id) || carcass.spoiled) return false;
  if (!isCarcassOwner(player, carcass) || !isPlayerNearCarcass(player, carcass, 1.5)) {
    return false;
  }

  const result = await inventory.completeHuntingProcessing(
    player,
    requirements,
    HUNTING_CONFIG.knifeItem,
    HUNTING_CONFIG.knifeDurabilityLoss,
    getProcessingBagOverrides(carcass),
    false
  );

  if (!result.ok) {
    const reasons = {
      knife: "Нужен исправный охотничий нож с прочностью не менее 5%.",
      items: "Не хватает верёвки или мешков.",
      slots: "Освободите место в инвентаре.",
      weight: "Недостаточно свободного веса в инвентаре.",
    };
    notify(player, reasons[result.reason] || "Не удалось завершить разделку.");
    return false;
  }

  releaseChallenge(player);
  try {
    player.call("hunting:tttFinish", [true]);
    player.call("hunting:processingChoiceClose", []);
  } catch {}

  console.log(
    `[HUNTING] Processing success | player=${player.id} carcass=${carcass.id} species=${carcass.species.id} mode=${mode} bag=${result.item?.uid || "unknown"}`
  );
  huntingAudit("processing_succeeded", player, {
    carcassId: carcass.id,
    speciesId: carcass.species.id,
    mode,
    bagUid: result.item?.uid || null,
  });
  if (Number.isFinite(Number(result.durability?.durability))) {
    notify(
      player,
      `Охотничий нож: ${Number(result.durability.durability)}/${Number(result.durability.maxDurability || 100)} прочности.`
    );
  }
  carcass.bagItem = { ...result.item };
  carcass.inventoryItemUid = null;
  carcass.processingComplete = true;
  carcass.expiresAt = Number(result.item?.freshUntil || (
    Date.now() + HUNTING_CONFIG.processedCarcassLifetimeMs
  ));
  return materializeProcessedBag(player, carcass);
}

async function startTicTacToe(player, carcass) {
  const consumed = await inventory.removeItems(player, HUNTING_CONFIG.processingItems);
  if (!consumed) {
    notify(player, "Для попытки нужны одна верёвка и один мешок.");
    return false;
  }

  const token = `${player.id}:${carcass.id}:${Date.now()}:${randomInt(1000, 9999)}`;
  player.__huntingProcessingChoice = null;
  player.__huntingChallenge = {
    token,
    carcassId: carcass.id,
    actionId: "tic_tac_toe",
    board: Array(9).fill(""),
    startedAt: Date.now(),
    expiresAt: Date.now() + 60000,
    consumedItems: HUNTING_CONFIG.processingItems.map((entry) => ({ ...entry })),
    refunded: false,
    cancelPending: false,
  };

  if (
    !huntingRuntime.active ||
    !player ||
    !mp.players.exists(player) ||
    !carcasses.has(carcass.id) ||
    carcass.lockedBy !== player ||
    carcass.spoiled ||
    carcass.stage !== "raw" ||
    !isCarcassOwner(player, carcass) ||
    !isPlayerNearCarcass(player, carcass, 1.5) ||
    player.vehicle
  ) {
    await cancelProcessing(
      player,
      "ttt_start_invalidated",
      "Разделка отменена. Верёвка и мешок возвращены."
    );
    return false;
  }

  player.call("hunting:tttStart", [JSON.stringify({
    token,
    carcassId: carcass.id,
    speciesName: carcass.species.name,
    title: `Разделка туши «${carcass.species.name}»`,
    board: Array(9).fill(""),
    attemptsUsed: Number(carcass.attemptsUsed || 0),
    attemptsMax: HUNTING_CONFIG.processingAttempts,
    attemptsLeft: HUNTING_CONFIG.processingAttempts - Number(carcass.attemptsUsed || 0),
  })]);
  return true;
}

function transformToBag(carcass) {
  const sourcePosition = carcass.entity && carcass.entity.position
    ? carcass.entity.position
    : carcass.position;
  const oldEntity = carcass.entity;
  const oldEntityType = carcass.entityType;
  let object = null;

  try {
    object = mp.objects.new(
      mp.joaat(HUNTING_CONFIG.packedCarcassModel),
      new mp.Vector3(sourcePosition.x, sourcePosition.y, sourcePosition.z + 0.15),
      { dimension: Number(carcass.dimension || oldEntity && oldEntity.dimension || 0) }
    );
  } catch (error) {
    console.error("[HUNTING] Failed to create packed carcass:", error);
    return false;
  }

  try {
    if (entityExists(oldEntity, oldEntityType)) oldEntity.destroy();
  } catch {}

  carcass.entity = object;
  carcass.entityType = "object";
  carcass.position = {
    x: Number(sourcePosition.x),
    y: Number(sourcePosition.y),
    z: Number(sourcePosition.z + 0.15),
  };

  return true;
}

async function materializeProcessedBag(player, carcass) {
  if (!carcass?.processingComplete || !carcass.bagItem) return false;

  if (transformToBag(carcass)) {
    carcass.processingComplete = false;
    carcass.stage = "bagged";
    syncCarcass(carcass);
    notify(player, "Туша разделана и упакована. Нажмите E у мешка, чтобы взять его.");
    return true;
  }

  const fallback = await inventory.addItemInstance(
    player,
    "hunting_carcass_bag",
    carcass.bagItem
  );
  if (fallback.ok) {
    carcass.processingComplete = false;
    removeCarcass(carcass, "processed_inventory_fallback");
    notify(player, `Туша разделана. Мешок «${carcass.species.name}» добавлен в инвентарь.`);
    return true;
  }

  syncCarcass(carcass);
  notify(player, "Туша уже разделана, но мешок пока не удалось создать. Освободите место и нажмите E ещё раз — ресурсы повторно не спишутся.");
  return false;
}

async function pickUpCarcass(player, carcass) {
  if (player.__huntingCarcassId) {
    notify(player, "Вы уже несёте одну тушу.");
    return false;
  }

  if (player.vehicle) {
    notify(player, "Сначала выйдите из транспорта.");
    return false;
  }

  let inventoryBag = null;
  if (carcass.inventoryItemUid) {
    inventoryBag = await inventory.getOwnedItemByUid(
      player,
      carcass.inventoryItemUid,
      "hunting_carcass_bag"
    );
  }
  if (!inventoryBag) {
    const added = await inventory.addItemInstance(
      player,
      "hunting_carcass_bag",
      carcass.bagItem || getProcessingBagOverrides(carcass)
    );
    if (!added.ok) {
      const reason = added.reason === "weight"
        ? "Недостаточно свободного веса в инвентаре."
        : "Освободите ячейку в инвентаре, чтобы поднять мешок.";
      notify(player, reason);
      return false;
    }
    inventoryBag = added.item;
    carcass.bagItem = { ...added.item };
    carcass.inventoryItemUid = String(added.item.uid);
  }

  carcass.stage = "carried";
  carcass.carrier = player;
  carcass.vehicle = null;
  player.__huntingCarcassId = carcass.id;
  syncCarcass(carcass);
  notify(player, "Мешок добавлен в инвентарь и закреплён на спине. Подойдите к машине или палатке и нажмите E.");
  return true;
}

async function loadIntoTrunk(player, carcass, vehicleId) {
  const vehicle = mp.vehicles.at(Number(vehicleId));

  if (!entityExists(vehicle, "vehicle") || player.vehicle) {
    return notify(player, "Подойдите к машине.");
  }

  if (Number(vehicle.dimension || 0) !== Number(player.dimension || 0)) {
    return notify(player, "Этот транспорт находится в другом измерении.");
  }

  if (getDistance(player.position, vehicle.position) > HUNTING_CONFIG.vehicleLoadDistance) {
    return notify(player, "Подойдите ближе к машине.");
  }

  if (!canControlVehicle(player, vehicle)) {
    return notify(player, "Положить мешок можно только в доступный вам багажник.");
  }

  const profile = await ensureHuntingProfile(player);
  const storageKey = getVehicleStorageKey(vehicle);
  if (!storageKey || !carcass.bagItem) return false;
  if (!Array.isArray(profile.vehicleBags[storageKey])) profile.vehicleBags[storageKey] = [];
  const stored = profile.vehicleBags[storageKey];
  const bagWeight = Number(carcass.bagItem.huntingWeight || carcass.bagItem.weight || 0);
  if (getStorageWeight(stored) + bagWeight > HUNTING_CONFIG.vehicleCapacityKg) {
    return notify(player, "В багажнике недостаточно свободного веса.");
  }

  const consumed = carcass.inventoryItemUid
    ? await inventory.consumeItemByUid(player, carcass.inventoryItemUid, "hunting_carcass_bag", 1)
    : { ok: true, item: { ...carcass.bagItem } };
  if (!consumed.ok) {
    removeCarcass(carcass, "inventory_bag_missing");
    return notify(player, "Мешок больше не найден в инвентаре."), false;
  }
  const storedBag = { ...(consumed.item || carcass.bagItem) };

  stored.push(storedBag);
  try {
    await saveHuntingProfile(player);
  } catch (error) {
    stored.pop();
    await inventory.addItemInstance(player, "hunting_carcass_bag", storedBag);
    console.error("[HUNTING] Failed to store carried bag:", error);
    return notify(player, "Не удалось сохранить мешок в багажнике. Попробуйте ещё раз.");
  }

  player.__huntingCarcassId = null;
  carcass.carrier = null;
  removeCarcass(carcass, "stored_in_vehicle");
  notify(player, "Мешок с тушей помещён в багажник.");
  huntingAudit("bag_stored_vehicle", player, {
    speciesId: carcass.species?.id,
    vehicleId: Number(vehicle.id),
  });
  return true;
}

async function loadIntoTent(player, carcass, tent) {
  if (!carcass?.bagItem || carcass.carrier !== player) return false;
  if (!tent || Number(tent.ownerStaticId) !== getPlayerStaticId(player)) {
    return notify(player, "Положить мешок можно только в свою палатку."), false;
  }
  if (Number(tent.dimension || 0) !== Number(player.dimension || 0)) return false;
  if (getDistance(player.position, tent.position) > HUNTING_CONFIG.tentInteractionDistance) return false;

  const profile = await ensureHuntingProfile(player);
  if (!profile.tent?.deployed || !carcass.inventoryItemUid) return false;
  const transfer = await inventory.transferHuntingTentBag(
    player,
    "put",
    -1,
    HUNTING_CONFIG.tentCapacityKg,
    carcass.inventoryItemUid
  );
  if (!transfer.ok) {
    const messages = {
      capacity: "В палатке недостаточно свободного веса.",
      bag: "Этот мешок больше не найден в инвентаре или уже испортился.",
      tent: "Состояние палатки обновилось. Откройте её ещё раз.",
      invalid: "Сервер отклонил неверные данные мешка.",
    };
    const message = messages[transfer.reason] || "Не удалось сохранить мешок в палатке. Изменения отменены.";
    console.warn(
      `[HUNTING] Tent bag store rejected | player=${player.id} uid=${carcass.inventoryItemUid} reason=${transfer.reason || "unknown"}`
    );
    return notify(player, message), false;
  }
  Object.assign(profile, transfer.profile || {});
  profiles.set(getPlayerStaticId(player), profile);
  tent.profile = profile;
  tent.profileTent = profile.tent;

  player.__huntingCarcassId = null;
  carcass.carrier = null;
  removeCarcass(carcass, "stored_in_tent");
  syncTent(tent);
  notify(player, "Мешок с тушей помещён в палатку.");
  huntingAudit("bag_stored_tent", player, {
    speciesId: carcass.species?.id,
    tentOwnerStaticId: Number(tent.ownerStaticId),
  });
  return true;
}

function dropCarriedCarcass(player, forced = false) {
  const carcass = carcasses.get(Number(player && player.__huntingCarcassId));
  if (!carcass || carcass.carrier !== player) return false;

  const position = player.position;
  player.__huntingCarcassId = null;
  carcass.carrier = null;
  carcass.stage = "bagged";
  carcass.position = {
    x: Number(position.x),
    y: Number(position.y),
    z: Number(position.z - 0.85),
  };

  if (entityExists(carcass.entity, "object")) {
    try {
      carcass.entity.position = new mp.Vector3(carcass.position.x, carcass.position.y, carcass.position.z);
    } catch {}
  }

  syncCarcass(carcass);
  notify(player, forced ? "Вы уронили тушу." : "Вы положили тушу на землю.");
  return true;
}

async function handleAnimalHit(
  player,
  entityId,
  weaponHash,
  validatedRifleShot = false,
  inventoryItemId = ""
) {
  try {
    if (!player || !mp.players.exists(player)) return;
    if (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) return;
    if (player.vehicle) return;

    const profile = await ensureHuntingProfile(player);
    if (!profile.active) {
      if (Date.now() - Number(player.__huntingInactiveWarningAt || 0) > 1800) {
        player.__huntingInactiveWarningAt = Date.now();
        notify(player, "Сначала начните свободную охоту или получите задание у Jeremy Meadows.");
      }
      return;
    }

    const animal = animals.get(Number(entityId));
    if (!animal || !animal.alive || !entityExists(animal.ped, "ped")) return;

    const zone = zonesById.get(animal.zoneId);
    // The tracked animal itself belongs to this zone. A valid long-range shot
    // may originate outside the radial border, so the player-to-animal distance
    // check below is authoritative instead of a fixed 35 metre border margin.
    if (!zone) return;
    if (Number(player.dimension || 0) !== Number(animal.ped.dimension || 0)) return;

    if (zone.id === "reserve" && Date.now() - Number(player.__huntingReserveWarningAt || 0) > 5000) {
      player.__huntingReserveWarningAt = Date.now();
      const wanted = Math.max(1, Number(player.getVariable?.("wantedLevel") || player.wantedLevel || 0));
      player.wantedLevel = wanted;
      try { player.setVariable("wantedLevel", wanted); } catch {}
      notify(player, "Охота в заповеднике запрещена. Нарушение зафиксировано, повышен уровень розыска.");
      console.warn(`[HUNTING] Reserve violation | player=${player.id} animal=${animal.entityId}`);
    }

    const serverWeapon = normalizeHash(player.weapon);
    const clientWeapon = normalizeHash(weaponHash);

    // Для validated-выстрела hash уже подтверждён инвентарём. Для melee/native
    // события клиентский hash точнее: player.weapon на сервере нередко на один
    // тик остаётся от ранее выбранного ружья. Нож дополнительно проверяется по
    // серверному UID активного предмета и факту владения ниже.
    const currentWeapon = validatedRifleShot
      ? clientWeapon
      : (clientWeapon || serverWeapon);
    let attack = getAttackProfile(currentWeapon, inventoryItemId);
    if (!attack) return;
    if (
      (attack.kind === "hunting_rifle" || attack.kind === "hunting_rifle_scoped") &&
      !validatedRifleShot
    ) return;
    if (getDistance(player.position, animal.ped.position) > attack.maxDistance) return;

    if (attack.kind === "knife") {
      const ownsHuntingKnife = await inventory.hasItems(player, [
        { itemId: HUNTING_CONFIG.knifeItem, amount: 1 },
      ]);
      const activeKnife = String(player?.activeInventoryWeapon?.itemId || "") === HUNTING_CONFIG.knifeItem ||
        weaponHashSetHas(knifeWeaponHashes, serverWeapon);
      if (!ownsHuntingKnife || !activeKnife) {
        attack = {
          ...attack,
          damage: 2,
          kind: "illegal_knife",
          preservesCarcass: false,
        };
      }
    }

    const now = Date.now();
    const hitKey = `${player.id}:${animal.entityId}`;
    if (now - Number(recentHits.get(hitKey) || 0) < attack.cooldownMs) return;
    if (now - Number(recentPlayerHits.get(player.id) || 0) < Math.min(attack.cooldownMs, 100)) return;
    recentHits.set(hitKey, now);
    recentPlayerHits.set(player.id, now);

    // Урон проходит только от рук, охотничьего ножа и ружья.
    // Целой туша остаётся только после специального охотничьего ружья.
    if (!attack.preservesCarcass) {
      animal.spoiled = true;
      huntingAudit("animal_illegal_damage", player, {
        animalEntityId: animal.entityId,
        speciesId: animal.species.id,
        kind: attack.kind,
      }, "warning");
    }

    animal.hits = Math.min(animal.hitsRequired, animal.hits + attack.damage);

    if (animal.hits >= animal.hitsRequired) {
      killAnimal(animal, player, attack.kind);
      return;
    }

    sendAnimalHealthToDebugAdmins(animal);

    if (
      animal.behavior === "skittish" &&
      (attack.kind === "hunting_rifle" || attack.kind === "hunting_rifle_scoped") &&
      Math.random() < 0.35
    ) {
      animal.behavior = "aggressive";
    }

    reactToHit(animal, player, true);
    const requiredHits = Math.max(1, Math.ceil(animal.hitsRequired / Math.max(1, attack.damage)));
    const registeredHits = Math.min(
      requiredHits,
      Math.max(1, Math.floor(animal.hits / Math.max(1, attack.damage)))
    );
    notify(player, `Попадание засчитано (${registeredHits}/${requiredHits}).`);
  } catch (error) {
    console.error("[HUNTING] hitAnimal error:", error);
  }
}

registerServerEvent("hunting:hitAnimal", (player, entityId, weaponHash) => {
  return runPlayerHuntingOperation(
    player,
    "animal_melee_hit",
    () => handleAnimalHit(player, entityId, weaponHash, false)
  );
});

// Compatibility no-op for stale or modified clients. Moving vehicles still
// trigger the separate AI flee reaction, but can never create a carcass.
registerServerEvent("hunting:vehicleHitAnimal", () => false);

registerServerEvent("hunting:validatedShot", (player, entityId, weaponHash, token) => {
  const ticket = player?.__huntingShotTicket;
  const normalizedHash = normalizeHash(weaponHash);

  if (
    !ticket ||
    String(ticket.token) !== String(token) ||
    Number(ticket.entityId) !== Number(entityId) ||
    normalizeHash(ticket.weaponHash) !== normalizedHash ||
    Date.now() > Number(ticket.expiresAt || 0)
  ) {
    return;
  }

  player.__huntingShotTicket = null;
  huntingAudit("weapon_shot_accepted", player, {
    animalEntityId: Number(entityId),
    weaponHash: normalizedHash,
    itemId: String(ticket.itemId || ""),
  });
  return runPlayerHuntingOperation(
    player,
    "animal_validated_shot",
    () => handleAnimalHit(player, entityId, normalizedHash, true, String(ticket.itemId || ""))
  );
});

function handleGunshotReaction(player, weaponHash) {
  try {
    if (!player || !mp.players.exists(player)) return;
    if (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) return;

    const hash = normalizeHash(weaponHash || player.weapon);
    if (!hash || weaponHashSetHas(unarmedWeaponHashes, hash) || weaponHashSetHas(knifeWeaponHashes, hash)) return;

    const now = Date.now();
    if (now - Number(player.__huntingLastGunshotReactionAt || 0) < 180) return;
    player.__huntingLastGunshotReactionAt = now;
    animals.forEach((animal) => {
      if (!animal.alive || !entityExists(animal.ped, "ped")) return;
      if (Number(animal.ped.dimension || 0) !== Number(player.dimension || 0)) return;
      if (getDistance(animal.ped.position, player.position) > 95) return;
      if (now < Number(animal.nextGunshotReactionAt || 0)) return;

      animal.nextGunshotReactionAt = now + 1800;
      assignAnimalController(animal, player);
      const fleeDurationMs = randomInt(2500, 4000);
      animal.soundFleeUntil = now + fleeDurationMs;
      animal.attackTargetId = null;
      animal.attackTargetUntil = 0;
      animal.lastAttackContactAt = 0;
      broadcast("hunting:animalReact", {
        entityId: animal.entityId,
        attackerId: player.id,
        behavior: animal.behavior,
        reactionBehavior: "skittish",
        transient: true,
        forced: true,
        durationMs: fleeDurationMs,
      });
    });
  } catch (error) {
    console.error("[HUNTING] gunshot reaction error:", error);
  }
}

registerServerEvent("hunting:gunshot", handleGunshotReaction);
registerServerEvent("hunting:gunshotHeard", (player, weaponHash) => {
  const serverHash = normalizeHash(player?.weapon);
  const clientHash = normalizeHash(weaponHash);
  const unarmed = weaponHashSetHas(unarmedWeaponHashes, serverHash) ||
    weaponHashSetHas(unarmedWeaponHashes, clientHash);
  if ((!serverHash && !clientHash) || (unarmed && !serverHash)) return;
  handleGunshotReaction(
    player,
    serverHash && !weaponHashSetHas(unarmedWeaponHashes, serverHash) ? serverHash : clientHash
  );
});

registerServerEvent("hunting:interact", (player, carcassId, vehicleId, clientWeaponHash) => runPlayerHuntingOperation(player, "interact", async () => {
  try {
    if (!player || !mp.players.exists(player)) return;
    if (Number.isFinite(Number(player.health)) && Number(player.health) <= 0) return;
    if (player.vehicle) return notify(player, "Сначала выйдите из транспорта.");

    const carried = carcasses.get(Number(player.__huntingCarcassId));
    if (carried && carried.carrier === player) {
      if (vehicleId === null || vehicleId === undefined || Number(vehicleId) < 0) {
        return notify(player, "Подойдите к любой машине.");
      }

      const vehicle = mp.vehicles.at(Number(vehicleId));
      return openVehicleInventory(player, vehicle);
    }

    const carcass = carcasses.get(Number(carcassId));
    if (!carcass || carcass.stage === "trunk" || carcass.stage === "carried") return;
    if (!isCarcassOwner(player, carcass)) {
      return notify(player, "Эта туша закреплена за охотником, который её добыл.");
    }
    if (!isPlayerNearCarcass(player, carcass)) return;

    if (carcass.spoiled) {
      return notify(player, "Испорченную тушу нельзя разделать.");
    }

    if (carcass.processingComplete && carcass.bagItem) {
      return materializeProcessedBag(player, carcass);
    }

    if (carcass.stage === "raw") {
      const profile = await ensureHuntingProfile(player);
      if (!isHuntingSessionActive(player, profile)) {
        return notify(player, "Сначала начните охоту у Джереми.");
      }
      const knife = await inventory.getOwnedItemCondition(player, HUNTING_CONFIG.knifeItem);

      if (!knife || Number(knife.durability || 0) < HUNTING_CONFIG.knifeDurabilityLoss) {
        return notify(player, "Нужен охотничий нож с прочностью не менее 5%.");
      }

      const hasProcessingItems = await inventory.hasItems(
        player,
        HUNTING_CONFIG.processingItems
      );

      if (!hasProcessingItems) {
        return notify(player, "Для обработки нужны одна верёвка и один мешок.");
      }

      if (!carcasses.has(carcass.id) || !isCarcassOwner(player, carcass)) return;
      if (!isPlayerNearCarcass(player, carcass)) return;

      return startProcessingChoice(player, carcass);
    }

    if (carcass.stage === "bagged") return pickUpCarcass(player, carcass);
  } catch (error) {
    console.error("[HUNTING] interact error:", error);
  }
}));

registerServerEvent("hunting:chooseProcessingMode", (player, carcassId, mode) => runPlayerHuntingOperation(player, "processing_choice", async () => {
  try {
    if (!player || !mp.players.exists(player)) return;
    const choice = player.__huntingProcessingChoice;
    const carcass = carcasses.get(Number(carcassId));
    const selectedMode = String(mode || "");
    if (
      !choice ||
      Number(choice.carcassId) !== Number(carcassId) ||
      Date.now() > Number(choice.expiresAt || 0) ||
      !carcass ||
      carcass.spoiled ||
      carcass.stage !== "raw" ||
      carcass.lockedBy !== player ||
      !isCarcassOwner(player, carcass) ||
      !isPlayerNearCarcass(player, carcass, 1.5) ||
      player.vehicle
    ) {
      await cancelProcessing(player, "choice_invalid", "Разделка больше недоступна.");
      return;
    }

    const knife = await inventory.getOwnedItemCondition(player, HUNTING_CONFIG.knifeItem);
    if (!knife || Number(knife.durability || 0) < HUNTING_CONFIG.knifeDurabilityLoss) {
      await cancelProcessing(player, "knife_missing", "Нужен исправный охотничий нож с прочностью не менее 5%.");
      return;
    }

    if (selectedMode === "auto") {
      const requirements = [
        { itemId: "hunting_rope", amount: 3 },
        { itemId: "hunting_bag", amount: 3 },
      ];
      const success = await finishProcessingSuccess(player, carcass, requirements, "automatic");
      if (!success && carcass.lockedBy === player) {
        player.__huntingProcessingChoice = choice;
      }
      return;
    }

    if (selectedMode !== "minigame") return;
    await startTicTacToe(player, carcass);
  } catch (error) {
    console.error("[HUNTING] chooseProcessingMode error:", error);
    await cancelProcessing(player, "choice_error", "Разделка прервана. Попробуйте ещё раз.");
  }
}));

registerServerEvent("hunting:cancelProcessing", (player) => runPlayerHuntingOperation(
  player,
  "processing_cancel",
  async () => cancelProcessing(player, "player_close", "Разделка отменена. Расходники возвращены.")
));

registerServerEvent("hunting:tttMove", (player, token, rawCell) => runPlayerHuntingOperation(player, "ttt_move", async () => {
  try {
    if (!player || !mp.players.exists(player)) return;
    const challenge = player.__huntingChallenge;
    if (
      !challenge ||
      challenge.actionId !== "tic_tac_toe" ||
      String(challenge.token) !== String(token)
    ) return;

    const carcass = carcasses.get(Number(challenge.carcassId));
    const cell = Number(rawCell);
    if (
      !carcass ||
      carcass.lockedBy !== player ||
      carcass.spoiled ||
      !isCarcassOwner(player, carcass) ||
      !isPlayerNearCarcass(player, carcass, 1.5) ||
      player.vehicle
    ) {
      await cancelProcessing(player, "ttt_unavailable", "Вы отошли от туши. Верёвка и мешок возвращены.");
      return;
    }
    if (Date.now() > Number(challenge.expiresAt || 0)) {
      failChallenge(player, "tic_tac_toe_timeout", "Время вышло. Попытка использована.");
      return;
    }
    if (
      !Number.isInteger(cell) ||
      cell < 0 ||
      cell > 8 ||
      challenge.board[cell]
    ) return;

    challenge.board[cell] = "X";
    if (getBoardWinner(challenge.board) === "X") {
      const success = await finishProcessingSuccess(player, carcass, [], "tic_tac_toe");
      if (!success && player.__huntingChallenge) {
        failChallenge(player, "processing_finalize_failed", "Не удалось упаковать тушу. Попытка использована.");
      }
      return;
    }

    let empty = challenge.board
      .map((value, index) => value ? -1 : index)
      .filter((index) => index >= 0);
    if (empty.length === 0) {
      failChallenge(player, "tic_tac_toe_draw");
      return;
    }

    // Лёгкий уровень: соперник делает случайный допустимый ход.
    const botCell = randomFrom(empty);
    challenge.board[botCell] = "O";
    const winner = getBoardWinner(challenge.board);
    empty = challenge.board
      .map((value, index) => value ? -1 : index)
      .filter((index) => index >= 0);

    if (winner === "O" || empty.length === 0) {
      player.call("hunting:tttState", [JSON.stringify({
        token: challenge.token,
        board: challenge.board,
      })]);
      failChallenge(player, winner === "O" ? "tic_tac_toe_lost" : "tic_tac_toe_draw");
      return;
    }

    player.call("hunting:tttState", [JSON.stringify({
      token: challenge.token,
      board: challenge.board,
    })]);
  } catch (error) {
    console.error("[HUNTING] tttMove error:", error);
    failChallenge(player, "tic_tac_toe_error", "Ошибка мини-игры. Попытка засчитана.");
  }
}));

// Старый клиентский результат полоски больше не изменяет состояние туши.
registerServerEvent("hunting:minigameResult", () => {});

registerServerEvent("hunting:jumpWhileCarrying", (player) => {
  try {
    if (!player || !mp.players.exists(player) || !player.__huntingCarcassId) return;

    const now = Date.now();
    if (now - Number(player.__huntingLastJump || 0) < 1000) return;
    player.__huntingLastJump = now;

    if (Math.random() <= HUNTING_CONFIG.jumpDropChance) {
      dropCarriedCarcass(player, true);
    }
  } catch (error) {
    console.error("[HUNTING] jumpWhileCarrying error:", error);
  }
});

registerServerEvent("playerEnterColshape", (player, shape) => {
  if (!shape?.isHuntingSellerSafeZone) return;

  player.__huntingSellerSafeZone = true;
  try {
    player.setVariable("huntingSellerSafeZone", true);
  } catch {}
});

registerServerEvent("playerExitColshape", (player, shape) => {
  if (!shape?.isHuntingSellerSafeZone) return;

  player.__huntingSellerSafeZone = false;
  try {
    player.setVariable("huntingSellerSafeZone", false);
  } catch {}
});

registerServerEvent("hunting:pvpAttempt", (attacker, targetPlayerId, weaponHash, kind) => {
  try {
    if (!attacker || !mp.players.exists(attacker)) return;
    const target = getPlayerById(targetPlayerId);
    if (!target || target === attacker || !mp.players.exists(target)) return;
    if (Number(attacker.dimension || 0) !== Number(target.dimension || 0)) return;
    if (getDistance(attacker.position, target.position) > HUNTING_CONFIG.shotDistance) return;

    const protectedArea = isInsideSellerSafeZone(attacker.position, 2) ||
      isInsideSellerSafeZone(target.position, 2) ||
      ZONES.some((zone) => isInsideZone(attacker.position, zone, 2) || isInsideZone(target.position, zone, 2));
    if (!protectedArea) return;

    const now = Date.now();
    if (now - Number(attacker.__huntingPvpAttemptLogAt || 0) < 1200) return;
    attacker.__huntingPvpAttemptLogAt = now;
    const data = {
      attackerId: Number(attacker.id),
      targetId: Number(target.id),
      weaponHash: normalizeHash(weaponHash),
      kind: String(kind || "damage"),
    };
    console.warn(`[HUNTING] DM attempt blocked | attacker=${attacker.id} target=${target.id} weapon=${data.weaponHash}`);
    huntingAudit("dm_attempt_blocked", attacker, data, "warning");
    mp.players.forEach((admin) => {
      if (getAdminLevel(admin) < 1) return;
      notify(admin, `[Охота/DM] Игрок ${attacker.id} попытался нанести урон игроку ${target.id}; действие заблокировано.`);
    });
  } catch (error) {
    console.error("[HUNTING] pvpAttempt error:", error);
  }
});

registerServerEvent("playerDamage", (player, healthLoss = 0, armourLoss = 0) => {
  if (!player || !mp.players.exists(player)) return;
  const insideSellerZone = player.__huntingSellerSafeZone ||
    isInsideSellerSafeZone(player.position, 2);
  const insideHuntingZone = ZONES.some((zone) => isInsideZone(player.position, zone, 2));

  if (!insideSellerZone && !insideHuntingZone) return;

  if (Date.now() - Number(player.__huntingDamageBlockedLogAt || 0) > 1200) {
    player.__huntingDamageBlockedLogAt = Date.now();
    console.warn(
      `[HUNTING] DM damage blocked | victim=${player.id} healthLoss=${Number(healthLoss || 0)} armourLoss=${Number(armourLoss || 0)} sellerZone=${insideSellerZone}`
    );
    huntingAudit("dm_damage_blocked", player, {
      victimId: Number(player.id),
      healthLoss: Number(healthLoss || 0),
      armourLoss: Number(armourLoss || 0),
      sellerZone: Boolean(insideSellerZone),
    }, "warning");
    mp.players.forEach((admin) => {
      if (admin === player || getAdminLevel(admin) < 1) return;
      notify(
        admin,
        `[Охота/DM] Заблокирован урон по игроку ${player.id} в ${insideSellerZone ? "зелёной зоне Jeremy" : "охотничьей зоне"}.`
      );
    });
  }

  const restoredHealth = Number(player.health || 0) + Math.max(0, Number(healthLoss || 0));
  const restoredArmour = Number(player.armour || 0) + Math.max(0, Number(armourLoss || 0));

  hudNeeds.setHealth(
    player,
    Math.min(Number(player.maxHealth || 100), Math.max(1, restoredHealth)),
    { persist: false }
  );
  player.armour = Math.min(100, Math.max(0, restoredArmour));
});

registerServerEvent("playerReady", (player) => {
  player.__huntingStartedThisSession = false;
  player.__huntingRuntimeSessionId = null;
  player.__huntingLoginCleanupComplete = false;
  player.__huntingCharacterReady = false;
  const initializeWhenCharacterReady = () => {
    if (!huntingRuntime.active || !player || !mp.players.exists(player)) return;
    if (player.__huntingCharacterReady !== true || getPlayerStaticId(player) <= 0) {
      player.__huntingCharacterReadyWaitTimer = setTimeout(initializeWhenCharacterReady, 1000);
      return;
    }
    player.__huntingCharacterReadyWaitTimer = null;
    runPlayerHuntingOperation(player, "player_ready", async () => {
    try {
      const profile = await ensureHuntingProfile(player);
      await inventory.spoilExpiredHuntingBags(player);
      if (!player.__huntingLoginCleanupComplete) {
        const staleTent = tents.get(getPlayerStaticId(player));
        profile.active = false;
        profile.mode = null;
        profile.currentQuest = null;
        profile.tent = null;
        profile.pendingTentReturn = null;
        if (staleTent) destroyTent(staleTent, "login_cleanup");
        await saveHuntingProfile(player);
        player.__huntingLoginCleanupComplete = true;
      }

      const equippedMask = await inventory.getEquippedItem(player, "hunting_mask_suit");
      if (equippedMask?.uid) {
        captureMaskSuitAppearance(player);
        applyMaskSuitAppearance(player);
        player.__huntingMaskSuit = true;
        player.__huntingMaskSuitUid = String(equippedMask.uid);
        player.__huntingMaskSuitUntil = 0;
        try { player.setVariable("huntingMaskSuit", true); } catch {}
      }
      if (profile.pendingTentReturn) {
        const returned = await inventory.addItemInstance(player, "hunting_tent", {
          durability: Math.max(1, Number(profile.pendingTentReturn.durability || 1)),
        });
        if (returned.ok) {
          profile.pendingTentReturn = null;
          await saveHuntingProfile(player);
          notify(player, "Палатка была автоматически свёрнута и возвращена в инвентарь. Хранившиеся туши потеряны.");
        } else {
          notify(player, "Освободите место в инвентаре, чтобы получить автоматически свёрнутую палатку.");
        }
      }
      if (
        profile.tent?.deployed &&
        Date.now() - Number(profile.lastSeenAt || Date.now()) > 2 * 60 * 60 * 1000
      ) {
        profile.tent.deployed = false;
        profile.tent.bags = [];
        const returned = await inventory.addItemInstance(player, "hunting_tent", {
          durability: Math.max(1, Number(profile.tent.durability || 1)),
        });
        if (returned.ok) {
          profile.tent = null;
          await saveHuntingProfile(player);
          notify(player, "Палатка автоматически свёрнута после долгого отсутствия. Хранившиеся туши потеряны.");
        } else {
          profile.pendingTentReturn = {
            durability: Math.max(1, Number(profile.tent.durability || 1)),
          };
          profile.tent = null;
          await saveHuntingProfile(player);
          notify(player, "Освободите место в инвентаре, чтобы получить свёрнутую палатку.");
        }
      } else {
        spawnTentForProfile(player, profile);
      }

      let pendingChanged = false;
      const pendingCash = Math.max(0, Number(profile.pendingCash || 0));
      if (pendingCash > 0) {
        try {
          if (await addPlayerCash(player, pendingCash)) {
            profile.pendingCash = 0;
            pendingChanged = true;
            notify(player, `Начислена отложенная награда за охоту: $${pendingCash}.`);
          }
        } catch {}
      }

      const pendingStimulants = Math.max(0, Number(profile.pendingStimulants || 0));
      if (pendingStimulants > 0) {
        const returned = await inventory.addItem(player, "hunting_stimulant", pendingStimulants);
        if (returned) {
          profile.pendingStimulants = 0;
          pendingChanged = true;
          notify(player, `Выданы отложенные стимуляторы: ${pendingStimulants}.`);
        }
      }

      if (pendingChanged) await saveHuntingProfile(player);
    } catch (error) {
      console.error("[HUNTING] Profile load error:", error);
    }
    syncPlayer(player);
    animals.forEach((animal) => {
      if (getDistance(animal.ped.position, player.position) <= 340) {
        assignAnimalController(animal, player);
      }
    });
    });
  };
  if (player.__huntingCharacterReadyWaitTimer) {
    clearTimeout(player.__huntingCharacterReadyWaitTimer);
  }
  player.__huntingCharacterReadyWaitTimer = setTimeout(initializeWhenCharacterReady, 1000);
});

registerServerEvent("hunting:characterReady", (player) => {
  if (!player || !mp.players.exists(player)) return;
  player.__huntingStartedThisSession = false;
  player.__huntingRuntimeSessionId = null;
  player.__huntingLoginCleanupComplete = false;
  player.__huntingCharacterReady = true;

  return runPlayerHuntingOperation(player, "character_ready", async () => {
    if (!huntingRuntime.active || !player || !mp.players.exists(player)) return false;
    player.__huntingOwnerIdCache = null;
    player.__huntingOwnerSessionId = null;
    player.__huntingProfile = null;
    const profile = await ensureHuntingProfile(player);
    const staticId = getPlayerStaticId(player);
    if (!staticId) return false;

    const staleTent = tents.get(staticId);
    profile.active = false;
    profile.mode = null;
    profile.currentQuest = null;
    profile.tent = null;
    profile.pendingTentReturn = null;
    if (staleTent) destroyTent(staleTent, "character_ready_cleanup");
    await saveHuntingProfile(player);
    if (!huntingRuntime.active || !player || !mp.players.exists(player)) return false;
    player.__huntingLoginCleanupComplete = true;
    syncPlayer(player);
    return true;
  });
});

registerServerEvent("hunting:requestSetup", (player) => {
  if (
    !player ||
    !mp.players.exists(player) ||
    player.__huntingLoginCleanupComplete !== true ||
    getPlayerStaticId(player) <= 0
  ) return;
  const now = Date.now();
  if (now - Number(player.__huntingLastSetupRequestAt || 0) < 1500) return;
  player.__huntingLastSetupRequestAt = now;
  return runPlayerHuntingOperation(player, "request_setup", async () => {
    const profile = await ensureHuntingProfile(player);
    if (!huntingRuntime.active || !player || !mp.players.exists(player)) return false;
    if (profile?.tent?.deployed) spawnTentForProfile(player, profile);
    syncPlayer(player);
    return true;
  });
});

registerServerEvent("hunting:carcassGrounded", (player, rawId, rawX, rawY, rawZ) => {
  const carcass = carcasses.get(Number(rawId));
  if (!carcass || carcass.entityType !== "ped" || carcass.stage !== "raw") return;
  if (!isCarcassOwner(player, carcass)) return;
  if (Number(carcass.dimension || 0) !== Number(player.dimension || 0)) return;
  if (carcass.groundSyncComplete) return;

  const next = { x: Number(rawX), y: Number(rawY), z: Number(rawZ) };
  if (![next.x, next.y, next.z].every(Number.isFinite)) return;
  if (getDistance(carcass.position, next) > 12 || getDistance(player.position, next) > 25) return;

  carcass.position = next;
  try {
    if (entityExists(carcass.entity, "ped")) {
      carcass.entity.position = new mp.Vector3(next.x, next.y, next.z);
    }
  } catch {}
  carcass.groundSyncComplete = true;
  syncCarcass(carcass);
});

registerServerEvent("playerDeath", (player) => {
  player.__huntingTentHold = null;
  if (player.__huntingChallenge) {
    failChallenge(player, "player_died", "Разделка прервана. Попытка использована.");
  } else if (player.__huntingProcessingChoice) {
    failChallenge(player, "player_died_before_choice", null, false);
  }
  dropCarriedCarcass(player, true);
});

registerServerEvent("playerQuit", (player) => {
  const quitAt = Date.now();
  const playerId = Number(player.id);
  const staticId = getPlayerStaticId(player);
  const profile = player.__huntingProfile || profiles.get(staticId) || null;
  const deployedTent = staticId > 0 ? tents.get(staticId) : null;
  if (player.__huntingCharacterReadyWaitTimer) {
    clearTimeout(player.__huntingCharacterReadyWaitTimer);
    player.__huntingCharacterReadyWaitTimer = null;
  }
  player.__huntingTentHold = null;

  if (player.__huntingChallenge) failChallenge(player, "player_quit");
  else if (player.__huntingProcessingChoice) {
    failChallenge(player, "player_quit_before_choice", null, false);
  }
  dropCarriedCarcass(player, true);
  recentPlayerHits.delete(playerId);
  recentHits.forEach((value, key) => {
    if (key.startsWith(`${playerId}:`)) recentHits.delete(key);
  });
  const pendingOperation = playerOperationChains.get(playerId) || Promise.resolve();
  pendingOperation
    .catch(() => {})
    .then(async () => {
      if (!staticId) {
        const currentTent = deployedTent;
        if (currentTent) destroyTent(currentTent, "owner_quit_without_profile");
        return false;
      }
      const quitProfile = profile || await huntingRepository.loadProfile(staticId);
      if (!quitProfile) {
        const currentTent = tents.get(staticId) || deployedTent;
        if (currentTent) destroyTent(currentTent, "owner_quit_without_profile");
        return false;
      }
      quitProfile.active = false;
      quitProfile.mode = null;
      quitProfile.currentQuest = null;
      quitProfile.tent = null;
      quitProfile.pendingTentReturn = null;
      quitProfile.lastSeenAt = quitAt;
      profiles.set(staticId, quitProfile);
      return huntingRepository.saveProfile(staticId, quitProfile).then(() => {
        const currentTent = tents.get(staticId) || deployedTent;
        if (currentTent) destroyTent(currentTent, "owner_quit");
        huntingAudit("hunt_abandoned_on_quit", null, {
          ownerStaticId: staticId,
          tentDestroyed: Boolean(currentTent),
        }, "info");
        return true;
      });
    })
    .catch((error) => {
      console.error("[HUNTING] Profile save on quit failed:", error);
    });
});

registerInterval(() => {
  const now = Date.now();

  animals.forEach((animal) => {
    if (!animal.alive || !entityExists(animal.ped, "ped")) return;

    const zone = zonesById.get(animal.zoneId);
    if (!zone) return;

    const vehicleThreat = getMovingVehicleThreat(animal);
    if (vehicleThreat && now >= Number(animal.nextVehicleFleeAt || 0)) {
      const fleeDurationMs = randomInt(4000, 6000);
      animal.nextVehicleFleeAt = now + 1800;
      animal.vehicleFleeUntil = now + fleeDurationMs;
      animal.attackTargetId = null;
      animal.attackTargetUntil = 0;
      animal.lastAttackContactAt = 0;
      assignAnimalController(animal, vehicleThreat.driver);
      broadcast("hunting:animalReact", {
        entityId: animal.entityId,
        attackerId: vehicleThreat.driver.id,
        behavior: animal.behavior,
        reactionBehavior: "skittish",
        transient: true,
        forced: true,
        durationMs: fleeDurationMs,
        reason: "moving_vehicle",
      });
      animal.nextRoamAt = now + fleeDurationMs + 500;
      return;
    }
    if (now < Number(animal.vehicleFleeUntil || 0)) return;

    if (now < Number(animal.soundFleeUntil || 0)) {
      animal.nextRoamAt = Math.max(
        Number(animal.nextRoamAt || 0),
        Number(animal.soundFleeUntil || 0) + 500
      );
      return;
    }

    const nearbyPlayer = getNearestPlayerForAnimal(
      animal,
      animal.behavior === "aggressive" ? 22 : 28
    );

    if (nearbyPlayer) {
      if (now >= Number(animal.nextReactionAt || 0)) {
        reactToHit(animal, nearbyPlayer);
        animal.nextReactionAt = now + 2500;
      }
      animal.nextRoamAt = now + 2500;
      return;
    }

    if (now < Number(animal.nextRoamAt || 0)) return;

    if (!assignAnimalController(animal)) {
      animal.nextRoamAt = now + 3000;
      return;
    }

    const target = getRandomRoamTarget(animal, zone);
    animal.nextRoamAt = now + randomInt(7000, 15000);

    broadcast("hunting:moveAnimal", JSON.stringify({
      entityId: animal.entityId,
      x: target.x,
      y: target.y,
      z: target.z,
      speed: animal.behavior === "aggressive" ? 1.35 : 1.0,
    }));
  });
}, HUNTING_CONFIG.moveIntervalMs);

registerInterval(() => {
  const now = Date.now();

  animals.forEach((animal) => {
    if (!animal.alive || animal.behavior !== "aggressive") return;

    const target = getPlayerById(animal.attackTargetId);
    if (!target) return;

    applyAnimalAttackDamage(animal, target, now);
  });
}, HUNTING_CONFIG.animalDamageIntervalMs);

registerInterval(() => {
  animals.forEach((animal, entityId) => {
    if (animal.alive && entityExists(animal.ped, "ped")) return;

    animals.delete(Number(entityId));
    broadcast("hunting:animalRemoved", JSON.stringify({ entityId: Number(entityId) }));
    destroyAnimalPed(animal);
    scheduleRespawn(animal.zoneId, animal.slotId, HUNTING_CONFIG.respawnRetryMs);
  });

  ZONES.forEach((zone) => {
    for (let slotIndex = 0; slotIndex < zone.population; slotIndex += 1) {
      const slotId = getSlotKey(zone.id, slotIndex);
      const animal = getAnimalInSlot(zone.id, slotId);

      if (!animal && !respawnTimers.has(slotId)) {
        console.warn(`[HUNTING] Empty slot ${slotId} detected; respawn scheduled.`);
        scheduleRespawn(zone.id, slotId, HUNTING_CONFIG.respawnRetryMs);
      }
    }
  });
}, HUNTING_CONFIG.slotWatchdogIntervalMs);

registerInterval(() => {
  const now = Date.now();

  carcasses.forEach((carcass) => {
    if (now >= carcass.expiresAt) {
      removeCarcass(carcass, "expired");
      return;
    }

    if (carcass.stage === "carried") {
      if (!carcass.carrier || !mp.players.exists(carcass.carrier)) {
        removeCarcass(carcass, "carrier_lost");
        return;
      }

      carcass.position = {
        x: Number(carcass.carrier.position.x),
        y: Number(carcass.carrier.position.y),
        z: Number(carcass.carrier.position.z),
      };
      const carrierDimension = Number(carcass.carrier.dimension || 0);
      if (Number(carcass.dimension || 0) !== carrierDimension) {
        carcass.dimension = carrierDimension;
        try {
          if (entityExists(carcass.entity, "object")) {
            carcass.entity.dimension = carrierDimension;
          }
        } catch {}
        syncCarcass(carcass);
      }

      // The controlling client keeps the network object attached to the spine bone.
      // Teleporting it to the root every second fights the attachment and causes jitter.
    }

    if (carcass.stage === "trunk" && !entityExists(carcass.vehicle, "vehicle")) {
      removeCarcass(carcass, "vehicle_lost");
    }
  });

  mp.players.forEach((player) => {
    const challenge = player.__huntingChallenge;
    if (challenge && now > challenge.expiresAt) {
      runPlayerHuntingOperation(player, "minigame_timeout", async () => {
        const current = player.__huntingChallenge;
        if (current && Date.now() > Number(current.expiresAt || 0)) {
          failChallenge(
            player,
            "minigame_timeout",
            "Время вышло. Попытка использована."
          );
        }
      });
    } else if (challenge) {
      const carcass = carcasses.get(Number(challenge.carcassId));
      if (
        !carcass ||
        carcass.lockedBy !== player ||
        carcass.spoiled ||
        !isCarcassOwner(player, carcass) ||
        !isPlayerNearCarcass(player, carcass, 1.5) ||
        player.vehicle
      ) {
        runPlayerHuntingOperation(player, "minigame_distance_cancel", async () => {
          if (player.__huntingChallenge === challenge) {
            await cancelProcessing(
              player,
              "distance_or_state",
              "Вы отошли от туши. Верёвка и мешок возвращены."
            );
          }
        });
      }
    }

    const choice = player.__huntingProcessingChoice;
    if (choice && now > Number(choice.expiresAt || 0)) {
      runPlayerHuntingOperation(player, "processing_choice_timeout", async () => {
        const current = player.__huntingProcessingChoice;
        if (current && Date.now() > Number(current.expiresAt || 0)) {
          failChallenge(player, "processing_choice_timeout", "Выбор режима отменён.", false);
        }
      });
    } else if (choice) {
      const carcass = carcasses.get(Number(choice.carcassId));
      if (
        !carcass ||
        carcass.lockedBy !== player ||
        carcass.spoiled ||
        !isCarcassOwner(player, carcass) ||
        !isPlayerNearCarcass(player, carcass, 1.5) ||
        player.vehicle
      ) {
        runPlayerHuntingOperation(player, "processing_choice_distance_cancel", async () => {
          if (player.__huntingProcessingChoice === choice) {
            await cancelProcessing(player, "choice_distance", "Вы отошли от туши. Разделка отменена.");
          }
        });
      }
    }
  });

  recentHits.forEach((timestamp, key) => {
    if (now - timestamp > 5000) recentHits.delete(key);
  });

  recentPlayerHits.forEach((timestamp, playerId) => {
    if (now - timestamp > 5000) recentPlayerHits.delete(playerId);
  });
}, HUNTING_CONFIG.carrySyncIntervalMs);

registerInterval(() => {
  const now = Date.now();
  mp.players.forEach((player) => {
    runPlayerHuntingOperation(player, "expiry_tick", async () => {
      await inventory.spoilExpiredHuntingBags(player, now);
      if (player.__huntingStimulantUntil && now >= player.__huntingStimulantUntil) {
        player.__huntingStimulantUntil = 0;
        try {
          player.setVariable("huntingStimulantUntil", 0);
        } catch {}
        notify(player, "Действие стимулятора закончилось: визуальная слышимость отключена.");
      }
    });
  });

  profiles.forEach((profile, staticId) => {
    const deployedTent = tents.get(Number(staticId));
    const ownerOnline = deployedTent?.ownerPlayer && mp.players.exists(deployedTent.ownerPlayer);
    if (
      deployedTent &&
      !ownerOnline &&
      now - Number(profile.lastSeenAt || now) >= 2 * 60 * 60 * 1000
    ) {
      profile.pendingTentReturn = {
        durability: Math.max(1, Number(profile.tent?.durability || 1)),
      };
      profile.tent = null;
      destroyTent(deployedTent, "owner_offline_timeout");
      huntingRepository.saveProfile(staticId, profile).catch((error) => {
        console.error("[HUNTING] Tent timeout save failed:", error);
      });
      console.log(`[HUNTING] Tent auto-folded | static=${staticId}`);
      return;
    }

    let changed = 0;
    Object.values(profile.vehicleBags || {}).forEach((bags) => {
      changed += spoilStoredBags(bags, now);
    });
    if (Array.isArray(profile.tent?.bags)) changed += spoilStoredBags(profile.tent.bags, now);
    if (changed > 0) {
      huntingRepository.saveProfile(staticId, profile).catch((error) => {
        console.error("[HUNTING] Stored carcass expiry save failed:", error);
      });
      console.log(`[HUNTING] Stored carcasses spoiled | static=${staticId} count=${changed}`);
      huntingAudit("stored_carcasses_spoiled", null, {
        ownerStaticId: Number(staticId),
        count: Number(changed),
      }, "warning");
    }
  });
}, 60000);

registerInterval(() => {
  mp.players.forEach((player) => {
    if (!player.__huntingMaskSuit) return;
    runPlayerHuntingOperation(player, "mask_validation", async () => {
      if (!mp.players.exists(player)) return;
      const uid = String(player.__huntingMaskSuitUid || "");
      const owned = uid
        ? await inventory.getOwnedItemByUid(player, uid, "hunting_mask_suit")
        : null;
      if (!owned) {
        await disableMaskSuit(player, "missing", false);
        return;
      }
    });
  });
}, 5000);

ZONES.forEach((zone) => {
  for (let slotId = 0; slotId < zone.population; slotId += 1) {
    spawnAnimal(zone.id, `${zone.id}:${slotId}`);
  }
});

try {
  const safeZone = HUNTING_CONFIG.sellerSafeZone;
  const shape = mp.colshapes.newSphere(
    Number(safeZone.center.x),
    Number(safeZone.center.y),
    Number(safeZone.center.z),
    Number(safeZone.radius)
  );
  shape.isHuntingSellerSafeZone = true;
  huntingRuntime.safeZoneShape = shape;
} catch (error) {
  console.error("[HUNTING] Failed to create Jeremy safe zone:", error);
}

console.log(
  `[HUNTING] Loaded | zones=${ZONES.length} | animals=${animals.size} | carcassLifetime=${HUNTING_CONFIG.carcassLifetimeMs}ms`
);

huntingRuntime.shutdown = (reason = "shutdown") => {
  huntingRuntime.active = false;
  huntingRuntime.events.splice(0).forEach(({ eventName, handler }) => {
    try {
      if (typeof mp.events.remove === "function") mp.events.remove(eventName, handler);
    } catch {}
  });
  huntingRuntime.commands.splice(0).forEach(({ name, handler }) => {
    try { mp.unregisterCommand?.(name, handler); } catch {}
  });
  huntingRuntime.intervals.splice(0).forEach((handle) => {
    try { clearInterval(handle); } catch {}
  });
  respawnTimers.forEach((handle) => {
    try { clearTimeout(handle); } catch {}
  });
  respawnTimers.clear();
  animals.forEach(destroyAnimalPed);
  animals.clear();
  carcasses.forEach(destroyCarcassEntity);
  carcasses.clear();
  tents.forEach((tent) => {
    try {
      if (entityExists(tent.entity, "object")) tent.entity.destroy();
    } catch {}
  });
  tents.clear();
  playerOperationChains.clear();
  try {
    if (huntingRuntime.safeZoneShape && mp.colshapes.exists(huntingRuntime.safeZoneShape)) {
      huntingRuntime.safeZoneShape.destroy();
    }
  } catch {}
  console.log(`[HUNTING] Runtime stopped | reason=${reason}`);
};

const huntingService = {
  ensureProfile: ensureHuntingProfile,
  runExclusive: runPlayerHuntingOperation,
  getState: getHuntingState,
  getVehicleStorageItemCount(player, storageKey) {
    const key = String(storageKey || "").trim();
    const profile = player?.__huntingProfile;
    const bags = key && profile?.vehicleBags && typeof profile.vehicleBags === "object"
      ? profile.vehicleBags[key]
      : null;
    return Array.isArray(bags) ? bags.length : 0;
  },
  removeEmptyVehicleStorage(player, storageKey) {
    const key = String(storageKey || "").trim();
    const profile = player?.__huntingProfile;
    if (!key || !profile?.vehicleBags || typeof profile.vehicleBags !== "object") return true;
    const bags = profile.vehicleBags[key];
    if (Array.isArray(bags) && bags.length > 0) return false;
    delete profile.vehicleBags[key];
    return true;
  },
  closeInventorySession(player) {
    if (!player) return;
    player.__huntingOpenTentOwner = null;
    player.__huntingOpenVehicleId = null;
    player.__huntingOpenVehicleKey = null;
  },
  handleInventoryMove(player, move) {
    const hasVehicleSession = player?.__huntingOpenVehicleId !== null &&
      player?.__huntingOpenVehicleId !== undefined &&
      Number.isFinite(Number(player.__huntingOpenVehicleId)) &&
      Number(player?.__huntingOpenVehicleId) >= 0;
    const operation = hasVehicleSession ? "vehicle_inventory_move" : "tent_inventory_move";
    return runPlayerHuntingOperation(player, operation, () => (
      operation === "vehicle_inventory_move"
        ? handleVehicleInventoryMove(player, move)
        : handleTentInventoryMove(player, move)
    ));
  },
  onInventoryItemRemoved(player, item) {
    if (!player || String(item?.itemId || item?.id) !== "hunting_carcass_bag") return false;
    const ownerStaticId = getPlayerStaticId(player);
    const ownerKey = getPlayerOwnerId(player);
    const itemUid = String(item.uid || "");
    const carried = carcasses.get(Number(player.__huntingCarcassId));
    const carcass = carried && String(carried.inventoryItemUid || "") === itemUid
      ? carried
      : Array.from(carcasses.values()).find((entry) => (
          (
            String(entry.ownerStaticId || "") === String(ownerKey) ||
            Number(entry.ownerStaticId || 0) === Number(ownerStaticId)
          ) &&
          String(entry.inventoryItemUid || "") === itemUid
        ));
    if (!carcass) return false;
    if (Number(player.__huntingCarcassId) === Number(carcass.id)) player.__huntingCarcassId = null;
    carcass.carrier = null;
    removeCarcass(carcass, "inventory_bag_removed");
    return true;
  },
  isRareShopUnlocked(player) {
    return Boolean(player?.__huntingProfile?.rareUnlocked);
  },
  canShow(player, condition) {
    const state = getHuntingState(player);
    switch (String(condition || "")) {
      case "huntingInactive": return !state.active && !state.quest;
      case "huntingActive": return state.active;
      case "huntingHasQuest": return Boolean(state.quest);
      case "huntingNoQuest": return !state.quest;
      default: return true;
    }
  },
  startFreeHunt(player) {
    return runPlayerHuntingOperation(player, "start_free_hunt", () => startFreeHunt(player));
  },
  assignQuest(player) {
    return runPlayerHuntingOperation(player, "assign_quest", () => assignQuest(player));
  },
  submitQuest(player) {
    return runPlayerHuntingOperation(player, "submit_quest", () => completeOrFailQuest(player, "submit"));
  },
  finishHunt(player) {
    return runPlayerHuntingOperation(player, "finish_hunt", () => finishHunt(player));
  },
  sellCarcassBag(player, coefficient, buyerId) {
    return runPlayerHuntingOperation(
      player,
      "sell_bag",
      () => sellCarcassBag(player, coefficient, buyerId)
    );
  },
  showInfo(player) {
    notify(
      player,
      "Для пригодной туши используйте специальную винтовку: обычная требует 2 попадания, редкая — 1. Кулаки, нож, транспорт и другое оружие портят тушу. Охотничий нож нужен для разделки на E. Мини-игра расходует 1 верёвку и 1 мешок, автоматическая разделка — по 3."
    );
    return true;
  },
};

global.twinkleHunting = huntingService;
module.exports = huntingService;

function getAdminLevel(player) {
  return Number(
    player?.adminLevel ||
    player?.admin ||
    player?.admin_level ||
    player?.character?.admin_level ||
    player?.characterData?.admin_level ||
    player?.getVariable?.("adminLevel") ||
    player?.getVariable?.("admin") ||
    0
  );
}

function hasHuntingCommandAccess(player) {
  if (getAdminLevel(player) >= 1) return true;
  notify(player, "Недостаточно прав для охотничьей административной команды.");
  return false;
}

try {
  registerServerCommand("whanimal", (player) => {
    if (!hasHuntingCommandAccess(player)) return;
    player.__huntingDebugEsp = !player.__huntingDebugEsp;
    player.call("hunting:debugEsp", [player.__huntingDebugEsp]);
    if (player.__huntingDebugEsp) {
      animals.forEach((animal) => sendAnimalHealthToDebugAdmins(animal));
    }
  });

  registerServerCommand("huntanimals", (player) => {
    if (!hasHuntingCommandAccess(player)) return;
    notify(player, `Животных: ${animals.size}; туш: ${carcasses.size}; палаток: ${tents.size}.`);
    animals.forEach((animal) => {
      notify(
        player,
        `#${animal.debugId} ${animal.species.name}: ${animal.behavior}, зона ${animal.zoneId}`
      );
    });
    carcasses.forEach((carcass) => {
      notify(
        player,
        `Туша #${carcass.id} ${carcass.species.name}: ${carcass.spoiled ? "испорчена" : "пригодна"}, владелец ${carcass.ownerStaticId || "нет"}`
      );
    });
  });

  registerServerCommand("hunts", (player) => {
    if (!hasHuntingCommandAccess(player)) return;
    const active = Array.from(profiles.values()).filter((profile) => profile.active).length;
    notify(player, `Активных охот: ${active}.`);
    mp.players.forEach((hunter) => {
      const state = hunter.__huntingProfile;
      if (!state?.active) return;
      notify(player, `Игрок ${hunter.id}: режим ${state.mode || "free"}, задание ${state.currentQuest?.id || "нет"}.`);
    });
  });

  registerServerCommand("huntstop", (player, _fullText, targetIdRaw) => {
    if (!hasHuntingCommandAccess(player)) return;
    const target = getPlayerById(targetIdRaw);
    if (!target) return notify(player, "Игрок не найден. Использование: /huntstop [id].");

    return runPlayerHuntingOperation(target, "admin_force_stop", async () => {
      const profile = await ensureHuntingProfile(target);
      const questId = profile.currentQuest?.id || null;
      profile.active = false;
      profile.mode = null;
      profile.currentQuest = null;
      releaseChallenge(target);
      dropCarriedCarcass(target, true);
      await saveHuntingProfile(target);
      syncPlayer(target);
      notify(target, "Администратор принудительно завершил вашу охоту.");
      notify(player, `Охота игрока ${target.id} завершена${questId ? `, задание ${questId} отменено` : ""}.`);
      console.warn(`[HUNTING] Admin force stop | admin=${player.id} target=${target.id} quest=${questId || "none"}`);
      return true;
    });
  });

  registerServerCommand("huntgive", (player, _fullText, targetIdRaw, itemIdRaw, amountRaw = 1) => {
    if (!hasHuntingCommandAccess(player)) return;
    const target = getPlayerById(targetIdRaw);
    const itemId = String(itemIdRaw || "").trim();
    const amount = Math.max(1, Math.min(100, Math.floor(Number(amountRaw || 1))));
    if (!target || (!itemId.startsWith("hunting_") && !["water", "burger"].includes(itemId))) {
      return notify(player, "Использование: /huntgive [id] [hunting_item] [количество].");
    }

    return runPlayerHuntingOperation(target, "admin_give_item", async () => {
      const added = await inventory.addItem(target, itemId, amount);
      notify(player, added ? `Предмет ${itemId} x${amount} выдан игроку ${target.id}.` : "Предмет не выдан: проверьте ID, место и вес.");
      if (added) console.warn(`[HUNTING] Admin item give | admin=${player.id} target=${target.id} item=${itemId} amount=${amount}`);
      return added;
    });
  });

  registerServerCommand("hunttake", (player, _fullText, targetIdRaw, itemIdRaw, amountRaw = 1) => {
    if (!hasHuntingCommandAccess(player)) return;
    const target = getPlayerById(targetIdRaw);
    const itemId = String(itemIdRaw || "").trim();
    const amount = Math.max(1, Math.min(100, Math.floor(Number(amountRaw || 1))));
    if (!target || !itemId.startsWith("hunting_")) {
      return notify(player, "Использование: /hunttake [id] [hunting_item] [количество].");
    }

    return runPlayerHuntingOperation(target, "admin_take_item", async () => {
      const removed = await inventory.removeItems(target, [{ itemId, amount }]);
      notify(player, removed ? `Предмет ${itemId} x${amount} изъят у игрока ${target.id}.` : "У игрока нет указанного количества предметов.");
      if (removed) console.warn(`[HUNTING] Admin item take | admin=${player.id} target=${target.id} item=${itemId} amount=${amount}`);
      return removed;
    });
  });
} catch (error) {
  console.error("[HUNTING] Admin commands registration failed:", error);
}
