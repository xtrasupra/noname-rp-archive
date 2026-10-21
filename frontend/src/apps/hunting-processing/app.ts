import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const huntingProcessingApp: InterfaceDefinition<'huntingProcessing'> = {
  id: 'huntingProcessing',
  title: '\u0420\u0430\u0437\u0434\u0435\u043b\u043a\u0430 \u0442\u0443\u0448\u0438',
  description: '\u0412\u044b\u0431\u043e\u0440 \u0441\u043f\u043e\u0441\u043e\u0431\u0430 \u0440\u0430\u0437\u0434\u0435\u043b\u043a\u0438 \u0438 \u043e\u0445\u043e\u0442\u043d\u0438\u0447\u044c\u044f \u043c\u0438\u043d\u0438-\u0438\u0433\u0440\u0430',
  kind: 'page',
  layer: 99,
  component: defineAsyncComponent(() => import('./HuntingProcessingApp.vue')),
}
