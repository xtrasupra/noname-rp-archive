import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const lsCustomsApp: InterfaceDefinition<'ls-customs'> = {
  id: 'ls-customs',
  title: 'LS Customs',
  description: 'Vehicle customization interface',
  kind: 'page',
  layer: 90,
  component: defineAsyncComponent(() => import('./LsCustomsApp.vue')),
}