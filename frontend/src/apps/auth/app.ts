import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const authApp: InterfaceDefinition<'auth'> = {
    id: 'auth',
    title: 'auth',
    description: 'AuthPage',
    kind: 'page',
    layer: 80,
    component: defineAsyncComponent(() => import('./AuthApp.vue')),
}
