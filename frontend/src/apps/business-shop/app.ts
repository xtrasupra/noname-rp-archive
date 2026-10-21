import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { parseBusinessShopPayload } from '@/shared/contracts/business-shop'

export const businessShopApp: InterfaceDefinition<'businessShop'> = {
  id: 'businessShop',
  title: 'Бизнес',
  description: 'Customer storefront for player-owned businesses',
  kind: 'page',
  layer: 100,
  resolvePayload: ({ payload }) => parseBusinessShopPayload(payload) ?? undefined,
  component: defineAsyncComponent(() => import('./BusinessShopApp.vue')),
}
