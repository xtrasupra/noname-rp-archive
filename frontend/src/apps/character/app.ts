import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import type { CharacterState } from '@/shared/types/game'

import { useCharacterStore } from '@/stores/character.store'

export const characterApp: InterfaceDefinition<'character'> = {
  id: 'character',
  title: 'Character',
  description: 'Персонажа изменитель',
  kind: 'page',
  layer: 80,
  component: defineAsyncComponent(() => import('./CharacterApp.vue')),
  beforeOpen({ pinia, props }) {
    if (props) {
      useCharacterStore(pinia).patch(props as Partial<CharacterState>)
    }
  },
  resolvePayload({ payload }) {
    return payload
  },
}
