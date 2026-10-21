import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { parseAutoServicePayload } from '@/shared/contracts/auto-service'

export const autoServiceApp: InterfaceDefinition<'auto-service'> = {
  id: 'auto-service',
  title: 'Автосервис',
  description: 'Personal vehicle delivery service',
  kind: 'page',
  layer: 90,
  resolvePayload: ({ payload }) => parseAutoServicePayload(payload) ?? undefined,
  component: defineAsyncComponent(() => import('./AutoServiceApp.vue')),
}
