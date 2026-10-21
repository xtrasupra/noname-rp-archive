"use strict";

const BUSINESS_CONTRACT_VERSION = 5;
const CUSTOMER_RANGE = 4.5;
const APPEARANCE_PREVIEW_SESSION_VERSION = 1;
const APPEARANCE_PREVIEW_DIMENSION_BASE = 70000;
const APPEARANCE_BUSINESS_TYPES = Object.freeze(["clothing", "barber", "tattoo"]);
const APPEARANCE_PREVIEW_STAGE = Object.freeze({
  // Reuse the stable character-creation studio instead of placing cameras at
  // cashier coordinates, where walls, counters and exterior geometry vary.
  position: Object.freeze({ x: 402.8664, y: -996.4108, z: -99.00027 }),
  heading: 180,
});
const MAX_EMPLOYEES = 20;
const MAX_PURCHASE_QUANTITY = 20;
const MAX_SUPPLY_QUANTITY = 5000;
const SUPPLY_DELIVERY_MS = 60 * 60 * 1000;
const BUSINESS_TAX_RATE = 0.001;

const PERMISSIONS = Object.freeze([
  "view_logs",
  "order_stock",
  "manage_balance",
  "manage_employees",
  "manage_products",
  "manage_taxes",
  "toggle_open",
]);

function product(id, name, price, stockKey, extra = {}) {
  return Object.freeze({
    id,
    name,
    price,
    stockKey,
    stockCost: Math.max(1, Math.floor(price * 0.45)),
    ...extra,
  });
}

function pricingProduct(id, name) {
  return product(id, name, 100, "service_units", {
    kind: "pricing",
    description: "Процент от базовой цены.",
  });
}

function fuelStation(id, name, district, position, heading) {
  return {
    id,
    type: "gas",
    name,
    district,
    description: "Автозаправочная станция самообслуживания. Заправка всегда наполняет бак полностью.",
    purchasePrice: 1300000,
    position,
    heading,
    npcModel: "mp_m_shopkeep_01",
    noNpc: true,
    noLabel: true,
    blip: { sprite: 361, color: 1, scale: 0.78, name: "Автозаправочная станция" },
    products: [
      product("petrol_95", "Бензин Премиум-95", 4, "petrol_95", { category: "Топливо", kind: "fuel", description: "Премиальный неэтилированный бензин. Цена указана за литр." }),
      product("water", "Вода", 35, "water", { category: "Товары в дорогу", kind: "item", amount: 1, description: "Холодная бутилированная вода." }),
      product("burger", "Бургер", 55, "burger", { category: "Товары в дорогу", kind: "item", amount: 1, description: "Быстрый перекус для долгой поездки." }),
      product("bandage", "Бинт", 120, "bandage", { category: "Товары в дорогу", kind: "item", amount: 1, description: "Компактное средство первой помощи." }),
      product("medkit", "Аптечка", 450, "medkit", { category: "Товары в дорогу", kind: "item", amount: 1, description: "Набор экстренной медицинской помощи." }),
    ],
    initialStock: { petrol_95: 5000, water: 120, burger: 80, bandage: 60, medkit: 30 },
  };
}

