import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const fishingCastApp: InterfaceDefinition<'fishingCast'> = {
  id: 'fishingCast',
  title: 'Fishing Cast',
  description: 'Fishing gear and cast setup',
  kind: 'overlay',
  layer: 99,
  component: defineAsyncComponent(() => import('./FishingCastApp.vue')),
}
