import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const npcDialogApp: InterfaceDefinition<'npcDialog'> = {
  id: 'npcDialog',
  title: 'NPC Dialog',
  description: 'Dialog interface for NPC conversations',
  kind: 'overlay',
  layer: 180,
  component: defineAsyncComponent(() => import('./NpcDialogApp.vue')),
}
