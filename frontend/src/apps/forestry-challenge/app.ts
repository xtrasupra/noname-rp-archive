import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const forestryChallengeApp: InterfaceDefinition<'forestryChallenge'> = {
  id: 'forestryChallenge',
  title: 'Срубка дерева',
  description: 'Server-authoritative moving-cursor lumber minigame',
  kind: 'overlay',
  layer: 95,
  component: defineAsyncComponent(() => import('./ForestryChallengeApp.vue')),
}
