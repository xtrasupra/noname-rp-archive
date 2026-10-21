import { defineStore } from 'pinia'

import type { PlayerState } from '@/shared/types/game'

const initialState: PlayerState = {
  id: 1,
  name: 'Archive Dev',
  ping: 24,
  locale: 'ru',
  authenticated: true,
  adminLevel: 3,
}

export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => ({
    ...initialState,
  }),

  actions: {
    patch(payload: Partial<PlayerState>) {
      Object.assign(this, payload)
    },

    reset() {
      Object.assign(this, initialState)
    },
  },
})
