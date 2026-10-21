import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const truckerResultApp: InterfaceDefinition<'truckerResult'> = {
  id: 'truckerResult',
  title: 'Trucker delivery result',
  description: 'Delivery settlement and performance summary',
  kind: 'overlay',
  layer: 190,
  interaction: 'blocking',
  component: defineAsyncComponent(() => import('./TruckerResultApp.vue')),
}
