import type { Pinia } from 'pinia'

import { normalizePayload } from '@/core/browser-api/payload'
import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { usePlayerStore } from '@/stores/player.store'
import type { PlayerState } from '@/shared/types/game'

export function patchPlayerState(pinia: Pinia, payload?: Partial<PlayerState> | string | null) {
  const normalizedPayload = normalizePayload<Partial<PlayerState>>(payload)

  if (!normalizedPayload) {
    return
  }

  usePlayerStore(pinia).patch(normalizedPayload)
  useBrowserRuntimeStore(pinia).appendLog('patchPlayer', JSON.stringify(normalizedPayload))
}
