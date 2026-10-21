import { defineStore } from 'pinia'

import type { InterfaceId } from '@/shared/contracts/ui'

interface RuntimeLogEntry {
  id: string
  name: string
  detail: string
  at: string
}

export const useBrowserRuntimeStore = defineStore('browser-runtime', {
  state: () => ({
    apiGlobal: 'twinkleBrowser',
    apiReady: false,
    currentPage: null as InterfaceId | null,
    lastAction: null as string | null,
    logs: [] as RuntimeLogEntry[],
  }),

  actions: {
    appendLog(name: string, detail: string) {
      this.lastAction = name
      this.logs.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        detail,
        at: new Date().toLocaleTimeString('ru-RU'),
      })

      this.logs = this.logs.slice(0, 8)
    },

    setCurrentPage(page: InterfaceId | null) {
      this.currentPage = page
    },

    setApiReady(value: boolean) {
      this.apiReady = value
    },
  },
})
