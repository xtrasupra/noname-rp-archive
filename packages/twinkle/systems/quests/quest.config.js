"use strict";

const CONTRACT_VERSION = 1;
const NEWCOMER_QUEST_ID = "newcomer_roadmap";
const NEWCOMER_QUEST_VERSION = 1;
const STARTER_VEHICLE_BUDGET = 6000;

const QUEST_EVENT_TYPES = Object.freeze([
  "npc.dialogue_completed",
  "location.entered",
  "world.interaction_completed",
  "inventory.item_received",
  "inventory.item_bought",
  "inventory.item_used",
  "inventory.item_given",
  "license.issued",
  "finance.cash_earned",
  "finance.cash_spent",
  "business.purchase_completed",
  "job.money_earned",
  "vehicle.purchased",
  "vehicle.parked",
  "fishing.fish_caught",
  "fishing.fish_sold",
]);

// Login spawn selection is reserved for guide NPCs. Job locations remain
// roadmap/GPS destinations and must never become character spawn points.
const STARTER_SPAWNS = Object.freeze([
  {
    type: "starter_airport",
    title: "Аэропорт — Jung Lee",
    kind: "npc",
    npcId: "guide_airport",
    position: { x: -1037.75, y: -2737.62, z: 20.17 },
    heading: 327.0,
    dimension: 0,
    icon: "airport",
  },
  {
    type: "starter_cityhall",
    title: "Мэрия — Alex Carter",
    kind: "npc",
    npcId: "guide_cityhall",
    position: { x: -545.42, y: -204.18, z: 38.21 },
    heading: 210.0,
    dimension: 0,
    icon: "documents",
  },
  {
    type: "starter_legion",
    title: "Площадь Легион — Sarah Wilson",
    kind: "npc",
    npcId: "guide_legion",
    position: { x: 203.51, y: -920.74, z: 30.69 },
    heading: 140.0,
    dimension: 0,
    icon: "city",
  },
  {
    type: "starter_clothing",
    title: "Бертон — Olivia Moore",
    kind: "npc",
    npcId: "guide_burton",
    position: { x: -181.25, y: -317.61, z: 39.73 },
    heading: 25.0,
    dimension: 0,
    icon: "clothing",
  },
]);

const POINTS = Object.freeze({
  helperNpc: {
    kind: "npc",
    label: "Jung Lee в аэропорту",
    position: { x: -1037.75, y: -2737.62, z: 20.17 },
    dimension: 0,
  },
  cityHall: {
    kind: "npc",
    label: "Стойка документов в мэрии",
    position: { x: -545.42, y: -204.18, z: 38.21 },
    dimension: 0,
  },
  clothing: {
    kind: "business",
    label: "Понсонбис в Бертоне",
    position: { x: -163.15, y: -302.04, z: 39.73 },
    dimension: 0,
  },
  grocery: {
    kind: "business",
    label: "24/7 Строберри",
    position: { x: 25.74, y: -1347.27, z: 29.5 },
    dimension: 0,
  },
  drivingSchool: {
    kind: "npc",
    label: "Инструктор автошколы",
    position: { x: -838.865, y: -161.244, z: 37.805 },
    dimension: 0,
  },
  delivery: {
    kind: "job",
    label: "Склад службы доставки",
    position: { x: 78.98, y: 111.85, z: 81.17 },
    dimension: 0,
  },
  dealership: {
    kind: "vehicle",
    label: "Стартовый автодилер",
    position: { x: -45.23, y: -1097.39, z: 26.42 },
    dimension: 0,
  },
  garage: {
    kind: "vehicle",
    label: "Личный стартовый гараж",
    position: { x: -38.77, y: -1115.84, z: 26.44 },
    dimension: 0,
  },
});

const STARTER_VEHICLE_DEALERSHIP = Object.freeze({
  npcId: "starter_vehicle_dealer",
  garageNpcId: "starter_garage_clerk",
  range: 6,
  garageId: "starter_garage",
  garageSlots: 1,
  spawn: {
    position: { x: -51.37, y: -1096.16, z: 26.42 },
    heading: 70.0,
    dimension: 0,
  },
  vehicles: Object.freeze([
    {
      id: "blista",
      model: "blista",
      name: "Компактная Blista",
      price: 5500,
      color: 111,
    },
  ]),
});

