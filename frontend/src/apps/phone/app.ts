import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const phoneApp: InterfaceDefinition<'phone'> = {
  id: 'phone',
  title: 'Phone',
  description: 'Player iPhone interface',
  kind: 'page',
  layer: 92,
  component: defineAsyncComponent(() => import('./PhoneApp.vue')),
}
