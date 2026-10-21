"use strict";

const truckerRoutes = require("../trucker/trucker.routes.json");
const treePositions = require("./forestry.trees.json");

const point = (x, y, z, heading = 0) => Object.freeze({ x, y, z, heading });

const TREE_TYPES = Object.freeze([
  Object.freeze({ id: "pine", name: "Сосна", chance: 55, bundles: [1, 1.3], xp: 8, color: [76, 170, 93] }),
  Object.freeze({ id: "fir", name: "Ель", chance: 25, bundles: [1.05, 1.4], xp: 10, color: [48, 138, 79] }),
  Object.freeze({ id: "cedar", name: "Кедр", chance: 15, bundles: [1.2, 1.6], xp: 12, color: [187, 137, 71] }),
  Object.freeze({ id: "oak", name: "Редкий дуб", chance: 5, bundles: [1.55, 2], xp: 18, color: [218, 174, 83] }),
]);

const LEVELS = Object.freeze([
  { level: 1, name: "Ученик лесоруба", xp: 0, yieldMultiplier: 1 },
  { level: 2, name: "Вальщик", xp: 80, yieldMultiplier: 1.03 },
  { level: 3, name: "Опытный вальщик", xp: 210, yieldMultiplier: 1.06 },
  { level: 4, name: "Таксатор", xp: 420, yieldMultiplier: 1.09 },
  { level: 5, name: "Мастер участка", xp: 720, yieldMultiplier: 1.12 },
  { level: 6, name: "Водитель лесовоза", xp: 1150, yieldMultiplier: 1.15 },
  { level: 7, name: "Бригадир", xp: 1700, yieldMultiplier: 1.18 },
  { level: 8, name: "Инженер леса", xp: 2400, yieldMultiplier: 1.21 },
  { level: 9, name: "Начальник делянки", xp: 3300, yieldMultiplier: 1.24 },
  { level: 10, name: "Легенда лесопилки", xp: 4400, yieldMultiplier: 1.27 },
]);

const ENTITLEMENTS = Object.freeze({
  chainsaw: Object.freeze({
    id: "chainsaw", name: "Рабочая бензопила", itemId: "forestry_chainsaw_rental",
    voucherItemId: "forestry_chainsaw_rental_voucher", price: 600,
    durationMs: 60 * 60 * 1000, minLevel: 1, tool: true, yieldMultiplier: 1,
  }),
  golden_axe: Object.freeze({
    id: "golden_axe", name: "Золотой топор", itemId: "forestry_golden_axe_rental",
    voucherItemId: "forestry_golden_axe_rental_voucher", price: 3600,
    durationMs: 2 * 60 * 60 * 1000, minLevel: 3, tool: true, yieldMultiplier: 2,
  }),
});

const HAUL_VEHICLES = Object.freeze([
  Object.freeze({ id: "mule", name: "Maibatsu Mule · брёвна", model: "mule", type: "van", price: 2400, minLevel: 6, license: "cdl_b", durationMs: 60 * 60 * 1000, capacityKg: [6, 12], payoutMultiplier: 1, fuel: 140 }),
  Object.freeze({ id: "phantom", name: "JoBuilt Phantom + лесной прицеп", model: "phantom", trailerModel: "trailerlogs", type: "truck", price: 3600, minLevel: 6, license: "cdl_a", durationMs: 60 * 60 * 1000, capacityKg: [12, 20], payoutMultiplier: 1.18, fuel: 260 }),
]);

const HAUL_DESTINATIONS = Object.freeze((() => {
  const unique = new Map();
  for (const route of truckerRoutes) {
    if (!route?.destination || route.vehicleType !== "truck") continue;
    const destination = route.destination;
    const key = `${Number(destination.x).toFixed(2)}:${Number(destination.y).toFixed(2)}:${Number(destination.z).toFixed(2)}`;
    if (!unique.has(key)) unique.set(key, Object.freeze({ ...destination, company: route.company || "Склад древесины" }));
  }
  return [...unique.values()];
})());

