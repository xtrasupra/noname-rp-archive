import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const licenseDocumentApp: InterfaceDefinition<'licenseDocument'> = {
  id: 'licenseDocument',
  title: 'License document',
  description: 'License document overlay',
  kind: 'overlay',
  layer: 180,
  component: defineAsyncComponent(() => import('./LicenseDocumentApp.vue')),
}

