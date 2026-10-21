import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { parseFishingShopPayload } from '@/shared/contracts/fishing-shop'

export const fishingShopApp: InterfaceDefinition<'fishingShop'> = {
  id: 'fishingShop',
  title: 'Fishing Shop',
  description: 'Fishing supplies shop',
  kind: 'overlay',
  layer: 98,
  resolvePayload: ({ payload }) => parseFishingShopPayload(payload) ?? undefined,
  component: defineAsyncComponent(() => import('./FishingShopApp.vue')),
}
