import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const miningChallengeApp: InterfaceDefinition<'miningChallenge'> = {
  id: 'miningChallenge',
  title: 'Добыча камня',
  description: 'Server-authoritative accelerated mining sequence',
  kind: 'overlay',
  layer: 194,
  interaction: 'blocking',
  component: defineAsyncComponent(() => import('./MiningChallengeApp.vue')),
}
