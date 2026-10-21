import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const vehicleApp: InterfaceDefinition<'vehicle'> = {
  id: 'vehicle',
  title: 'Vehicle',
  description: 'Нижний слой со статусом транспорта.',
  kind: 'overlay',
  layer: 40,
  gameplayChrome: true,
  component: defineAsyncComponent(() => import('./VehicleApp.vue')),
}
