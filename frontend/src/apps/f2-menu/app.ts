import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const f2MenuApp: InterfaceDefinition<'f2Menu'> = {
  id: 'f2Menu',
  title: 'F2 Menu',
  description: 'Player quick menu',
  kind: 'page',
  layer: 92,
  component: defineAsyncComponent(() => import('./F2MenuApp.vue')),
}
