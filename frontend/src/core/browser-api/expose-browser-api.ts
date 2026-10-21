import type { Pinia } from 'pinia'

import type { TwinkleBrowserApi } from './types'
import {
  closeAllInterfaces,
  closeAllPages,
  closeInterface,
  closePage,
  openInterface,
  setPage,
} from './interface-api'
import { clearNotifications, notify } from './notification-api'
import {
  getSnapshot,
  resetState,
} from './state-api'

import { patchCharacterState } from '@/apps/character/browser-api'
import { patchPlayerState } from '@/apps/hud/browser-api'
import {
  patchTabletOrganization,
  patchTabletState,
  setTabletOrganizations,
  setTabletState,
} from '@/apps/tablet/browser-api'
import { patchVehicleState } from '@/apps/vehicle/browser-api'
import { isInterfaceId, isOverlayInterfaceId, isPageInterfaceId } from '@/shared/contracts/ui'
import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'

export function exposeBrowserApi(pinia: Pinia) {
  const runtimeStore = useBrowserRuntimeStore(pinia)

  const reject = (reason: string) => {
    runtimeStore.appendLog('api:error', reason)
  }

  const api: TwinkleBrowserApi = {
    version: '1.0.0',

    pages: {
      close(page) {
        if (page && !isPageInterfaceId(page)) {
          reject(`unknown page: ${String(page)}`)
          return
        }

        closePage(pinia, page)
      },
      closeAll() {
        closeAllPages(pinia)
      },
      set(page, props, payload) {
        if (!isInterfaceId(page) || (page !== 'hud' && !isPageInterfaceId(page))) {
          reject(`unknown page: ${String(page)}`)
          return
        }

        setPage(pinia, page, props, payload)
      },
    },

    interfaces: {
      close(id) {
        if (!isInterfaceId(id)) {
          reject(`unknown interface: ${String(id)}`)
          return
        }

        closeInterface(pinia, id)
      },
      closeAll() {
        closeAllInterfaces(pinia)
      },
      open(id, payload) {
        if (!isInterfaceId(id) || !isOverlayInterfaceId(id)) {
          reject(`unknown overlay: ${String(id)}`)
          return
        }

        openInterface(pinia, id, payload)
      },
    },

    state: {
      getSnapshot() {
        return getSnapshot(pinia)
      },
      patchCharacter(payload) {
        patchCharacterState(pinia, payload)
      },
      patchPlayer(payload) {
        patchPlayerState(pinia, payload)
      },
      patchTablet(payload) {
        patchTabletState(pinia, payload)
      },
      patchVehicle(payload) {
        patchVehicleState(pinia, payload)
      },
      reset() {
        resetState(pinia)
      },
    },

    closeAllInterfaces() {
      closeAllInterfaces(pinia)
    },
    closeAllPages() {
      closeAllPages(pinia)
    },
    closeInterface(id) {
      if (!isInterfaceId(id)) {
        reject(`unknown interface: ${String(id)}`)
        return
      }

      closeInterface(pinia, id)
    },
    closePage(page) {
      if (page && !isPageInterfaceId(page)) {
        reject(`unknown page: ${String(page)}`)
        return
      }

      closePage(pinia, page)
    },
    getSnapshot() {
      return getSnapshot(pinia)
    },
    notify(message, options) {
      return notify(pinia, message, options)
    },
    clearNotifications() {
      clearNotifications(pinia)
    },
    openInterface(id, payload) {
      if (!isInterfaceId(id) || !isOverlayInterfaceId(id)) {
        reject(`unknown overlay: ${String(id)}`)
        return
      }

      openInterface(pinia, id, payload)
    },
    patchCharacter(payload) {
      patchCharacterState(pinia, payload)
    },
    patchPlayer(payload) {
      patchPlayerState(pinia, payload)
    },
    patchTablet(payload) {
      patchTabletState(pinia, payload)
    },
    patchVehicle(payload) {
      patchVehicleState(pinia, payload)
    },
    tablet: {
      patch(payload) {
        patchTabletState(pinia, payload)
      },
      patchOrganization(payload) {
        patchTabletOrganization(pinia, payload)
      },
      set(payload) {
        setTabletState(pinia, payload)
      },
      setOrganizations(payload) {
        setTabletOrganizations(pinia, payload)
      },
    },
    setPage(page, props, payload) {
      if (!isInterfaceId(page) || (page !== 'hud' && !isPageInterfaceId(page))) {
        reject(`unknown page: ${String(page)}`)
        return
      }

      setPage(pinia, page, props, payload)
    },
  }

  window.twinkleBrowser = api
  runtimeStore.setApiReady(true)
  runtimeStore.appendLog('api:ready', `window.${runtimeStore.apiGlobal}`);

  return () => {
    delete window.twinkleBrowser
    runtimeStore.setApiReady(false)
  }
}
