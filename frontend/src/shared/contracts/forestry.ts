export interface ForestryProfile {
  xp: number
  level: number
  levelName: string
  yieldMultiplier: number
  treesCut: number
  logsDelivered: number
  logsLost: number
  haulTrips: number
  fastDeliveries: number
  totalEarned: number
  secretSawClaimed: boolean
}

export interface ForestryEntitlementState {
  remainingMs: number
  payload?: Record<string, unknown>
}

export interface ForestryEquipmentEntry {
  id: string
  name: string
  price: number
  durationMinutes: number
  minLevel: number
  available: boolean
  consumable?: boolean
  reason?: string | null
}

export interface ForestryVehicleEntry {
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

export interface ForestryEquipmentPayload {
  profile: ForestryProfile
  cash?: number
  active: Record<string, ForestryEntitlementState>
  equipment: ForestryEquipmentEntry[]
  vehicles: ForestryVehicleEntry[]
  initialTab?: 'equipment' | 'haul'
}

export interface ForestryChallengePayload {
  token: string
  treeId: string
  treeName: string
  round: number
  hits: number
  misses: number
  attempts: number
  hitsRequired: number
  maxAttempts: number
  ttlMs: number
  targetCenter: number
  targetWidth: number
  speed: number
  phase: number
  direction: number
  clientStartDelayMs: number
  accelerated: boolean
  tool: 'chainsaw' | 'golden_axe' | string
  ackInputId?: string
  lastHit?: boolean | null
  resync?: boolean
}
