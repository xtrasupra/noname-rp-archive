import { computed, ref, type Ref } from 'vue'

import type { CharacterOrganization, CharacterOrganizationPermission, CharacterOrganizationRank } from '@/shared/types/game'

export type OrganizationSettingsTab = 'roles' | 'items' | 'realEstate' | 'vehicles'

type UseOrganizationSettingsOptions = {
  activeOrganization: Ref<CharacterOrganization | null>
  emit: (eventName: string, ...args: unknown[]) => void
  isFamilyOrganization: Ref<boolean>
  organizationSettingRanks: Ref<CharacterOrganizationRank[]>
  patchOrganization: (organization: CharacterOrganization) => void
}

export function useOrganizationSettings(options: UseOrganizationSettingsOptions) {
  const activeSettingsTab = ref<OrganizationSettingsTab>('roles')
  const selectedSettingsRankId = ref<string | number | null>(null)
  const settingsOverrides = ref<Record<string, boolean>>({})
  const settingsSearch = ref('')

  const selectedSettingsRank = computed(() =>
    options.organizationSettingRanks.value.find((rank) => rank.id === selectedSettingsRankId.value) ?? options.organizationSettingRanks.value[0],
  )

  function getDefaultSettingsRankId(ranks: CharacterOrganizationRank[] = options.organizationSettingRanks.value) {
    return ranks.find((rank) => rank.rank === 5 || rank.id === 5)?.id ?? ranks[0]?.id ?? null
  }

  function resetOrganizationSettingsState(rankId: string | number | null = null) {
    settingsSearch.value = ''
    activeSettingsTab.value = 'roles'
    selectedSettingsRankId.value = rankId
  }

  function setSettingsTab(tab: OrganizationSettingsTab) {
    if (tab === 'realEstate' && !options.isFamilyOrganization.value) {
      activeSettingsTab.value = 'roles'
      settingsSearch.value = ''
      return
    }

    activeSettingsTab.value = tab
    settingsSearch.value = ''
    options.emit('tablet:organizationSettingsTabFromBrowser', options.activeOrganization.value?.id, tab)
  }

  function ensureOrganizationSettingsTabAvailable() {
    if (!options.isFamilyOrganization.value && activeSettingsTab.value === 'realEstate') {
      activeSettingsTab.value = 'roles'
      settingsSearch.value = ''
    }
  }

  function getSettingsSortTable() {
    return activeSettingsTab.value === 'realEstate' ? 'settingsRealEstate' : 'settingsVehicles'
  }

  function getPermissionOverrideKey(permission: CharacterOrganizationPermission, rank = selectedSettingsRank.value) {
    return `${options.activeOrganization.value?.id ?? 'organization'}:${activeSettingsTab.value}:${rank?.id ?? 'none'}:${permission.id}`
  }

  function isPermissionEnabled(permission: CharacterOrganizationPermission, rank = selectedSettingsRank.value) {
    if (!rank) {
      return false
    }

    const overrideKey = getPermissionOverrideKey(permission, rank)

    return settingsOverrides.value[overrideKey] ?? (permission.enabledRanks.includes(rank.id) || permission.enabledRanks.includes(rank.rank))
  }

  function toggleOrganizationPermission(permission: CharacterOrganizationPermission, event: Event) {
    if (!options.activeOrganization.value || !selectedSettingsRank.value) {
      return
    }

    const enabled = (event.target as HTMLInputElement).checked
    settingsOverrides.value[getPermissionOverrideKey(permission)] = enabled
    options.emit(
      'tablet:organizationPermissionActionFromBrowser',
      options.activeOrganization.value.id,
      activeSettingsTab.value,
      selectedSettingsRank.value.id,
      permission.id,
      enabled,
    )
  }

  function updateSettingsVehicleValue(vehicleId: string | number, field: 'incomePercent' | 'rankAccess', direction: -1 | 1) {
    const organization = options.activeOrganization.value

    if (!organization?.settings?.vehicles) {
      return
    }

    const vehicles = organization.settings.vehicles.map((vehicle) => {
      if (vehicle.id !== vehicleId) {
        return vehicle
      }

      const nextValue = field === 'rankAccess'
        ? Math.max(1, Number(vehicle[field]) + direction)
        : Math.max(0, Number(vehicle[field]) + direction)

      return {
        ...vehicle,
        [field]: nextValue,
      }
    })

    options.patchOrganization({
      ...organization,
      settings: {
        ...organization.settings,
        vehicles,
      },
    })
    options.emit('tablet:organizationSettingsVehicleActionFromBrowser', organization.id, vehicleId, field, direction)
  }

  function returnSettingsVehicle(vehicleId: string | number) {
    if (!options.activeOrganization.value) {
      return
    }

    options.emit('tablet:organizationSettingsVehicleReturnFromBrowser', options.activeOrganization.value.id, vehicleId)
  }

  return {
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
  }
}
