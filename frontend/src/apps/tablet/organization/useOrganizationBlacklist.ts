import { computed, ref, type Ref } from 'vue'

import type { CharacterOrganization, CharacterOrganizationBlacklistEntry } from '@/shared/types/game'

type BlacklistTab = 'stats' | 'history'

type UseOrganizationBlacklistOptions = {
  activeOrganization: Ref<CharacterOrganization | null>
  emit: (eventName: string, ...args: unknown[]) => void
  organizationBlacklist: Ref<CharacterOrganization['blacklist'] | undefined>
}

export function useOrganizationBlacklist(options: UseOrganizationBlacklistOptions) {
  const activeBlacklistTab = ref<BlacklistTab>('stats')
  const blacklistSearch = ref('')
  const blacklistPlayerStatic = ref('')
  const blacklistReason = ref('')
  const blacklistAddModalOpen = ref(false)
  const blacklistRemoveModalOpen = ref(false)
  const blacklistRemoveEntry = ref<CharacterOrganizationBlacklistEntry | null>(null)
  const blacklistRemoveReason = ref('')

  const activeBlacklistEntries = computed<CharacterOrganizationBlacklistEntry[]>(() =>
    activeBlacklistTab.value === 'history'
      ? options.organizationBlacklist.value?.history ?? []
      : options.organizationBlacklist.value?.entries ?? [],
  )

  function resetOrganizationBlacklistState() {
    activeBlacklistTab.value = 'stats'
    blacklistSearch.value = ''
    blacklistPlayerStatic.value = ''
    blacklistReason.value = ''
    blacklistAddModalOpen.value = false
    blacklistRemoveModalOpen.value = false
    blacklistRemoveEntry.value = null
    blacklistRemoveReason.value = ''
  }

  function setBlacklistTab(tab: BlacklistTab) {
    activeBlacklistTab.value = tab
    options.emit('tablet:organizationBlacklistTabFromBrowser', options.activeOrganization.value?.id, tab)
  }

  function openBlacklistAddModal() {
    blacklistPlayerStatic.value = ''
    blacklistReason.value = ''
    blacklistAddModalOpen.value = true
  }

  function closeBlacklistAddModal(result = false) {
    if (!options.activeOrganization.value) {
      blacklistAddModalOpen.value = false
      return
    }

    if (!result) {
      options.emit('tablet:organizationBlacklistAddFromBrowser', options.activeOrganization.value.id, false, {})
    }

    blacklistAddModalOpen.value = false
    blacklistPlayerStatic.value = ''
    blacklistReason.value = ''
  }

  function submitBlacklistAdd() {
    if (!options.activeOrganization.value) {
      return
    }

    const playerStatic = blacklistPlayerStatic.value.trim()

    if (!playerStatic) {
      return
    }

    options.emit('tablet:organizationBlacklistAddFromBrowser', options.activeOrganization.value.id, true, {
      playerId: null,
      playerName: '',
      playerUid: null,
      playerStatic,
      reason: blacklistReason.value.trim(),
    })

    closeBlacklistAddModal(true)
  }

  function openBlacklistRemoveModal(entry: CharacterOrganizationBlacklistEntry) {
    if (activeBlacklistTab.value === 'history') {
      return
    }

    blacklistRemoveEntry.value = entry
    blacklistRemoveReason.value = ''
    blacklistRemoveModalOpen.value = true
  }

  function closeBlacklistRemoveModal(result = false) {
    if (!options.activeOrganization.value) {
      blacklistRemoveModalOpen.value = false
      blacklistRemoveEntry.value = null
      blacklistRemoveReason.value = ''
      return
    }

    if (!result) {
      options.emit('tablet:organizationBlacklistRemoveFromBrowser', options.activeOrganization.value.id, false, {})
    }

    blacklistRemoveModalOpen.value = false
    blacklistRemoveEntry.value = null
    blacklistRemoveReason.value = ''
  }

  function submitBlacklistRemove() {
    if (!options.activeOrganization.value || !blacklistRemoveEntry.value) {
      return
    }

    options.emit('tablet:organizationBlacklistRemoveFromBrowser', options.activeOrganization.value.id, true, {
      entryId: blacklistRemoveEntry.value.id,
      playerName: blacklistRemoveEntry.value.playerName,
      playerUid: blacklistRemoveEntry.value.playerUid,
      reason: blacklistRemoveReason.value.trim(),
    })

    closeBlacklistRemoveModal(true)
  }

  return {
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
  }
}
