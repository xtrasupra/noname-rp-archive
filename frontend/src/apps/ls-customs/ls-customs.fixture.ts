import type { LsCustomsPayload } from '@/shared/contracts/ui'

export const lsCustomsFixture: LsCustomsPayload = {
  sessionId: 'dev-lsc-session',
  vehicle: {
    id: 314,
    model: 'sultanrs',
    name: 'Karin Sultan RS',
    plate: 'TWN 204',
  },
  balance: { cash: 500000, bank: 500000 },
  installed: {
    repair: '__none__',
    engine: 'stock',
    transmission: 'stock',
    brakes: 'stock',
    suspension: 'stock',
    turbo: 'stock',
    spoiler: 'stock',
    front_bumper: 'stock',
    rims: 'stock',
    tint: 'stock',
    lights: 'stock',
    paint: 'primary',
  },
  categories: [
    { id: 'repair', name: 'Ремонт', description: 'Полное восстановление автомобиля', icon: 'repair', options: [{ id: 'full', name: 'Полный ремонт', price: 300, description: 'Кузов и двигатель' }] },
    { id: 'engine', name: 'Двигатель', description: 'Мощность и разгон', icon: 'engine', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 500 },
      { id: 'stage-1', gameModIndex: 0, name: 'Stage 1', price: 1300 },
      { id: 'stage-2', gameModIndex: 1, name: 'Stage 2', price: 2000 },
      { id: 'stage-3', gameModIndex: 2, name: 'Stage 3', price: 4000 },
    ] },
    { id: 'transmission', name: 'Трансмиссия', description: 'Скорость переключения', icon: 'transmission', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 300 },
      { id: 'street', gameModIndex: 0, name: 'Уличная', price: 800 },
      { id: 'sport', gameModIndex: 1, name: 'Спортивная', price: 1500 },
      { id: 'race', gameModIndex: 2, name: 'Гоночная', price: 2500 },
    ] },
    { id: 'brakes', name: 'Тормоза', description: 'Контроль торможения', icon: 'brakes', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 300 },
      { id: 'street', gameModIndex: 0, name: 'Уличные', price: 600 },
      { id: 'sport', gameModIndex: 1, name: 'Спортивные', price: 1200 },
      { id: 'race', gameModIndex: 2, name: 'Гоночные', price: 2000 },
    ] },
    { id: 'suspension', name: 'Подвеска', description: 'Посадка и устойчивость', icon: 'suspension', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 200 },
      { id: 'lowered', gameModIndex: 0, name: 'Заниженная', price: 800 },
      { id: 'street', gameModIndex: 1, name: 'Уличная', price: 1500 },
      { id: 'sport', gameModIndex: 2, name: 'Спортивная', price: 2000 },
    ] },
    { id: 'turbo', name: 'Турбонаддув', description: 'Дополнительная мощность', icon: 'turbo', options: [
      { id: 'stock', gameModIndex: -1, name: 'Без турбо', price: 500 },
      { id: 'turbo-kit', gameModIndex: 0, name: 'Турбо-кит', price: 10000 },
    ] },
    { id: 'spoiler', name: 'Спойлер', description: 'Внешний вид кузова', icon: 'body', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 1200 },
      { id: 'variant-1', gameModIndex: 0, name: 'Вариант 1', price: 1800 },
      { id: 'variant-2', gameModIndex: 1, name: 'Вариант 2', price: 1800 },
      { id: 'variant-3', gameModIndex: 2, name: 'Вариант 3', price: 1800 },
    ] },
    { id: 'front_bumper', name: 'Передний бампер', description: 'Детали передней части', icon: 'body', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 3000 },
      { id: 'variant-1', gameModIndex: 0, name: 'Вариант 1', price: 3500 },
      { id: 'variant-2', gameModIndex: 1, name: 'Вариант 2', price: 3500 },
    ] },
    { id: 'rims', name: 'Диски', description: 'Стиль колёс', icon: 'wheels', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 4500 },
      { id: 'variant-1', gameModIndex: 0, name: 'Вариант 1', price: 4500 },
      { id: 'variant-2', gameModIndex: 1, name: 'Вариант 2', price: 4500 },
      { id: 'variant-3', gameModIndex: 2, name: 'Вариант 3', price: 4500 },
    ] },
    { id: 'tint', name: 'Тонировка', description: 'Затемнение стёкол', icon: 'tint', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 200 },
      { id: 'pure-black', gameModIndex: 0, name: 'Pure Black', price: 800 },
      { id: 'dark-smoke', gameModIndex: 1, name: 'Dark Smoke', price: 500 },
      { id: 'limo', gameModIndex: 3, name: 'Limo', price: 450 },
    ] },
    { id: 'lights', name: 'Фары', description: 'Цвет ксенона', icon: 'lights', options: [
      { id: 'stock', gameModIndex: -1, name: 'Стандарт', price: 1500 },
      { id: 'white', gameModIndex: 0, name: 'Белые', price: 1800 },
      { id: 'blue', gameModIndex: 1, name: 'Голубые', price: 1800 },
      { id: 'pink', gameModIndex: 9, name: 'Розовые', price: 1800 },
    ] },
    { id: 'paint', name: 'Покраска', description: 'Цвет и тип покрытия', icon: 'paint', supportsColor: true, options: [
      { id: 'primary', name: 'Основной цвет', price: 3000 },
      { id: 'secondary', name: 'Дополнительный цвет', price: 2500 },
    ] },
  ],
}