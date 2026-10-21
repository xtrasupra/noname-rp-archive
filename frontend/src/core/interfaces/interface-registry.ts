import type { InterfaceId } from '@/shared/contracts/ui'

import type { InterfaceDefinition } from './types'

const registry = new Map<InterfaceId, InterfaceDefinition>();

export function registerInterfaces(...definitions: InterfaceDefinition[]) {
  definitions.forEach((definition) => {
    registry.set(definition.id, definition)
  })
}

export function getInterfaceDefinition(id: InterfaceId) {
  return registry.get(id)
}

export function listInterfaceDefinitions() {
  return [...registry.values()].sort((left, right) => left.layer - right.layer)
}
