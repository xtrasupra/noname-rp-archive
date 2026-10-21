import type { CharacterOrganization, CharacterState } from '@/shared/types/game'
import type { ValidatedBusinessProduct, ValidatedBusinessShopPayload } from './business-shop'
import type { ValidatedFishingShopPayload } from './fishing-shop'
import type { ValidatedHuntingShopPayload } from './hunting-shop'
import type { ValidatedSelectSpawnPayload } from './select-spawn'
import type { TabletMarketplaceState } from './tablet-marketplace'
import type { QuestStateV1 } from './quests'
import type { AutoServicePayload } from './auto-service'
import type { TruckerRentalPayload, TruckerResultPayload, TruckerTabletPayload } from './trucker'
import type { MiningChallengePayload, MiningEquipmentPayload } from './mining'
import type { ForestryChallengePayload, ForestryEquipmentPayload } from './forestry'
import type { ArmoredCollectorTabletPayload } from './armored-collector'

export const interfaceIds = [
  'hud',
  'character',
  'characterSelection',
  'phone',
  'tablet',
  'furnitureEditor',
  'rent-car',
  'truckerRental',
  'auto-service',
  'vehicle-dealership',
  'ls-customs',
  'government-computer',
  'drivingSchool',
  'businessShop',
  'inventory',
  'f2Menu',
  'vehicle',
  'radialMenu',
  'npcDialog',
  'licenseDocument',
  'huntingShop',
  'huntingProcessing',
  'fishingShop',
  'fishingCast',
  'fishingReeling',
  'auth',
  'selectSpawn',
  'characterCustomizer',
  'notifications',
  'truckerResult',
  'miningEquipment',
  'miningChallenge',
  'forestryEquipment',
  'forestryChallenge',
] as const
export const pageInterfaceIds = [
  'character',
  'characterSelection',
  'phone',
  'tablet',
  'rent-car',
  'truckerRental',
  'auto-service',
  'vehicle-dealership',
  'ls-customs',
  'government-computer',
  'drivingSchool',
  'businessShop',
  'furnitureEditor',
  'inventory',
  'f2Menu',
  'huntingShop',
  'huntingProcessing',
  'auth',
  'selectSpawn',
  'characterCustomizer',
  'miningEquipment',
  'forestryEquipment',
] as const

export type InterfaceId = (typeof interfaceIds)[number]
export type PageInterfaceId = (typeof pageInterfaceIds)[number]
export type OverlayInterfaceId = Exclude<InterfaceId, PageInterfaceId>
export type SelectSpawnPayload = ValidatedSelectSpawnPayload
export type SpawnOption = SelectSpawnPayload['options'][number]
export type SpawnOptionType = SpawnOption['type']

export interface TabletPayload {
  activeOrganizationId?: string | number | null
  activeHouseId?: string | number | null
  activeApartmentId?: string | number | null
  character?: Partial<CharacterState>
  houses?: TabletHouse[]
  apartments?: TabletApartment[]
  marketplace?: TabletMarketplaceState
  organization?: CharacterOrganization
  organizations?: CharacterOrganization[]
  businesses?: TabletBusiness[]
  trucker?: TruckerTabletPayload | null
  armoredCollector?: ArmoredCollectorTabletPayload | null
}

export type BusinessProduct = ValidatedBusinessProduct
export type BusinessShopPayload = ValidatedBusinessShopPayload

export interface TabletBusinessEmployee {
  characterUuid: number
  characterName: string
  permissions: string[]
}

export interface TabletBusinessStock {
  stockKey: string
  label: string
  quantity: number
  unitCost: number
}

export interface TabletBusinessActivity {
  id: number
  action?: string
  amount?: number
  total_price?: number
  stock_key?: string
  quantity?: number
  status?: string
  available_at?: string
  created_at?: string
}

