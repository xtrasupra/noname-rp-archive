export const notificationVariants = ['warning', 'error', 'success', 'info'] as const

export type NotificationVariant = (typeof notificationVariants)[number]

export interface NotificationOptions {
  title?: string
  variant?: NotificationVariant
  type?: NotificationVariant
  style?: NotificationVariant
  duration?: number
  closable?: boolean
}

export interface NotificationItem {
  id: string
  title: string
  message: string
  variant: NotificationVariant
  duration: number
  closable: boolean
  createdAt: string
}

export function isNotificationVariant(value: unknown): value is NotificationVariant {
  return typeof value === 'string' && (notificationVariants as readonly string[]).includes(value)
}
