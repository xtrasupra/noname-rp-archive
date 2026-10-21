"use strict";

const ORDER_TEMPLATES = require("./trucker.routes.json");

const position = (x, y, z, heading = 0) => Object.freeze({ x, y, z, heading });

const RANKS = Object.freeze([
  { rank: 1, name: "Стажёр", xp: 0 },
  { rank: 2, name: "Городской водитель", xp: 500 },
  { rank: 3, name: "Экспедитор", xp: 1400 },
  { rank: 4, name: "Надёжный перевозчик", xp: 2800 },
  { rank: 5, name: "Магистральный водитель", xp: 4800 },
  { rank: 6, name: "Старший водитель", xp: 7500 },
  { rank: 7, name: "Специалист логистики", xp: 11000 },
  { rank: 8, name: "Ветеран трассы", xp: 15500 },
  { rank: 9, name: "Элитный перевозчик", xp: 21000 },
  { rank: 10, name: "Легенда дорог", xp: 28000 },
]);

const SKILLS = Object.freeze([
  { id: "valuable_cargo", name: "Ценный груз", description: "Открывает дорогие заказы с электроникой и ювелирными изделиями.", cost: 2, minRank: 2, prerequisite: null },
  { id: "quick_loading", name: "Слаженная погрузка", description: "Сокращает погрузку и разгрузку на 20%.", cost: 1, minRank: 3, prerequisite: null },
  { id: "fuel_planning", name: "Топливное планирование", description: "Добавляет премию за экономичный расход топлива.", cost: 2, minRank: 3, prerequisite: null },
  { id: "fragile_cargo", name: "Хрупкий груз", description: "Открывает хрупкие грузы с повышенной оплатой и штрафом за повреждения.", cost: 3, minRank: 4, prerequisite: "valuable_cargo" },
  { id: "long_haul", name: "Дальняя дистанция", description: "Открывает междугородние магистральные маршруты.", cost: 3, minRank: 5, prerequisite: null },
  { id: "hazmat", name: "Опасные материалы", description: "Открывает топливо и химикаты. Требует CDL A.", cost: 4, minRank: 6, prerequisite: "long_haul" },
  { id: "cold_chain", name: "Холодовая цепь", description: "Открывает скоропортящиеся грузы с бонусом за раннюю доставку.", cost: 3, minRank: 7, prerequisite: "fragile_cargo" },
  { id: "priority_dispatch", name: "Приоритет диспетчера", description: "Даёт 8% к базовой оплате доступных заказов.", cost: 4, minRank: 8, prerequisite: "long_haul" },
  { id: "master_logistics", name: "Мастер логистики", description: "Открывает самые дорогие специальные контракты.", cost: 5, minRank: 10, prerequisite: "hazmat" },
]);

const VEHICLES = Object.freeze([
  { id: "bison", name: "Bravado Bison", model: "bison", type: "pickup", rentPrice: 450, maxWeightKg: 900, minRank: 1, license: "cdl_b", fuel: 85, fuelMax: 85, fuelConsumption: 1.15 },
  { id: "bobcatxl", name: "Vapid Bobcat XL", model: "bobcatxl", type: "pickup", rentPrice: 700, maxWeightKg: 1300, minRank: 3, license: "cdl_b", fuel: 90, fuelMax: 90, fuelConsumption: 1.2 },
  { id: "speedo", name: "Vapid Speedo", model: "speedo", type: "van", rentPrice: 950, maxWeightKg: 2800, minRank: 4, license: "cdl_b", fuel: 100, fuelMax: 100, fuelConsumption: 1.3 },
  { id: "boxville", name: "Brute Boxville", model: "boxville2", type: "van", rentPrice: 1400, maxWeightKg: 4500, minRank: 5, license: "cdl_b", fuel: 120, fuelMax: 120, fuelConsumption: 1.55 },
  { id: "mule", name: "Maibatsu Mule", model: "mule", type: "van", rentPrice: 1900, maxWeightKg: 6500, minRank: 6, license: "cdl_b", fuel: 140, fuelMax: 140, fuelConsumption: 1.7 },
  { id: "phantom", name: "JoBuilt Phantom + прицеп", model: "phantom", trailerModel: "trailers", type: "truck", rentPrice: 3200, maxWeightKg: 18000, minRank: 7, license: "cdl_a", fuel: 260, fuelMax: 260, fuelConsumption: 2.5 },
  { id: "phantom_box", name: "JoBuilt Phantom + закрытый прицеп", model: "phantom", trailerModel: "trailers4", type: "truck", rentPrice: 3600, maxWeightKg: 18000, minRank: 7, license: "cdl_a", fuel: 260, fuelMax: 260, fuelConsumption: 2.55 },
  { id: "phantom_fuel", name: "JoBuilt Phantom + топливная цистерна", model: "phantom", trailerModel: "tanker", type: "truck", rentPrice: 3800, maxWeightKg: 18000, minRank: 8, license: "cdl_a", fuel: 260, fuelMax: 260, fuelConsumption: 2.6 },
  { id: "phantom_tanker", name: "JoBuilt Phantom + цистерна", model: "phantom", trailerModel: "tanker2", type: "truck", rentPrice: 3900, maxWeightKg: 18000, minRank: 8, license: "cdl_a", fuel: 260, fuelMax: 260, fuelConsumption: 2.6 },
  { id: "hauler", name: "JoBuilt Hauler + прицеп", model: "hauler", trailerModel: "trailers2", type: "truck", rentPrice: 4300, maxWeightKg: 24000, minRank: 8, license: "cdl_a", fuel: 300, fuelMax: 300, fuelConsumption: 2.7 },
  { id: "hauler_carrier", name: "JoBuilt Hauler + автовоз", model: "hauler", trailerModel: "tr4", type: "truck", rentPrice: 5200, maxWeightKg: 24000, minRank: 9, license: "cdl_a", fuel: 300, fuelMax: 300, fuelConsumption: 2.8 },
  { id: "phantom3", name: "JoBuilt Phantom Custom + прицеп", model: "phantom3", trailerModel: "trailers3", type: "truck", rentPrice: 6000, maxWeightKg: 30000, minRank: 10, license: "cdl_a", fuel: 340, fuelMax: 340, fuelConsumption: 2.9 },
]);