export interface TabletBusiness {
  id: string
  name: string
  type: string
  balances: { cash: number; card: number }
  analytics: {
    buyersMonth: number
    revenueDay: number
    revenueWeek: number
    revenueMonth: number
    salesMonth: number
    topProducts: Array<{ id: string; name: string; quantity: number; revenue: number }>
  }
  isOpen: boolean
  isOwner: boolean
  ownerName: string
  purchasePrice: number
  permissions: string[]
  priceEditingEnabled: boolean
  products: Array<{ id: string; kind: string; name: string; basePrice: number; price: number }>
  salePrice?: number | null
  tax: { dailyPrice: number; paidUntil?: string | null }
  stock: TabletBusinessStock[]
  employees: TabletBusinessEmployee[]
  sales: TabletBusinessActivity[]
  supplies: TabletBusinessActivity[]
  ledger: TabletBusinessActivity[]
}

export interface TabletHouseResident {
  id: string | number
  name: string
  static: number
}

export interface TabletHouseFeature {
  label: string
  value: string | number | boolean
}

export type TabletPropertyKind = 'house' | 'apartment'
export type TabletPropertyTab =
  | 'overview'
  | 'interior'
  | 'furniture'
  | 'garage'
  | 'storage'
  | 'access'
  | 'logs'
  | 'settings'
export type TabletPropertyDoorStatus = 'open' | 'closed'
export type TabletPropertySaleStatus = 'owned' | 'forSale'

export interface TabletVector3 {
  x: number
  y: number
  z: number
}

export interface TabletPropertyAction {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
  disabledReason?: string
}

export interface TabletPropertyInterior {
  id: string | number
  title: string
  preview?: string
  price: number
  furnitureLimit: number
  entryPosition?: TabletVector3
  exitPosition?: TabletVector3
  garageEntryPosition?: TabletVector3
  current?: boolean
  available?: boolean
}

export interface TabletPropertyFurnitureItem {
  id: string | number
  title: string
  category: string
  model?: string
  position?: TabletVector3
  rotation?: TabletVector3
  installedBy?: string
  installedAt?: string
  active?: boolean
  price?: number
  image?: string
  installed?: boolean
  room?: string
  canInstall?: boolean
}

export interface TabletPropertyGarageSlot {
  id: string | number
  vehicleName: string
  plate: string
  status: 'stored' | 'outside' | 'blocked' | string
  owner: string
  access: string
  image?: string
  preview?: string
}

export interface TabletPropertyGarage {
  entryPosition?: TabletVector3
  exitPosition?: TabletVector3
  vehicleSpawnPosition?: TabletVector3
  status?: 'active' | 'blocked' | string
}

export interface TabletPropertyStorageItem {
  id: string | number
  title: string
  category: string
  amount: number
  weight: number
}

export interface TabletPropertyAccessEntry {
  id: string | number
  name: string
  static: number
  role: string
  rights: string[]
}

export interface TabletPropertyLogEntry {
  id: string | number
  type: string
  title: string
  actor?: string
  createdAt: string
  details?: string
}

export interface TabletPropertySettings {
  canEnterClosed?: boolean
  canUseStorage?: boolean
  canUseGarage?: boolean
  canInstallFurniture?: boolean
  furnitureInstallCooldown?: number
  furnitureInstallCooldownRemaining?: number
  blockedReason?: string
}

export interface TabletHouse {
  id: string | number
  number: string | number
  title: string
  address: string
  paidUntil: string
  image?: string
  locked: boolean
  propertyType?: TabletPropertyKind
  saleStatus?: TabletPropertySaleStatus
  price?: number
  buildingId?: string | number
  buildingName?: string
  defaultInteriorId?: string | number
  owner?: string
  doorStatus?: TabletPropertyDoorStatus
  currentInteriorId?: string | number
  residentLimit: number
  residents: TabletHouseResident[]
  features: TabletHouseFeature[]
  actions?: TabletPropertyAction[]
  interiors?: TabletPropertyInterior[]
  furniture?: TabletPropertyFurnitureItem[]
  garage?: TabletPropertyGarageSlot[]
  garageInfo?: TabletPropertyGarage
  garageSlotsTotal?: number
  garageSlotsUsed?: number
  storage?: TabletPropertyStorageItem[]
  storageWeight?: number
  storageMaxWeight?: number
  access?: TabletPropertyAccessEntry[]
  logs?: TabletPropertyLogEntry[]
  settings?: TabletPropertySettings
}

