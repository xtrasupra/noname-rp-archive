import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const truckerRentalApp: InterfaceDefinition<'truckerRental'> = {
  id: 'truckerRental',
  title: 'Аренда транспорта Cross-State',
  description: 'Dedicated trucker fleet rental catalog',
  kind: 'page',
  layer: 92,
  component: defineAsyncComponent(() => import('./TruckerRentalApp.vue')),
}
