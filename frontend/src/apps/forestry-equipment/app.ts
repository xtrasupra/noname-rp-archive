import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const forestryEquipmentApp: InterfaceDefinition<'forestryEquipment'> = {
  id: 'forestryEquipment',
  title: 'Снаряжение лесоруба',
  description: 'Lumberjack tools, boosts and timber transport rental',
  kind: 'page',
  layer: 94,
  component: defineAsyncComponent(() => import('./ForestryEquipmentApp.vue')),
}
