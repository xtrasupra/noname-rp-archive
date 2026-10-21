import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const fishingReelingApp: InterfaceDefinition<'fishingReeling'> = {
  id: 'fishingReeling',
  title: 'Fishing Reeling',
  description: 'Fishing bite and reeling minigame',
  kind: 'overlay',
  layer: 100,
  component: defineAsyncComponent(() => import('./FishingReelingApp.vue')),
}
