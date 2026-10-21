export function normalizePayload<T>(payload?: T | string | null): T | undefined {
  if (payload == null) {
    return undefined
  }

  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as T
    } catch {
      return undefined
    }
  }

  return payload
}
