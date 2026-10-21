import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const radialMenuApp: InterfaceDefinition<'radialMenu'> = {
  id: 'radialMenu',
  title: 'Radial menu',
  description: 'Context radial menu',
  kind: 'overlay',
  layer: 120,
  component: defineAsyncComponent(() => import('./RadialMenuApp.vue')),
}