const NEWCOMER_QUEST = Object.freeze({
  id: NEWCOMER_QUEST_ID,
  version: NEWCOMER_QUEST_VERSION,
  title: "Дорожная карта новичка",
  description: "Освойте основы Twinkle: получите документы, посетите магазины, поработайте, оформите лицензию и купите первый автомобиль.",
  steps: Object.freeze([
    {
      id: "starter_documents",
      title: "Стартовый набор",
      objective: "Поговорите с Jung Lee и получите привязанные к персонажу телефон и ID-карту.",
      target: POINTS.helperNpc,
      condition: { type: "inventory.item_received", subjectId: "starter_pack", target: 1 },
      completionHint: "Подсказка: отправляйтесь в Понсонбис в Бертоне и купите любой предмет одежды.",
      rewards: Object.freeze([
        { key: "chapter_starter_documents", type: "cash", amount: 1000, description: "Глава «Стартовый набор»" },
      ]),
    },
    {
      id: "buy_clothes",
      title: "Новая одежда",
      objective: "Купите любой предмет одежды в Понсонбисе в Бертоне.",
      target: POINTS.clothing,
      condition: { type: "business.purchase_completed", subjectId: "clothing_ponsonbys", target: 1 },
      completionHint: "Подсказка: зайдите в магазин 24/7 Строберри и купите еду или воду.",
      rewards: Object.freeze([
        { key: "chapter_buy_clothes", type: "cash", amount: 500, description: "Глава «Новая одежда»" },
      ]),
    },
    {
      id: "buy_groceries",
      title: "Запасы в дорогу",
      objective: "Купите еду или воду в магазине 24/7 Строберри.",
      target: POINTS.grocery,
      condition: { type: "business.purchase_completed", subjectId: "grocery_strawberry", target: 1 },
      completionHint: "Подсказка: отправляйтесь в автошколу и получите водительскую лицензию категории B.",
      rewards: Object.freeze([
        { key: "chapter_buy_groceries", type: "cash", amount: 500, description: "Глава «Запасы в дорогу»" },
      ]),
    },
    {
      id: "driving_license",
      title: "Водительская лицензия",
      objective: "Получите водительскую лицензию категории B в автошколе или отделе лицензирования.",
      target: POINTS.drivingSchool,
      condition: { type: "license.issued", subjectId: "vehicle_b", target: 1 },
      completionHint: "Подсказка: устройтесь на доставку и заработайте минимум $250 за один или несколько рейсов.",
      rewards: Object.freeze([
        { key: "chapter_driving_license", type: "cash", amount: 1000, description: "Глава «Водительская лицензия»" },
      ]),
    },
    {
      id: "delivery_job",
      title: "Первая легальная работа",
      objective: "Выполните безопасный маршрут доставки и заработайте первые $250.",
      target: POINTS.delivery,
      condition: { type: "job.money_earned", subjectId: "delivery", target: 250, useAmount: true },
      completionHint: "Подсказка: бюджет на транспорт выдан. Купите компактную Blista у стартового автодилера.",
      rewards: Object.freeze([
        {
          key: "starter_vehicle_budget",
          type: "cash",
          amount: STARTER_VEHICLE_BUDGET,
          description: "Бюджет на первый автомобиль",
        },
      ]),
    },
    {
      id: "buy_budget_vehicle",
      title: "Первый автомобиль",
      objective: "Купите доступный стартовый автомобиль у автодилера.",
      target: POINTS.dealership,
      condition: { type: "vehicle.purchased", subjectId: "starter_dealership", target: 1 },
      completionHint: "Подсказка: отвезите купленную машину к стартовому гаражу и припаркуйте её в личный слот.",
      rewards: Object.freeze([
        { key: "chapter_buy_budget_vehicle", type: "cash", amount: 750, description: "Глава «Первый автомобиль»" },
      ]),
    },
    {
      id: "park_budget_vehicle",
      title: "Личный гараж",
      objective: "Припаркуйте купленный стартовый автомобиль в личном гаражном слоте.",
      target: POINTS.garage,
      condition: { type: "vehicle.parked", subjectId: "starter_garage", target: 1, requirePurchasedVehicle: true },
      completionHint: "Все главы дорожной карты пройдены. Награда за финальную главу начислена.",
      rewards: Object.freeze([
        { key: "chapter_park_budget_vehicle", type: "cash", amount: 1500, description: "Глава «Личный гараж»" },
      ]),
    },
  ]),
});

const QUESTS = Object.freeze({
  [NEWCOMER_QUEST_ID]: NEWCOMER_QUEST,
});

module.exports = {
  CONTRACT_VERSION,
  NEWCOMER_QUEST_ID,
  NEWCOMER_QUEST_VERSION,
  QUEST_EVENT_TYPES,
  QUESTS,
  STARTER_SPAWNS,
  STARTER_VEHICLE_BUDGET,
  STARTER_VEHICLE_DEALERSHIP,
};
