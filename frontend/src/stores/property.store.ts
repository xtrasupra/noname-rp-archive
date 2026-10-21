import { defineStore } from 'pinia'

import type { TabletApartment, TabletHouse } from '@/shared/contracts/ui'
import { isDevelopmentMockEnabled } from '@/shared/development-mocks'
import { initialApartments, initialHouses } from '@/shared/fixtures/property.fixture'

function cloneHouse(house: TabletHouse): TabletHouse {
  return {
    ...house,
    access: house.access?.map((entry) => ({ ...entry, rights: [...entry.rights] })),
    actions: house.actions?.map((action) => ({ ...action })),
    features: house.features.map((feature) => ({ ...feature })),
    furniture: house.furniture?.map((item) => ({
      ...item,
      position: item.position ? { ...item.position } : undefined,
      rotation: item.rotation ? { ...item.rotation } : undefined,
    })),
    garage: house.garage?.map((slot) => ({ ...slot })),
    garageInfo: house.garageInfo
      ? {
          ...house.garageInfo,
          entryPosition: house.garageInfo.entryPosition ? { ...house.garageInfo.entryPosition } : undefined,
          exitPosition: house.garageInfo.exitPosition ? { ...house.garageInfo.exitPosition } : undefined,
          vehicleSpawnPosition: house.garageInfo.vehicleSpawnPosition ? { ...house.garageInfo.vehicleSpawnPosition } : undefined,
        }
      : undefined,
    interiors: house.interiors?.map((interior) => ({ ...interior })),
    logs: house.logs?.map((entry) => ({ ...entry })),
    residents: house.residents.map((resident) => ({ ...resident })),
    settings: house.settings ? { ...house.settings } : undefined,
    storage: house.storage?.map((item) => ({ ...item })),
  }
}

function cloneApartment(apartment: TabletApartment): TabletApartment {
  return cloneHouse(apartment)
}

export const usePropertyStore = defineStore('property', {
  state: () => ({
    apartments: isDevelopmentMockEnabled ? initialApartments.map(cloneApartment) : [],
    houses: isDevelopmentMockEnabled ? initialHouses.map(cloneHouse) : [],
  }),

  actions: {
    setApartments(apartments: TabletApartment[]) {
      this.apartments = apartments.map(cloneApartment)
    },

    setHouses(houses: TabletHouse[]) {
      this.houses = houses.map(cloneHouse)
    },

    toggleHouseLock(houseId: string | number) {
      this.houses = this.houses.map((house) =>
        house.id === houseId
          ? { ...house, doorStatus: house.locked ? 'open' : 'closed', locked: !house.locked }
          : house,
      )
    },

    setApartmentInterior(apartmentId: string | number, interiorId: string | number) {
      this.apartments = this.apartments.map((apartment) =>
        apartment.id === apartmentId
          ? {
              ...apartment,
              currentInteriorId: interiorId,
              interiors: apartment.interiors?.map((interior) => ({
                ...interior,
                current: interior.id === interiorId,
              })),
            }
          : apartment,
      )
    },

    setHouseInterior(houseId: string | number, interiorId: string | number) {
      this.houses = this.houses.map((house) =>
        house.id === houseId
          ? {
              ...house,
              currentInteriorId: interiorId,
              interiors: house.interiors?.map((interior) => ({
                ...interior,
                current: interior.id === interiorId,
              })),
            }
          : house,
      )
    },

    toggleApartmentLock(apartmentId: string | number) {
      this.apartments = this.apartments.map((apartment) =>
        apartment.id === apartmentId
          ? { ...apartment, doorStatus: apartment.locked ? 'open' : 'closed', locked: !apartment.locked }
          : apartment,
      )
    },

    reset() {
      this.apartments = isDevelopmentMockEnabled ? initialApartments.map(cloneApartment) : []
      this.houses = isDevelopmentMockEnabled ? initialHouses.map(cloneHouse) : []
    },
  },
})
