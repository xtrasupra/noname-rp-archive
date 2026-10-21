import type { Component } from 'vue'
import type { Pinia } from 'pinia'

import type {
  ClientPagePropsMap,
  InterfaceEntryPayload,
  InterfaceId,
  InterfacePayloadMap,
  PageInterfaceId,
} from '@/shared/contracts/ui'

export type InterfaceOpenProps<Id extends InterfaceId> = Id extends PageInterfaceId
  ? ClientPagePropsMap[Id]
  : InterfacePayloadMap[Id]

export interface InterfaceOpenContext<Id extends InterfaceId = InterfaceId> {
  id: Id
  payload?: InterfacePayloadMap[Id]
  pinia: Pinia
  props?: InterfaceOpenProps<Id>
}

export interface InterfaceDefinition<Id extends InterfaceId = InterfaceId> {
  id: Id
  title: string
  description: string
  kind: 'page' | 'overlay'
  layer: number
  /**
   * Controls whether the full-screen host layer captures input outside the
   * component's explicitly interactive descendants.
   *
   * Pages block input by default; overlays pass input through by default.
   */
  interaction?: 'blocking' | 'passthrough'
  /**
   * Persistent gameplay presentation such as HUD or vehicle state. Gameplay
   * chrome remains registered but is not rendered while a foreground page or
   * modal overlay is active unless `alwaysVisible` is enabled.
   */
  gameplayChrome?: boolean
  /**
   * Keeps a high-priority overlay visible above foreground interfaces. This is
   * reserved for global feedback such as notifications, not ordinary HUD chrome.
   */
  alwaysVisible?: boolean
  component: Component
  clearBeforeOpen?: boolean
  beforeOpen?(context: InterfaceOpenContext<Id>): void
  resolvePayload?(context: InterfaceOpenContext<Id>): InterfacePayloadMap[Id] | undefined
}

export type InterfaceStateEntry = InterfaceEntryPayload & {
  openedAt: string
}
