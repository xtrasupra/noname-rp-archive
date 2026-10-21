import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const rentCarApp: InterfaceDefinition<'rent-car'> = {
  id: 'rent-car',
  title: 'Аренда транспорта',
  description: 'Vehicle rental interface',
  kind: 'page',
  layer: 90,
  component: defineAsyncComponent(() => import('./RentCarApp.vue')),
}
