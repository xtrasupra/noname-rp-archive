import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { patchTabletStores } from './state'

export const tabletApp: InterfaceDefinition<'tablet'> = {
  id: 'tablet',
  title: 'Tablet',
  description: 'Player tablet home screen',
  kind: 'page',
  layer: 90,
  component: defineAsyncComponent(() => import('./TabletApp.vue')),
  beforeOpen({ pinia, payload, props }) {
    patchTabletStores(pinia, payload ?? props)
  },
  resolvePayload({ payload, props }) {
    return payload ?? props
  },
}
