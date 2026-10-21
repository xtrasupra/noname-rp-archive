"use strict";

const POINTS = [
  {
    position: { x: -337.82, y: -136.53, z: 38.21 },
    approach: { x: -365.43, y: -131.74, z: 38.68 },
    camera: { x: -338.529, y: -143.28, z: 40.146 },
    lookAt: { x: -338.348, y: -122.966, z: 38.335 },
    heading: 250,
    dimension: 0,
  },
];

const MOD_CATEGORIES = [
  { id: "repair", name: "Ремонт", description: "Полное восстановление автомобиля", icon: "repair", options: [{ id: "full", name: "Полный ремонт", price: 300, description: "Кузов и двигатель" }] },
  { id: "engine", name: "Двигатель", description: "Мощность и разгон", icon: "engine", modType: 11, multiplier: 3, options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 500 }, { id: "stage-1", name: "Stage 1", gameModIndex: 0, price: 1300 },
    { id: "stage-2", name: "Stage 2", gameModIndex: 1, price: 2000 }, { id: "stage-3", name: "Stage 3", gameModIndex: 2, price: 4000 },
    { id: "stage-4", name: "Stage 4", gameModIndex: 3, price: 5000 },
  ] },
  { id: "transmission", name: "Трансмиссия", description: "Скорость переключения", icon: "transmission", modType: 13, multiplier: 3, options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 300 }, { id: "street", name: "Уличная", gameModIndex: 0, price: 800 },
    { id: "sport", name: "Спортивная", gameModIndex: 1, price: 1500 }, { id: "race", name: "Гоночная", gameModIndex: 2, price: 2500 },
  ] },
  { id: "brakes", name: "Тормоза", description: "Контроль торможения", icon: "brakes", modType: 12, multiplier: 3, options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 300 }, { id: "street", name: "Уличные", gameModIndex: 0, price: 600 },
    { id: "sport", name: "Спортивные", gameModIndex: 1, price: 1200 }, { id: "race", name: "Гоночные", gameModIndex: 2, price: 2000 },
  ] },
  { id: "suspension", name: "Подвеска", description: "Посадка и устойчивость", icon: "suspension", modType: 15, multiplier: 3, options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 200 }, { id: "lowered", name: "Заниженная", gameModIndex: 0, price: 800 },
    { id: "street", name: "Уличная", gameModIndex: 1, price: 1500 }, { id: "sport", name: "Спортивная", gameModIndex: 2, price: 2000 },
    { id: "race", name: "Гоночная", gameModIndex: 3, price: 2200 },
  ] },
  { id: "armor", name: "Броня", description: "Защита кузова", icon: "body", modType: 16, multiplier: 3, options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 500 }, { id: "armor-20", name: "20%", gameModIndex: 0, price: 1000 },
    { id: "armor-40", name: "40%", gameModIndex: 1, price: 1800 }, { id: "armor-60", name: "60%", gameModIndex: 2, price: 2600 },
    { id: "armor-80", name: "80%", gameModIndex: 3, price: 3400 }, { id: "armor-100", name: "100%", gameModIndex: 4, price: 4500 },
  ] },
  { id: "turbo", name: "Турбонаддув", description: "Дополнительная мощность", icon: "turbo", multiplier: 3, options: [
    { id: "stock", name: "Без турбо", gameModIndex: -1, price: 500 }, { id: "turbo-kit", name: "Турбо-кит", gameModIndex: 0, price: 10000 },
  ] },
  { id: "horn", name: "Клаксон", description: "Звуковой сигнал", icon: "body", modType: 14, dynamic: true, price: 700 },
  { id: "tint", name: "Тонировка", description: "Затемнение стёкол", icon: "tint", options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 200 }, { id: "pure-black", name: "Pure Black", gameModIndex: 0, price: 800 },
    { id: "dark-smoke", name: "Dark Smoke", gameModIndex: 1, price: 500 }, { id: "light-smoke", name: "Light Smoke", gameModIndex: 2, price: 400 },
    { id: "limo", name: "Limo", gameModIndex: 3, price: 450 }, { id: "green", name: "Green", gameModIndex: 4, price: 300 },
  ] },
  { id: "lights", name: "Фары", description: "Цвет ксенона", icon: "lights", multiplier: 0.5, options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 1500 }, { id: "white", name: "Белые", gameModIndex: 0, price: 1500 },
    { id: "blue", name: "Голубые", gameModIndex: 1, price: 1500 }, { id: "cyan", name: "Светло-голубые", gameModIndex: 2, price: 1500 },
    { id: "green", name: "Зелёные", gameModIndex: 3, price: 1500 }, { id: "yellow", name: "Жёлтые", gameModIndex: 6, price: 1500 },
    { id: "red", name: "Красные", gameModIndex: 8, price: 1500 }, { id: "pink", name: "Розовые", gameModIndex: 9, price: 1500 },
    { id: "purple", name: "Фиолетовые", gameModIndex: 10, price: 1500 },
  ] },
  { id: "neon", name: "Неон", description: "Подсветка днища", icon: "lights", supportsColor: true, options: [
    { id: "stock", name: "Без неона", gameModIndex: -1, price: 250 }, { id: "enabled", name: "Установить", gameModIndex: 0, price: 3000 },
  ] },
  { id: "plate", name: "Рамка номера", description: "Стиль номерного знака", icon: "body", options: [
    { id: "stock", name: "Стандарт", gameModIndex: -1, price: 100 }, { id: "yellow-black", name: "Жёлтый на чёрном", gameModIndex: 0, price: 600 },
    { id: "yellow-blue", name: "Жёлтый на синем", gameModIndex: 1, price: 500 }, { id: "blue-white", name: "Синий на белом", gameModIndex: 2, price: 350 },
    { id: "black-white", name: "Чёрный на белом", gameModIndex: 4, price: 500 },
  ] },
  { id: "paint", name: "Покраска", description: "Цвет и тип покрытия", icon: "paint", supportsColor: true, multiplier: 0.5, options: [
    { id: "primary", name: "Основной цвет", price: 3000 }, { id: "secondary", name: "Дополнительный цвет", price: 2500 },
  ] },
  { id: "rims", name: "Диски", description: "Стиль колёс", icon: "wheels", modType: 23, dynamic: true, multiplier: 0.5, price: 4500 },
  { id: "spoiler", name: "Спойлер", description: "Внешний вид кузова", icon: "body", modType: 0, dynamic: true, multiplier: 0.5, price: 1200 },
  { id: "front_bumper", name: "Передний бампер", description: "Детали передней части", icon: "body", modType: 1, dynamic: true, multiplier: 0.5, price: 3000 },
  { id: "rear_bumper", name: "Задний бампер", description: "Детали задней части", icon: "body", modType: 2, dynamic: true, multiplier: 0.5, price: 3000 },
  { id: "sideskirt", name: "Пороги", description: "Боковые элементы", icon: "body", modType: 3, dynamic: true, multiplier: 0.5, price: 800 },
  { id: "exhaust", name: "Выхлоп", description: "Выхлопная система", icon: "body", modType: 4, dynamic: true, multiplier: 0.5, price: 1500 },
  { id: "frame", name: "Каркас", description: "Элементы каркаса", icon: "body", modType: 5, dynamic: true, multiplier: 0.5, price: 1500 },
  { id: "grille", name: "Решётка", description: "Решётка радиатора", icon: "body", modType: 6, dynamic: true, multiplier: 0.5, price: 700 },
  { id: "hood", name: "Капот", description: "Варианты капота", icon: "body", modType: 7, dynamic: true, multiplier: 0.5, price: 3000 },
  { id: "roof", name: "Крыша", description: "Варианты крыши", icon: "body", modType: 10, dynamic: true, multiplier: 0.5, price: 3000 },
  { id: "livery", name: "Ливрея", description: "Винилы и оформление", icon: "paint", modType: 48, dynamic: true, multiplier: 0.5, price: 3000 },
];

module.exports = { POINTS, MOD_CATEGORIES };