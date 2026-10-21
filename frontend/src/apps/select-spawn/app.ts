import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'
import { parseSelectSpawnPayload } from '@/shared/contracts/select-spawn'

export const selectSpawnApp: InterfaceDefinition<'selectSpawn'> = {
  id: 'selectSpawn',
  title: 'Select Spawn',
  description: 'SelectSpawnPage',
  kind: 'page',
  layer: 80,
  resolvePayload: ({ payload }) => parseSelectSpawnPayload(payload) ?? undefined,
  component: defineAsyncComponent(() => import('./SelectSpawn.vue')),
}
