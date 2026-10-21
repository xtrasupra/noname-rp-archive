import { defineStore } from 'pinia'

import type {
  NotificationItem,
  NotificationOptions,
  NotificationVariant,
} from '@/shared/contracts/notifications'

import { isNotificationVariant } from '@/shared/contracts/notifications'

const DEFAULT_DURATION = 4500
const MAX_DURATION = 300_000
const MAX_VISIBLE_NOTIFICATIONS = 5
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function createId() {
  return `notification-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function resolveVariant(options?: NotificationOptions): NotificationVariant {
  const candidate = options?.variant ?? options?.type ?? options?.style

  return isNotificationVariant(candidate) ? candidate : 'info'
}

function resolveTitle(variant: NotificationVariant, title?: string) {
  if (title) {
    return title
  }

  const titles: Record<NotificationVariant, string> = {
    error: 'Ошибка',
    info: 'Информация',
    success: 'Успешно',
    warning: 'Внимание',
  }

  return titles[variant]
}

function resolveDuration(duration?: number) {
  if (duration === undefined) return DEFAULT_DURATION
  if (!Number.isFinite(duration)) return DEFAULT_DURATION

  return Math.min(MAX_DURATION, Math.max(0, duration))
}

function clearNotificationTimer(id: string) {
  const timer = timers.get(id)

  if (!timer) return

  clearTimeout(timer)
  timers.delete(id)
}

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    items: [] as NotificationItem[],
  }),

  actions: {
    notify(message: string, options?: NotificationOptions) {
      const variant = resolveVariant(options)
      const duration = resolveDuration(options?.duration)
      const item: NotificationItem = {
        id: createId(),
        title: resolveTitle(variant, options?.title),
        message,
        variant,
        duration,
        closable: options?.closable ?? true,
        createdAt: new Date().toISOString(),
      }

      this.items.unshift(item)
      const evictedItems = this.items.splice(MAX_VISIBLE_NOTIFICATIONS)
      evictedItems.forEach(({ id }) => clearNotificationTimer(id))

      if (duration > 0) {
        timers.set(
          item.id,
          setTimeout(() => {
            this.dismiss(item.id)
          }, duration),
        )
      }

      return item.id
    },

    dismiss(id: string) {
      clearNotificationTimer(id)

      this.items = this.items.filter((item) => item.id !== id)
    },

    clear() {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      this.items = []
    },
  },
})
