import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { parseVehicleDealershipPayload } from '@/shared/contracts/vehicle-dealership'

export const vehicleDealershipApp: InterfaceDefinition<'vehicle-dealership'> = {
  id: 'vehicle-dealership',
  title: 'Vehicle dealership',
  description: 'Private showroom and personal vehicle purchase interface',
  kind: 'page',
  layer: 90,
  resolvePayload: ({ payload }) => parseVehicleDealershipPayload(payload) ?? undefined,
  component: defineAsyncComponent(() => import('./VehicleDealershipApp.vue')),
}
