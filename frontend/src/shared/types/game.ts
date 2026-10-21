export interface PlayerState {
  id: number | null
  name: string
  ping: number
  locale: string
  authenticated: boolean
  adminLevel: number
}

export interface CharacterState {
  id: number | null
  name: string
  level: number
  cash: number
  bank: number
  job: string
  health: number
  armor: number
  organizations: CharacterOrganization[]
}

export type CharacterOrganizationType = 'family' | 'faction' | 'gang' | 'mafia' | 'government' | 'business' | (string & {})
export type CharacterOrganizationAppKind = 'family' | 'faction' | (string & {})

export interface CharacterOrganization {
  id: string
  appId?: string
  appKind?: CharacterOrganizationAppKind
  name: string
  type: CharacterOrganizationType
  color?: string
  accentColor?: string
  tabColor?: string
  members?: CharacterOrganizationMember[]
  storageLogs?: CharacterOrganizationStorageLog[]
  balance?: number
  balanceLogs?: CharacterOrganizationBalanceLog[]
  bonusLogs?: CharacterOrganizationBonusLog[]
  territories?: CharacterOrganizationTerritoryState
  blacklist?: CharacterOrganizationBlacklistState
  info?: CharacterOrganizationInfo
  upgrades?: CharacterOrganizationUpgradeState
  settings?: CharacterOrganizationSettings
}

export interface CharacterOrganizationUpgradeState {
  isLeader: boolean
  points: number
  reputation: number
  direction: string
  categories: CharacterOrganizationUpgradeCategory[]
}

export interface CharacterOrganizationUpgradeCategory {
  id: string
  title: string
  angle: number
  upgrades: CharacterOrganizationUpgrade[]
}

export interface CharacterOrganizationUpgrade {
  id: string
  name: string
  description: string
  benefits: string[]
  unlocked: boolean
}

export interface CharacterOrganizationInfo {
  isCreator: boolean
  rank: number
  playerName: string
  rankName: string
  logo?: string
  label: string
  subtitle: string
  level: number
  levelProgress: number
  levelTarget: number
  reputation: number
  balance: number
  donations: number
  memberSlotsUsed: number
  memberSlotsTotal: number
  garageSlotsUsed: number
  garageSlotsTotal: number
  bills: CharacterOrganizationBill[]
}

export interface CharacterOrganizationBill {
  id: string | number
  title: string
  paidUntil: string
  daysLeft: number
  dailyPrice: number
  notice: string
}

export interface CharacterOrganizationBlacklistState {
  entries: CharacterOrganizationBlacklistEntry[]
  history: CharacterOrganizationBlacklistEntry[]
  candidates: CharacterOrganizationBlacklistCandidate[]
}

export interface CharacterOrganizationBlacklistEntry {
  id: string | number
  playerName: string
  playerUid: number
  issuerName: string
  issuerUid: number
  comment: string
  dateTime: string
}

export interface CharacterOrganizationBlacklistCandidate {
  id: string | number
  name: string
  uid: number
}

export interface CharacterOrganizationTerritoryState {
  controlPercent: number
  controlled: number
  total: number
  attacksAvailable: number
  attacksTotal: number
  defensesAvailable: number
  defensesTotal: number
  businesses: CharacterOrganizationTerritory[]
  captureSchedule: CharacterOrganizationCaptureSchedule[]
}

export interface CharacterOrganizationTerritory {
  id: number
  x: number
  y: number
  businessCount: number
  ownerName: string
  ownerColor: string
  striped?: boolean
  active?: boolean
}

export interface CharacterOrganizationCaptureSchedule {
  day: string
  times: string[]
}

export interface CharacterOrganizationSettings {
  ranks: CharacterOrganizationRank[]
  rolePermissions: CharacterOrganizationPermission[]
  itemAccess: CharacterOrganizationPermission[]
  vehicleAccess: CharacterOrganizationPermission[]
  realEstate: CharacterOrganizationRealEstateAsset[]
  vehicles: CharacterOrganizationVehicleAsset[]
}

export interface CharacterOrganizationRealEstateAsset {
  id: string | number
  title: string
  image?: string
  features: Array<{
    label: string
    value: string
  }>
}

export interface CharacterOrganizationVehicleAsset {
  id: string | number
  name: string
  className: string
  fuelType: string
  owner?: string
  image?: string
  incomePercent: number
  rankAccess: number
  canReturn: boolean
}

export interface CharacterOrganizationRank {
  id: string | number
  rank: string | number
  name: string
}

export interface CharacterOrganizationPermission {
  id: string
  label: string
  enabledRanks: Array<string | number>
}

export interface CharacterOrganizationMember {
  id: number
  name: string
  uid: number
  role: string
  rank: string | number
  todayOnline: string
  monthOnline: string
  lastSeen: string
  online: boolean
  invitedBy?: string
  warnCount?: number
  history?: CharacterOrganizationMemberHistory[]
}

export interface CharacterOrganizationMemberHistory {
  id: string | number
  leader: string
  uid: number
  rank: string | number
  action: string
  comment?: string
  dateTime: string
}

export interface CharacterOrganizationStorageLog {
  id: string | number
  name: string
  uid: number
  rank: string | number
  action: string
  amount: number
  itemName: string
  dateTime: string
}

export interface CharacterOrganizationBalanceLog {
  id: string | number
  name?: string
  uid?: number
  rank?: string | number
  transactionType: string
  comment?: string
  amount: number
  dateTime: string
}

export interface CharacterOrganizationBonusLog {
  id: string | number
  issuerName: string
  issuerUid: number
  issuerRank: string | number
  recipientName: string
  recipientUid: number
  recipientRank: string | number
  comment: string
  amount: number
  dateTime: string
}

export interface VehicleState {
  id: number | null
  model: string
  plate: string
  speed: number
  maxSpeed: number
  mileage: number
  fuel: number
  fuelMax: number
  engineHealth: number
  inVehicle: boolean
  doorsLocked: boolean
  engineOn: boolean
  seatbeltOn: boolean
  lightsOn: boolean
  gear?: number | 'R' | 'N' | 'D'
}
