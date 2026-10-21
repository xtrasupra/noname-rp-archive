import { ref, type Ref } from 'vue'

import type { CharacterOrganization } from '@/shared/types/game'
import type { OrganizationAction, OrganizationSection } from './types'

type StorageTab = 'logs' | 'accounting'

type UseOrganizationNavigationOptions = {
  activeOrganization: Ref<CharacterOrganization | null>
  activeOrganizationId: Ref<string | number | null>
  activeSection: Ref<OrganizationSection>
  canOpenInfo: Ref<boolean>
  canOpenUpgrades: Ref<boolean>
  emit: (eventName: string, ...args: unknown[]) => void
  getDefaultSettingsRankId: () => string | number | null
  isFamilyOrganization: Ref<boolean>
  resetBlacklist: () => void
  resetFinance: () => void
  resetMembers: () => void
  resetSettings: (rankId?: string | number | null) => void
}

export function useOrganizationNavigation(options: UseOrganizationNavigationOptions) {
  const captureScheduleModalOpen = ref(false)
  const deleteOrganizationModalOpen = ref(false)
  const organizationDirectionModalOpen = ref(false)
  const memberSearch = ref('')
  const storageSearch = ref('')
  const balanceSearch = ref('')
  const bonusSearch = ref('')
  const activeStorageTab = ref<StorageTab>('logs')

  function resetOrganizationSearchState() {
    memberSearch.value = ''
    storageSearch.value = ''
    balanceSearch.value = ''
    bonusSearch.value = ''
    activeStorageTab.value = 'logs'
  }

  function resetOrganizationNavigationState(settingsRankId: string | number | null = null) {
    options.activeSection.value = 'home'
    options.resetMembers()
    options.resetFinance()
    captureScheduleModalOpen.value = false
    options.resetBlacklist()
    deleteOrganizationModalOpen.value = false
    organizationDirectionModalOpen.value = false
    resetOrganizationSearchState()
    options.resetSettings(settingsRankId)
  }

  function openOrganization(organization: CharacterOrganization, settingsRankId: string | number | null) {
    options.activeOrganizationId.value = organization.id
    resetOrganizationNavigationState(settingsRankId)
  }

  function closeOrganization() {
    options.activeOrganizationId.value = null
    resetOrganizationNavigationState()
  }

  function backToOrganizationHome() {
    resetOrganizationNavigationState(options.getDefaultSettingsRankId())
  }

  function backToOrganizationMembers() {
    options.activeSection.value = 'members'
    options.resetMembers()
  }

  function backFromOrganizationSection() {
    if (options.activeSection.value === 'memberDetails') {
      backToOrganizationMembers()
      return
    }

    backToOrganizationHome()
  }

  function handleOrganizationAction(action: OrganizationAction) {
    const organization = options.activeOrganization.value

    if (!organization) {
      return
    }

    options.emit('tablet:organizationActionFromBrowser', organization.id, action.id)

    if (action.id === 'members') {
      options.activeSection.value = 'members'
      return
    }

    if (action.id === 'storage') {
      options.activeSection.value = 'storage'
      activeStorageTab.value = 'logs'
      storageSearch.value = ''
      return
    }

    if (action.id === 'balance') {
      options.activeSection.value = 'balance'
      balanceSearch.value = ''
      return
    }

    if (action.id === 'settings') {
      options.activeSection.value = 'settings'
      options.resetSettings(options.getDefaultSettingsRankId())
      return
    }

    if (action.id === 'bonus') {
      options.activeSection.value = 'bonus'
      bonusSearch.value = ''
      return
    }

    if (action.id === 'territories') {
      options.activeSection.value = 'territories'
      return
    }

    if (action.id === 'blacklist') {
      options.activeSection.value = 'blacklist'
      options.resetBlacklist()
      return
    }

    if (action.id === 'info' && options.canOpenInfo.value) {
      options.activeSection.value = 'info'
      return
    }

    if (action.id === 'upgrades' && options.canOpenUpgrades.value) {
      options.activeSection.value = 'upgrades'
    }
  }

  function setStorageTab(tab: StorageTab) {
    activeStorageTab.value = tab
    options.emit('tablet:organizationStorageTabFromBrowser', options.activeOrganization.value?.id, tab)
  }

  function openCaptureScheduleModal() {
    captureScheduleModalOpen.value = true
  }

  function closeCaptureScheduleModal() {
    captureScheduleModalOpen.value = false
  }

  function payOrganizationBill(billId: string | number) {
    if (!options.activeOrganization.value) {
      return
    }

    options.emit('tablet:organizationBillPayFromBrowser', options.activeOrganization.value.id, billId)
  }

  function openDeleteOrganizationModal() {
    deleteOrganizationModalOpen.value = true
  }

  function openOrganizationDirectionModal() {
    if (!options.isFamilyOrganization.value) {
      return
    }

    organizationDirectionModalOpen.value = true
  }

  function closeOrganizationDirectionModal() {
    organizationDirectionModalOpen.value = false
  }

  function ensureOrganizationDirectionModalAvailable() {
    if (!options.isFamilyOrganization.value && organizationDirectionModalOpen.value) {
      organizationDirectionModalOpen.value = false
    }
  }

  function selectOrganizationDirection(directionId: string) {
    if (!options.isFamilyOrganization.value) {
      closeOrganizationDirectionModal()
      return
    }

    options.emit('tablet:organizationDirectionSelectFromBrowser', options.activeOrganization.value?.id, directionId)
    closeOrganizationDirectionModal()
  }

  function closeDeleteOrganizationModal(result = false) {
    if (!options.activeOrganization.value) {
      deleteOrganizationModalOpen.value = false
      return
    }

    options.emit('tablet:organizationDeleteFromBrowser', options.activeOrganization.value.id, result)
    deleteOrganizationModalOpen.value = false
  }

  return {
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
  }
}
