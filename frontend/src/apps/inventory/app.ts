import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const inventoryApp: InterfaceDefinition<'inventory'> = {
  id: 'inventory',
  title: 'Inventory',
  description: 'Player inventory',
  kind: 'page',
  layer: 95,
  component: defineAsyncComponent(() => import('./InventoryApp.vue')),
}