export interface TabletApartment extends TabletHouse {}

export interface FurnitureEditorVector3 {
  x: number
  y: number
  z: number
}

export interface FurnitureEditorItem {
  id: string | number
  category: string
  name: string
  image?: string
  price: number
  inRoom: boolean
  model?: string
  objectId?: string | number
  position?: FurnitureEditorVector3
  rotation?: FurnitureEditorVector3
  canBuy?: boolean
  canDelete?: boolean
  canMove?: boolean
}

export interface FurnitureEditorPayload {
  categories?: string[]
  currentCategory?: string
  items?: FurnitureEditorItem[]
  propertyId?: string | number | null
  propertyKind?: TabletPropertyKind
  selectedId?: string | number | null
  title?: string
  visible?: boolean
}

export interface RadialMenuAction {
  id: string
  label: string
  shortLabel?: string
  icon?: string
  description?: string
  disabled?: boolean
  disabledReason?: string
  hidden?: boolean
  closeOnSelect?: boolean
  children?: RadialMenuAction[]
  payload?: unknown
}

export interface RadialMenuGroup {
  id: string
  label: string
  icon?: string
  description?: string
  disabled?: boolean
  disabledReason?: string
  hidden?: boolean
  items: RadialMenuAction[]
}

export type HudTaskType = 'yellow' | 'red'

export interface HudTask {
  id: string | number
  type: HudTaskType
  title: string
  description: string
  image?: string
  hidden?: boolean
  progress?: {
    steps: number
    activeStep: number
  }
}

export interface RadialMenuPayload {
  contractVersion?: number
  activeGroupId?: string
  groups?: RadialMenuGroup[]
  hint?: string
  revision?: number
  target?: {
    id?: number | null
    kind: 'self' | 'player' | 'vehicle'
    label?: string
  }
  title?: string
  view?: 'main' | 'vehicle'
  visible?: boolean
}

export interface LicenseDocumentPayload {
  contractVersion?: number
  documentKind?: 'identity' | 'license' | 'medical' | 'permit'
  id?: string
  title?: string
  type?: string
  category?: string
  variant?: string
  firstName?: string
  lastName?: string
  fullName?: string
  age?: number
  gender?: string
  birthDate?: string
  issuedAt?: string
  expiresAt?: string
  number?: string
  signature?: string
  photo?: string
  ownerStaticId?: string | number
  residence?: string
  maritalStatus?: string
  issuerName?: string
  physicalHealthy?: boolean
  mentalHealthy?: boolean
  notes?: string
  validityDays?: number
}

export type HuntingShopPayload = ValidatedHuntingShopPayload

export interface HuntingProcessingPayload {
  phase: 'choice' | 'ttt'
  carcassId: number
  speciesName?: string
  attemptsUsed?: number
  attemptsMax?: number
  token?: string
  title?: string
  board?: string[]
  pending?: boolean
  closing?: boolean
}

export type FishingShopPayload = ValidatedFishingShopPayload

export interface FishingGearEntry {
  itemId: string
  items: Array<{
    uid: string
    itemId?: string
    id?: string
    name?: string
    durability?: number
    maxDurability?: number
    amount?: number
  }>
}

export interface FishingCastPayload {
  title?: string
  active?: boolean
  level?: number
  pointRange?: number
  preferred?: {
    rodUid?: string
  } | null
  point?: {
    id: string
    name: string
    type?: string
    position?: TabletVector3
  } | null
  gear?: {
    rods?: FishingGearEntry[]
    reels?: FishingGearEntry[]
    lines?: FishingGearEntry[]
    hooks?: FishingGearEntry[]
    baits?: FishingGearEntry[]
    support?: FishingGearEntry[]
    points?: Array<{
      id: string
      name: string
      type?: string
      position?: TabletVector3
    }>
  }
}

