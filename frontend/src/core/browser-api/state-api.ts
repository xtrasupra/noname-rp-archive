import type { Pinia } from 'pinia'

import type { BrowserApiSnapshot } from './types'
import { syncRuntimePage } from './runtime-page'

import type { PageInterfaceId } from '@/shared/contracts/ui'

import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { useCharacterStore } from '@/stores/character.store'
import { useNotificationStore } from '@/stores/notification.store'
import { usePlayerStore } from '@/stores/player.store'
import { usePropertyStore } from '@/stores/property.store'
import { useVehicleStore } from '@/stores/vehicle.store'

export function getSnapshot(pinia: Pinia): BrowserApiSnapshot {
  const interfaceManager = useInterfaceManagerStore(pinia)
  const playerStore = usePlayerStore(pinia)
  const characterStore = useCharacterStore(pinia)
  const propertyStore = usePropertyStore(pinia)
  const vehicleStore = useVehicleStore(pinia)

  return {
    activeInterfaces: interfaceManager.activeEntries.map((entry) => entry.id),
    currentPage: (interfaceManager.currentPageEntry?.id as PageInterfaceId | null) ?? null,
    character: { ...characterStore.$state },
    property: {
      apartments: [...propertyStore.apartments],
      houses: [...propertyStore.houses],
    },
    player: { ...playerStore.$state },
    vehicle: { ...vehicleStore.$state },
  }
}

export function resetState(pinia: Pinia) {
  const interfaceManager = useInterfaceManagerStore(pinia)

  usePlayerStore(pinia).reset()
  useCharacterStore(pinia).reset()
  useVehicleStore(pinia).reset()
  usePropertyStore(pinia).reset()
  useNotificationStore(pinia).clear()
  interfaceManager.closeAll()
  useBrowserRuntimeStore(pinia).appendLog('reset', 'stores and ui')
  syncRuntimePage(pinia)
}