module.exports = Object.freeze({
  npc: Object.freeze({
    id: "trucker_dispatcher",
    name: "Виктор Хейл",
    profession: "Диспетчер Cross-State Logistics",
    model: "s_m_m_trucker_01",
    position: new mp.Vector3(1010.4826049804688, -2288.781982421875, 30.50954818725586),
    heading: 174.80410766601562,
    colshapeRadius: 4.2,
    scenario: "WORLD_HUMAN_CLIPBOARD",
  }),
  blip: Object.freeze({ sprite: 477, color: 5, scale: 0.9, name: "Дальнобой — Cross-State Logistics", shortRange: true }),
  vehicleSpawn: position(1010.75, -2292.85, 30.51, 84),
  trailerSpawn: position(997.2, -2293.3, 30.51, 84),
  refreshMs: 5 * 60 * 1000,
  orderCount: 20,
  offerTtlMs: 5 * 60 * 1000 + 30000,
  rentalDurationMs: 90 * 60 * 1000,
  rentalOrderLimit: 5,
  cancellation: Object.freeze({
    beforePickupRate: 0.10,
    afterLoadingRate: 0.25,
    beforePickupMinimum: 500,
    afterLoadingMinimum: 1000,
  }),
  economy: Object.freeze({
    weightRanges: Object.freeze({ pickup: [250, 1300], van: [900, 6500], truck: [7000, 30000] }),
    payPerKm: Object.freeze({ pickup: 150, van: 195, truck: 285 }),
    averageSpeed: Object.freeze({ pickup: 17, van: 16, truck: 14 }),
    cargoMultiplier: Object.freeze({ standard: 1, valuable: 1.45, fragile: 1.35, perishable: 1.4, hazmat: 1.65 }),
    earlyBonusMax: 0.15,
    latePenaltyMax: 0.5,
    priorityBonus: 0.08,
    fuelBonusMax: 0.08,
    skillPointsPerRank: 2,
  }),
  interaction: Object.freeze({ pickupRadius: 2.0, otherRadius: 5.0, pickupHeadingTolerance: 12, otherHeadingTolerance: 40, maxSpeed: 0.8, stableMs: 1000 }),
  loading: Object.freeze({ baseMs: 9000, truckMs: 15000, minimumMs: 5000, spoilOnCancel: 12 }),
  unloading: Object.freeze({ baseMs: 8000, truckMs: 13000, minimumMs: 4500, spoilOnCancel: 15 }),
  cdl: Object.freeze({ b: Object.freeze({ id: "cdl_b", price: 7500 }), a: Object.freeze({ id: "cdl_a", price: 22500 }) }),
  ranks: RANKS,
  skills: SKILLS,
  vehicles: VEHICLES,
  // All 1,279 ground routes from the supplied legacy server file. Only the
  // route data was carried over; gameplay, validation and economy are new.
  orderTemplates: Object.freeze(ORDER_TEMPLATES),
});
