import { defineStore } from 'pinia'

import type { VehicleState } from '@/shared/types/game'

const initialState: VehicleState = {
  id: 314,
  model: 'Karin Sultan RS',
  plate: 'TWN-204',
  speed: 0,
  maxSpeed: 240,
  mileage: 165,
  fuel: 74,
  fuelMax: 100,
  engineHealth: 89,
  inVehicle: false,
  doorsLocked: false,
  engineOn: false,
  seatbeltOn: false,
  lightsOn: false,
  gear: 'N',
}

export const useVehicleStore = defineStore('vehicle', {
  state: (): VehicleState => ({
    ...initialState,
  }),

  actions: {
    patch(payload: Partial<VehicleState>) {
      Object.assign(this, payload)
    },

    setInVehicle(value: boolean) {
      this.inVehicle = value

      if (!value) {
        this.speed = 0
      }
    },

    setSpeed(speed: number) {
      this.speed = speed
    },

    reset() {
      Object.assign(this, initialState)
    },
  },
})