module.exports = Object.freeze({
  npc: Object.freeze({
    id: "forestry_foreman",
    name: "Олег Ветров",
    profession: "Бригадир лесопилки",
    model: "s_m_y_construct_01",
    position: new mp.Vector3(-567.946, 5253.788, 70.47),
    heading: 79.93,
    colshapeRadius: 4.2,
    scenario: "WORLD_HUMAN_CLIPBOARD",
  }),
  blip: Object.freeze({ sprite: 237, color: 25, scale: 0.9, name: "Лесопилка", shortRange: true }),
  zone: Object.freeze({ minX: -880, maxX: -390, minY: 5070, maxY: 5860, minZ: 20, maxZ: 150, dimension: 0 }),
  shiftBoundaryPaddingM: 120,
  shiftOutsideTimeoutMs: 5 * 60 * 1000,
  unloadPoint: point(-556.339, 5371.781, 70.24, 165),
  vehicleSpawn: point(-575.1, 5250.2, 70.45, 154),
  trailerSpawn: point(-585.2, 5244.4, 70.3, 154),
  treeRespawnMs: 12 * 60 * 1000,
  treeClusterRadiusM: 0.75,
  // Keep each RAGE remote-event comfortably below the packet limit. The
  // client receives a moving window while the server still owns all trees.
  clientTreeWindowSize: 24,
  clientTreePacketBytes: 6000,
  clientTreeSyncDistanceM: 35,
  clientTreeSyncIntervalMs: 5000,
  interactionRadius: 2.6,
  unloadRadius: 3.2,
  sellRadius: 3.2,
  haulRadius: 6,
  lockTimeoutMs: 25 * 1000,
  treePositions: Object.freeze(treePositions.map((entry, slot) => Object.freeze({ slot, ...entry }))),
  initialWaveSize: treePositions.length,
  refillWaveSize: 0,
  activeTreeCap: treePositions.length,
  activeTreeMinDistance: 0,
  publicAnnouncementMs: 15 * 60 * 1000,
  treeTypes: TREE_TYPES,
  levels: LEVELS,
  entitlements: ENTITLEMENTS,
  stimulant: Object.freeze({ itemId: "forestry_stimulant", name: "Стимулятор лесоруба x2", price: 375, durationMs: 5 * 60 * 1000, minLevel: 5, yieldMultiplier: 2 }),
  yieldMultiplierCap: 3,
  secretSaw: Object.freeze({ itemId: "forestry_secret_saw_trophy", documentKey: "forestry:trophy:secret_saw", treesRequired: 1000, payoutMultiplier: 3 }),
  minigame: Object.freeze({
    hitsRequired: 3,
    maxAttempts: 6,
    ttlMs: 24 * 1000,
    roundLeadMs: 850,
    minInputMs: 140,
    targetWidth: [0.13, 0.2],
    speed: [0.72, 1.48],
    accelerationChance: 0.45,
    acceleration: [1.12, 1.48],
    latencyTolerance: 0.055,
  }),
  economy: Object.freeze({ basePay: 60, payPerMeter: 1.3, xpPerTree: 8, speedBonusMax: 0.15, speedBonusLeadSeconds: 12, targetWalkSpeedMps: 2.35 }),
  haul: Object.freeze({ loadingMs: 9000, unloadingMs: 8000, minimumStock: 6, minimumStockKg: 6, minDestinationDistanceM: 1800, roadDistanceMultiplier: 1.24, maxPlausibleSpeedMps: 55, basePay: 250, payPerKm: 285, payPerUnit: 35, payPerKg: 35, minimumPay: 2500, xp: 55 }),
  haulVehicles: HAUL_VEHICLES,
  haulDestinations: HAUL_DESTINATIONS,
  cargoVisual: Object.freeze({
    models: Object.freeze(["prop_log_01"]),
    bone: 28422,
    position: Object.freeze([0.01, -0.16, -0.15]),
    rotation: Object.freeze([5, 2, 90]),
    animation: Object.freeze({ dictionary: "anim@heists@box_carry@", name: "idle", flags: 49 }),
  }),
});
