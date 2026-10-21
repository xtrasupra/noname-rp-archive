import { defineAsyncComponent } from 'vue'
import type { InterfaceDefinition } from '@/core/interfaces/types'

export const governmentComputerApp: InterfaceDefinition<'government-computer'> = {
  id: 'government-computer',
  title: 'Government Computer',
  description: 'State procurement and decree terminal',
  kind: 'page',
  layer: 90,
  component: defineAsyncComponent(() => import('./GovernmentComputerApp.vue')),
}
