import type { Pinia } from 'pinia'

import { normalizePayload } from './payload'
import { syncRuntimePage } from './runtime-page'

import type {
  ClientPagePropsMap,
  InterfaceId,
  InterfacePayloadMap,
  OverlayInterfaceId,
  PageInterfaceId,
} from '@/shared/contracts/ui'

import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { getInterfaceDefinition } from '@/core/interfaces/interface-registry'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import type { InterfaceOpenContext } from '@/core/interfaces/types'
import { callClientEvent } from '@/core/client-events/client-event'

export function setPage<Id extends InterfaceId>(
  pinia: Pinia,
  page: Id,
  props?: Id extends PageInterfaceId ? ClientPagePropsMap[Id] | string : InterfacePayloadMap[Id] | string,
  payload?: InterfacePayloadMap[Id] | string,
) {
  const interfaceManager = useInterfaceManagerStore(pinia)
  const runtimeStore = useBrowserRuntimeStore(pinia)
  const normalizedProps = normalizePayload<ClientPagePropsMap[Extract<Id, PageInterfaceId>]>(props as ClientPagePropsMap[Extract<Id, PageInterfaceId>] | string | undefined)
  const normalizedPayload = normalizePayload<InterfacePayloadMap[Id]>(payload)
  const definition = getInterfaceDefinition(page)

  if (!definition) {
    runtimeStore.appendLog('api:error', `unregistered interface: ${String(page)}`)
    return
  }

  const context = {
    id: page,
    payload: normalizedPayload,
    pinia,
    props: normalizedProps,
  } as InterfaceOpenContext
  const nextPayload = definition.resolvePayload
    ? definition.resolvePayload(context)
    : normalizedPayload ?? normalizedProps

  definition.beforeOpen?.(context)

  if (definition.clearBeforeOpen) {
    interfaceManager.closeAll()
  }

  if (definition.kind === 'overlay') {
    interfaceManager.open(page, nextPayload as InterfacePayloadMap[Id] | undefined)
  } else {
    interfaceManager.setPage(page as Extract<Id, PageInterfaceId>, nextPayload as InterfacePayloadMap[Extract<Id, PageInterfaceId>] | undefined)
  }

  runtimeStore.appendLog('setPage', `${page} (${Object.keys((normalizedProps ?? nextPayload) ?? {}).length} props)`)
  syncRuntimePage(pinia)

  if (page === 'characterSelection') {
    const selectionPayload = nextPayload as InterfacePayloadMap['characterSelection'] | undefined
    callClientEvent('characterSelection:pageSetFromBrowser', selectionPayload?.uiRevision ?? 0)
  } else if (page === 'selectSpawn') {
    const spawnPayload = nextPayload as InterfacePayloadMap['selectSpawn'] | undefined
    callClientEvent('spawnSelector:pageSetFromBrowser', spawnPayload?.uiRevision ?? 0)
  }
}

export function closePage(pinia: Pinia, page?: PageInterfaceId) {
  useInterfaceManagerStore(pinia).closePage(page)
  useBrowserRuntimeStore(pinia).appendLog('closePage', page ?? 'current')
  syncRuntimePage(pinia)
}

export function closeAllPages(pinia: Pinia) {
  useInterfaceManagerStore(pinia).closeAllPages()
  useBrowserRuntimeStore(pinia).appendLog('closeAllPages', 'ok')
  syncRuntimePage(pinia)
}

export function openInterface<Id extends OverlayInterfaceId>(
  pinia: Pinia,
  id: Id,
  payload?: InterfacePayloadMap[Id] | string,
) {
  const normalizedPayload = normalizePayload<InterfacePayloadMap[Id]>(payload)

  useInterfaceManagerStore(pinia).open(id, normalizedPayload)
  useBrowserRuntimeStore(pinia).appendLog('openInterface', id)
}

export function closeInterface(pinia: Pinia, id: InterfaceId) {
  useInterfaceManagerStore(pinia).close(id)
  useBrowserRuntimeStore(pinia).appendLog('closeInterface', id)
  syncRuntimePage(pinia)
}

export function closeAllInterfaces(pinia: Pinia) {
  const interfaceManager = useInterfaceManagerStore(pinia)

  interfaceManager.closeAllOverlays()
  useBrowserRuntimeStore(pinia).appendLog('closeAllInterfaces', 'ok')
}
