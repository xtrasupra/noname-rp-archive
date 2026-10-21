import type { Pinia } from 'pinia'

import { normalizePayload } from '@/core/browser-api/payload'
import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useCharacterStore } from '@/stores/character.store'
import type { CharacterState } from '@/shared/types/game'

export function patchCharacterState(pinia: Pinia, payload?: Partial<CharacterState> | string | null) {
  const normalizedPayload = normalizePayload<Partial<CharacterState>>(payload)

  if (!normalizedPayload) {
    return
  }

  useCharacterStore(pinia).patch(normalizedPayload)
  useBrowserRuntimeStore(pinia).appendLog('patchCharacter', JSON.stringify(normalizedPayload))
}