export interface FishingReelingPayload {
  phase?: 'waiting' | 'bite' | 'reeling' | 'timing' | 'fail' | 'result'
  token?: string
  pointName?: string
  progress?: number
  tension?: number
  fishPower?: number
  hookWindowMs?: number
  durationMs?: number
  targetStart?: number
  targetEnd?: number
  retryDelayMs?: number
  startedAt?: number
  waitMin?: number
  waitMax?: number
  reason?: string
  closing?: boolean
}

export interface HudTaskStep {
  id: string
  text: string
  completed: boolean
}

export interface HudChatMessage {
  id?: string | number
  text: string
  type?: 'me' | 'ooc' | 'try' | 'do' | 'channel' | (string & {})
  channelType?: string
  isSuccessfully?: boolean
  createdAt?: number | string
  author?: string
  channel?: string
  badge?: string
}

export interface HudAction {
  label?: string
  event?: string
  payload?: unknown
}

export type HudContractAction = HudAction

export interface HudContractModalPayload {
  id?: string | number
  enabled?: boolean
  title: string
  description?: string
  trueAction?: HudContractAction
  falseAction?: HudContractAction
}

export interface HudPayload {
  visible?: boolean
  quests?: QuestStateV1
  contract?: HudContractModalPayload
  chat?: {
    isVisible: boolean
    isActive?: boolean
    messages?: HudChatMessage[]
    maxMessages?: number
    channels?: string[]
    activeChannel?: string
  }
  server?: {
    online?: string
    x2?: boolean
    logo?: string
  }
  player?: {
    needs?: {
      water?: number
      eat?: number
      id?: number
    }
    finance?: {
      cash?: number
      bank?: number
    }
    gun?: {
      isVisible?: boolean
      weaponHash?: number
      weaponName?: string
      ammo?: number
      totalAmmo?: number
    }
  }
  microphone?: {
    isTalking?: boolean
  }
  info?: {
    temperature?: number | string
    weatherLabel?: string
    time?: string
    date?: string
    serverEpochMs?: number
    timeZone?: string
    street?: string
    zone?: string
    safeZone?: boolean
  }

  tasks?: {
    isVisible: boolean
    merge?: boolean
    items: HudTask[]
  }
  hotkeys?: {
    isVisible: boolean
    items: Array<{
      name: string
      key: string
    }>
  }
  interaction?: {
    key: string
    holdRequired: boolean
  }
  deal?: {
    nickName: string
  }
  greeting?: {
    nickname: string
    serverId: number
    characterId: number
    duration: number
  }
  capture?: {
    title: string
    progress: number
  }
  exchange?: {
    id?: string | number
    title: string
    description: string
    accept?: HudAction
    decline?: HudAction
  }
  request?: {
    id?: string | number
    title: string
    description: string
    accept?: HudAction
    decline?: HudAction
  }
  actionCamera?: {
    title: string
    startedAt?: string
    duration?: string
  }
  reward?: {
    enabled?: boolean
    visible?: boolean
    timeLeft: string
    amount: number
  }
  battle?: {
    attackers: {
      name: string
      shortName: string
      dies: number
      alive: number
      logoSymbol: string
      gangColor: string
      timer: {
        serverTime: string
        expiredAt: string
      }
    }
    protecting: {
      name: string
      shortName: string
      dies: number
      alive: number
      logoSymbol: string
      gangColor: string
      timer: {
        serverTime: string
        expiredAt: string
      }
    }
  }
}
export type CharacterSelectionSlotState =
  'empty' | 'locked' | 'notPurchased' | 'character'
export type CharacterSelectionRole =
  'leader' | 'player' | 'administrator' | (string & {})

export interface CharacterSelectionCharacter {
  id: number
  firstName: string
  lastName: string
  cash: number
  bank: number
  role: CharacterSelectionRole
  level?: number
  organization?: string | null
  lastOnline?: string
  totalOnlineTime?: number
  name?: string
}

