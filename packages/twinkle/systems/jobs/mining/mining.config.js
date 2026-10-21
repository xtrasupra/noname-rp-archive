"use strict";

const truckerRoutes = require("../trucker/trucker.routes.json");

const point = (x, y, z, heading = 0) => Object.freeze({ x, y, z, heading });

const ROCK_POSITIONS = Object.freeze([
  [2948.625732421875, 2781.692626953125, 39.753875732421875, 17.968368530273438],
  [2951.04541015625, 2783.8935546875, 40.61140823364258, -56.178096771240234],
  [2958.887939453125, 2824.431884765625, 43.17811965942383, 160.22804260253906],
  [2948.6083984375, 2820.466796875, 43.48515701293945, 125.59849548339844],
  [2951.81689453125, 2816.963623046875, 42.275001525878906, -125.39139556884766],
  [2956.12158203125, 2814.44677734375, 42.36302947998047, -130.44488525390625],
  [2956.03369140625, 2808.702392578125, 41.982154846191406, 164.1356201171875],
  [2949.357666015625, 2807.907470703125, 41.564186096191406, 77.429931640625],
  [2943.338623046875, 2812.438232421875, 42.23110580444336, 54.87257385253906],
  [2937.148681640625, 2816.745361328125, 43.97442626953125, 54.87257385253906],
  [2933.106689453125, 2816.296630859375, 44.59931564331055, 112.1053237915039],
  [2928.40478515625, 2813.386962890625, 44.5146598815918, 122.4357681274414],
  [2924.9345703125, 2810.39599609375, 43.616764068603516, 134.3590087890625],
  [2920.1552734375, 2811.153564453125, 45.513267517089844, 75.9631576538086],
  [2917.124755859375, 2804.7001953125, 43.453468322753906, 142.21426391601562],
  [2918.7138671875, 2799.18310546875, 41.43072509765625, -160.7830047607422],
  [2920.860107421875, 2796.6533203125, 40.90497589111328, -119.83943176269531],
  [2922.05615234375, 2792.637939453125, 40.56657791137695, -171.669189453125],
  [2925.6630859375, 2789.813720703125, 40.208621978759766, -113.69159698486328],
  [2928.130126953125, 2784.691650390625, 40.062538146972656, -156.0045166015625],
  [2932.95263671875, 2782.2861328125, 39.212852478027344, -99.76298522949219],
  [2934.994873046875, 2779.332763671875, 39.08527755737305, -163.9457244873047],
  [2937.94970703125, 2777.778076171875, 39.24016571044922, -102.54183959960938],
  [2941.7021484375, 2780.237548828125, 39.375362396240234, -21.176097869873047],
  [2942.548828125, 2784.040283203125, 39.72580337524414, -2.65238094329834],
  [2941.455810546875, 2787.650390625, 40.01143264770508, 30.086421966552734],
  [2944.454833984375, 2792.516845703125, 40.49540328979492, -48.9359130859375],
  [2948.63330078125, 2793.25341796875, 40.70844650268555, -91.60407257080078],
  [2951.65087890625, 2792.171875, 40.94673156738281, -108.52351379394531],
  [2954.44921875, 2787.611328125, 41.49142837524414, -160.42202758789062],
  [2959.23876953125, 2784.174560546875, 40.6712646484375, -113.2676010131836],
  [2963.07861328125, 2784.742919921875, 39.76521301269531, -69.63114166259766],
  [2965.805908203125, 2786.649658203125, 39.609230041503906, -43.30373764038086],
  [2967.592041015625, 2790.7353515625, 40.05345153808594, -9.195551872253418],
  [2966.357421875, 2795.591796875, 40.7924690246582, 31.066184997558594],
  [2962.625, 2798.555908203125, 41.146453857421875, 66.0337905883789],
  [2959.572265625, 2799.69970703125, 41.32413864135742, 68.75534057617188],
  [2957.396240234375, 2804.677001953125, 42.01211929321289, 3.844959259033203],
  [2960.8525390625, 2809.95654296875, 42.5301399230957, -46.60396194458008],
  [2967.535888671875, 2807.241455078125, 42.36266326904297, -130.60531616210938],
  [2969.2275390625, 2802.957275390625, 41.7451171875, -167.2001190185547],
  [2967.927490234375, 2798.12890625, 41.08181381225586, 155.5469970703125],
  [2970.59619140625, 2793.38916015625, 40.49575424194336, -133.4357147216797],
  [2973.70166015625, 2790.324951171875, 40.19081115722656, -124.36006164550781],
  [2974.399169921875, 2785.060546875, 39.38515090942383, 173.9217529296875],
  [2970.978515625, 2780.36328125, 38.77709197998047, 128.41171264648438],
  [2965.8876953125, 2779.26123046875, 39.107421875, 92.7966537475586],
  [2962.443603515625, 2775.478271484375, 39.683292388916016, 152.30978393554688],
  [2958.232666015625, 2774.835693359375, 39.985939025878906, 83.70381164550781],
  [2954.613525390625, 2771.32275390625, 38.86928176879883, 161.8437957763672],
  [2951.373046875, 2765.88623046875, 39.410499572753906, 146.6661376953125],
  [2946.5087890625, 2764.587890625, 40.57489013671875, 86.73474884033203],
  [2941.937744140625, 2767.201416015625, 39.916847229003906, 45.56201934814453],
  [2936.656005859375, 2766.29150390625, 40.601524353027344, 122.9800796508789],
  [2933.896728515625, 2771.82373046875, 39.15217971801758, 29.358774185180664],
  [2929.696533203125, 2773.23291015625, 40.62353515625, 91.02047729492188],
  [2925.83349609375, 2775.70263671875, 43.28860092163086, 54.270973205566406],
  [2921.09423828125, 2777.009765625, 44.01194381713867, 87.29053497314453],
  [2917.825439453125, 2779.387939453125, 43.642547607421875, 40.77782440185547],
  [2915.448486328125, 2783.654052734375, 44.41194534301758, 28.739973068237305],
  [2915.960205078125, 2788.95458984375, 43.76010513305664, -19.72079086303711],
  [2918.64990234375, 2793.89306640625, 41.13376235961914, -43.3209228515625],
  [2923.836181640625, 2794.948974609375, 40.751129150390625, -93.75839233398438],
  [2929.040771484375, 2795.497314453125, 40.73604965209961, -82.29924011230469],
  [2933.692138671875, 2792.52587890625, 40.37321090698242, -127.34518432617188],
  [2938.0029296875, 2791.027587890625, 40.22760772705078, -102.5017318725586],
  [2941.716064453125, 2791.48828125, 40.34531784057617, -77.19418334960938],
  [2947.0927734375, 2788.87109375, 40.50481414794922, -123.71835327148438],
  [2951.8701171875, 2786.166259765625, 41.2906379699707, -119.59879302978516],
  [2973.019287109375, 2804.57080078125, 42.60432434082031, -102.1522216796875],
  [2978.724853515625, 2793.98974609375, 41.286861419677734, -152.03965759277344],
  [2977.540283203125, 2787.16064453125, 39.86095428466797, 145.92127990722656],
].map(([x, y, z, heading], slot) => Object.freeze({ slot, x, y, z, heading })));

