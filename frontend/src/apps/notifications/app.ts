import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const notificationsApp: InterfaceDefinition<'notifications'> = {
  id: 'notifications',
  title: 'Notifications',
  description: 'Notification overlay',
  kind: 'overlay',
  layer: 1000,
  gameplayChrome: true,
  alwaysVisible: true,
  component: defineAsyncComponent(() => import('./NotificationCenter.vue')),
}