const BUSINESSES = Object.freeze([
  {
    id: "gunstore_vespucci",
    type: "gunstore",
    name: "Оружейный магазин Веспуччи",
    district: "Веспуччи",
    description: "Лицензионное оружие, боеприпасы и защитное снаряжение.",
    purchasePrice: 2200000,
    position: { x: -662.18, y: -935.21, z: 21.83 },
    heading: 181,
    npcModel: "s_m_y_ammucity_01",
    blip: { sprite: 110, color: 1, scale: 0.78, name: "Оружейный магазин" },
    products: [
      product("pistol", "Пистолет", 6500, "pistol", { category: "Оружие", kind: "item", amount: 1, description: "Гражданский полуавтоматический пистолет." }),
      product("ammo_9mm", "Патроны 9 мм", 180, "ammo_9mm", { category: "Боеприпасы", kind: "item", amount: 20, description: "Коробка из 20 пистолетных патронов." }),
      product("armor", "Бронежилет", 2400, "armor", { category: "Защита", kind: "item", amount: 1, description: "Средство индивидуальной защиты." }),
    ],
    initialStock: { pistol: 30, ammo_9mm: 250, armor: 40 },
  },
  {
    id: "grocery_strawberry",
    type: "grocery",
    name: "24/7 Строберри",
    district: "Строберри",
    description: "Еда, напитки и средства первой помощи на каждый день.",
    purchasePrice: 650000,
    position: { x: 25.74, y: -1347.27, z: 29.5 },
    heading: 271,
    npcModel: "mp_m_shopkeep_01",
    blip: { sprite: 52, color: 2, scale: 0.78, name: "Магазин 24/7" },
    products: [
      product("water", "Вода", 35, "water", { category: "Напитки", kind: "item", amount: 1, description: "Утоляет жажду." }),
      product("burger", "Бургер", 55, "burger", { category: "Еда", kind: "item", amount: 1, description: "Утоляет голод." }),
      product("bandage", "Бинт", 120, "bandage", { category: "Медицина", kind: "item", amount: 1, description: "Базовое средство первой помощи." }),
      product("medkit", "Аптечка", 450, "medkit", { category: "Медицина", kind: "item", amount: 1, description: "Набор экстренной медицинской помощи." }),
    ],
    initialStock: { water: 250, burger: 250, bandage: 100, medkit: 50 },
  },
  {
    id: "barber_hawick",
    type: "barber",
    name: "Парикмахерская Хавик",
    district: "Хавик",
    description: "Стрижки и профессиональная укладка волос.",
    purchasePrice: 900000,
    position: { x: -814.31, y: -183.82, z: 37.57 },
    heading: 118,
    npcModel: "s_f_m_fembarber",
    blip: { sprite: 71, color: 27, scale: 0.78, name: "Парикмахерская" },
    products: [
      product("hair_classic", "Классическая стрижка", 250, "service_units", { category: "Стрижки", kind: "hair", description: "Классическая короткая стрижка.", appearance: { hairId: 1, color1: 0, color2: 0 }, preview: { type: "hair", hairId: 1, color1: 0, color2: 0 } }),
      product("hair_side", "Боковой пробор", 350, "service_units", { category: "Стрижки", kind: "hair", description: "Аккуратная стрижка с боковым пробором.", appearance: { hairId: 4, color1: 2, color2: 2 }, preview: { type: "hair", hairId: 4, color1: 2, color2: 2 } }),
      product("hair_fade", "Фейд", 450, "service_units", { category: "Стрижки", kind: "hair", description: "Современная стрижка с плавным переходом.", appearance: { hairId: 5, color1: 1, color2: 1 }, preview: { type: "hair", hairId: 5, color1: 1, color2: 1 } }),
    ],
    initialStock: { service_units: 300 },
  },
  {
    id: "tattoo_vespucci",
    type: "tattoo",
    name: "Тату-салон Веспуччи",
    district: "Веспуччи",
    description: "Постоянные татуировки от лицензированных мастеров.",
    purchasePrice: 1100000,
    position: { x: -1153.59, y: -1425.58, z: 4.95 },
    heading: 125,
    npcModel: "u_m_y_tattoo_01",
    blip: { sprite: 75, color: 1, scale: 0.78, name: "Тату-салон" },
    products: [
      product("tattoo_beach_head", "Пляжная татуировка на голову", 800, "service_units", {
        category: "Голова",
        kind: "tattoo",
        description: "Постоянная татуировка на голову из пляжной коллекции.",
        decoration: { collection: "mpbeach_overlays", overlay: "fm_hair_fuzz" },
        preview: { type: "tattoo", focus: "full", collection: "mpbeach_overlays", overlay: "fm_hair_fuzz" },
      }),
    ],
    initialStock: { service_units: 200 },
  },
  {
    id: "clothing_ponsonbys",
    type: "clothing",
    name: "Понсонбис Бертон",
    district: "Бертон",
    description: "Одежда, обувь и аксессуары для повседневной городской жизни.",
    purchasePrice: 1400000,
    position: { x: -163.15, y: -302.04, z: 39.73 },
    heading: 249,
    npcModel: "s_f_y_shop_mid",
    blip: { sprite: 73, color: 47, scale: 0.78, name: "Магазин одежды" },
    products: [
      product("tshirt_black", "Чёрная футболка", 150, "tshirt_black", { category: "Нательная одежда", kind: "item", amount: 1, description: "Простая чёрная футболка.", preview: { type: "component", component: 8, drawable: 15, texture: 0, palette: 0 } }),
      product("hoodie_black", "Чёрное худи", 450, "hoodie_black", { category: "Верхняя одежда", kind: "item", amount: 1, description: "Тёплое чёрное худи в уличном стиле.", preview: { type: "component", component: 11, drawable: 7, texture: 0, palette: 0 } }),
      product("jeans_blue", "Синие джинсы", 300, "jeans_blue", { category: "Брюки", kind: "item", amount: 1, description: "Классические синие джинсы.", preview: { type: "component", component: 4, drawable: 1, texture: 0, palette: 0 } }),
      product("sneakers_white", "Белые кроссовки", 300, "sneakers_white", { category: "Обувь", kind: "item", amount: 1, description: "Чистые белые кроссовки на каждый день.", preview: { type: "component", component: 6, drawable: 5, texture: 0 } }),
      product("cap_black", "Чёрная кепка", 120, "cap_black", { category: "Головные уборы", kind: "item", amount: 1, description: "Простая чёрная бейсболка.", preview: { type: "prop", prop: 0, drawable: 10, texture: 0 } }),
      product("glasses_black", "Чёрные очки", 180, "glasses_black", { category: "Очки", kind: "item", amount: 1, description: "Тёмные повседневные очки.", preview: { type: "prop", prop: 1, drawable: 5, texture: 0 } }),
    ],
    initialStock: { tshirt_black: 80, hoodie_black: 80, jeans_blue: 80, sneakers_white: 80, cap_black: 80, glasses_black: 80 },
  },
  {
    id: "lsc_burton",
    type: "lsc",
    name: "Автомастерская Бертон",
    district: "Бертон",
    description: "Ремонт, внешний тюнинг и улучшение характеристик автомобиля.",
    purchasePrice: 2500000,
    position: { x: -337.82, y: -136.53, z: 38.21 },
    heading: 70,
    npcModel: "s_m_m_autoshop_01",
    external: true,
    blip: { sprite: 72, color: 4, scale: 0.78, name: "Автомастерская" },
    products: [
      pricingProduct("lsc_repair", "Наценка на ремонт"),
      pricingProduct("lsc_engine", "Наценка на двигатель"),
      pricingProduct("lsc_transmission", "Наценка на трансмиссию"),
      pricingProduct("lsc_brakes", "Наценка на тормоза"),
      pricingProduct("lsc_suspension", "Наценка на подвеску"),
      pricingProduct("lsc_armor", "Наценка на броню"),
      pricingProduct("lsc_turbo", "Наценка на турбонаддув"),
      pricingProduct("lsc_horn", "Наценка на гудок"),
      pricingProduct("lsc_tint", "Наценка на тонировку"),
      pricingProduct("lsc_lights", "Наценка на свет"),
      pricingProduct("lsc_neon", "Наценка на неон"),
      pricingProduct("lsc_plate", "Наценка на номер"),
      pricingProduct("lsc_paint", "Наценка на покраску"),
      pricingProduct("lsc_rims", "Наценка на диски"),
      pricingProduct("lsc_spoiler", "Наценка на спойлер"),
      pricingProduct("lsc_front_bumper", "Наценка на передний бампер"),
      pricingProduct("lsc_rear_bumper", "Наценка на задний бампер"),
      pricingProduct("lsc_sideskirt", "Наценка на боковые пороги"),
      pricingProduct("lsc_exhaust", "Наценка на выхлоп"),
      pricingProduct("lsc_frame", "Наценка на раму"),
      pricingProduct("lsc_grille", "Наценка на решётку"),
      pricingProduct("lsc_hood", "Наценка на капот"),
      pricingProduct("lsc_roof", "Наценка на крышу"),
      pricingProduct("lsc_livery", "Наценка на ливрею"),
    ],
    initialStock: { service_units: 1000 },
    supplyCosts: { service_units: 120 },
  },
  fuelStation(
    "gas_strawberry",
    "АЗС Строберри",
    "Строберри",
    { x: 265.65, y: -1261.31, z: 29.29 },
    90
  ),
  fuelStation(
    "gas_route68",
    "АЗС Трасса 68",
    "Трасса 68",
    { x: 49.42, y: 2778.79, z: 58.04 },
    145
  ),
  {
    id: "hunting_jeremy",
    type: "hunting",
    name: "Охотничьи товары Джереми",
    district: "Лес Палето",
    description: "Специализированное охотничье и полевое снаряжение.",
    purchasePrice: 1750000,
    position: { x: -674.157, y: 5838.05, z: 17.34 },
    heading: 135,
    npcModel: "s_m_m_hairdress_01",
    external: true,
    blip: { sprite: 442, color: 2, scale: 0.78, name: "Охотничьи товары" },
    products: [pricingProduct("hunting_markup", "Наценка магазина охоты")],
    initialStock: { service_units: 2500 },
    supplyCosts: { service_units: 20 },
  },
  {
    id: "fishing_noah",
    type: "fishing",
    name: "Рыболовные товары Ноа",
    district: "Пирс Дель-Перро",
    description: "Рыболовные снасти, наживка и специализированное снаряжение.",
    purchasePrice: 1500000,
    position: { x: -1818.9, y: -1216.42, z: 13.02 },
    heading: 139,
    npcModel: "s_m_y_dockwork_01",
    external: true,
    blip: { sprite: 68, color: 3, scale: 0.78, name: "Рыболовные товары" },
    products: [pricingProduct("fishing_markup", "Наценка магазина рыбалки")],
    initialStock: { service_units: 2500 },
    supplyCosts: { service_units: 20 },
  },
]);

const BUSINESS_BY_ID = new Map(BUSINESSES.map((business) => [business.id, business]));

module.exports = {
  BUSINESSES,
  BUSINESS_BY_ID,
  BUSINESS_CONTRACT_VERSION,
  CUSTOMER_RANGE,
  APPEARANCE_PREVIEW_SESSION_VERSION,
  APPEARANCE_PREVIEW_DIMENSION_BASE,
  APPEARANCE_BUSINESS_TYPES,
  APPEARANCE_PREVIEW_STAGE,
  MAX_EMPLOYEES,
  MAX_PURCHASE_QUANTITY,
  MAX_SUPPLY_QUANTITY,
  SUPPLY_DELIVERY_MS,
  BUSINESS_TAX_RATE,
  PERMISSIONS,
};
