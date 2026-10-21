import type { Pinia } from 'pinia'

import type { PageInterfaceId } from '@/shared/contracts/ui'

import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'

export function syncRuntimePage(pinia: Pinia) {
  const runtimeStore = useBrowserRuntimeStore(pinia)
  const interfaceManager = useInterfaceManagerStore(pinia)

  runtimeStore.setCurrentPage((interfaceManager.currentPageEntry?.id as PageInterfaceId | null) ?? null)
}
