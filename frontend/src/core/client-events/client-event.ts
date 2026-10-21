export type MpBridge = {
  trigger?: (eventName: string, ...args: unknown[]) => void
  events?: {
    call: (eventName: string, ...args: unknown[]) => void
  }
}

export function callClientEvent(eventName: string, ...args: unknown[]) {
  const mp = (globalThis as typeof globalThis & { mp?: MpBridge }).mp

  if (typeof mp?.trigger === 'function') {
    mp.trigger(eventName, ...args)
    return
  }

  mp?.events?.call(eventName, ...args)
}
