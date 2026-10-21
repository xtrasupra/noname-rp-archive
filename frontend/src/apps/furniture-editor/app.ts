import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const furnitureEditorApp: InterfaceDefinition<'furnitureEditor'> = {
  id: 'furnitureEditor',
  title: 'Furniture Editor',
  description: 'Apartment and house furniture editor',
  kind: 'page',
  layer: 96,
  component: defineAsyncComponent(() => import('./FurnitureEditorApp.vue')),
  resolvePayload({ payload, props }) {
    return payload ?? props
  },
}