const RESOURCES = Object.freeze([
  Object.freeze({ id: "stone", name: "Камень", rarity: "low", chance: 36, hp: 60, kg: [7, 11], pricePerKg: 22, xp: 8, model: "prop_rock_4_c", zOffset: -1.11, color: [106, 112, 119] }),
  Object.freeze({ id: "coal", name: "Уголь", rarity: "low", chance: 30, hp: 70, kg: [8, 12], pricePerKg: 28, xp: 9, model: "prop_rock_4_d", zOffset: -0.93, color: [35, 38, 44] }),
  Object.freeze({ id: "metal", name: "Металл", rarity: "medium", chance: 17, hp: 90, kg: [6, 9], pricePerKg: 44, xp: 12, model: "prop_rock_1_e", zOffset: -1.31, color: [96, 113, 126] }),
  Object.freeze({ id: "copper", name: "Медь", rarity: "medium", chance: 10, hp: 100, kg: [5, 8], pricePerKg: 60, xp: 14, model: "prop_rock_2_a", zOffset: -1.23, color: [173, 91, 54] }),
  Object.freeze({ id: "gold", name: "Золото", rarity: "rare", chance: 6, hp: 130, kg: [2.5, 4.5], pricePerKg: 180, xp: 22, model: "prop_rock_2_g", zOffset: -1.26, color: [222, 173, 48] }),
  Object.freeze({ id: "diamond", name: "Алмазы", rarity: "very_rare", chance: 1, hp: 160, kg: [0.6, 1.2], pricePerKg: 950, xp: 35, model: "prop_rock_3_f", zOffset: -1.35, color: [92, 224, 240] }),
]);

