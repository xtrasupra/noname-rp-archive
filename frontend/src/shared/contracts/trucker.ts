export type TruckerVehicleType = 'pickup' | 'van' | 'truck'
export type TruckerCargoKind = 'standard' | 'valuable' | 'fragile' | 'perishable' | 'hazmat'

export interface TruckerPosition {
  x: number
  y: number
  z: number
  heading: number
}

export interface TruckerEligibility {
  passport: boolean
  cdlB: boolean
  cdlA: boolean
  canWork: boolean
  reasons?: string[]
}

export interface TruckerProfile {
  xp: number
  rank: number
  rankName: string
  nextRankXp: number | null
  skillPoints: number
  skillProgress: number
  completedOrders: number
  failedOrders: number
  cancellationDebt: number
  onTimeOrders: number
  lateOrders: number
  totalEarned: number
  totalDistanceM: number
  totalFuelUsed: number
}

export interface TruckerRank {
  rank: number
  name: string
  xp: number
}

export interface TruckerSkill {
  id: string
  name: string
  description: string
  cost: number
  minRank: number
  prerequisite: string | null
  unlocked: boolean
  canUnlock: boolean
}

export interface TruckerVehicle {
  id: string
  name: string
  model: string
  trailerModel?: string
  type: TruckerVehicleType
  rentPrice: number
  maxWeightKg: number
  minRank: number
  license: 'cdl_b' | 'cdl_a'
  available: boolean
  disabledReasons: string[]
}

export interface TruckerCurrentVehicle {
  id: string
  name: string
  type: TruckerVehicleType
  maxWeightKg: number
  trailerAttached: boolean
  leaseExpiresAt: number
  ordersRemaining: number
}

export interface TruckerRentalPayload {
  vehicles: TruckerVehicle[]
  currentVehicle: TruckerCurrentVehicle | null
  durationMinutes: number
  orderLimit: number
}

export interface TruckerOrder {
  orderId: string
  refreshBucket: number
  cargo: string
  company: string
  cargoKind: TruckerCargoKind
  vehicleType: TruckerVehicleType
  requiredLicense: 'cdl_b' | 'cdl_a'
  requiredRank: number
  requiredSkill: string | null
  trailerModel: string | null
  trailerLivery: number | null
  trailerColors: [number, number] | null
  weightKg: number
  origin: TruckerPosition
  destination: TruckerPosition
  routeDistanceM: number
  timeLimitSeconds: number
  basePay: number
  expiresAt: string | number
  status: string
  distanceToPickupM: number
  canAccept: boolean
  disabledReasons: string[]
}

export interface TruckerActiveOrder {
  orderId: string
  cargo: string
  company: string
  weightKg: number
  stage: 'to_pickup' | 'loading' | 'to_dropoff' | 'unloading'
  deadlineAt: number
  cargoValidity: number
  distanceToTargetM: number
  cancelFee: number
}

export interface TruckerTabletPayload {
  available: true
  revision: number
  serverNow: number
  refreshIntervalMs: number
  nextRefreshAt: number
  eligibility: TruckerEligibility
  profile: TruckerProfile
  ranks: TruckerRank[]
  skills: TruckerSkill[]
  vehicles: TruckerVehicle[]
  currentVehicle: TruckerCurrentVehicle | null
  activeOrder: TruckerActiveOrder | null
  orders: TruckerOrder[]
}

export interface TruckerResultPayload {
  orderId: string
  cargo: string
  company: string
  weightKg: number
  routeDistanceM: number
  actualDistanceM: number
  durationSeconds: number
  earlySeconds: number
  lateSeconds: number
  cargoValidity: number
  fuelUsed: number
  basePay: number
  earlyBonus: number
  skillBonus: number
  damagePenalty: number
  latePenalty: number
  finalPayout: number
  xpEarned: number
  skillProgressEarned: number
  skillPointsEarned: number
  oldRank: number
  newRank: number
}
