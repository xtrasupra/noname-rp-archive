import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  InterfaceEntryPayload,
  InterfaceId,
  InterfacePayloadMap,
  PageInterfaceId,
} from '@/shared/contracts/ui'

import { getInterfaceDefinition, listInterfaceDefinitions } from './interface-registry'
import type { InterfaceStateEntry } from './types'

export const useInterfaceManagerStore = defineStore('interface-manager', () => {
  const activeInterfaces = ref<InterfaceStateEntry[]>([])

  const availableInterfaces = computed(() => listInterfaceDefinitions())

  const activeEntries = computed(() =>
    activeInterfaces.value
      .map((entry) => {
        const definition = getInterfaceDefinition(entry.id)

        if (!definition) {
          return null
        }

        return {
          ...entry,
          definition,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => left.definition.layer - right.definition.layer),
  )

  const currentPageEntry = computed(
    () => activeEntries.value.find((entry) => entry.definition.kind === 'page') ?? null,
  )

  const overlayEntries = computed(() =>
    activeEntries.value.filter((entry) => entry.definition.kind === 'overlay'),
  )

  function upsert(entry: InterfaceEntryPayload) {
    const current = activeInterfaces.value.find((item) => item.id === entry.id)

    if (current) {
      current.payload = entry.payload
      return
    }

    activeInterfaces.value.push({
      ...entry,
      openedAt: new Date().toISOString(),
    })
  }

  function open<Id extends InterfaceId>(id: Id, payload?: InterfacePayloadMap[Id]) {
    upsert({
      id,
      payload,
    } as InterfaceEntryPayload)
  }
  function set<Id extends InterfaceId>(id: Id, payload: InterfacePayloadMap[Id]) {
    upsert({
      id,
      payload,
    } as InterfaceEntryPayload)
  }

  function close(id: InterfaceId) {
    activeInterfaces.value = activeInterfaces.value.filter((entry) => entry.id !== id)
  }

  function toggle<Id extends InterfaceId>(id: Id, payload?: InterfacePayloadMap[Id]) {
    if (isActive(id)) {
      close(id)
      return
    }

    open(id, payload)
  }

  function setPage<Id extends PageInterfaceId>(id: Id, payload?: InterfacePayloadMap[Id]) {
    const overlayEntries = activeInterfaces.value.filter(
      (entry) => getInterfaceDefinition(entry.id)?.kind === 'overlay',
    )
    const currentEntry = activeInterfaces.value.find((entry) => entry.id === id)
    const nextPageEntry: InterfaceStateEntry = currentEntry
      ? ({
          ...currentEntry,
          payload: payload ?? currentEntry.payload,
        } as InterfaceStateEntry)
      : ({
          id,
          payload,
          openedAt: new Date().toISOString(),
        } as InterfaceStateEntry)

    activeInterfaces.value = [
      ...overlayEntries,
      nextPageEntry,
    ]
  }

  function closePage(id?: PageInterfaceId) {
    const targetId = id ?? currentPageEntry.value?.id

    if (!targetId) {
      return
    }

    close(targetId)
  }

  function closeAllPages() {
    activeInterfaces.value = activeInterfaces.value.filter(
      (entry) => getInterfaceDefinition(entry.id)?.kind !== 'page',
    )
  }

  function closeAllOverlays() {
    activeInterfaces.value = activeInterfaces.value.filter(
      (entry) => getInterfaceDefinition(entry.id)?.kind !== 'overlay',
    )
  }

  function setActive(ids: InterfaceId[]) {
    const nextEntries: InterfaceStateEntry[] = ids.map((id) => {
      const current = activeInterfaces.value.find((entry) => entry.id === id)

      return (
        current ?? {
          id,
          openedAt: new Date().toISOString(),
        }
      ) as InterfaceStateEntry
    })

    activeInterfaces.value = nextEntries
  }

  function closeAll() {
    activeInterfaces.value = []
  }

  function isActive(id: InterfaceId) {
    return activeInterfaces.value.some((entry) => entry.id === id)
  }

  return {
    activeEntries,
    activeInterfaces,
    availableInterfaces,
    close,
    closeAll,
    closeAllOverlays,
    closeAllPages,
    closePage,
    currentPageEntry,
    isActive,
    open,
    overlayEntries,
    set,
    setPage,
    setActive,
    toggle,
  }
})
