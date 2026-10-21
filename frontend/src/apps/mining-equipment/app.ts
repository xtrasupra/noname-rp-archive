import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const miningEquipmentApp: InterfaceDefinition<'miningEquipment'> = {
  id: 'miningEquipment',
  title: 'Снаряжение шахтёра',
  description: 'Equipment, boosts and quarry haul rental',
  kind: 'page',
  layer: 94,
  component: defineAsyncComponent(() => import('./MiningEquipmentApp.vue')),
}
