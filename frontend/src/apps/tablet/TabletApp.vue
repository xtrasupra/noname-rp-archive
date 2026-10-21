<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component, type StyleValue } from 'vue'
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  CircleDollarSign,
  CircleSlash,
  FileWarning,
  Funnel,
  Gamepad2,
  Gift,
  House,
  Info,
  Map,
  MapPin,
  Megaphone,
  MinusCircle,
  Package,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Swords,
  Trash2,
  Truck,
  UserPlus,
  UserMinus,
  UserRound,
  Users,
  X,
} from 'lucide-vue-next'

import { callClientEvent } from '@/core/client-events/client-event'
import TwinkleButton from '@/shared/components/TwinkleButton.vue'
import { useCharacterStore } from '@/stores/character.store'
import { usePropertyStore } from '@/stores/property.store'
import type { InterfacePayloadMap } from '@/shared/contracts/ui'
import MarketplaceApp from './marketplace/MarketplaceApp.vue'
import BusinessApp from './business/BusinessApp.vue'
import PropertyApp from './property/PropertyApp.vue'
import TruckerApp from './trucker/TruckerApp.vue'
import ArmoredCollectorApp from './armored-collector/ArmoredCollectorApp.vue'
import { isArmoredCollectorAppAvailable } from '@/shared/contracts/armored-collector'
import {
  darkenHexColor,
  formatOrganizationBadge as getOrganizationBadge,
  getHexColorRgb,
  getOrganizationAccentColor,
  getOrganizationTileStyle,
} from './organization/branding'
import type { OrganizationAction, OrganizationMemberAction, OrganizationSection } from './organization/types'
import { useOrganizationBlacklist } from './organization/useOrganizationBlacklist'
import { useOrganizationFinance } from './organization/useOrganizationFinance'
import { useOrganizationMemberActions } from './organization/useOrganizationMemberActions'
import { useOrganizationNavigation } from './organization/useOrganizationNavigation'
import { useOrganizationSettings } from './organization/useOrganizationSettings'
import { useOrganizationSort, type OrganizationSortOption } from './organization/useOrganizationSort'
import { useOrganizationTerritories } from './organization/useOrganizationTerritories'
import { useOrganizationUpgrades } from './organization/useOrganizationUpgrades'
import { useTabletProperty } from './property/useTabletProperty'
import type {
  CharacterOrganization,
  CharacterOrganizationBalanceLog,
  CharacterOrganizationBonusLog,
  CharacterOrganizationMemberHistory,
  CharacterOrganizationPermission,
  CharacterOrganizationRank,
  CharacterOrganizationStorageLog,
} from '@/shared/types/game'

type TabletAppItem = {
  id: string
  label: string
  icon?: Component
  organization?: CharacterOrganization
  theme: 'market' | 'business' | 'home' | 'apartment' | 'gps' | 'billboard' | 'game' | 'settings' | 'family' | 'fraction' | 'organization' | 'trucker' | 'armoredCollector'
}

type ActiveTabletApp = 'house' | 'apartment' | 'marketplace' | 'business' | 'trucker' | 'armoredCollector'

const characterStore = useCharacterStore()
const propertyStore = usePropertyStore()
const props = defineProps<{
  payload?: InterfacePayloadMap['tablet']
}>()
const activeTabletApp = ref<ActiveTabletApp | null>(null)
// Payloads describe available organizations; navigation remains local and
// starts on the tablet home screen for every fresh open.
const activeOrganizationId = ref<string | number | null>(null)
const activeOrganizationSection = ref<OrganizationSection>('home')

const baseApps: TabletAppItem[] = [
  { id: 'home', label: 'Мой дом', icon: House, theme: 'home' },
  { id: 'apartment', label: 'Моя квартира', icon: Building2, theme: 'apartment' },
  { id: 'business', label: 'Мой бизнес', icon: Building2, theme: 'business' },
  { id: 'billboards', label: 'Билборды', icon: Megaphone, theme: 'billboard' },
  { id: 'marketplace', label: 'Маркетплейс', icon: ShoppingBag, theme: 'market' },
  { id: 'gps', label: 'GPS', icon: Map, theme: 'gps' },
  { id: 'game-2048', label: '2048', icon: Gamepad2, theme: 'game' },
  { id: 'settings', label: 'Настройки', icon: Settings, theme: 'settings' },
]


if (props.payload?.houses) {
  propertyStore.setHouses(props.payload.houses)
}

if (props.payload?.apartments) {
  propertyStore.setApartments(props.payload.apartments)
}

function getOrganizationAppKind(organization: CharacterOrganization): 'family' | 'fraction' {
  return organization.type === 'family' ? 'family' : 'fraction'
}

const hiddenOrganizationAppIds = new Set(['family:pashkovsky'])

const organizationApps = computed<TabletAppItem[]>(() =>
  characterStore.organizations.reduce<TabletAppItem[]>((apps, organization) => {
    const appKind = getOrganizationAppKind(organization)
    const appId = organization.appId ?? `${appKind}:${organization.id}`

    if (hiddenOrganizationAppIds.has(appId)) {
      return apps
    }

    apps.push({
      id: appId,
      label: organization.name,
      organization,
      theme: appKind,
    })

    return apps
  }, []),
)

const apps = computed<TabletAppItem[]>(() => [
  ...organizationApps.value,
  ...(isArmoredCollectorAppAvailable(props.payload?.armoredCollector)
    ? [{ id: 'armoredCollector', label: 'Инкассатор', icon: ShieldCheck, theme: 'armoredCollector' as const }]
    : []),
  ...(props.payload?.trucker?.available
    ? [{ id: 'trucker', label: 'Дальнобой', icon: Truck, theme: 'trucker' as const }]
    : []),
  ...baseApps,
])

const dockAppIds = new Set(['home', 'business', 'marketplace', 'gps'])
const dockApps = computed(() => apps.value.filter((app) => dockAppIds.has(app.id)))

