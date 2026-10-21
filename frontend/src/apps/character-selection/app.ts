import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const characterSelectionApp: InterfaceDefinition<'characterSelection'> = {
  id: 'characterSelection',
  title: 'Character Selection',
  description: 'Character selection screen',
  kind: 'page',
  layer: 80,
  component: defineAsyncComponent(() => import('./CharacterSelection.vue')),
}
