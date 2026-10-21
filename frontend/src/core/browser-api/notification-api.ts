import type { Pinia } from 'pinia'

import type { NotificationOptions } from '@/shared/contracts/notifications'

import { useBrowserRuntimeStore } from '@/core/browser/runtime.store'
import { useInterfaceManagerStore } from '@/core/interfaces/interface-manager.store'
import { useNotificationStore } from '@/stores/notification.store'

function normalizeNotificationOptions(options?: NotificationOptions | string | null): NotificationOptions | undefined {
  if (typeof options === 'string') {
    return { variant: options as NotificationOptions['variant'] }
  }

  return options ?? undefined
}

export function notify(pinia: Pinia, message: string, options?: NotificationOptions | string | null) {
  const interfaceManager = useInterfaceManagerStore(pinia)
  const notificationStore = useNotificationStore(pinia)
  const notificationId = notificationStore.notify(String(message), normalizeNotificationOptions(options))

  if (!interfaceManager.isActive('notifications')) {
    interfaceManager.open('notifications')
  }

  useBrowserRuntimeStore(pinia).appendLog('notify', notificationId)

  return notificationId
}

export function clearNotifications(pinia: Pinia) {
  useNotificationStore(pinia).clear()
  useBrowserRuntimeStore(pinia).appendLog('clearNotifications', 'ok')
}
