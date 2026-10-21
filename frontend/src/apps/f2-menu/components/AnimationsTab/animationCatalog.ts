export type AnimationPose =
  | 'arms-up-wide'
  | 'arms-up'
  | 'salute-one'
  | 'salute-two'
  | 'stand'
  | 'shrug'
  | 'rub-hands'
  | 'waiting'
  | 'situps'
  | 'dig'
  | 'wave'
  | 'look'
  | 'look-ground'
  | 'rest'
  | 'pushup'
  | 'hands-waist'
  | 'phone'
  | 'kneel'
  | 'lean'
  | 'cross-arms'
  | 'point'

export type AnimationCatalogItem = {
  category: string
  id: string
  name: string
  pose: AnimationPose
  shortName: string
}

export const animationCatalog: AnimationCatalogItem[] = [
  { id: 'hands-up-wide', name: 'Поднять руки', shortName: 'Руки', category: 'Действия', pose: 'arms-up-wide' },
  { id: 'hands-up', name: 'Руки вверх', shortName: 'Руки', category: 'Действия', pose: 'arms-up' },
  { id: 'salute-one', name: 'Отдать честь 1', shortName: 'Честь', category: 'Действия', pose: 'salute-one' },
  { id: 'salute-two', name: 'Отдать честь 2', shortName: 'Честь 2', category: 'Действия', pose: 'salute-two' },
  { id: 'marine-stand', name: 'Наталья морская пехота', shortName: 'Стойка', category: 'Действия', pose: 'stand' },
  { id: 'search-player', name: 'Обыскать игрока', shortName: 'Обыск', category: 'Действия', pose: 'stand' },
  { id: 'shrug', name: 'Симплусть', shortName: 'Жест', category: 'Действия', pose: 'shrug' },
  { id: 'rub-hands', name: 'Треть руки', shortName: 'Руки', category: 'Действия', pose: 'rub-hands' },
  { id: 'short-wait', name: 'Немного ожидания', shortName: 'Ждать', category: 'Действия', pose: 'waiting' },
  { id: 'situps', name: 'Упражнение на пресс', shortName: 'Пресс', category: 'Действия', pose: 'situps' },
  { id: 'dig-ground', name: 'Ворочить землю', shortName: 'Земля', category: 'Действия', pose: 'dig' },
  { id: 'wave-hands', name: 'Махать руками', shortName: 'Привет', category: 'Действия', pose: 'wave' },
  { id: 'look', name: 'Осмотреть', shortName: 'Осмотр', category: 'Действия', pose: 'look' },
  { id: 'look-ground', name: 'Осмотреть землю', shortName: 'Земля', category: 'Действия', pose: 'look-ground' },
  { id: 'breathless', name: 'Одышка', shortName: 'Одышка', category: 'Действия', pose: 'rest' },
  { id: 'pushup', name: 'Отжиматься', shortName: 'Отжим.', category: 'Действия', pose: 'pushup' },
  { id: 'calm-stand', name: 'Стоять спокойно', shortName: 'Стоять', category: 'Позы', pose: 'stand' },
  { id: 'hands-waist', name: 'Руки на пояс', shortName: 'Пояс', category: 'Позы', pose: 'hands-waist' },
  { id: 'wait', name: 'Ждать', shortName: 'Ждать', category: 'Позы', pose: 'waiting' },
  { id: 'greeting-phone', name: 'Приветствие', shortName: 'Привет', category: 'Позитивные', pose: 'phone' },
  { id: 'kneel', name: 'Сесть на колено', shortName: 'Колено', category: 'Позы', pose: 'kneel' },
  { id: 'cross-arms', name: 'Скрестить руки', shortName: 'Руки', category: 'Позы', pose: 'cross-arms' },
  { id: 'point', name: 'Указать пальцем', shortName: 'Указать', category: 'Действия', pose: 'point' },
  { id: 'lean', name: 'Наклониться', shortName: 'Наклон', category: 'Позы', pose: 'lean' },
  { id: 'check-pockets', name: 'Проверить карманы', shortName: 'Карманы', category: 'Действия', pose: 'rub-hands' },
  { id: 'bow', name: 'Поклон', shortName: 'Поклон', category: 'Позитивные', pose: 'lean' },
  { id: 'warmup', name: 'Разминка', shortName: 'Разминка', category: 'Действия', pose: 'arms-up' },
  { id: 'pose', name: 'Позировать', shortName: 'Поза', category: 'Эксклюзивные', pose: 'hands-waist' },
  { id: 'look-far', name: 'Смотреть вдаль', shortName: 'Вдаль', category: 'Позы', pose: 'look' },
  { id: 'phone-call', name: 'Звонок', shortName: 'Тел.', category: 'Действия', pose: 'phone' },
  { id: 'sit-ground', name: 'Сесть на землю', shortName: 'Сесть', category: 'Позы', pose: 'situps' },
  { id: 'call-over', name: 'Подозвать', shortName: 'Позвать', category: 'Позитивные', pose: 'wave' },
  { id: 'check-pulse', name: 'Проверить пульс', shortName: 'Пульс', category: 'Действия', pose: 'kneel' },
  { id: 'tired', name: 'Устать', shortName: 'Устал', category: 'Прочие', pose: 'rest' },
  { id: 'combat-stand', name: 'Боевой стойка', shortName: 'Бой', category: 'Прочие', pose: 'stand' },
]
