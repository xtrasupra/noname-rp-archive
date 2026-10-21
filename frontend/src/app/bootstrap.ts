import type { Pinia } from 'pinia'

import { registerInterfaceApps } from '@/apps'
import { hudFixture } from '@/apps/hud/hud.fixture'
import { rentCarFixture } from '@/apps/rent-car/rent-car.fixture'
import { lsCustomsFixture } from '@/apps/ls-customs/ls-customs.fixture'
import { governmentComputerFixture } from '@/apps/government-computer/government-computer.fixture'
import { fallbackCharacterSelectionSlots } from '@/shared/fixtures/character-selection.fixture'
import { exposeBrowserApi } from '@/core/browser-api/expose-browser-api'
import { callClientEvent } from '@/core/client-events/client-event'
import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { useVehicleStore } from '@/stores/vehicle.store'

export function bootstrapBrowser(pinia: Pinia) {
  registerInterfaceApps()

  const runtimeStore = useBrowserRuntimeStore(pinia)
  const interfaceManager = useInterfaceManagerStore(pinia)

  interfaceManager.closeAll()

  if ((import.meta.env.DEV || import.meta.env.MODE === 'demo')) {
    useVehicleStore(pinia).patch({
      doorsLocked: false,
      engineHealth: 24,
      engineOn: true,
      fuel: 42.9,
      fuelMax: 100,
      inVehicle: true,
      lightsOn: true,
      maxSpeed: 340,
      mileage: 111,
      seatbeltOn: false,
      speed: 92,
      gear: 'D',
    })
    const searchParams = new URLSearchParams(window.location.search)
    const page = searchParams.get('page')

    if (page === 'auth') {
      interfaceManager.setPage('auth', {
        mode: searchParams.get('mode') === 'recovery' ? 'recovery' : 'login',
      })
    } else if (page === 'tablet') {
      interfaceManager.setPage('tablet')
    } else if (page === 'hud') {
      interfaceManager.set('hud', hudFixture)
    } else if (page === 'ls-customs') {
      interfaceManager.setPage('ls-customs', lsCustomsFixture)
    } else if (page === 'government-computer') {
      interfaceManager.setPage('government-computer', governmentComputerFixture)
    } else if (page === 'characterSelection') {
      // Match production: persistent overlays remain mounted around auth-flow pages.
      interfaceManager.set('hud', { visible: false })
      interfaceManager.set('notifications', {})
      interfaceManager.setPage('characterSelection', {
        slots: fallbackCharacterSelectionSlots,
        selectedSlotId: fallbackCharacterSelectionSlots[0]?.id ?? null,
        uiRevision: 1,
      })
    } else if (page === 'selectSpawn') {
      interfaceManager.set('hud', { visible: false })
      interfaceManager.set('notifications', {})
      interfaceManager.setPage('selectSpawn', {
        contractVersion: 1,
        selected: 'default',
        options: [
          {
            type: 'default',
            title: 'Начальный спавн',
            icon: 'default',
            kind: 'random',
            position: { x: -1037.75, y: -2737.62, z: 20.17 },
            heading: 327,
            dimension: 0,
          },
        ],
        uiRevision: 1,
      })
    } else {
      interfaceManager.setPage('rent-car', rentCarFixture)
    }
  } else {
    // The authoritative spawn flow opens the HUD after a character is active.
    interfaceManager.set('hud', { visible: false })
  }

  runtimeStore.setCurrentPage(interfaceManager.currentPageEntry?.id ?? null)

  const destroyApi = exposeBrowserApi(pinia)
  console.info('[TWINKLE CEF] Browser API ready')
  callClientEvent('twinkle:cef:ready')

  return () => {
    destroyApi()
  }
}