const LEVELS = Object.freeze([
  { level: 1, name: "Стажёр", xp: 0, kgMultiplier: 1 },
  { level: 2, name: "Забойщик", xp: 80, kgMultiplier: 1.03 },
  { level: 3, name: "Проходчик", xp: 210, kgMultiplier: 1.06 },
  { level: 4, name: "Горняк", xp: 420, kgMultiplier: 1.09 },
  { level: 5, name: "Мастер смены", xp: 720, kgMultiplier: 1.12 },
  { level: 6, name: "Водитель карьера", xp: 1150, kgMultiplier: 1.15 },
  { level: 7, name: "Бригадир", xp: 1700, kgMultiplier: 1.18 },
  { level: 8, name: "Инженер добычи", xp: 2400, kgMultiplier: 1.21 },
  { level: 9, name: "Начальник участка", xp: 3300, kgMultiplier: 1.24 },
  { level: 10, name: "Легенда шахты", xp: 4400, kgMultiplier: 1.27 },
]);

const ENTITLEMENTS = Object.freeze({
  drill: Object.freeze({ id: "drill", name: "Пневматический бур", itemId: "mining_drill_rental", voucherItemId: "mining_drill_rental_voucher", price: 600, durationMs: 60 * 60 * 1000, minLevel: 1, tool: true, damage: 16, inputDelayMultiplier: 1.03, yieldMultiplier: 1 }),
  golden_pickaxe: Object.freeze({ id: "golden_pickaxe", name: "Золотая кирка", itemId: "mining_golden_pickaxe_rental", voucherItemId: "mining_golden_pickaxe_rental_voucher", price: 3600, durationMs: 2 * 60 * 60 * 1000, minLevel: 3, tool: true, damage: 10, inputDelayMultiplier: 1, yieldMultiplier: 2 }),
  gps: Object.freeze({ id: "gps", name: "GPS-перехватчик", itemId: "mining_gps_rental", voucherItemId: "mining_gps_rental_voucher", price: 600, durationMs: 60 * 60 * 1000, minLevel: 1 }),
});

const BASIC_TOOL = Object.freeze({
  id: "basic_pickaxe",
  name: "Рабочая кирка",
  itemId: "mining_basic_pickaxe",
  documentKey: "mining:job:basic_pickaxe",
  damage: 8,
  inputDelayMultiplier: 1,
  yieldMultiplier: 1,
});

