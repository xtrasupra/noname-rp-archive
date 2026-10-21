import type { Pinia } from 'pinia'

import { useCharacterStore } from '@/stores/character.store'
import { usePropertyStore } from '@/stores/property.store'
import type { TabletPayload } from '@/shared/contracts/ui'

export function patchTabletStores(pinia: Pinia, payload?: TabletPayload) {
  if (!payload) {
    return
  }

  const characterStore = useCharacterStore(pinia)
  const propertyStore = usePropertyStore(pinia)

  if (payload.character) {
    characterStore.patch(payload.character)
  }

  if (payload.organizations) {
    characterStore.patch({ organizations: payload.organizations })
  }

  if (payload.organization) {
    characterStore.patchOrganization(payload.organization)
  }

  if (payload.houses) {
    propertyStore.setHouses(payload.houses)
  }

  if (payload.apartments) {
    propertyStore.setApartments(payload.apartments)
  }
}