const tabletHouses = computed(() => propertyStore.houses)
const tabletApartments = computed(() => propertyStore.apartments)
const tabletBusinesses = computed(() => props.payload?.businesses ?? [])
const {
  activePropertyTab,
  apartmentTitle,
  applyApartmentInterior,
  applyActivePropertyPayload,
  applyHouseInterior,
  backFromApartmentDetails,
  backFromHouseDetails,
  evictApartmentResident,
  evictHouseResident,
  handleApartmentAction,
  handleHouseAction,
  houseTitle,
  openApartmentApp,
  openHouseApp,
  resetPropertySelection,
  routeToApartment,
  routeToHouse,
  selectedApartment,
  selectedHouse,
  selectApartment,
  selectHouse,
  setPropertyTab,
  toggleApartmentLock,
  toggleHouseLock,
} = useTabletProperty({
  apartments: tabletApartments,
  emit: callClientEvent,
  houses: tabletHouses,
  setApartmentInterior: (apartmentId, interiorId) => propertyStore.setApartmentInterior(apartmentId, interiorId),
  setHouseInterior: (houseId, interiorId) => propertyStore.setHouseInterior(houseId, interiorId),
  toggleApartmentLock: (apartmentId) => propertyStore.toggleApartmentLock(apartmentId),
  toggleHouseLock: (houseId) => propertyStore.toggleHouseLock(houseId),
})
const activeOrganization = computed(() =>
  characterStore.organizations.find((organization) => organization.id === activeOrganizationId.value) ?? null,
)
const isFamilyOrganization = computed(() => activeOrganization.value?.type === 'family')
const organizationAccentColor = computed(() => getOrganizationAccentColor(activeOrganization.value))
const organizationAccentRgb = computed(() => getHexColorRgb(organizationAccentColor.value))
const organizationPanelStyle = computed<StyleValue>(() => ({
  '--organization-accent': organizationAccentColor.value,
  '--organization-accent-dark': darkenHexColor(organizationAccentColor.value, 0.72),
  '--organization-accent-rgb': organizationAccentRgb.value,
}))
const organizationActions: OrganizationAction[] = [
  { id: 'members', label: 'Коллеги', icon: Users },
  { id: 'storage', label: 'Склад', icon: Package },
  { id: 'balance', label: 'Управление балансом', icon: CircleDollarSign },
  { id: 'settings', label: 'Настройки', icon: Settings },
  { id: 'bonus', label: 'Премирование', icon: ClipboardList },
  { id: 'territories', label: 'Контроль территорий', icon: Swords },
  { id: 'blacklist', label: 'Черный список', icon: CircleSlash },
  { id: 'info', label: 'Информация', icon: Info },
  { id: 'upgrades', label: 'Улучшения', icon: Gift },
]
const organizationDirections = [
  {
    id: 'authority',
    title: 'Авторитет',
    description: 'Ускоряет развитие репутации, влияния и доступа к статусным улучшениям семьи.',
    image: 'linear-gradient(135deg, #0f172a 0%, #172554 48%, #38bdf8 100%)',
  },
  {
    id: 'storage',
    title: 'Склад',
    description: 'Усиливает работу со складом: быстрее операции, шире лимиты и больше журналов действий.',
    image: 'linear-gradient(135deg, #111827 0%, #14532d 48%, #4ade80 100%)',
  },
  {
    id: 'transport',
    title: 'Транспорт',
    description: 'Открывает расширенный автопарк, гаражные слоты и удобное обслуживание техники.',
    image: 'linear-gradient(135deg, #18181b 0%, #7c2d12 52%, #fb923c 100%)',
  },
  {
    id: 'territories',
    title: 'Территории',
    description: 'Даёт преимущества в контроле районов, разведке, расписаниях и защите бизнеса.',
    image: 'linear-gradient(135deg, #111827 0%, #581c87 50%, #c084fc 100%)',
  },
] as const
const organizationMemberActions: OrganizationMemberAction[] = [
  { id: 'promote', label: 'Повышение', icon: ChevronDown },
  { id: 'demote', label: 'Понижение', icon: ChevronDown },
  { id: 'giveWarn', label: 'Выдать WARN', icon: FileWarning },
  { id: 'removeWarn', label: 'Снять WARN', icon: ArrowLeft },
  { id: 'dismiss', label: 'Уволить', icon: UserMinus },
  { id: 'bonus', label: 'Выдать премию', icon: Gift },
]
const organizationSortOptions: Record<string, OrganizationSortOption[]> = {
  members: [
    { key: 'id', label: '#' },
    { key: 'name', label: 'Имя и фамилия' },
    { key: 'uid', label: 'UID' },
    { key: 'role', label: 'Должность' },
    { key: 'rank', label: 'Ранг' },
    { key: 'todayOnline', label: 'Сегодня' },
    { key: 'monthOnline', label: 'Месяц' },
    { key: 'lastSeen', label: 'Статус в сети' },
  ],
  storage: [
    { key: 'name', label: 'Имя и фамилия' },
    { key: 'uid', label: 'UID' },
    { key: 'rank', label: 'Ранг' },
    { key: 'action', label: 'Действие' },
    { key: 'amount', label: 'Кол-во' },
    { key: 'itemName', label: 'Название предмета' },
    { key: 'dateTime', label: 'Дата и время' },
  ],
  blacklist: [
    { key: 'playerName', label: 'Участник списка' },
    { key: 'playerUid', label: 'UID участника' },
    { key: 'issuerName', label: 'Занес в список' },
    { key: 'issuerUid', label: 'UID автора' },
    { key: 'comment', label: 'Комментарий' },
    { key: 'dateTime', label: 'Дата и время' },
  ],
  bonus: [
    { key: 'issuerName', label: 'Выплатил' },
    { key: 'issuerUid', label: 'UID выплатившего' },
    { key: 'issuerRank', label: 'Ранг выплатившего' },
    { key: 'recipientName', label: 'Получил' },
    { key: 'recipientUid', label: 'UID получившего' },
    { key: 'recipientRank', label: 'Ранг получившего' },
    { key: 'comment', label: 'Комментарий' },
    { key: 'amount', label: 'Сумма' },
    { key: 'dateTime', label: 'Дата и время' },
  ],
  balance: [
    { key: 'name', label: 'Имя и фамилия' },
    { key: 'uid', label: 'UID' },
    { key: 'rank', label: 'Ранг' },
    { key: 'transactionType', label: 'Тип транзакции' },
    { key: 'comment', label: 'Комментарий' },
    { key: 'amount', label: 'Сумма' },
    { key: 'dateTime', label: 'Дата' },
  ],
  settingsRealEstate: [
    { key: 'title', label: 'Название' },
  ],
  settingsVehicles: [
    { key: 'name', label: 'Название' },
    { key: 'className', label: 'Класс' },
    { key: 'owner', label: 'Владелец' },
    { key: 'incomePercent', label: 'Процент дохода' },
    { key: 'rankAccess', label: 'Доступ ранга' },
  ],
}
const {
  getOrganizationSortIndicator,
  getOrganizationSortLabel,
  getOrganizationSortOptions,
  organizationSorts,
  selectOrganizationSort,
  setOrganizationSort,
  sortOrganizationRows,
} = useOrganizationSort(organizationSortOptions)
const organizationMembers = computed(() => activeOrganization.value?.members ?? [])
const selectedMemberHistory = computed<CharacterOrganizationMemberHistory[]>(() =>
  selectedOrganizationMember.value?.history
  ?? organizationMembers.value.find((member) => member.history?.length)?.history
  ?? [],
)
const organizationStorageLogs = computed<CharacterOrganizationStorageLog[]>(() => activeOrganization.value?.storageLogs ?? [])
const organizationBalanceLogs = computed<CharacterOrganizationBalanceLog[]>(() => activeOrganization.value?.balanceLogs ?? [])
const organizationBalance = computed(() => activeOrganization.value?.balance ?? 0)
const organizationBonusLogs = computed<CharacterOrganizationBonusLog[]>(() => activeOrganization.value?.bonusLogs ?? [])
const organizationTerritories = computed(() => activeOrganization.value?.territories)
const organizationBlacklist = computed(() => activeOrganization.value?.blacklist)
const organizationInfo = computed(() => activeOrganization.value?.info)
const organizationUpgrades = computed(() => activeOrganization.value?.upgrades)
const organizationHeaderPlayerName = computed(() => organizationInfo.value?.playerName ?? characterStore.name)
const organizationHeaderRankName = computed(() => organizationInfo.value?.rankName ?? String(organizationInfo.value?.rank ?? ''))
const organizationHeaderLogo = computed(() => organizationInfo.value?.logo ?? getOrganizationBadge(activeOrganization.value ?? undefined))
const isActiveOrganizationFamily = computed(() => activeOrganization.value?.type === 'family')
const canOpenOrganizationInfo = computed(() => Boolean(organizationInfo.value?.isCreator && organizationInfo.value.rank === 9))
const canOpenOrganizationUpgrades = computed(() => Boolean(organizationUpgrades.value?.isLeader))
const {
  setTerritoriesCanvas,
} = useOrganizationTerritories({
  activeSection: activeOrganizationSection,
  organizationTerritories,
})
const availableOrganizationActions = computed(() =>
  organizationActions.filter((action) => {
    if (action.id === 'info') {
      return canOpenOrganizationInfo.value
    }

    if (action.id === 'upgrades') {
      return canOpenOrganizationUpgrades.value
    }

    return true
  }),
)
const {
  centerOrganizationUpgradesMap,
  changeOrganizationUpgradeMapScale,
  dragOrganizationUpgradesMap,
  handleOrganizationUpgradesWheel,
  hoveredUpgrade,
  isOrganizationUpgradesDragging,
  organizationUpgradeGridBounds,
  organizationUpgradeMapCenterX,
  organizationUpgradeMapCenterY,
  organizationUpgradeMapDefaultScale,
  organizationUpgradeMapScale,
  organizationUpgradeMapTransform,
  organizationUpgradeMapViewBox,
  renderedOrganizationUpgradeCategories,
  selectOrganizationUpgrade,
  setOrganizationUpgradeMapScale,
  setOrganizationUpgradesViewport,
  splitUpgradeName,
  startOrganizationUpgradesDrag,
  stopOrganizationUpgradesDrag,
  suppressOrganizationUpgradeClickAfterDrag,
  unlockOrganizationUpgrade,
  upgradeAction,
} = useOrganizationUpgrades({
  activeOrganization,
  emit: callClientEvent,
  organizationUpgrades,
})
const {
  activeBlacklistEntries,
  activeBlacklistTab,
  blacklistAddModalOpen,
  blacklistPlayerStatic,
  blacklistReason,
  blacklistRemoveEntry,
  blacklistRemoveModalOpen,
  blacklistRemoveReason,
  blacklistSearch,
  closeBlacklistAddModal,
  closeBlacklistRemoveModal,
  openBlacklistAddModal,
  openBlacklistRemoveModal,
  resetOrganizationBlacklistState,
  setBlacklistTab,
  submitBlacklistAdd,
  submitBlacklistRemove,
} = useOrganizationBlacklist({
  activeOrganization,
  emit: callClientEvent,
  organizationBlacklist,
})
const organizationSettings = computed(() => activeOrganization.value?.settings)
const organizationSettingRanks = computed<CharacterOrganizationRank[]>(() => organizationSettings.value?.ranks ?? [])
const {
  activeSettingsTab,
  ensureOrganizationSettingsTabAvailable,
  getDefaultSettingsRankId,
  getSettingsSortTable,
  isPermissionEnabled,
  resetOrganizationSettingsState,
  selectedSettingsRank,
  selectedSettingsRankId,
  settingsSearch,
  setSettingsTab,
  toggleOrganizationPermission,
  updateSettingsVehicleValue,
  returnSettingsVehicle,
} = useOrganizationSettings({
  activeOrganization,
  emit: callClientEvent,
  isFamilyOrganization,
  organizationSettingRanks,
  patchOrganization: (organization) => characterStore.patchOrganization(organization),
})
const {
  balanceAction,
  balanceAmount,
  balanceComment,
  balanceModalOpen,
  closeBalanceModal,
  closeMassBonusModal,
  massBonusAmount,
  massBonusComment,
  massBonusModalOpen,
  openBalanceModal,
  openMassBonusModal,
  resetOrganizationFinanceState,
  submitBalanceAction,
  submitMassBonusAction,
} = useOrganizationFinance({
  activeOrganization,
  emit: callClientEvent,
})
const {
  bonusAmount,
  bonusComment,
  bonusModalOpen,
  closeBonusModal,
  handleMemberAction,
  isPendingMemberDismissAction,
  isPendingMemberRankAction,
  memberDismissReason,
  memberDismissToBlacklist,
  memberRankActionOptions,
  memberRankActionReason,
  memberRankActionTargetId,
  openMemberDetails,
  pendingMemberAction,
  resetOrganizationMemberState,
  selectedMemberRankActionRank,
  selectedOrganizationMember,
  selectedOrganizationMemberUid,
  submitBonus,
  submitMemberAction,
  submitMemberDismissAction,
  submitMemberRankAction,
} = useOrganizationMemberActions({
  activeOrganization,
  emit: callClientEvent,
  memberActions: organizationMemberActions,
  organizationMembers,
  organizationSettingRanks,
  setSection(section) {
    activeOrganizationSection.value = section
  },
})
const {
  activeStorageTab,
  backFromOrganizationSection,
  backToOrganizationMembers,
  balanceSearch,
  bonusSearch,
  captureScheduleModalOpen,
  closeCaptureScheduleModal,
  closeDeleteOrganizationModal,
  closeOrganization,
  closeOrganizationDirectionModal,
  deleteOrganizationModalOpen,
  ensureOrganizationDirectionModalAvailable,
  handleOrganizationAction,
  memberSearch,
  openCaptureScheduleModal,
  openDeleteOrganizationModal,
  openOrganization,
  openOrganizationDirectionModal,
  organizationDirectionModalOpen,
  payOrganizationBill,
  selectOrganizationDirection,
  setStorageTab,
  storageSearch,
} = useOrganizationNavigation({
  activeOrganization,
  activeOrganizationId,
  activeSection: activeOrganizationSection,
  canOpenInfo: canOpenOrganizationInfo,
  canOpenUpgrades: canOpenOrganizationUpgrades,
  emit: callClientEvent,
  getDefaultSettingsRankId,
  isFamilyOrganization,
  resetBlacklist: resetOrganizationBlacklistState,
  resetFinance: resetOrganizationFinanceState,
  resetMembers: resetOrganizationMemberState,
  resetSettings: resetOrganizationSettingsState,
})
const activeSettingsPermissions = computed<CharacterOrganizationPermission[]>(() => {
  if (activeSettingsTab.value === 'items') {
    return organizationSettings.value?.itemAccess ?? []
  }

  return organizationSettings.value?.rolePermissions ?? []
})
const filteredSettingsRealEstate = computed(() => {
  if (!isActiveOrganizationFamily.value) {
    return []
  }

  const query = settingsSearch.value.trim().toLowerCase()
  const realEstate = organizationSettings.value?.realEstate ?? []

  if (!query) {
    return realEstate
  }

  return realEstate.filter((asset) =>
    [
      asset.title,
      ...asset.features.flatMap((feature) => [feature.label, feature.value]),
    ].some((value) => String(value).toLowerCase().includes(query)),
  )
})
const filteredSettingsVehicles = computed(() => {
  const query = settingsSearch.value.trim().toLowerCase()
  const vehicles = organizationSettings.value?.vehicles ?? []

  if (!query) {
    return vehicles
  }

  return vehicles.filter((vehicle) =>
    [
      vehicle.name,
      vehicle.className,
      vehicle.fuelType,
      vehicle.owner ?? '',
      vehicle.incomePercent,
      vehicle.rankAccess,
    ].some((value) => String(value).toLowerCase().includes(query)),
  )
})
const sortedSettingsRealEstate = computed(() =>
  sortOrganizationRows(filteredSettingsRealEstate.value, 'settingsRealEstate', {
    title: (asset) => asset.title,
  }),
)
const sortedSettingsVehicles = computed(() =>
  sortOrganizationRows(filteredSettingsVehicles.value, 'settingsVehicles', {
    name: (vehicle) => vehicle.name,
    className: (vehicle) => vehicle.className,
    owner: (vehicle) => vehicle.owner ?? '',
    incomePercent: (vehicle) => vehicle.incomePercent,
    rankAccess: (vehicle) => vehicle.rankAccess,
  }),
)
const organizationTitle = computed(() => {
  if (activeOrganizationSection.value === 'memberDetails') {
    return selectedOrganizationMember.value?.name
  }

  if (activeOrganizationSection.value === 'members') {
    return 'Коллеги'
  }

  if (activeOrganizationSection.value === 'storage') {
    return 'Склад'
  }

  if (activeOrganizationSection.value === 'balance') {
    return formatMoney(organizationBalance.value).replace(/\s?\$/, '')
  }

  if (activeOrganizationSection.value === 'settings') {
    return 'Настройки'
  }

  if (activeOrganizationSection.value === 'bonus') {
    return 'Премирование'
  }

  if (activeOrganizationSection.value === 'territories') {
    return 'Контроль территорий'
  }

  if (activeOrganizationSection.value === 'blacklist') {
    return 'Черный список'
  }

  if (activeOrganizationSection.value === 'info') {
    return 'Информация'
  }

  if (activeOrganizationSection.value === 'upgrades') {
    return 'Улучшения'
  }

  return activeOrganization.value?.name
})
const filteredOrganizationMembers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase()

  if (!query) {
    return organizationMembers.value
  }

  return organizationMembers.value.filter((member) =>
    [
      member.name,
      member.uid,
      member.role,
      member.rank,
      member.todayOnline,
      member.monthOnline,
      member.lastSeen,
    ]
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})
const filteredOrganizationStorageLogs = computed(() => {
  const query = storageSearch.value.trim().toLowerCase()

  if (!query) {
    return organizationStorageLogs.value
  }

  return organizationStorageLogs.value.filter((log) =>
    [
      log.name,
      log.uid,
      log.rank,
      log.action,
      log.amount,
      log.itemName,
      log.dateTime,
    ]
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})
const filteredOrganizationBalanceLogs = computed(() => {
  const query = balanceSearch.value.trim().toLowerCase()

  if (!query) {
    return organizationBalanceLogs.value
  }

  return organizationBalanceLogs.value.filter((log) =>
    [
      log.name ?? '-',
      log.uid ?? '-',
      log.rank ?? '-',
      log.transactionType,
      log.comment ?? '-',
      log.amount,
      log.dateTime,
    ]
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})
const filteredOrganizationBonusLogs = computed(() => {
  const query = bonusSearch.value.trim().toLowerCase()

  if (!query) {
    return organizationBonusLogs.value
  }

  return organizationBonusLogs.value.filter((log) =>
    [
      log.issuerName,
      log.issuerUid,
      log.issuerRank,
      log.recipientName,
      log.recipientUid,
      log.recipientRank,
      log.comment,
      log.amount,
      log.dateTime,
    ]
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})
const filteredBlacklistEntries = computed(() => {
  const query = blacklistSearch.value.trim().toLowerCase()

  if (!query) {
    return activeBlacklistEntries.value
  }

  return activeBlacklistEntries.value.filter((entry) =>
    [
      entry.playerName,
      entry.playerUid,
      entry.issuerName,
      entry.issuerUid,
      entry.comment,
      entry.dateTime,
    ]
      .some((value) => String(value).toLowerCase().includes(query)),
  )
})
const sortedOrganizationMembers = computed(() =>
  sortOrganizationRows(filteredOrganizationMembers.value, 'members', {
    id: (member) => member.id,
    name: (member) => member.name,
    uid: (member) => member.uid,
    role: (member) => member.role,
    rank: (member) => member.rank,
    todayOnline: (member) => member.todayOnline,
    monthOnline: (member) => member.monthOnline,
    lastSeen: (member) => member.lastSeen,
  }),
)
const sortedOrganizationStorageLogs = computed(() =>
  sortOrganizationRows(filteredOrganizationStorageLogs.value, 'storage', {
    name: (log) => log.name,
    uid: (log) => log.uid,
    rank: (log) => log.rank,
    action: (log) => log.action,
    amount: (log) => log.amount,
    itemName: (log) => log.itemName,
    dateTime: (log) => log.dateTime,
  }),
)
const sortedOrganizationBalanceLogs = computed(() =>
  sortOrganizationRows(filteredOrganizationBalanceLogs.value, 'balance', {
    name: (log) => log.name ?? '',
    uid: (log) => log.uid ?? '',
    rank: (log) => log.rank ?? '',
    transactionType: (log) => log.transactionType,
    comment: (log) => log.comment ?? '',
    amount: (log) => log.amount,
    dateTime: (log) => log.dateTime,
  }),
)
const sortedOrganizationBonusLogs = computed(() =>
  sortOrganizationRows(filteredOrganizationBonusLogs.value, 'bonus', {
    issuerName: (log) => log.issuerName,
    issuerUid: (log) => log.issuerUid,
    issuerRank: (log) => log.issuerRank,
    recipientName: (log) => log.recipientName,
    recipientUid: (log) => log.recipientUid,
    recipientRank: (log) => log.recipientRank,
    comment: (log) => log.comment,
    amount: (log) => log.amount,
    dateTime: (log) => log.dateTime,
  }),
)
const sortedBlacklistEntries = computed(() =>
  sortOrganizationRows(filteredBlacklistEntries.value, 'blacklist', {
    playerName: (entry) => entry.playerName,
    playerUid: (entry) => entry.playerUid,
    issuerName: (entry) => entry.issuerName,
    issuerUid: (entry) => entry.issuerUid,
    comment: (entry) => entry.comment,
    dateTime: (entry) => entry.dateTime,
  }),
)
const sortedSelectedMemberHistory = computed(() =>
  sortOrganizationRows(selectedMemberHistory.value, 'memberHistory', {
    leader: (record) => record.leader,
    uid: (record) => record.uid,
    rank: (record) => record.rank,
    action: (record) => record.action,
    comment: (record) => record.comment,
    dateTime: (record) => record.dateTime,
  }),
)

function formatMoney(value: number) {
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} $`
}

function applyTabletPayload(payload?: InterfacePayloadMap['tablet']) {
  if (!payload) {
    return
  }

  if (payload.character) {
    characterStore.patch(payload.character)
  }

  if (payload.organizations) {
    characterStore.patch({ organizations: payload.organizations })
  }

  if (payload.organization) {
    characterStore.patchOrganization(payload.organization)
  }

  if (payload.houses) {
    propertyStore.setHouses(payload.houses)
  }

  if (payload.apartments) {
    propertyStore.setApartments(payload.apartments)
  }

  applyActivePropertyPayload(payload, (app) => {
    activeTabletApp.value = app
  })

}


function openApp(app: TabletAppItem) {
  callClientEvent('tablet:openAppFromBrowser', app.id)

  if (app.id === 'home') {
    activeTabletApp.value = 'house'
    openHouseApp()
    return
  }

  if (app.id === 'apartment') {
    activeTabletApp.value = 'apartment'
    openApartmentApp()
    return
  }

  if (app.id === 'marketplace') {
    activeTabletApp.value = 'marketplace'
    activeOrganizationId.value = null
    resetPropertySelection()
    return
  }

  if (app.id === 'business') {
    activeTabletApp.value = 'business'
    activeOrganizationId.value = null
    resetPropertySelection()
    callClientEvent('tablet:businessRefreshFromBrowser')
    return
  }

  if (app.id === 'trucker') {
    activeTabletApp.value = 'trucker'
    activeOrganizationId.value = null
    resetPropertySelection()
    callClientEvent('tablet:trucker:requestFromBrowser')
    return
  }

  if (app.id === 'armoredCollector') {
    activeTabletApp.value = 'armoredCollector'
    activeOrganizationId.value = null
    resetPropertySelection()
    callClientEvent('tablet:armoredCollector:requestFromBrowser')
    return
  }

  if (app.organization) {
    activeTabletApp.value = null
    resetPropertySelection()
    openOrganization(app.organization, getDefaultSettingsRankId(app.organization.settings?.ranks ?? []))
  }
}

function closeTabletApp() {
  activeTabletApp.value = null
  resetPropertySelection()
}

watch(
  () => props.payload,
  (payload) => {
    applyTabletPayload(payload)
  },
  { deep: true, immediate: true },
)

watch(
  () => props.payload?.trucker?.available,
  (available) => {
    if (!available && activeTabletApp.value === 'trucker') {
      closeTabletApp()
    }
  },
)

watch(
  () => isArmoredCollectorAppAvailable(props.payload?.armoredCollector),
  (available) => {
    if (!available && activeTabletApp.value === 'armoredCollector') {
      closeTabletApp()
    }
  },
)

watch(
  activeOrganization,
  (organization) => {
    if (activeOrganizationId.value && !organization) {
      closeOrganization()
      return
    }

    if (selectedOrganizationMemberUid.value && !selectedOrganizationMember.value) {
      backToOrganizationMembers()
    }

    ensureOrganizationSettingsTabAvailable()

    ensureOrganizationDirectionModalAvailable()
  },
)

watch(
  activeOrganizationSection,
  () => {
    if (activeOrganizationSection.value === 'upgrades') {
      void nextTick(centerOrganizationUpgradesMap)
    }
  },
)

</script>

<template>
  <main class="tablet-app">
    <section class="tablet-device" aria-label="Планшет">
      <div class="tablet-device__bezel">
        <div class="tablet-device__camera">
          <span></span>
        </div>

        <div class="tablet-screen">
          <header v-if="!activeOrganization && !activeTabletApp" class="tablet-status">
            <div class="tablet-status__left">
              <span>11:11</span>
              <span>11.11.2011</span>
            </div>
            <div class="tablet-status__right">
              <span class="tablet-signal" aria-hidden="true">
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span class="tablet-wifi" aria-hidden="true"></span>
              <span>100%</span>
              <span class="tablet-battery" aria-hidden="true"></span>
            </div>
          </header>

          <template v-if="activeOrganization">
            <section class="organization-panel" :style="organizationPanelStyle" aria-label="Организация">
              <header class="organization-panel__header">
                <div class="organization-panel__title">
                  <button
                    v-if="activeOrganizationSection !== 'home'"
                    class="organization-panel__back"
                    type="button"
                    aria-label="Назад"
                    @click="backFromOrganizationSection"
                  >
                    <ArrowLeft aria-hidden="true" />
                  </button>

                  <div v-if="activeOrganizationSection !== 'territories'">
                    <h1 :class="{ 'organization-panel__balance-title': activeOrganizationSection === 'balance' }">
                      <CircleDollarSign v-if="activeOrganizationSection === 'balance'" aria-hidden="true" />
                      {{ organizationTitle }}
                    </h1>
                  </div>

                  <Users v-if="activeOrganizationSection === 'members'" class="organization-panel__title-icon" aria-hidden="true" />
                  <UserRound v-if="activeOrganizationSection === 'memberDetails'" class="organization-panel__title-icon" aria-hidden="true" />
                  <Package v-if="activeOrganizationSection === 'storage'" class="organization-panel__title-icon" aria-hidden="true" />
                  <Settings v-if="activeOrganizationSection === 'settings'" class="organization-panel__title-icon" aria-hidden="true" />
                  <Gift v-if="activeOrganizationSection === 'bonus'" class="organization-panel__title-icon" aria-hidden="true" />
                  <CircleSlash v-if="activeOrganizationSection === 'blacklist'" class="organization-panel__title-icon" aria-hidden="true" />
                  <Info v-if="activeOrganizationSection === 'info'" class="organization-panel__title-icon" aria-hidden="true" />
                  <Gift v-if="activeOrganizationSection === 'upgrades'" class="organization-panel__title-icon" aria-hidden="true" />

                  <div v-if="activeOrganizationSection === 'settings'" class="organization-settings__tabs" role="tablist" aria-label="Разделы склада">
                    <button
                      class="organization-settings__tab"
                      :class="{ 'organization-settings__tab--active': activeSettingsTab === 'roles' }"
                      type="button"
                      role="tab"
                      :aria-selected="activeSettingsTab === 'roles'"
                      @click="setSettingsTab('roles')"
                    >
                      <ClipboardList aria-hidden="true" />
                      <span>Должность</span>
                    </button>
                    <button
                      class="organization-settings__tab"
                      :class="{ 'organization-settings__tab--active': activeSettingsTab === 'items' }"
                      type="button"
                      role="tab"
                      :aria-selected="activeSettingsTab === 'items'"
                      @click="setSettingsTab('items')"
                    >
                      <Swords aria-hidden="true" />
                      <span>Предметы</span>
                    </button>
                    <button
                      v-if="isActiveOrganizationFamily"
                      class="organization-settings__tab"
                      :class="{ 'organization-settings__tab--active': activeSettingsTab === 'realEstate' }"
                      type="button"
                      role="tab"
                      :aria-selected="activeSettingsTab === 'realEstate'"
                      @click="setSettingsTab('realEstate')"
                    >
                      <Building2 aria-hidden="true" />
                      <span>Недвижимость</span>
                    </button>
                    <button
                      class="organization-settings__tab"
                      :class="{ 'organization-settings__tab--active': activeSettingsTab === 'vehicles' }"
                      type="button"
                      role="tab"
                      :aria-selected="activeSettingsTab === 'vehicles'"
                      @click="setSettingsTab('vehicles')"
                    >
                      <CircleSlash aria-hidden="true" />
                      <span>Транспорт</span>
                    </button>
                  </div>

                  <div v-if="activeOrganizationSection === 'bonus'" class="organization-bonus__controls organization-bonus__controls--header">
                    <button type="button" @click="openMassBonusModal">
                      <PlusCircle aria-hidden="true" />
                      <span>Массовая выплата</span>
                    </button>
                  </div>

                  <div v-if="activeOrganizationSection === 'blacklist'" class="organization-blacklist__tabs organization-blacklist__tabs--header" role="tablist" aria-label="Разделы черного списка">
                    <button
                      class="organization-blacklist__tab"
                      :class="{ 'organization-blacklist__tab--active': activeBlacklistTab === 'stats' }"
                      type="button"
                      role="tab"
                      :aria-selected="activeBlacklistTab === 'stats'"
                      @click="setBlacklistTab('stats')"
                    >
                      <ClipboardList aria-hidden="true" />
                      <span>Список</span>
                    </button>
                    <button
                      class="organization-blacklist__tab"
                      :class="{ 'organization-blacklist__tab--active': activeBlacklistTab === 'history' }"
                      type="button"
                      role="tab"
                      :aria-selected="activeBlacklistTab === 'history'"
                      @click="setBlacklistTab('history')"
                    >
                      <Clock3 aria-hidden="true" />
                      <span>История</span>
                    </button>
                    <button class="organization-blacklist__tab" type="button" @click="openBlacklistAddModal">
                      <PlusCircle aria-hidden="true" />
                      <span>Добавить в список</span>
                    </button>
                  </div>

                  <div v-if="activeOrganizationSection === 'upgrades' && organizationUpgrades" class="organization-upgrades__toolbar organization-upgrades__toolbar--header">
                    <div class="organization-upgrades__stats">
                      <span>
                        <CircleDollarSign aria-hidden="true" />
                        413 752,17
                      </span>
                      <span class="organization-upgrades__reputation">
                        <i aria-hidden="true"></i>
                        <strong>715</strong>
                        <em>- (Отрицательный)</em>
                      </span>
                    </div>

                    <button v-if="isFamilyOrganization" type="button" @click="openOrganizationDirectionModal">
                      <Settings aria-hidden="true" />
                      <span>Сменить направление</span>
                    </button>

                    <div class="organization-upgrades__zoom" aria-label="Zoom">
                      <button type="button" aria-label="Zoom out" @click="changeOrganizationUpgradeMapScale(-0.1)">
                        <MinusCircle aria-hidden="true" />
                      </button>
                      <button type="button" @click="setOrganizationUpgradeMapScale(organizationUpgradeMapDefaultScale)">
                        {{ Math.round(organizationUpgradeMapScale * 100) }}%
                      </button>
                      <button type="button" aria-label="Zoom in" @click="changeOrganizationUpgradeMapScale(0.1)">
                        <PlusCircle aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div v-if="activeOrganizationSection === 'territories'" class="organization-territories__toolbar organization-territories__toolbar--header">
                    <div class="organization-territories__stats" aria-label="Статистика территорий">
                      <span>
                        Контроль:
                        <strong>{{ organizationTerritories?.controlPercent }}%</strong>
                      </span>
                      <span>
                        {{ organizationTerritories?.controlled }} / {{ organizationTerritories?.total }}
                      </span>
                      <span>
                        <Swords aria-hidden="true" />
                        {{ organizationTerritories?.attacksAvailable }} / {{ organizationTerritories?.attacksTotal }}
                      </span>
                      <span>
                        <CircleSlash aria-hidden="true" />
                        {{ organizationTerritories?.defensesAvailable }} / {{ organizationTerritories?.defensesTotal }}
                      </span>
                      <span class="organization-territories__check" aria-hidden="true">
                        <Check aria-hidden="true" />
                      </span>
                    </div>

                    <div class="organization-territories__actions">
                      <button type="button" @click="openCaptureScheduleModal">
                        <CalendarDays aria-hidden="true" />
                        <span>Расписание захватов</span>
                      </button>
                      <button type="button" aria-label="Уведомления">
                        <Bell aria-hidden="true" />
                      </button>
                      <span class="organization-territories__mark" aria-hidden="true">
                        {{ organizationHeaderLogo }}
                      </span>
                    </div>
                  </div>

                  <div v-if="activeOrganizationSection === 'storage'" class="organization-storage__header">
                    <div class="organization-storage__totals" aria-label="Сводка склада">
                      <span>
                        <Package aria-hidden="true" />
                        7 449
                      </span>
                      <span>
                        <CircleDollarSign aria-hidden="true" />
                        0
                      </span>
                      <span>
                        <Swords aria-hidden="true" />
                        13 450
                      </span>
                    </div>

                    <div class="organization-storage__tabs" role="tablist" aria-label="Разделы склада">
                      <button
                        class="organization-storage__tab"
                        :class="{ 'organization-storage__tab--active': activeStorageTab === 'logs' }"
                        type="button"
                        role="tab"
                        :aria-selected="activeStorageTab === 'logs'"
                        @click="setStorageTab('logs')"
                      >
                        <ClipboardList aria-hidden="true" />
                        <span>Лог действий</span>
                      </button>
                      <button
                        class="organization-storage__tab"
                        :class="{ 'organization-storage__tab--active': activeStorageTab === 'accounting' }"
                        type="button"
                        role="tab"
                        :aria-selected="activeStorageTab === 'accounting'"
                        @click="setStorageTab('accounting')"
                      >
                        <Package aria-hidden="true" />
                        <span>Складской учёт</span>
                      </button>
                    </div>
                  </div>

                  <div v-if="activeOrganizationSection === 'balance'" class="organization-balance__header">
                    <span class="organization-balance__wallet" aria-hidden="true"></span>
                    <div class="organization-balance__controls">
                      <button type="button" @click="openBalanceModal('deposit')">
                        <PlusCircle aria-hidden="true" />
                        <span>Пополнить</span>
                      </button>
                      <button type="button" @click="openBalanceModal('withdraw')">
                        <MinusCircle aria-hidden="true" />
                        <span>Снять</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="activeOrganizationSection !== 'territories'" class="organization-panel__meta">
                  <div class="organization-panel__meta-text">
                    <span>{{ organizationHeaderPlayerName }}</span>
                    <strong>{{ organizationHeaderRankName }}</strong>
                  </div>
                  <span class="organization-panel__mark" aria-hidden="true">
                    {{ organizationHeaderLogo }}
                  </span>
                  <button class="organization-panel__close" type="button" aria-label="Закрыть" @click="closeOrganization">
                    <X aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div v-if="activeOrganizationSection === 'home'" class="organization-panel__actions">
                <button
                  v-for="action in availableOrganizationActions"
                  :key="action.id"
                  class="organization-action"
                  type="button"
                  @click="handleOrganizationAction(action)"
                >
                  <span class="organization-action__icon">
                    <component :is="action.icon" aria-hidden="true" />
                  </span>
                  <span>{{ action.label }}</span>
                </button>
              </div>

              <section v-else-if="activeOrganizationSection === 'members'" class="organization-members" aria-label="Коллеги">
                <div class="organization-members__toolbar">
                  <label class="organization-members__search">
                    <Search aria-hidden="true" />
                    <input v-model="memberSearch" type="search" placeholder="Введите значение для поиска">
                  </label>

                  <details class="organization-sort-menu">
                    <summary class="organization-members__filter">
                      <Funnel aria-hidden="true" />
                      <span>{{ getOrganizationSortLabel('members') }}</span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div class="organization-sort-menu__list">
                      <button
                        v-for="option in getOrganizationSortOptions('members')"
                        :key="option.key"
                        type="button"
                        :class="{ 'organization-sort-menu__item--active': organizationSorts.members?.key === option.key }"
                        @click="selectOrganizationSort('members', option.key, $event)"
                      >
                        <span>{{ option.label }}</span>
                        <i>{{ getOrganizationSortIndicator('members', option.key) }}</i>
                      </button>
                    </div>
                  </details>
                </div>

                <div class="organization-members__table" role="table" aria-label="Список коллег">
                  <div class="organization-members__row organization-members__row--head" role="row">
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'id')">#<i>{{ getOrganizationSortIndicator('members', 'id') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'name')">Имя и фамилия<i>{{ getOrganizationSortIndicator('members', 'name') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'uid')">UID<i>{{ getOrganizationSortIndicator('members', 'uid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'role')">Должность<i>{{ getOrganizationSortIndicator('members', 'role') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'rank')">Ранг<i>{{ getOrganizationSortIndicator('members', 'rank') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'todayOnline')">Сегодня<i>{{ getOrganizationSortIndicator('members', 'todayOnline') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'monthOnline')">Месяц<i>{{ getOrganizationSortIndicator('members', 'monthOnline') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('members', 'lastSeen')">Статус в сети<i>{{ getOrganizationSortIndicator('members', 'lastSeen') }}</i></button></span>
                  </div>

                  <div
                    v-for="member in sortedOrganizationMembers"
                    :key="member.id"
                    class="organization-members__row"
                    :class="{ 'organization-members__row--active': selectedOrganizationMember?.uid === member.uid }"
                    role="row"
                    tabindex="0"
                    @click="openMemberDetails(member)"
                    @keydown.enter.prevent="openMemberDetails(member)"
                    @keydown.space.prevent="openMemberDetails(member)"
                  >
                    <span role="cell">{{ member.id }}</span>
                    <strong role="cell">{{ member.name }}</strong>
                    <span role="cell">{{ member.uid }}</span>
                    <span role="cell">{{ member.role }}</span>
                    <span role="cell">{{ member.rank }}</span>
                    <span role="cell">{{ member.todayOnline }}</span>
                    <span role="cell">{{ member.monthOnline }}</span>
                    <span class="organization-members__status" role="cell">
                      {{ member.lastSeen }}
                      <i v-if="member.online" aria-hidden="true"></i>
                    </span>
                  </div>

                  <div v-if="sortedOrganizationMembers.length === 0" class="organization-empty organization-empty--table">
                    <strong>Коллеги не найдены</strong>
                    <span>Попробуйте изменить поиск или дождитесь обновления состава.</span>
                  </div>
                </div>
              </section>

              <section v-else-if="activeOrganizationSection === 'storage'" class="organization-storage" aria-label="Склад">
                <div class="organization-members__toolbar">
                  <label class="organization-members__search">
                    <Search aria-hidden="true" />
                    <input v-model="storageSearch" type="search" placeholder="Введите значение для поиска">
                  </label>

                  <details class="organization-sort-menu">
                    <summary class="organization-members__filter">
                      <Funnel aria-hidden="true" />
                      <span>{{ getOrganizationSortLabel('storage') }}</span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div class="organization-sort-menu__list">
                      <button
                        v-for="option in getOrganizationSortOptions('storage')"
                        :key="option.key"
                        type="button"
                        :class="{ 'organization-sort-menu__item--active': organizationSorts.storage?.key === option.key }"
                        @click="selectOrganizationSort('storage', option.key, $event)"
                      >
                        <span>{{ option.label }}</span>
                        <i>{{ getOrganizationSortIndicator('storage', option.key) }}</i>
                      </button>
                    </div>
                  </details>
                </div>

                <div class="organization-storage__table" role="table" aria-label="Логи склада">
                  <div class="organization-storage__row organization-storage__row--head" role="row">
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'name')">Имя и фамилия<i>{{ getOrganizationSortIndicator('storage', 'name') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'uid')">UID<i>{{ getOrganizationSortIndicator('storage', 'uid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'rank')">Ранг<i>{{ getOrganizationSortIndicator('storage', 'rank') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'action')">Действие<i>{{ getOrganizationSortIndicator('storage', 'action') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'amount')">Кол-во<i>{{ getOrganizationSortIndicator('storage', 'amount') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'itemName')">Название предмета<i>{{ getOrganizationSortIndicator('storage', 'itemName') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('storage', 'dateTime')">Дата и время<i>{{ getOrganizationSortIndicator('storage', 'dateTime') }}</i></button></span>
                  </div>

                  <div
                    v-for="log in sortedOrganizationStorageLogs"
                    :key="log.id"
                    class="organization-storage__row"
                    role="row"
                  >
                    <strong role="cell">{{ log.name }}</strong>
                    <span role="cell">{{ log.uid }}</span>
                    <span role="cell">{{ log.rank }}</span>
                    <span role="cell">{{ log.action }}</span>
                    <span role="cell">{{ log.amount }}</span>
                    <span role="cell">{{ log.itemName }}</span>
                    <span role="cell">{{ log.dateTime }}</span>
                  </div>

                  <div v-if="sortedOrganizationStorageLogs.length === 0" class="organization-empty organization-empty--table">
                    <strong>Лог склада пуст</strong>
                    <span>Операции со складом появятся здесь после обновления данных.</span>
                  </div>
                </div>
              </section>

              <section v-else-if="activeOrganizationSection === 'blacklist'" class="organization-blacklist" aria-label="Черный список">
                <div class="organization-blacklist__tabs" role="tablist" aria-label="Разделы черного списка">
                  <button
                    class="organization-blacklist__tab"
                    :class="{ 'organization-blacklist__tab--active': activeBlacklistTab === 'stats' }"
                    type="button"
                    role="tab"
                    :aria-selected="activeBlacklistTab === 'stats'"
                    @click="setBlacklistTab('stats')"
                  >
                    <ClipboardList aria-hidden="true" />
                    <span>Статистика</span>
                  </button>
                  <button
                    class="organization-blacklist__tab"
                    :class="{ 'organization-blacklist__tab--active': activeBlacklistTab === 'history' }"
                    type="button"
                    role="tab"
                    :aria-selected="activeBlacklistTab === 'history'"
                    @click="setBlacklistTab('history')"
                  >
                    <Clock3 aria-hidden="true" />
                    <span>История</span>
                  </button>
                  <button class="organization-blacklist__tab" type="button" @click="openBlacklistAddModal">
                    <UserPlus aria-hidden="true" />
                    <span>Добавить в список</span>
                  </button>
                </div>

                <div class="organization-members__toolbar">
                  <label class="organization-members__search">
                    <Search aria-hidden="true" />
                    <input v-model="blacklistSearch" type="search" placeholder="Введите значение для поиска">
                  </label>

                  <details class="organization-sort-menu">
                    <summary class="organization-members__filter">
                      <Funnel aria-hidden="true" />
                      <span>{{ getOrganizationSortLabel('blacklist') }}</span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div class="organization-sort-menu__list">
                      <button
                        v-for="option in getOrganizationSortOptions('blacklist')"
                        :key="option.key"
                        type="button"
                        :class="{ 'organization-sort-menu__item--active': organizationSorts.blacklist?.key === option.key }"
                        @click="selectOrganizationSort('blacklist', option.key, $event)"
                      >
                        <span>{{ option.label }}</span>
                        <i>{{ getOrganizationSortIndicator('blacklist', option.key) }}</i>
                      </button>
                    </div>
                  </details>
                </div>

                <div class="organization-blacklist__table" role="table" aria-label="Записи черного списка">
                  <div class="organization-blacklist__row organization-blacklist__row--head" role="row">
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('blacklist', 'playerName')">Участник списка<i>{{ getOrganizationSortIndicator('blacklist', 'playerName') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('blacklist', 'playerUid')">UID<i>{{ getOrganizationSortIndicator('blacklist', 'playerUid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('blacklist', 'issuerName')">Занес в список<i>{{ getOrganizationSortIndicator('blacklist', 'issuerName') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('blacklist', 'issuerUid')">UID<i>{{ getOrganizationSortIndicator('blacklist', 'issuerUid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('blacklist', 'comment')">Комментарий<i>{{ getOrganizationSortIndicator('blacklist', 'comment') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('blacklist', 'dateTime')">Дата и время<i>{{ getOrganizationSortIndicator('blacklist', 'dateTime') }}</i></button></span>
                  </div>

                  <div
                    v-for="entry in sortedBlacklistEntries"
                    :key="entry.id"
                    class="organization-blacklist__row"
                    :class="{ 'organization-blacklist__row--clickable': activeBlacklistTab !== 'history' }"
                    role="row"
                    :tabindex="activeBlacklistTab !== 'history' ? 0 : undefined"
                    @click="openBlacklistRemoveModal(entry)"
                    @keydown.enter.prevent="openBlacklistRemoveModal(entry)"
                    @keydown.space.prevent="openBlacklistRemoveModal(entry)"
                  >
                    <strong role="cell">{{ entry.playerName }}</strong>
                    <span role="cell">{{ entry.playerUid }}</span>
                    <strong role="cell">{{ entry.issuerName }}</strong>
                    <span role="cell">{{ entry.issuerUid }}</span>
                    <span role="cell">{{ entry.comment }}</span>
                    <span role="cell">{{ entry.dateTime }}</span>
                  </div>

                  <div v-if="sortedBlacklistEntries.length === 0" class="organization-empty organization-empty--table">
                    <strong>Записей нет</strong>
                    <span>{{ activeBlacklistTab === 'history' ? 'История черного списка пока пуста.' : 'Черный список пока пуст.' }}</span>
                  </div>
                </div>
              </section>

              <section v-else-if="activeOrganizationSection === 'info' && organizationInfo" class="organization-info" aria-label="Информация о семье">
                <aside class="organization-info__sidebar">
                  <div class="organization-info__brand">
                    <span class="organization-info__avatar" aria-hidden="true">{{ getOrganizationBadge(activeOrganization) }}</span>
                    <strong>{{ organizationInfo.label }}</strong>
                    <small>{{ organizationInfo.subtitle }}</small>
                    <button type="button">Редактировать профиль</button>
                  </div>

                  <div class="organization-info__metric organization-info__metric--level">
                    <div>
                      <strong>{{ organizationInfo.level }}</strong>
                      <span>Уровень</span>
                    </div>
                    <span>{{ organizationInfo.levelProgress }} / {{ organizationInfo.levelTarget }}</span>
                    <i :style="{ width: `${Math.min(100, (organizationInfo.levelProgress / organizationInfo.levelTarget) * 100)}%` }"></i>
                  </div>

                  <dl class="organization-info__stats organization-info__stats--summary">
                    <div class="organization-info__stat-row organization-info__stat-row--reputation">
                      <dt>Репутация</dt>
                      <dd>
                        <i aria-hidden="true"></i>
                        <span>{{ organizationInfo.reputation }}</span>
                        <PlusCircle aria-hidden="true" />
                      </dd>
                    </div>
                    <div class="organization-info__stat-row organization-info__stat-row--heading">
                      <dt>Баланс организации:</dt>
                    </div>
                    <div class="organization-info__stat-row">
                      <dt>Доллары:</dt>
                      <dd>
                        <span>{{ formatMoney(organizationInfo.donations) }}</span>
                        <CircleDollarSign aria-hidden="true" />
                      </dd>
                    </div>
                    <div class="organization-info__stat-row organization-info__stat-row--heading">
                      <dt>Слоты организации:</dt>
                    </div>
                    <div class="organization-info__stat-row">
                      <dt>Слоты участников:</dt>
                      <dd>{{ organizationInfo.memberSlotsUsed }} / {{ organizationInfo.memberSlotsTotal }}</dd>
                    </div>
                    <div class="organization-info__stat-row">
                      <dt>Гаражные места:</dt>
                      <dd>{{ organizationInfo.garageSlotsUsed }} / {{ organizationInfo.garageSlotsTotal }}</dd>
                    </div>
                  </dl>

                  <dl class="organization-info__stats organization-info__stats--legacy" aria-hidden="true">
                    <div>
                      <dt>Репутация</dt>
                      <dd>{{ organizationInfo.reputation }}</dd>
                    </div>
                    <div>
                      <dt>Баланс организации:</dt>
                      <dd>{{ formatMoney(organizationInfo.balance) }}</dd>
                    </div>
                    <div>
                      <dt>Донаты:</dt>
                      <dd>{{ formatMoney(organizationInfo.donations) }}</dd>
                    </div>
                    <div>
                      <dt>Слоты участников:</dt>
                      <dd>{{ organizationInfo.memberSlotsUsed }} / {{ organizationInfo.memberSlotsTotal }}</dd>
                    </div>
                    <div>
                      <dt>Гаражные места:</dt>
                      <dd>{{ organizationInfo.garageSlotsUsed }} / {{ organizationInfo.garageSlotsTotal }}</dd>
                    </div>
                  </dl>

                  <button class="organization-info__delete" type="button" @click="openDeleteOrganizationModal">
                    <Trash2 aria-hidden="true" />
                    <span>Удалить семью</span>
                  </button>
                </aside>

                <div class="organization-info__content">
                  <h2>Счета на оплату и уведомления</h2>

                  <div v-if="organizationInfo.bills.length" class="organization-info__bills">
                    <article
                      v-for="bill in organizationInfo.bills"
                      :key="bill.id"
                      class="organization-info-bill"
                    >
                      <h3>{{ bill.title }}</h3>
                      <p>Оплачено до: <strong>{{ bill.paidUntil }}</strong></p>
                      <p>Осталось: <strong>{{ bill.daysLeft }} дн.</strong></p>
                      <p>Стоимость оплаты за 1 день: <strong>{{ formatMoney(bill.dailyPrice) }}</strong></p>
                      <span>{{ bill.notice }}</span>
                      <button type="button" @click="payOrganizationBill(bill.id)">Оплатить</button>
                    </article>
                  </div>

                  <div v-else class="organization-info__empty">
                    <strong>Счетов нет</strong>
                    <span>Активные счета и уведомления появятся здесь.</span>
                  </div>
                </div>
              </section>

              <section v-else-if="activeOrganizationSection === 'upgrades' && organizationUpgrades" class="organization-upgrades" aria-label="Улучшения семьи">
                <div class="organization-upgrades__toolbar">
                  <div class="organization-upgrades__stats">
                    <span>
                      <CircleDollarSign aria-hidden="true" />
                      {{ formatMoney(organizationUpgrades.points) }}
                    </span>
                    <span>
                      <strong>{{ organizationUpgrades.reputation }}</strong>
                      {{ organizationUpgrades.direction }}
                    </span>
                  </div>

                  <button v-if="isFamilyOrganization" type="button" @click="openOrganizationDirectionModal">
                    <Settings aria-hidden="true" />
                    <span>Сменить направление</span>
                  </button>

                  <div class="organization-upgrades__zoom" aria-label="Zoom">
                    <button type="button" aria-label="Zoom out" @click="changeOrganizationUpgradeMapScale(-0.1)">
                      <MinusCircle aria-hidden="true" />
                    </button>
                    <button type="button" @click="setOrganizationUpgradeMapScale(organizationUpgradeMapDefaultScale)">
                      {{ Math.round(organizationUpgradeMapScale * 100) }}%
                    </button>
                    <button type="button" aria-label="Zoom in" @click="changeOrganizationUpgradeMapScale(0.1)">
                      <PlusCircle aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <Transition name="organization-upgrades-hint">
                  <div v-if="hoveredUpgrade" class="organization-upgrades__hint">
                    <span>{{ hoveredUpgrade.unlocked ? 'Открыто' : 'Не открыто' }}</span>
                    <strong>{{ hoveredUpgrade.name }}</strong>
                  </div>
                </Transition>

                <div
                  v-if="renderedOrganizationUpgradeCategories.length"
                  :ref="setOrganizationUpgradesViewport"
                  class="organization-upgrades__viewport"
                  :class="{ 'organization-upgrades__viewport--dragging': isOrganizationUpgradesDragging }"
                  @click.capture="suppressOrganizationUpgradeClickAfterDrag"
                  @pointercancel="stopOrganizationUpgradesDrag"
                  @pointerdown="startOrganizationUpgradesDrag"
                  @pointerleave="stopOrganizationUpgradesDrag"
                  @pointermove="dragOrganizationUpgradesMap"
                  @pointerup="stopOrganizationUpgradesDrag"
                  @wheel.passive="handleOrganizationUpgradesWheel"
                >
                  <svg class="organization-upgrades__map" :viewBox="organizationUpgradeMapViewBox" role="img" aria-label="Дерево улучшений семьи">
                  <defs>
                    <pattern id="organizationUpgradeGrid" width="18" height="18" patternUnits="userSpaceOnUse">
                      <path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(255,255,255,.035)" stroke-width="1" />
                    </pattern>
                  </defs>
                  <rect
                    :x="organizationUpgradeGridBounds.x"
                    :y="organizationUpgradeGridBounds.y"
                    :width="organizationUpgradeGridBounds.width"
                    :height="organizationUpgradeGridBounds.height"
                    fill="url(#organizationUpgradeGrid)"
                  />

                  <g :transform="organizationUpgradeMapTransform">
                    <g
                      v-for="category in renderedOrganizationUpgradeCategories"
                      :key="category.id"
                      class="organization-upgrades__branch"
                    >
                      <line
                        :x1="organizationUpgradeMapCenterX"
                        :y1="organizationUpgradeMapCenterY"
                        :x2="category.lineEndX"
                        :y2="category.lineEndY"
                      />
                      <text :x="category.lineEndX" :y="category.lineEndY" text-anchor="middle">{{ category.title }}</text>

                      <g
                        v-for="upgrade in category.upgrades"
                        :key="upgrade.id"
                        class="organization-upgrades__node"
                        :class="{
                          'organization-upgrades__node--active': upgrade.unlocked,
                          'organization-upgrades__node--selected': upgradeAction?.id === upgrade.id,
                        }"
                        role="button"
                        tabindex="0"
                        @click="selectOrganizationUpgrade(upgrade)"
                        @dblclick.stop.prevent="unlockOrganizationUpgrade(upgrade)"
                        @keydown.enter.prevent="selectOrganizationUpgrade(upgrade)"
                        @keydown.space.prevent="selectOrganizationUpgrade(upgrade)"
                        @mouseenter="hoveredUpgrade = upgrade"
                        @mouseleave="hoveredUpgrade = null"
                        @focus="hoveredUpgrade = upgrade"
                        @blur="hoveredUpgrade = null"
                      >
                        <rect :x="upgrade.x - 54" :y="upgrade.y - 22" width="108" height="44" rx="5" />
                        <text :x="upgrade.x" :y="upgrade.y" text-anchor="middle">
                          <tspan
                            v-for="(line, lineIndex) in splitUpgradeName(upgrade.name)"
                            :key="`${upgrade.id}-${line}`"
                            :x="upgrade.x"
                            :dy="lineIndex === 0 ? (splitUpgradeName(upgrade.name).length > 1 ? '-0.05em' : '0.35em') : '1.12em'"
                          >
                            {{ line }}
                          </tspan>
                        </text>
                      </g>
                    </g>

                    <g class="organization-upgrades__center">
                      <rect :x="organizationUpgradeMapCenterX - 27.5" :y="organizationUpgradeMapCenterY - 27.5" width="55" height="55" rx="12" />
                      <text :x="organizationUpgradeMapCenterX" :y="organizationUpgradeMapCenterY + 6" text-anchor="middle">{{ organizationHeaderLogo }}</text>
                    </g>
                  </g>
                </svg>
                </div>

                <div v-else class="organization-empty organization-empty--upgrades">
                  <strong>Улучшения не переданы</strong>
                  <span>Дерево улучшений появится после синхронизации категорий.</span>
                </div>

                <Transition name="organization-upgrades-details">
                  <aside v-if="upgradeAction" class="organization-upgrades__details">
                    <header>
                      <div>
                        <span>{{ upgradeAction.unlocked ? 'Улучшение открыто' : upgradeAction.categoryTitle }}</span>
                        <h2>{{ upgradeAction.name }}</h2>
                      </div>
                      <button type="button" aria-label="Закрыть" @click="upgradeAction = null"></button>
                    </header>
                    <p>{{ upgradeAction.description }}</p>
                    <ul>
                      <li v-for="benefit in upgradeAction.benefits" :key="benefit">{{ benefit }}</li>
                    </ul>
                    <button
                      class="organization-upgrades__unlock"
                      type="button"
                      :disabled="upgradeAction.unlocked"
                      @click="unlockOrganizationUpgrade(upgradeAction)"
                    >
                      {{ upgradeAction.unlocked ? 'Уже открыто' : 'Открыть улучшение' }}
                    </button>
                  </aside>
                </Transition>
              </section>

              <section v-else-if="activeOrganizationSection === 'territories'" class="organization-territories" aria-label="Контроль территорий">
                <div class="organization-territories__toolbar">
                  <div class="organization-territories__stats" aria-label="Статистика территорий">
                    <span>
                      Контроль:
                      <strong>{{ organizationTerritories?.controlPercent }}%</strong>
                    </span>
                    <span>
                      {{ organizationTerritories?.controlled }} / {{ organizationTerritories?.total }}
                    </span>
                    <span>
                      <Swords aria-hidden="true" />
                      {{ organizationTerritories?.attacksAvailable }} / {{ organizationTerritories?.attacksTotal }}
                    </span>
                    <span>
                      <CircleSlash aria-hidden="true" />
                      {{ organizationTerritories?.defensesAvailable }} / {{ organizationTerritories?.defensesTotal }}
                    </span>
                  </div>

                  <div class="organization-territories__actions">
                    <button type="button" @click="openCaptureScheduleModal">
                      <CalendarDays aria-hidden="true" />
                      <span>Расписание захватов</span>
                    </button>
                    <button type="button" aria-label="Уведомления">
                      <Bell aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div v-if="organizationTerritories?.businesses.length" class="organization-territories__canvas-wrap">
                  <canvas :ref="setTerritoriesCanvas" class="organization-territories__canvas" aria-label="Карта территорий"></canvas>
                </div>

                <div v-else class="organization-empty organization-empty--territories">
                  <strong>Территории не загружены</strong>
                  <span>Карта появится после передачи списка бизнесов.</span>
                </div>
              </section>

              <section v-else-if="activeOrganizationSection === 'bonus'" class="organization-bonus" aria-label="Премирование">
                <div class="organization-bonus__controls">
                  <button type="button" @click="openMassBonusModal">
                    <PlusCircle aria-hidden="true" />
                    <span>Массовая выплата</span>
                  </button>
                </div>

                <div class="organization-members__toolbar">
                  <label class="organization-members__search">
                    <Search aria-hidden="true" />
                    <input v-model="bonusSearch" type="search" placeholder="Введите значение">
                  </label>

                  <details class="organization-sort-menu">
                    <summary class="organization-members__filter">
                      <Funnel aria-hidden="true" />
                      <span>{{ getOrganizationSortLabel('bonus') }}</span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div class="organization-sort-menu__list">
                      <button
                        v-for="option in getOrganizationSortOptions('bonus')"
                        :key="option.key"
                        type="button"
                        :class="{ 'organization-sort-menu__item--active': organizationSorts.bonus?.key === option.key }"
                        @click="selectOrganizationSort('bonus', option.key, $event)"
                      >
                        <span>{{ option.label }}</span>
                        <i>{{ getOrganizationSortIndicator('bonus', option.key) }}</i>
                      </button>
                    </div>
                  </details>
                </div>

                <div class="organization-bonus__table" role="table" aria-label="Логи премирования">
                  <div class="organization-bonus__row organization-bonus__row--head" role="row">
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'issuerName')">Выплатил<i>{{ getOrganizationSortIndicator('bonus', 'issuerName') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'issuerUid')">В. UID<i>{{ getOrganizationSortIndicator('bonus', 'issuerUid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'issuerRank')">В. Ранг<i>{{ getOrganizationSortIndicator('bonus', 'issuerRank') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'recipientName')">Получил<i>{{ getOrganizationSortIndicator('bonus', 'recipientName') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'recipientUid')">П. UID<i>{{ getOrganizationSortIndicator('bonus', 'recipientUid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'recipientRank')">П. Ранг<i>{{ getOrganizationSortIndicator('bonus', 'recipientRank') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'comment')">Комментарий<i>{{ getOrganizationSortIndicator('bonus', 'comment') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'amount')">Сумма<i>{{ getOrganizationSortIndicator('bonus', 'amount') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('bonus', 'dateTime')">Дата и время<i>{{ getOrganizationSortIndicator('bonus', 'dateTime') }}</i></button></span>
                  </div>

                  <div
                    v-for="log in sortedOrganizationBonusLogs"
                    :key="log.id"
                    class="organization-bonus__row"
                    role="row"
                  >
                    <strong role="cell">{{ log.issuerName }}</strong>
                    <span role="cell">{{ log.issuerUid }}</span>
                    <span role="cell">{{ log.issuerRank }}</span>
                    <strong role="cell">{{ log.recipientName }}</strong>
                    <span role="cell">{{ log.recipientUid }}</span>
                    <span role="cell">{{ log.recipientRank }}</span>
                    <span role="cell">{{ log.comment }}</span>
                    <span role="cell">{{ formatMoney(log.amount) }}</span>
                    <span role="cell">{{ log.dateTime }}</span>
                  </div>

                  <div v-if="sortedOrganizationBonusLogs.length === 0" class="organization-empty organization-empty--table">
                    <strong>Премий нет</strong>
                    <span>История премирования появится после первых выплат.</span>
                  </div>
                </div>
              </section>

              <section v-else-if="activeOrganizationSection === 'settings'" class="organization-settings" aria-label="Настройки организации">
                <div class="organization-settings__tabs" role="tablist" aria-label="Разделы настроек">
                  <button
                    class="organization-settings__tab"
                    :class="{ 'organization-settings__tab--active': activeSettingsTab === 'roles' }"
                    type="button"
                    role="tab"
                    :aria-selected="activeSettingsTab === 'roles'"
                    @click="setSettingsTab('roles')"
                  >
                    <ClipboardList aria-hidden="true" />
                    <span>Должность</span>
                  </button>
                  <button
                    class="organization-settings__tab"
                    :class="{ 'organization-settings__tab--active': activeSettingsTab === 'items' }"
                    type="button"
                    role="tab"
                    :aria-selected="activeSettingsTab === 'items'"
                    @click="setSettingsTab('items')"
                  >
                    <Package aria-hidden="true" />
                    <span>Предметы</span>
                  </button>
                  <button
                    v-if="isActiveOrganizationFamily"
                    class="organization-settings__tab"
                    :class="{ 'organization-settings__tab--active': activeSettingsTab === 'realEstate' }"
                    type="button"
                    role="tab"
                    :aria-selected="activeSettingsTab === 'realEstate'"
                    @click="setSettingsTab('realEstate')"
                  >
                    <Building2 aria-hidden="true" />
                    <span>Недвижимость</span>
                  </button>
                  <button
                    class="organization-settings__tab"
                    :class="{ 'organization-settings__tab--active': activeSettingsTab === 'vehicles' }"
                    type="button"
                    role="tab"
                    :aria-selected="activeSettingsTab === 'vehicles'"
                    @click="setSettingsTab('vehicles')"
                  >
                    <Car aria-hidden="true" />
                    <span>Транспорт</span>
                  </button>
                </div>

                <div v-if="activeSettingsTab === 'roles' || activeSettingsTab === 'items'" class="organization-settings__layout">
                  <aside class="organization-settings__ranks" aria-label="Ранги">
                    <div class="organization-settings__rank-head">Название должности</div>
                    <button
                      v-for="rank in organizationSettingRanks"
                      :key="rank.id"
                      class="organization-settings__rank"
                      :class="{ 'organization-settings__rank--active': selectedSettingsRank?.id === rank.id }"
                      type="button"
                      @click="selectedSettingsRankId = rank.id"
                    >
                      <span>{{ rank.rank }}</span>
                      <strong>{{ rank.name }}</strong>
                    </button>

                    <div v-if="organizationSettingRanks.length === 0" class="organization-empty organization-empty--settings-list">
                      <strong>Ранги не переданы</strong>
                      <span>Список должностей появится после синхронизации.</span>
                    </div>
                  </aside>

                  <div class="organization-settings__permissions" aria-label="Возможности ранга">
                    <label
                      v-for="permission in activeSettingsPermissions"
                      :key="permission.id"
                      class="organization-settings__permission"
                    >
                      <input
                        type="checkbox"
                        :checked="isPermissionEnabled(permission)"
                        @change="toggleOrganizationPermission(permission, $event)"
                      >
                      <span class="organization-settings__switch" aria-hidden="true"></span>
                      <span>{{ permission.label }}</span>
                    </label>

                    <div v-if="activeSettingsPermissions.length === 0" class="organization-empty organization-empty--settings">
                      <strong>Разрешений нет</strong>
                      <span>Для выбранного ранга пока не переданы права.</span>
                    </div>
                  </div>
                </div>

                <template v-else>
                  <div class="organization-members__toolbar">
                    <label class="organization-members__search">
                      <Search aria-hidden="true" />
                      <input v-model="settingsSearch" type="search" placeholder="Введите значение для поиска">
                    </label>

                    <details class="organization-sort-menu">
                      <summary class="organization-members__filter">
                        <Funnel aria-hidden="true" />
                        <span>{{ getOrganizationSortLabel(getSettingsSortTable()) }}</span>
                        <ChevronDown aria-hidden="true" />
                      </summary>
                      <div class="organization-sort-menu__list">
                        <button
                          v-for="option in getOrganizationSortOptions(getSettingsSortTable())"
                          :key="option.key"
                          type="button"
                          :class="{ 'organization-sort-menu__item--active': organizationSorts[getSettingsSortTable()]?.key === option.key }"
                          @click="selectOrganizationSort(getSettingsSortTable(), option.key, $event)"
                        >
                          <span>{{ option.label }}</span>
                          <i>{{ getOrganizationSortIndicator(getSettingsSortTable(), option.key) }}</i>
                        </button>
                      </div>
                    </details>
                  </div>

                  <div v-if="activeSettingsTab === 'realEstate' && isFamilyOrganization" class="organization-settings-assets organization-settings-assets--estate">
                    <article
                      v-for="asset in sortedSettingsRealEstate"
                      :key="asset.id"
                      class="organization-estate-card"
                    >
                      <header :style="asset.image ? { '--estate-image': `url(${asset.image})` } : undefined">
                        <strong>{{ asset.title }}</strong>
                        <span aria-hidden="true">
                          <MapPin />
                        </span>
                      </header>

                      <dl>
                        <div v-for="feature in asset.features" :key="feature.label">
                          <dt>{{ feature.label }}</dt>
                          <dd>{{ feature.value }}</dd>
                        </div>
                      </dl>
                    </article>

                    <div v-if="sortedSettingsRealEstate.length === 0" class="organization-empty organization-empty--cards">
                      <strong>Недвижимость не найдена</strong>
                      <span>Объекты появятся здесь после обновления имущества семьи.</span>
                    </div>
                  </div>

                  <div v-else class="organization-settings-assets organization-settings-assets--vehicles">
                    <article
                      v-for="vehicle in sortedSettingsVehicles"
                      :key="vehicle.id"
                      class="organization-vehicle-card"
                    >
                      <header>
                        <strong>{{ vehicle.name }}</strong>
                        <span>{{ vehicle.className }}</span>
                      </header>

                      <div class="organization-vehicle-card__preview" :class="`organization-vehicle-card__preview--${vehicle.id}`">
                        <Car aria-hidden="true" />
                      </div>

                      <div v-if="vehicle.owner" class="organization-vehicle-card__owner">
                        <span>Владелец:</span>
                        <strong>{{ vehicle.owner }}</strong>
                        <TwinkleButton v-if="vehicle.canReturn" variant="compact" @click="returnSettingsVehicle(vehicle.id)">
                          Вернуть
                        </TwinkleButton>
                      </div>

                      <div class="organization-vehicle-card__stepper">
                        <span>Процент с дохода</span>
                        <TwinkleButton
                          aria-label="Уменьшить процент с дохода"
                          icon-only
                          variant="compact"
                          @click="updateSettingsVehicleValue(vehicle.id, 'incomePercent', -1)"
                        >
                          <ChevronDown aria-hidden="true" />
                        </TwinkleButton>
                        <strong>{{ vehicle.incomePercent }}</strong>
                        <TwinkleButton
                          aria-label="Увеличить процент с дохода"
                          icon-only
                          variant="compact"
                          @click="updateSettingsVehicleValue(vehicle.id, 'incomePercent', 1)"
                        >
                          <ChevronDown aria-hidden="true" />
                        </TwinkleButton>
                      </div>

                      <div class="organization-vehicle-card__stepper">
                        <span>Доступ ранга</span>
                        <TwinkleButton
                          aria-label="Уменьшить доступ ранга"
                          icon-only
                          variant="compact"
                          @click="updateSettingsVehicleValue(vehicle.id, 'rankAccess', -1)"
                        >
                          <ChevronDown aria-hidden="true" />
                        </TwinkleButton>
                        <strong>{{ vehicle.rankAccess }}</strong>
                        <TwinkleButton
                          aria-label="Увеличить доступ ранга"
                          icon-only
                          variant="compact"
                          @click="updateSettingsVehicleValue(vehicle.id, 'rankAccess', 1)"
                        >
                          <ChevronDown aria-hidden="true" />
                        </TwinkleButton>
                      </div>
                    </article>

                    <div v-if="sortedSettingsVehicles.length === 0" class="organization-empty organization-empty--cards">
                      <strong>Транспорт не найден</strong>
                      <span>Машины появятся здесь после обновления автопарка.</span>
                    </div>
                  </div>
                </template>
              </section>

              <section v-else-if="activeOrganizationSection === 'balance'" class="organization-balance" aria-label="Управление балансом">
                <div class="organization-members__toolbar">
                  <label class="organization-members__search">
                    <Search aria-hidden="true" />
                    <input v-model="balanceSearch" type="search" placeholder="Введите значение для поиска">
                  </label>

                  <details class="organization-sort-menu">
                    <summary class="organization-members__filter">
                      <Funnel aria-hidden="true" />
                      <span>{{ getOrganizationSortLabel('balance') }}</span>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div class="organization-sort-menu__list">
                      <button
                        v-for="option in getOrganizationSortOptions('balance')"
                        :key="option.key"
                        type="button"
                        :class="{ 'organization-sort-menu__item--active': organizationSorts.balance?.key === option.key }"
                        @click="selectOrganizationSort('balance', option.key, $event)"
                      >
                        <span>{{ option.label }}</span>
                        <i>{{ getOrganizationSortIndicator('balance', option.key) }}</i>
                      </button>
                    </div>
                  </details>
                </div>

                <div class="organization-balance__table" role="table" aria-label="Логи баланса">
                  <div class="organization-balance__row organization-balance__row--head" role="row">
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'name')">Имя и фамилия<i>{{ getOrganizationSortIndicator('balance', 'name') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'uid')">UID<i>{{ getOrganizationSortIndicator('balance', 'uid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'rank')">Ранг<i>{{ getOrganizationSortIndicator('balance', 'rank') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'transactionType')">Тип транзакции<i>{{ getOrganizationSortIndicator('balance', 'transactionType') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'comment')">Комментарий<i>{{ getOrganizationSortIndicator('balance', 'comment') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'amount')">Сумма<i>{{ getOrganizationSortIndicator('balance', 'amount') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('balance', 'dateTime')">Дата<i>{{ getOrganizationSortIndicator('balance', 'dateTime') }}</i></button></span>
                  </div>

                  <div
                    v-for="log in sortedOrganizationBalanceLogs"
                    :key="log.id"
                    class="organization-balance__row"
                    role="row"
                  >
                    <strong role="cell">{{ log.name ?? '\u2014' }}</strong>
                    <span role="cell">{{ log.uid ?? '\u2014' }}</span>
                    <span role="cell">{{ log.rank ?? '\u2014' }}</span>
                    <span role="cell">{{ log.transactionType }}</span>
                    <span role="cell">{{ log.comment ?? '\u2014' }}</span>
                    <span role="cell">{{ formatMoney(log.amount) }}</span>
                    <span role="cell">{{ log.dateTime }}</span>
                  </div>

                  <div v-if="sortedOrganizationBalanceLogs.length === 0" class="organization-empty organization-empty--table">
                    <strong>Операций нет</strong>
                    <span>Пополнения и списания баланса появятся здесь.</span>
                  </div>
                </div>
              </section>

              <section v-else-if="selectedOrganizationMember" class="organization-member-profile" aria-label="Информация о коллеге">
                <div class="organization-member-profile__stats">
                  <article>
                    <span>UID:</span>
                    <strong>{{ selectedOrganizationMember.uid }}</strong>
                  </article>
                  <article>
                    <span>Ранг:</span>
                    <strong>{{ selectedOrganizationMember.rank }}</strong>
                  </article>
                  <article>
                    <span>Должность:</span>
                    <strong>{{ selectedOrganizationMember.role }}</strong>
                  </article>
                  <article>
                    <span>WARN:</span>
                    <strong>{{ selectedOrganizationMember.warnCount ?? 0 }} / 3</strong>
                  </article>
                  <article>
                    <span>Сегодня:</span>
                    <strong>{{ selectedOrganizationMember.todayOnline }}</strong>
                  </article>
                  <article>
                    <span>Месяц:</span>
                    <strong>{{ selectedOrganizationMember.monthOnline }}</strong>
                  </article>
                  <article>
                    <span>Принял в орг:</span>
                    <strong>{{ selectedOrganizationMember.invitedBy ?? 'Не указано' }}</strong>
                  </article>
                </div>

                <div class="organization-member-profile__actions">
                  <button
                    v-for="action in organizationMemberActions"
                    :key="action.id"
                    class="organization-member-action"
                    :class="[
                      `organization-member-action--${action.id}`,
                      { 'organization-member-action--confirm': pendingMemberAction?.id === action.id },
                    ]"
                    type="button"
                    @click="handleMemberAction(action)"
                  >
                    <component :is="action.icon" aria-hidden="true" />
                    <span>{{ action.label }}</span>
                  </button>
                </div>

                <div class="organization-member-history" role="table" aria-label="История действий">
                  <div class="organization-member-history__row organization-member-history__row--head" role="row">
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('memberHistory', 'leader')">Руководство<i>{{ getOrganizationSortIndicator('memberHistory', 'leader') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('memberHistory', 'uid')">UID<i>{{ getOrganizationSortIndicator('memberHistory', 'uid') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('memberHistory', 'rank')">Ранг<i>{{ getOrganizationSortIndicator('memberHistory', 'rank') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('memberHistory', 'action')">Действие<i>{{ getOrganizationSortIndicator('memberHistory', 'action') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('memberHistory', 'comment')">Комментарий<i>{{ getOrganizationSortIndicator('memberHistory', 'comment') }}</i></button></span>
                    <span role="columnheader"><button class="organization-sort" type="button" @click="setOrganizationSort('memberHistory', 'dateTime')">Дата и время<i>{{ getOrganizationSortIndicator('memberHistory', 'dateTime') }}</i></button></span>
                  </div>

                  <div
                    v-for="record in sortedSelectedMemberHistory"
                    :key="record.id"
                    class="organization-member-history__row"
                    role="row"
                  >
                    <strong role="cell">{{ record.leader }}</strong>
                    <span role="cell">{{ record.uid }}</span>
                    <span role="cell">{{ record.rank }}</span>
                    <span role="cell">{{ record.action }}</span>
                    <span role="cell">{{ record.comment || '-' }}</span>
                    <span role="cell">{{ record.dateTime }}</span>
                  </div>

                  <div v-if="sortedSelectedMemberHistory.length === 0" class="organization-empty organization-empty--table">
                    <strong>История пуста</strong>
                    <span>Действия по выбранному участнику пока не переданы.</span>
                  </div>
                </div>
              </section>
            </section>

            <section v-if="pendingMemberAction" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <form
                v-if="isPendingMemberRankAction"
                class="organization-confirm-modal__panel"
                @submit.prevent="submitMemberRankAction"
              >
                <h2>{{ pendingMemberAction.label }}</h2>
                <p>{{ selectedOrganizationMember?.name }}</p>
                <label>
                  <span>Ранг</span>
                  <select v-model="memberRankActionTargetId" required>
                    <option disabled value="">Выберите ранг</option>
                    <option
                      v-for="rank in memberRankActionOptions"
                      :key="rank.id"
                      :value="rank.id"
                    >
                      {{ rank.rank }} - {{ rank.name }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>Причина</span>
                  <input v-model.trim="memberRankActionReason" type="text" placeholder="Укажите причину">
                </label>
                <div>
                  <button type="button" @click="submitMemberAction(false)">Отмена</button>
                  <button type="submit" :disabled="!selectedMemberRankActionRank">Подтвердить</button>
                </div>
              </form>
              <form
                v-else-if="isPendingMemberDismissAction"
                class="organization-confirm-modal__panel"
                @submit.prevent="submitMemberDismissAction"
              >
                <h2>Уволить</h2>
                <p>{{ selectedOrganizationMember?.name }}</p>
                <label>
                  <span>Причина</span>
                  <input v-model.trim="memberDismissReason" type="text" placeholder="Укажите причину увольнения">
                </label>
                <label class="organization-confirm-checkbox">
                  <input v-model="memberDismissToBlacklist" type="checkbox">
                  <span aria-hidden="true"></span>
                  <strong>Занести в чёрный список</strong>
                </label>
                <div>
                  <button type="button" @click="submitMemberAction(false)">Отмена</button>
                  <button type="submit">Уволить</button>
                </div>
              </form>
              <div v-else class="organization-confirm-modal__panel">
                <h2>{{ pendingMemberAction.label }}</h2>
                <p>Применить действие к {{ selectedOrganizationMember?.name }}?</p>
                <div>
                  <button type="button" @click="submitMemberAction(false)">Отмена</button>
                  <button type="button" @click="submitMemberAction(true)">Подтвердить</button>
                </div>
              </div>
            </section>

            <section v-if="bonusModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <form class="organization-confirm-modal__panel organization-confirm-modal__panel--bonus" @submit.prevent="submitBonus">
                <h2>Выдать премию</h2>
                <p>{{ selectedOrganizationMember?.name }}</p>
                <label>
                  <span>Сумма</span>
                  <input v-model="bonusAmount" type="number" min="1" inputmode="numeric" placeholder="Введите сумму">
                </label>
                <label>
                  <span>Комментарий</span>
                  <input v-model.trim="bonusComment" type="text" placeholder="Причина премии">
                </label>
                <div>
                  <button type="button" @click="closeBonusModal(false)">Отмена</button>
                  <button type="submit">Выдать</button>
                </div>
              </form>
            </section>

            <section v-if="balanceModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <form class="organization-confirm-modal__panel organization-confirm-modal__panel--balance" @submit.prevent="submitBalanceAction">
                <h2>{{ balanceAction === 'deposit' ? 'Пополнить баланс' : 'Снять с баланса' }}</h2>
                <p>{{ activeOrganization?.name }}</p>
                <label>
                  <span>Сумма</span>
                  <input v-model="balanceAmount" type="number" min="1" inputmode="numeric" placeholder="Введите сумму">
                </label>
                <label>
                  <span>Комментарий</span>
                  <input v-model.trim="balanceComment" type="text" placeholder="Комментарий">
                </label>
                <div>
                  <button type="button" @click="closeBalanceModal(false)">Отмена</button>
                  <button type="submit">{{ balanceAction === 'deposit' ? 'Пополнить' : 'Снять' }}</button>
                </div>
              </form>
            </section>

            <section v-if="massBonusModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <form class="organization-confirm-modal__panel organization-confirm-modal__panel--bonus" @submit.prevent="submitMassBonusAction">
                <h2>Массовая выплата</h2>
                <p>{{ activeOrganization?.name }}</p>
                <label>
                  <span>Сумма</span>
                  <input v-model="massBonusAmount" type="number" min="1" inputmode="numeric" placeholder="Введите сумму">
                </label>
                <label>
                  <span>Комментарий</span>
                  <input v-model.trim="massBonusComment" type="text" placeholder="Причина выплаты">
                </label>
                <div>
                  <button type="button" @click="closeMassBonusModal(false)">Отмена</button>
                  <button type="submit">Выдать</button>
                </div>
              </form>
            </section>

            <section v-if="captureScheduleModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <div class="organization-confirm-modal__panel organization-confirm-modal__panel--schedule">
                <h2>Расписание захватов</h2>
                <div class="organization-schedule">
                  <div
                    v-for="day in organizationTerritories?.captureSchedule ?? []"
                    :key="day.day"
                    class="organization-schedule__row"
                  >
                    <strong>{{ day.day }}</strong>
                    <span>{{ day.times.join(', ') }}</span>
                  </div>

                  <div v-if="(organizationTerritories?.captureSchedule.length ?? 0) === 0" class="organization-empty organization-empty--schedule">
                    <strong>Расписание пусто</strong>
                    <span>Окна захватов появятся после обновления данных.</span>
                  </div>
                </div>
                <div>
                  <button type="button" @click="closeCaptureScheduleModal">Закрыть</button>
                  <button type="button" @click="closeCaptureScheduleModal">Готово</button>
                </div>
              </div>
            </section>

            <section v-if="blacklistAddModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <form class="organization-confirm-modal__panel organization-confirm-modal__panel--blacklist" @submit.prevent="submitBlacklistAdd">
                <h2>Добавить в чёрный список</h2>
                <p>Можно выбрать игрока из списка или ввести статик игрока вне организации.</p>
                <label>
                  <span>Статик игрока</span>
                  <input
                    v-model.trim="blacklistPlayerStatic"
                    type="text"
                    inputmode="numeric"
                    placeholder="Введите статик игрока"
                  >
                </label>

                <label>
                  <span>Причина</span>
                  <input v-model.trim="blacklistReason" type="text" placeholder="Введите причину">
                </label>
                <div>
                  <button type="button" @click="closeBlacklistAddModal(false)">Отмена</button>
                  <button type="submit">Добавить</button>
                </div>
              </form>
            </section>

            <section v-if="blacklistRemoveModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <form class="organization-confirm-modal__panel organization-confirm-modal__panel--blacklist" @submit.prevent="submitBlacklistRemove">
                <h2>Снять с чёрного списка</h2>
                <p>{{ blacklistRemoveEntry?.playerName }} / {{ blacklistRemoveEntry?.playerUid }}</p>
                <label>
                  <span>Причина</span>
                  <input v-model.trim="blacklistRemoveReason" type="text" placeholder="Введите причину снятия">
                </label>
                <div>
                  <button type="button" @click="closeBlacklistRemoveModal(false)">Отмена</button>
                  <button type="submit">Снять</button>
                </div>
              </form>
            </section>

            <section v-if="deleteOrganizationModalOpen" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <div class="organization-confirm-modal__panel">
                <h2>Удалить семью?</h2>
                <p>Действие отправится на сервер для подтверждения удаления {{ activeOrganization?.name }}.</p>
                <div>
                  <button type="button" @click="closeDeleteOrganizationModal(false)">Отмена</button>
                  <button type="button" @click="closeDeleteOrganizationModal(true)">Удалить</button>
                </div>
              </div>
            </section>

            <section v-if="organizationDirectionModalOpen && isFamilyOrganization" class="organization-confirm-modal" aria-modal="true" role="dialog">
              <div class="organization-confirm-modal__panel organization-confirm-modal__panel--directions">
                <header class="organization-directions__header">
                  <div>
                    <h2>Сменить направление</h2>
                    <p>Выберите ветку развития организации.</p>
                  </div>
                  <button type="button" aria-label="Закрыть" @click="closeOrganizationDirectionModal"></button>
                </header>

                <div class="organization-directions">
                  <button
                    v-for="direction in organizationDirections"
                    :key="direction.id"
                    class="organization-direction-card"
                    type="button"
                    @click="selectOrganizationDirection(direction.id)"
                  >
                    <span class="organization-direction-card__image" :style="{ background: direction.image }"></span>
                    <strong>{{ direction.title }}</strong>
                    <span>{{ direction.description }}</span>
                  </button>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="activeTabletApp === 'trucker'">
            <TruckerApp :payload="props.payload?.trucker" @close="closeTabletApp" />
          </template>

          <template v-else-if="activeTabletApp === 'armoredCollector'">
            <ArmoredCollectorApp :payload="props.payload?.armoredCollector" @close="closeTabletApp" />
          </template>

          <template v-else-if="activeTabletApp === 'marketplace'">
            <MarketplaceApp :payload="props.payload?.marketplace" @close="closeTabletApp" />
          </template>

          <template v-else-if="activeTabletApp === 'business'">
            <BusinessApp :businesses="tabletBusinesses" @close="closeTabletApp" />
          </template>

          <template v-else-if="activeTabletApp === 'apartment'">
            <PropertyApp
              :active-tab="activePropertyTab"
              :properties="tabletApartments"
              :selected-property="selectedApartment"
              kind="apartment"
              :title="apartmentTitle"
              @action="handleApartmentAction"
              @apply-interior="applyApartmentInterior"
              @back="backFromApartmentDetails"
              @close="closeTabletApp"
              @evict-resident="evictApartmentResident"
              @route="routeToApartment"
              @select="selectApartment"
              @set-tab="setPropertyTab"
              @toggle-lock="toggleApartmentLock"
            />
          </template>

          <template v-else-if="activeTabletApp === 'house'">
            <PropertyApp
              :active-tab="activePropertyTab"
              :properties="tabletHouses"
              :selected-property="selectedHouse"
              kind="house"
              :title="houseTitle"
              @action="handleHouseAction"
              @apply-interior="applyHouseInterior"
              @back="backFromHouseDetails"
              @close="closeTabletApp"
              @evict-resident="evictHouseResident"
              @route="routeToHouse"
              @select="selectHouse"
              @set-tab="setPropertyTab"
              @toggle-lock="toggleHouseLock"
            />
          </template>

          <template v-else>
            <div class="tablet-icons">
              <button
                v-for="app in apps"
                :key="app.id"
                class="tablet-icon"
                type="button"
                @click="openApp(app)"
              >
                <span class="tablet-icon__tile" :class="`tablet-icon__tile--${app.theme}`" :style="getOrganizationTileStyle(app.organization)">
                  <span v-if="app.organization" class="tablet-icon__organization" aria-hidden="true">
                    {{ getOrganizationBadge(app.organization) }}
                  </span>
                  <component :is="app.icon" v-else-if="app.icon" class="tablet-icon__lucide" aria-hidden="true" />
                  <span v-else class="tablet-icon__glyph" aria-hidden="true"></span>
                </span>
                <span class="tablet-icon__label">{{ app.label }}</span>
              </button>
            </div>

            <div class="tablet-pages" aria-hidden="true">
              <span class="tablet-pages__dot tablet-pages__dot--active"></span>
              <span class="tablet-pages__dot"></span>
            </div>

            <nav class="tablet-dock" aria-label="Быстрый доступ">
              <button
                v-for="app in dockApps"
                :key="`dock-${app.id}`"
                class="tablet-icon tablet-icon--dock"
                type="button"
                @click="openApp(app)"
              >
                <span class="tablet-icon__tile" :class="`tablet-icon__tile--${app.theme}`" :style="getOrganizationTileStyle(app.organization)">
                  <span v-if="app.organization" class="tablet-icon__organization" aria-hidden="true">
                    {{ getOrganizationBadge(app.organization) }}
                  </span>
                  <component :is="app.icon" v-else-if="app.icon" class="tablet-icon__lucide" aria-hidden="true" />
                  <span v-else class="tablet-icon__glyph" aria-hidden="true"></span>
                </span>
              </button>
            </nav>

            <div class="tablet-home-indicator" aria-hidden="true"></div>
          </template>
        </div>
      </div>
    </section>
  </main>
</template>

<style lang="scss" scoped>
@use "./organization/organization";

.tablet-app {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.2vh;
  background: transparent;
  color: #ffffff;
  font-family: "SF Pro Display", "Segoe UI", sans-serif;
  box-sizing: border-box;
}

.tablet-device {
  position: relative;
  width: min(116vh, calc(100vw - 1.5vh));
  aspect-ratio: 1320 / 945;
  background: url("/icon-ipad-1.png") center / contain no-repeat;
}

.tablet-device::before,
.tablet-device::after {
  display: none;
}

.tablet-device__bezel {
  position: absolute;
  inset: 5.05% 3.15% 5.75%;
  border-radius: 3vh;
  overflow: hidden;
}

.tablet-device__camera {
  display: none;
}

.tablet-device__camera::before,
.tablet-device__camera::after,
.tablet-device__camera span {
  position: absolute;
  top: 50%;
  border-radius: 50%;
  content: "";
  transform: translateY(-50%);
}

.tablet-device__camera::before {
  left: 0;
  width: 3.1vh;
  height: 1.2vh;
  border-radius: 999px;
  background: rgb(16 16 18 / 92%);
}

.tablet-device__camera span {
  left: 7.3vh;
  width: 0.72vh;
  height: 0.72vh;
  background: radial-gradient(circle at 35% 35%, #2860c8, #02030c 65%);
  box-shadow: 0 0 0.8vh rgb(26 78 180 / 54%);
}

.tablet-device__camera::after {
  right: 0;
  width: 1.25vh;
  height: 1.25vh;
  background: #070707;
}

.tablet-screen {
  position: absolute;
  inset: 0;
  border-radius: 3vh;
  overflow: hidden;
  background:
    radial-gradient(26vh 43vh at -1% 70%, #d454f4 0 13%, #7a1f96 33%, transparent 34%),
    radial-gradient(33vh 48vh at 2% 83%, #020205 0 58%, transparent 59%),
    radial-gradient(58vh 36vh at 88% 98%, #ac2ecd 0 28%, #541166 52%, transparent 53%),
    radial-gradient(66vh 46vh at 78% -4%, #1a061f 0 40%, #461059 68%, transparent 69%),
    radial-gradient(67vh 62vh at 54% -2%, #5d1772 0 48%, #ac2ecd 64%, transparent 65%),
    radial-gradient(34vh 68vh at 0% 0%, #210728 0 52%, transparent 53%),
    linear-gradient(135deg, #100613 0%, #08040a 50%, #0f0f10 100%);
  box-shadow: inset 0 0 0 0.12vh rgb(255 255 255 / 5%);
}

.tablet-screen::before {
  position: absolute;
  inset: 0;
  background: transparent;
  content: "";
  pointer-events: none;
}

.tablet-status {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.18vh 2.4vh 0;
  color: #ffffff;
  font-size: 1.05vh;
  font-weight: 600;
  line-height: 1;
}

.tablet-status__left,
.tablet-status__right {
  display: flex;
  align-items: center;
  gap: 0.55vh;
}

.tablet-signal {
  display: flex;
  align-items: flex-end;
  gap: 0.16vh;
  height: 1vh;
}

.tablet-signal i {
  width: 0.28vh;
  border-radius: 999px;
  background: #ffffff;
}

.tablet-signal i:nth-child(1) {
  height: 0.35vh;
}

.tablet-signal i:nth-child(2) {
  height: 0.52vh;
}

.tablet-signal i:nth-child(3) {
  height: 0.74vh;
}

.tablet-signal i:nth-child(4) {
  height: 0.94vh;
}

.tablet-wifi {
  width: 1.1vh;
  height: 0.82vh;
  background:
    radial-gradient(circle at 50% 100%, #ffffff 0 12%, transparent 14%),
    radial-gradient(ellipse at 50% 100%, transparent 0 30%, #ffffff 31% 42%, transparent 43% 100%),
    radial-gradient(ellipse at 50% 100%, transparent 0 52%, #ffffff 53% 62%, transparent 63% 100%);
}

.tablet-battery {
  position: relative;
  width: 2.15vh;
  height: 0.92vh;
  border: 0.16vh solid #ffffff;
  border-radius: 0.26vh;
  box-sizing: border-box;
}

.tablet-battery::before {
  position: absolute;
  top: 0.1vh;
  right: 0.1vh;
  bottom: 0.1vh;
  left: 0.1vh;
  border-radius: 0.12vh;
  background: #ffffff;
  content: "";
}

.tablet-battery::after {
  position: absolute;
  top: 50%;
  right: -0.44vh;
  width: 0.24vh;
  height: 0.42vh;
  border-radius: 0 999px 999px 0;
  background: #ffffff;
  content: "";
  transform: translateY(-50%);
}

.tablet-icons {
  position: relative;
  z-index: 1;
  display: grid;
  width: 90vh;
  grid-template-columns: repeat(9, 9.4vh);
  grid-auto-rows: 9.8vh;
  justify-content: space-between;
  row-gap: 2.35vh;
  margin: 4.6vh auto 0;
}

.tablet-icon {
  width: 9.4vh;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.72vh;
  padding: 0;
  border: 0;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
}

.tablet-icon__tile {
  position: relative;
  width: 5.55vh;
  height: 5.55vh;
  display: grid;
  place-items: center;
  border-radius: 1.22vh;
  overflow: hidden;
  box-shadow: 0 0.8vh 2vh rgb(0 0 0 / 20%);
}

.tablet-icon__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.tablet-icon__image--marketplace {
  object-fit: contain;
}

.tablet-icon__image--business {
  object-fit: contain;
}

.tablet-icon__image--home {
  object-fit: contain;
}

.tablet-icon__image--gps {
  object-fit: contain;
}

.tablet-icon__image--night {
  object-fit: contain;
}

.tablet-icon__lucide {
  width: 3.35vh;
  height: 3.35vh;
  color: #ffffff;
  stroke-width: 2.35;
}

.tablet-icon__organization {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #ffffff;
  font-size: 2vh;
  font-weight: 600;
  letter-spacing: 0;
  text-shadow: 0 0.22vh 0.75vh rgb(0 0 0 / 45%);
}

.tablet-icon__label {
  max-width: 9.4vh;
  color: #ffffff;
  font-size: 1.05vh;
  font-weight: 600;
  line-height: 1.15;
  overflow: hidden;
  text-align: center;
  text-shadow: 0 0.2vh 0.6vh rgb(0 0 0 / 45%);
  overflow-wrap: anywhere;
}

.tablet-icon__tile--market {
  background: linear-gradient(135deg, #26c5ff, #168ee4);
}

.tablet-icon__tile--business {
  background: linear-gradient(135deg, #f5a531, #e27b0b);
}

.tablet-icon__tile--home {
  background: linear-gradient(135deg, #31e0d1, #18c7bd);
}

.tablet-icon__tile--apartment {
  background:
    linear-gradient(135deg, rgb(255 255 255 / 18%), transparent 32%),
    linear-gradient(135deg, #6877ff, #35d6c9 58%, #23435f);
}

.tablet-icon__tile--gps {
  background: linear-gradient(135deg, #26e665, #15c64f);
}

.tablet-icon__tile--billboard {
  background: linear-gradient(135deg, #58c476, #2f9c56);
}

.tablet-icon__tile--game {
  background: linear-gradient(135deg, #ffd95a, #e0ae20);
}

.tablet-icon__tile--family {
  background:
    radial-gradient(circle at 70% 22%, rgb(255 255 255 / 18%), transparent 28%),
    linear-gradient(145deg, var(--organization-app-color, #d09b63), #050506 72%);
}

.tablet-icon__tile--fraction {
  background:
    radial-gradient(circle at 30% 24%, rgb(255 255 255 / 22%), transparent 30%),
    linear-gradient(145deg, var(--organization-app-color, #079cf0), #0a1f54 64%, #05070d);
}

.tablet-icon__tile--organization {
  background: linear-gradient(135deg, #6a577c, #34223e);
}

.tablet-icon__tile--night {
  background:
    radial-gradient(circle at 60% 40%, #2c2422 0 12%, transparent 13%),
    #020205;
}

.tablet-icon__tile--settings {
  background: linear-gradient(135deg, #8c8c8e, #707073);
}

.tablet-icon__glyph {
  position: relative;
  width: 3.2vh;
  height: 3.2vh;
  color: #ffffff;
}

.tablet-icon__tile--market .tablet-icon__glyph {
  width: 3.1vh;
  height: 2.7vh;
  border: 0.35vh solid currentColor;
  border-top: 0;
  border-radius: 0 0 0.55vh 0.55vh;
}

.tablet-icon__tile--market .tablet-icon__glyph::before {
  position: absolute;
  top: -1.1vh;
  left: -0.35vh;
  width: 3.8vh;
  height: 1.35vh;
  border: 0.35vh solid currentColor;
  border-bottom: 0;
  border-radius: 0.7vh 0.7vh 0 0;
  content: "";
}

.tablet-icon__tile--market .tablet-icon__glyph::after {
  position: absolute;
  top: calc(-0.95vh + 3px);
  left: 0.65vh;
  width: 0.35vh;
  height: 1.35vh;
  background: currentColor;
  box-shadow: 1vh 0 0 currentColor;
  content: "";
}

.tablet-icon__tile--business .tablet-icon__glyph {
  border-radius: 0.25vh;
  background:
    linear-gradient(currentColor 0 0) 0.45vh 0.55vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 1.35vh 0.55vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 2.25vh 0.55vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 0.45vh 1.35vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 1.35vh 1.35vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 2.25vh 1.35vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 0.45vh 2.15vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 1.35vh 2.15vh / 0.45vh 0.45vh,
    linear-gradient(currentColor 0 0) 2.25vh 2.15vh / 0.45vh 0.45vh;
  background-repeat: no-repeat;
  outline: 0.3vh solid currentColor;
}

.tablet-icon__tile--home .tablet-icon__glyph::before {
  position: absolute;
  inset: 1.3vh 0.55vh 0.1vh;
  border-radius: 0.25vh;
  background: currentColor;
  content: "";
}

.tablet-icon__tile--home .tablet-icon__glyph::after {
  position: absolute;
  inset: 0.2vh 0.15vh auto;
  height: 2vh;
  background: currentColor;
  clip-path: polygon(50% 0, 100% 48%, 82% 48%, 82% 100%, 18% 100%, 18% 48%, 0 48%);
  content: "";
}

.tablet-icon__tile--gps .tablet-icon__glyph {
  border: 0.28vh solid currentColor;
  border-radius: 0.25vh;
}

.tablet-icon__tile--gps .tablet-icon__glyph::before,
.tablet-icon__tile--gps .tablet-icon__glyph::after {
  position: absolute;
  inset: 0.28vh auto 0.28vh 0.92vh;
  width: 0.25vh;
  background: currentColor;
  content: "";
}

.tablet-icon__tile--gps .tablet-icon__glyph::after {
  left: 2vh;
}

.tablet-icon__tile--night .tablet-icon__glyph {
  width: 2.8vh;
  height: 2.8vh;
  border-radius: 50%;
  background: radial-gradient(circle at 68% 35%, transparent 0 38%, #f2f2f2 39% 62%, transparent 63%);
  transform: rotate(-28deg);
}

.tablet-icon__tile--settings .tablet-icon__glyph {
  border-radius: 50%;
  background:
    radial-gradient(circle, #707073 0 24%, transparent 25%),
    conic-gradient(currentColor 0 8%, transparent 8% 17%, currentColor 17% 25%, transparent 25% 34%, currentColor 34% 42%, transparent 42% 51%, currentColor 51% 59%, transparent 59% 68%, currentColor 68% 76%, transparent 76% 85%, currentColor 85% 93%, transparent 93%);
}

.tablet-pages {
  position: absolute;
  left: 50%;
  bottom: 12.35vh;
  z-index: 2;
  display: flex;
  gap: 0.55vh;
  transform: translateX(-50%);
}

.tablet-pages__dot {
  width: 0.85vh;
  height: 0.85vh;
  border-radius: 50%;
  background: rgb(255 255 255 / 30%);
}

.tablet-pages__dot--active {
  background: #ffffff;
}

.tablet-dock {
  position: absolute;
  left: 50%;
  bottom: 2.2vh;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 1.1vh;
  padding: 1.2vh 2.15vh;
  border-radius: 2.45vh;
  background: rgb(71 142 129 / 70%);
  transform: translateX(-50%);
}

.tablet-icon__tile--trucker {
  background: linear-gradient(145deg, #40d8ff, #217da3 54%, #0e4058);
  box-shadow: inset 0 0 0 0.1vh rgb(255 255 255 / 16%), 0 0.7vh 1.4vh rgb(5 45 64 / 32%);
}

.tablet-icon__tile--armoredCollector {
  color: #11180d;
  background: linear-gradient(145deg, #dff267, #80b947 54%, #385d22);
  box-shadow: inset 0 0 0 0.1vh rgb(245 255 171 / 28%), 0 0.7vh 1.4vh rgb(38 68 24 / 35%);
}

.tablet-icon--dock {
  gap: 0;
}

.tablet-home-indicator {
  position: absolute;
  left: 50%;
  bottom: 0.8vh;
  z-index: 3;
  width: 13.8vh;
  height: 0.42vh;
  border-radius: 999px;
  background: #ffffff;
  transform: translateX(-50%);
}




.tablet-screen .tablet-status,
.tablet-screen .tablet-icon__label {
  font-size: clamp(12px, 1.22vh, 15px);
}

.tablet-screen .tablet-icon__tile {
  width: 6.05vh;
  height: 6.05vh;
}

@media (max-width: 900px) {
  .tablet-device {
    width: calc(100vw - 3.2vh);
  }

  .tablet-icons {
    width: 82%;
    grid-template-columns: repeat(3, 8.8vh);
    row-gap: 4vh;
  }


  .house-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .house-details {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
}
</style>
