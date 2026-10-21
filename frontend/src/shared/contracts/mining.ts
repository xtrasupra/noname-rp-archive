export interface MiningProfile {
  xp: number
  level: number
  levelName: string
  kgMultiplier: number
  stonesMined: number
  kgSold: number
  kgSpilled: number
  haulTrips: number
  totalEarned: number
}

export interface MiningEntitlementState {
  remainingMs: number
  payload?: Record<string, unknown>
}

export interface MiningEquipmentEntry {
  id: string
  name: string
  price: number
  durationMinutes: number
  minLevel: number
  available: boolean
  consumable?: boolean
  reason?: string | null
}

export interface MiningVehicleEntry {
  id: string
  name: string
  model: string
  type: 'van' | 'truck'
  price: number
  minLevel: number
  license: 'cdl_b' | 'cdl_a'
  durationMinutes: number
  current?: boolean
  remainingMs?: number
  expiresInMs?: number
  available: boolean
  reasons: string[]
}

export interface MiningEquipmentPayload {
  profile: MiningProfile
  cash?: number
  active: Record<string, MiningEntitlementState>
  equipment: MiningEquipmentEntry[]
  vehicles: MiningVehicleEntry[]
}

export interface MiningChallengePayload {
  token: string
  rockId: string
  resourceName: string
  hp: number
  maxHp: number
  sequence: string[]
  ttlMs: number
  firstDelayMs: number
  minimumDelayMs: number
  acceleration: number
  tool: 'basic_pickaxe' | 'drill' | 'golden_pickaxe' | string
  index?: number
  correct?: number
  errors?: number
  ackInputId?: string
  lastCorrect?: boolean
  resync?: boolean
}
