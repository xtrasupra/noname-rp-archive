import { defineAsyncComponent } from 'vue'

import type { InterfaceDefinition } from '@/core/interfaces/types'

export const drivingSchoolApp: InterfaceDefinition<'drivingSchool'> = {
  id: 'drivingSchool',
  title: 'Автошкола',
  description: 'Изучение теории и экзамен автошколы',
  kind: 'page',
  layer: 99,
  component: defineAsyncComponent(() => import('./DrivingSchoolApp.vue')),
}
