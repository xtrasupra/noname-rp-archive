"use strict";

const point = (x, y, z, heading = 0) => Object.freeze({ x, y, z, heading, dimension: 0 });

// Supplied legacy Gruppe 6 pickup catalog. The legacy client trusted arbitrary
// coordinates from the player; only these immutable server-side points are used.
const PICKUPS = Object.freeze([
  [253.4611, 220.7204, 106.2865],
  [148.5, -1039.971, 29.37775],
  [1175.054, 2706.404, 38.09407],
  [-1212.83, -330.3573, 37.78702],
  [314.3541, -278.5519, 54.17077],
  [-2962.951, 482.8024, 15.7031],
  [-350.6871, -49.60739, 49.04258],
  [-111.1722, 6467.846, 31.62671],
  [-113.3064, 6469.969, 31.62672],
  [138.7087, -1705.711, 28.29162],
  [1214.091, -472.9952, 65.208],
  [-276.4055, 6226.398, 30.69552],
  [-1282.688, -1117.432, 5.990113],
  [1931.844, 3730.305, 31.84443],
  [-33.34319, -154.1892, 56.07654],
  [-813.5332, -183.2378, 36.5689],
  [22.08832, -1106.986, 29.79703],
  [252.17, -50.08245, 69.94106],
  [842.2239, -1033.294, 28.19486],
  [-661.947, -935.6796, 21.82924],
  [-1305.899, -394.5485, 36.69577],
  [809.9118, -2157.209, 28.61901],
  [2567.651, 294.4759, 107.7349],
  [-3171.98, 1087.908, 19.83874],
  [-1117.679, 2698.744, 17.55415],
  [1693.555, 3759.9, 33.70533],
  [-330.36, 6083.885, 30.45477],
  [-1148.878, -2000.123, 12.18026],
  [-347.0815, -133.3432, 38.00966],
  [726.0679, -1071.613, 27.31101],
  [-207.0201, -1331.493, 33.89437],
  [1187.764, 2639.15, 37.43521],
  [101.0262, 6618.267, 31.43771],
  [472.2666, -1310.529, 28.22178],
  [26.213, -1345.442, 29.49702],
  [-1223.059, -906.7239, 12.32635],
  [-1487.533, -379.3019, 40.16339],
  [1135.979, -982.2205, 46.4158],
  [1699.741, 4924.002, 42.06367],
  [374.3559, 327.7817, 103.5664],
  [-3241.895, 1001.701, 12.83071],
  [-3039.184, 586.3903, 7.90893],
  [-2968.295, 390.9566, 15.04331],
  [547.8511, 2669.281, 42.1565],
  [1165.314, 2709.109, 38.157721],
  [1960.845, 3741.882, 32.34375],
  [1729.792, 6414.979, 35.03723],
].map(([x, y, z], index) => Object.freeze({
  id: `ac_${String(index + 1).padStart(3, "0")}`,
  name: `Точка GR6 ${String(index + 1).padStart(2, "0")} · markers[${index}]`,
  legacyIndex: index,
  position: point(x, y, z),
})));

// These coordinates came from gr6.grabMarkers. In the supplied source they
// start a night robbery, add wanted level and remove reputation, so they are
// deliberately kept out of the legal collector route pool.
const ROBBERY_POINTS = Object.freeze([
  [2544.863, 2580.673, 36.94484],
  [2552.278, 4672.925, 32.95345],
  [2307.159, 4888.141, 40.80823],
  [1711.456, 4747.02, 40.94597],
  [2413.809, 4991.302, 45.2426],
  [408.0634, 6493.51, 27.09958],
  [-24.08177, 6459.26, 30.41778],
  [47.56932, 6299.511, 30.23523],
  [723.0118, -822.5493, 23.72392],
  [906.7827, -1518.068, 29.43467],
  [845.0453, -2360.232, 29.34108],
  [69.28804, -1428.331, 28.31164],
  [388.5147, 62.68007, 96.97788],
  [-452.1371, 292.7735, 82.2362],
  [-457.0465, -51.68466, 43.51545],
  [-414.9887, -2182.779, 9.318105],
  [-195.8015, -2679.408, 5.006399],
  [254.6616, -3057.888, 4.782318],
  [1234.291, -3204.701, 4.641251],
].map(([x, y, z], index) => Object.freeze({ legacyIndex: index, position: point(x, y, z) })));

const LEVELS = Object.freeze([
  0, 120, 320, 650, 1100, 1700, 2450, 3400, 4550, 6000,
]);

// The job intentionally has ten transparent pay grades. Percentages apply to
// the distance-and-bag base payout; the fast-route reward remains separate.
const LEVEL_PAY_RATES = Object.freeze([
  0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18,
]);

module.exports = Object.freeze({
  contractVersion: 1,
  jobId: "armored_collector",
  npc: Object.freeze({
    id: "armored_collector_dispatcher",
    name: "Диспетчер Gruppe 6",
    model: "s_m_m_armoured_02",
    position: new mp.Vector3(-519.759, -615.342, 26.33),
    heading: -78.79,
    colshapeRadius: 4.5,
    scenario: "WORLD_HUMAN_CLIPBOARD",
  }),
  blip: Object.freeze({ sprite: 67, color: 2, scale: 0.85, name: "Инкассация · Gruppe 6", shortRange: true }),
  vehicle: Object.freeze({
    model: "stockade",
    label: "Brute Stockade · Gruppe 6",
    spawn: point(-500.978, -611.932, 25.309, -91.82),
    spawnClearRadius: 6.5,
    fuel: 100,
  }),
  unload: Object.freeze({
    name: "Хранилище Gruppe 6",
    position: point(-470.832, -624.416, 25.309, 90.63),
  }),
  refreshMs: 5 * 60 * 1000,
  offersPerRotation: 10,
  vehicleAbsenceTimeoutMs: 5 * 60 * 1000,
  sampleIntervalMs: 1000,
  cancellation: Object.freeze({
    beforePickupFee: 250,
    afterPickupBaseFee: 400,
    perLoadedBagFee: 100,
    maximumFee: 800,
  }),
  interaction: Object.freeze({
    pickupRadius: 2.8,
    pickupVehicleRadius: 24,
    loadVehicleRadius: 7.5,
    unloadRadius: 4.5,
    unloadVehicleRadius: 12,
    selectAtBaseRadius: 85,
    maximumVehicleSpeedMps: 1.5,
    maximumPlausibleTravelMps: 65,
    hardMinimumTravelMps: 55,
  }),
  economy: Object.freeze({
    roadDistanceMultiplier: 1.22,
    basePay: 75,
    payPerKm: 210,
    payPerBag: 100,
    levelPayRates: LEVEL_PAY_RATES,
    level10Unlock: 10,
    level10FlatBonus: 500,
    fastBonusMaxRate: 0.25,
    targetSpeedMps: 15,
    serviceSecondsPerBag: 24,
    xpBase: 35,
    xpPerKm: 5,
    xpPerBag: 7,
  }),
  levels: LEVELS,
  pickups: PICKUPS,
  robberyPoints: ROBBERY_POINTS,
});
