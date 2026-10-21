import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const characterCustomizerApp: InterfaceDefinition<'characterCustomizer'> = {
  id: 'characterCustomizer',
  title: 'characterCustomizer',
  description: 'characterCustomizer',
  kind: 'page',
  layer: 80,
  component: defineAsyncComponent(() => import('./CharacterCustomizer.vue')),
}
