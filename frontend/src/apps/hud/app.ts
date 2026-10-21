import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const hudApp: InterfaceDefinition<'hud'> = {
  id: 'hud',
  title: 'HUD',
  description: 'Поверхностный интерфейс с данными игрока и персонажа.',
  kind: 'overlay',
  layer: 20,
  gameplayChrome: true,
  component: defineAsyncComponent(() => import('./HudApp.vue')),
}
