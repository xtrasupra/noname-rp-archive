import type { Pinia } from 'pinia'

import { normalizePayload } from '@/core/browser-api/payload'
import { syncRuntimePage } from '@/core/browser-api/runtime-page'
import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { useCharacterStore } from '@/stores/character.store'
import type { TabletPayload } from '@/shared/contracts/ui'
import type { CharacterOrganization } from '@/shared/types/game'
import { patchTabletStores } from './state'

export function patchTabletState(pinia: Pinia, payload?: TabletPayload | string | null) {
  const normalizedPayload = normalizePayload<TabletPayload>(payload)

  if (!normalizedPayload) {
    return
  }

  patchTabletStores(pinia, normalizedPayload)
  const interfaceManager = useInterfaceManagerStore(pinia)
  const currentTabletPayload = interfaceManager.activeInterfaces.find((entry) => entry.id === 'tablet')?.payload

  if (interfaceManager.isActive('tablet')) {
    interfaceManager.set('tablet', {
      ...(currentTabletPayload ?? {}),
      ...normalizedPayload,
    })
  }
  useBrowserRuntimeStore(pinia).appendLog('patchTablet', JSON.stringify(normalizedPayload))
}

export function setTabletState(pinia: Pinia, payload?: TabletPayload | string | null) {
  const normalizedPayload = normalizePayload<TabletPayload>(payload)

  if (!normalizedPayload) {
    return
  }

  patchTabletState(pinia, normalizedPayload)
  useInterfaceManagerStore(pinia).setPage('tablet', normalizedPayload)
  useBrowserRuntimeStore(pinia).appendLog('setTablet', JSON.stringify(normalizedPayload))
  syncRuntimePage(pinia)
}

export function patchTabletOrganization(pinia: Pinia, payload?: CharacterOrganization | string | null) {
  const normalizedPayload = normalizePayload<CharacterOrganization>(payload)

  if (!normalizedPayload) {
    return
  }

  useCharacterStore(pinia).patchOrganization(normalizedPayload)
  useBrowserRuntimeStore(pinia).appendLog('patchTabletOrganization', String(normalizedPayload.id))
}

export function setTabletOrganizations(pinia: Pinia, payload?: CharacterOrganization[] | string | null) {
  const normalizedPayload = normalizePayload<CharacterOrganization[]>(payload)

  if (!normalizedPayload) {
    return
  }

  useCharacterStore(pinia).patch({ organizations: normalizedPayload })
  useBrowserRuntimeStore(pinia).appendLog('setTabletOrganizations', String(normalizedPayload.length))
}