export interface CharacterSelectionSlot {
  id: number
  state: CharacterSelectionSlotState
  character?: CharacterSelectionCharacter | null
  title?: string
  description?: string
  lockReason?: string
  lockedUntil?: string
  lockedFor?: string
  lockedBy?: string
  lockedByFirstName?: string
  lockedByLastName?: string
}

export interface CharacterSelectionPayload {
  slots: CharacterSelectionSlot[]
  selectedSlotId?: number | null
  pending?: boolean
  uiRevision?: number
}

export interface RentCarColor {
  colorId: string | number
  name: string
  color: string
}

export interface RentCarVehicle {
  id: string | number
  model: string
  name: string
  price: number
  image?: string
  colors: RentCarColor[]
}

export interface RentCarPayload {
  vehicles: RentCarVehicle[]
  minHours?: number
  maxHours?: number
}

export type LsCustomsPaymentType = 'cash' | 'card'

export interface LsCustomsOption {
  id: string | number
  name: string
  price: number
  gameModIndex?: number
  description?: string
  available?: boolean
}

export interface LsCustomsCategory {
  id: string
  name: string
  description: string
  icon?: string
  available?: boolean
  supportsColor?: boolean
  dynamic?: boolean
  modType?: number
  options: LsCustomsOption[]
}

export interface LsCustomsPayload {
  sessionId: string
  vehicle: {
    id: string | number
    model: string
    name: string
    plate: string
  }
  balance: {
    cash: number
    bank: number
  }
  installed: Record<string, string | number>
  categories: LsCustomsCategory[]
  point?: {
    camera: { x: number; y: number; z: number }
    lookAt: { x: number; y: number; z: number }
    heading: number
  }
}
export interface GovernmentDecree {
  id: number
  documentNumber: string
  title: string
  summary?: string
  body: string
  effectiveAt?: string
  authorName: string
  authorPosition?: string
  version: number
  pdfUrl?: string
  createdAt: string
  updatedAt?: string
}
export interface GovernmentComputerPayload {
  permissions: { canOrderMaterials: boolean; canManageDecrees: boolean }
  documentStorage?: { ready: boolean; reasons: string[] }
  actor: { name: string; fractionName: string }
  material: {
    treasury: number
    unitPrice: number
    minAmount: number
    maxAmount: number
    fractions: Array<{ id: number; name: string; shortName?: string }>
    orders: Array<{ id: number; amount: number; unitPrice: number; totalPrice: number; status: string; createdAt: string; targetName: string }>
  }
  decrees: GovernmentDecree[]
}

export interface VehicleDealershipColor {
  id: number
  name: string
  hex: string
}

export interface VehicleDealershipVehicle {
  id: string
  model: string
  name: string
  className: string
  price: number
  image?: string
  colors: VehicleDealershipColor[]
}

export interface VehicleDealershipPayload {
  contractVersion: 1
  selectedVehicleId?: string
  balances: {
    cash: number
    bank: number
  }
  maxOwnedVehicles: number
  vehicles: VehicleDealershipVehicle[]
  interiorIpl?: string
  camera?: {
    target: { x: number; y: number; z: number }
    radius: number
    height: number
    angle: number
    fov: number
  }
}

export interface DrivingSchoolPayload {
  token: string
  mode?: 'exam' | 'study'
  price?: number
  phase: 'study' | 'theoryIntro' | 'questions' | 'theoryFeedback' | 'theoryResult' | 'practicalStarting'
  theory?: string[]
  studyQuestions?: Array<{
    index: number
    text: string
    answers: string[]
    correct: number
    explanation: string
  }>
  score?: number
  total?: number
  feedback?: string
  feedbackCorrect?: boolean
  passed?: boolean
  resultMessage?: string
  question?: {
    index: number
    total: number
    text: string
    answers: string[]
  } | null
}

