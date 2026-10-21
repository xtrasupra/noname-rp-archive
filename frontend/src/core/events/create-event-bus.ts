type EventHandler<Payload> = (payload: Payload) => void

export interface EventBus<Events extends object> {
  emit<Key extends keyof Events>(event: Key, payload: Events[Key]): void
  on<Key extends keyof Events>(
    event: Key,
    handler: EventHandler<Events[Key]>,
  ): () => void
  clear(): void
}

export function createEventBus<Events extends object>(): EventBus<Events> {
  const listeners = new Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>()

  return {
    emit(event, payload) {
      const handlers = listeners.get(event)

      if (!handlers) {
        return
      }

      handlers.forEach((handler) => {
        handler(payload)
      })
    },

    on(event, handler) {
      const handlers = listeners.get(event) ?? new Set()

      handlers.add(handler as EventHandler<Events[keyof Events]>)
      listeners.set(event, handlers)

      return () => {
        handlers.delete(handler as EventHandler<Events[keyof Events]>)

        if (handlers.size === 0) {
          listeners.delete(event)
        }
      }
    },

    clear() {
      listeners.clear()
    },
  }
}