const HAUL_VEHICLES = Object.freeze([
  Object.freeze({ id: "mule", name: "Maibatsu Mule · порода", model: "mule", type: "van", price: 2400, minLevel: 6, license: "cdl_b", durationMs: 60 * 60 * 1000, capacityKg: [80, 160], payoutMultiplier: 1, fuel: 140 }),
  Object.freeze({ id: "phantom", name: "JoBuilt Phantom + грузовой прицеп", model: "phantom", trailerModel: "trailers", type: "truck", price: 3600, minLevel: 6, license: "cdl_a", durationMs: 60 * 60 * 1000, capacityKg: [140, 260], payoutMultiplier: 1.18, fuel: 260 }),
]);

const HAUL_DESTINATIONS = Object.freeze((() => {
  const unique = new Map();
  for (const route of truckerRoutes) {
    if (!route?.destination || route.vehicleType !== "truck") continue;
    const destination = route.destination;
    const key = `${Number(destination.x).toFixed(2)}:${Number(destination.y).toFixed(2)}:${Number(destination.z).toFixed(2)}`;
    if (!unique.has(key)) unique.set(key, Object.freeze({ ...destination, company: route.company || "Промышленный склад" }));
  }
  return [...unique.values()];
})());

module.exports = Object.freeze({
  npc: Object.freeze({
    id: "mining_foreman",
    name: "Михаил Крамер",
    profession: "Бригадир карьера",
    model: "s_m_y_construct_02",
    position: new mp.Vector3(2830.439453125, 2799.754150390625, 57.55592346191406),
    heading: 99.35702514648438,
    colshapeRadius: 4.2,
    scenario: "WORLD_HUMAN_CLIPBOARD",
  }),
  blip: Object.freeze({ sprite: 618, color: 5, scale: 0.9, name: "Шахта", shortRange: true }),
  zone: Object.freeze({ minX: 2663.337158203125, maxX: 3013.124755859375, minY: 2561.1162109375, maxY: 2991.429931640625, minZ: 20, maxZ: 180, dimension: 0 }),
  shiftBoundaryPaddingM: 100,
  shiftOutsideTimeoutMs: 5 * 60 * 1000,
  salePoint: point(2958.908935546875, 2753.543212890625, 43.70643615722656, 17.802217483520508),
  vehicleSpawn: point(2824.4, 2792.5, 57.35, 99),
  trailerSpawn: point(2812.2, 2794.9, 57.25, 99),
  waveMs: 5 * 60 * 1000,
  initialWaveSize: 18,
  refillWaveSize: 8,
  activeRockCap: 24,
  activeRockMinDistance: 7,
  publicAnnouncementMs: 15 * 60 * 1000,
  interactionRadius: 2.4,
  sellRadius: 3,
  haulRadius: 6,
  maxParticipants: 8,
  participantIdleMs: 60 * 1000,
  competitionWindowMs: 40 * 1000,
  competitionIdleSettleMs: 5 * 1000,
  minShare: 0.05,
  challenge: Object.freeze({
    keys: Object.freeze([
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
      "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
      "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "SPACE", "SHIFT", "MOUSE1", "MOUSE2",
    ]),
    length: 18, ttlMs: 36000, firstDelayMs: 1150, minimumDelayMs: 1150,
    acceleration: 1, serverMinIntervalMs: 25, humanMinimumFraction: 0,
  }),
  stimulant: Object.freeze({ itemId: "mining_stimulant", price: 750, durationMs: 10 * 60 * 1000, yieldMultiplier: 2 }),
  yieldMultiplierCap: 3,
  haul: Object.freeze({ loadingMs: 9000, unloadingMs: 8000, minimumStockKg: 40, minDestinationDistanceM: 1800, roadDistanceMultiplier: 1.24, maxPlausibleSpeedMps: 55, basePay: 250, payPerKm: 285, payPerKg: 2.5, minimumPay: 2500, xp: 55 }),
  rockPositions: ROCK_POSITIONS,
  resources: RESOURCES,
  levels: LEVELS,
  entitlements: ENTITLEMENTS,
  basicTool: BASIC_TOOL,
  haulVehicles: HAUL_VEHICLES,
  haulDestinations: HAUL_DESTINATIONS,
});
