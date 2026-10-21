import type { HudChatMessage, HudPayload } from '@/shared/contracts/ui'

const battleServerTime = new Date()
const battleExpiredAt = new Date(battleServerTime.getTime() + 15 * 60 * 1000)

const channelTypes = [
  'global',
  'admin',
  'goverment',
  'quest',
  'event',
  'family',
  'news',
  'report',
  'lottery',
  'award',
  'phone',
  'department',
  'loudspeaker',
  'taxi',
  'vip',
  'radio',
  'punishment',
  'server',
  'police',
] as const

const channelMessages: HudChatMessage[] = channelTypes.map(
  (channelType, index) => ({
    id: `channel-${channelType}`,
    author: 'Kent_Nixon [999]',
    text: `Тестовое сообщение канала №${index + 1}`,
    type: 'channel',
    channelType,
  }),
)

const roleplayMessages: HudChatMessage[] = Array.from(
  { length: 31 },
  (_, index) => ({
    id: index + 1,
    author: `[22:10:${String(index % 60).padStart(2, '0')}] Kent_Nixon [999]`,
    text: `Тестовое сообщение чата №${index + 1}`,
    type: (['me', 'ooc', 'try', 'do'] as const)[index % 4],
    isSuccessfully: Math.floor(index / 4) % 2 === 0,
  }),
)

export const hudFixture: HudPayload = {
  visible: true,
  chat: {
    isVisible: true,
    activeChannel: 'IC',
    messages: [...roleplayMessages, ...channelMessages],
  },
  server: {
    online: '1000 / 2000',
    x2: true,

  },
  player: {
    needs: {
      water: 50,
      eat: 50,
      id: 5555,
    },
    finance: {
      cash: 100000,
      bank: 500000,
    },
    gun: {
      ammo: 30,
      totalAmmo: 90,
    },
  },
  microphone: {
    isTalking: false,
  },
  info: {
    temperature: -24,
    weatherLabel: 'Холодно',
    time: '00:00',
    date: '27/07/2026',
    street: 'Альта-стрит',
    zone: 'Альта',
    safeZone: true,
  },
  tasks: {
    isVisible: true,
    items: [
      {
        id: 'task-yellow',
        type: 'yellow',
        title: 'Теперь я водитель',
        description: 'Краткое описание задания',
        progress: {
          steps: 2,
          activeStep: 1,
        },
      },
      {
        id: 'task-red',
        type: 'red',
        title: 'Акция',
        description: 'Отыграй 7 часов чтобы получить Автомобиль',
      },
    ],
  },
  hotkeys: {
    isVisible: true,
    items: [
      { name: 'Телефон', key: 'P' },
      { name: 'Планшет', key: 'G' },
      { name: 'Инвентарь', key: 'I' },
      { name: 'Чат', key: 'T' },
      { name: 'Микрофон', key: 'N' },
      { name: 'Меню персонажа', key: 'M' },
      { name: 'Релог микро', key: 'F6' },
      { name: 'Спрятать худ', key: 'F5' },
      { name: 'Анимации', key: 'Tab' },
    ],
  },
  interaction: {
    key: 'E',
    holdRequired: true,
  },
  deal: {
    nickName: 'Kent Nixon [232 | #111111]',
  },
  greeting: {
    nickname: 'KENT NIXON',
    serverId: 111,
    characterId: 564370,
    duration: 5000,
  },
  battle: {
    attackers: {
      name: 'The Families Gang',
      shortName: 'families',
      dies: 5,
      alive: 12,
      logoSymbol: 'F',
      gangColor: '#f07229',
      timer: {
        serverTime: battleServerTime.toISOString(),
        expiredAt: battleExpiredAt.toISOString(),
      },
    },
    protecting: {
      name: 'The Ballas Gang',
      shortName: 'ballas',
      dies: 5,
      alive: 12,
      logoSymbol: 'B',
      gangColor: '#C455EA',
      timer: {
        serverTime: battleServerTime.toISOString(),
        expiredAt: battleExpiredAt.toISOString(),
      },
    },
  },
}
