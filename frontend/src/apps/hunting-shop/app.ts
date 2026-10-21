import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { parseHuntingShopPayload } from '@/shared/contracts/hunting-shop'

export const huntingShopApp: InterfaceDefinition<'huntingShop'> = {
  id: 'huntingShop',
  title: 'Hunting Shop',
  description: 'Jeremy Meadows hunting supplies',
  kind: 'page',
  layer: 98,
  resolvePayload: ({ payload }) => parseHuntingShopPayload(payload) ?? undefined,
  component: defineAsyncComponent(() => import('./HuntingShopApp.vue')),
}