export interface F2MenuPayload {
  quests?: QuestStateV1
  player?: Record<string, unknown>
  character?: Record<string, unknown>
  playerName?: string
  playerTitle?: string
  adminLevel?: number
  animations?: Record<string, unknown>
  [key: string]: unknown
}

export interface InterfacePayloadMap {
  hud: HudPayload
  selectSpawn: SelectSpawnPayload,
  auth: {
    mode?: 'login' | 'register' | 'recovery'
    recovery?: {
      step?: 'email' | 'code' | 'password'
      email?: string
      error?: string
      emailError?: string
      codeError?: string
      passwordError?: string
      pending?: boolean
    }
  };
  characterCustomizer: object;
  character: {
    section?: 'overview' | 'skills' | 'documents'
  }
  characterSelection: CharacterSelectionPayload
  phone: {
    phoneNumber?: string
    balance?: number
    operator?: string
    tariff?: string
  }
  tablet: TabletPayload
  furnitureEditor: FurnitureEditorPayload
  'rent-car': RentCarPayload
  truckerRental: TruckerRentalPayload
  'auto-service': AutoServicePayload
  'vehicle-dealership': VehicleDealershipPayload
  'ls-customs': LsCustomsPayload
  'government-computer': GovernmentComputerPayload
  drivingSchool: DrivingSchoolPayload
  businessShop: BusinessShopPayload
  inventory: object
  f2Menu: F2MenuPayload
  vehicle: {
    highlightedStat?: 'speed' | 'fuel' | 'engine'
  }
  notifications: object
  radialMenu: RadialMenuPayload
  licenseDocument: LicenseDocumentPayload
  huntingShop: HuntingShopPayload
  huntingProcessing: HuntingProcessingPayload
  fishingShop: FishingShopPayload
  fishingCast: FishingCastPayload
  fishingReeling: FishingReelingPayload
  truckerResult: TruckerResultPayload
  miningEquipment: MiningEquipmentPayload
  miningChallenge: MiningChallengePayload
  forestryEquipment: ForestryEquipmentPayload
  forestryChallenge: ForestryChallengePayload
  npcDialog: {
    name?: string
    profession?: string
    message?: string
    actions?: Array<{
      id?: string | number
      label: string
      event?: string
      payload?: unknown
    }>
  }
}

export interface ClientPagePropsMap {
  character: Partial<CharacterState>
  characterSelection: CharacterSelectionPayload
  phone: InterfacePayloadMap['phone']
  tablet: TabletPayload
  'rent-car': RentCarPayload
  truckerRental: TruckerRentalPayload
  'auto-service': AutoServicePayload
  'vehicle-dealership': VehicleDealershipPayload
  'ls-customs': LsCustomsPayload
  'government-computer': GovernmentComputerPayload
  drivingSchool: DrivingSchoolPayload
  businessShop: BusinessShopPayload
  furnitureEditor: FurnitureEditorPayload
  inventory: object
  f2Menu: F2MenuPayload
  huntingShop: HuntingShopPayload
  huntingProcessing: HuntingProcessingPayload
  fishingShop: FishingShopPayload
  fishingCast: FishingCastPayload
  fishingReeling: FishingReelingPayload
  auth: InterfacePayloadMap['auth']
  selectSpawn: SelectSpawnPayload
  characterCustomizer: object
  miningEquipment: MiningEquipmentPayload
  forestryEquipment: ForestryEquipmentPayload
}

export type InterfaceEntryPayload = {
  [Key in InterfaceId]: {
    id: Key
    payload?: InterfacePayloadMap[Key]
  }
}[InterfaceId]

export function isInterfaceId(id: string): id is InterfaceId {
  return (interfaceIds as readonly string[]).includes(id)
}

export function isPageInterfaceId(id: InterfaceId): id is PageInterfaceId {
  return (pageInterfaceIds as readonly InterfaceId[]).includes(id)
}

export function isOverlayInterfaceId(
  id: InterfaceId,
): id is OverlayInterfaceId {
  return !isPageInterfaceId(id)
}
