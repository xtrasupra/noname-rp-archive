export const ROULETTE_MULTIPLIER_VALUES = [2, 3, 5, 10] as const

export type RouletteMultiplierValue = typeof ROULETTE_MULTIPLIER_VALUES[number]
export type RouletteMultiplierLabel = `x${RouletteMultiplierValue}`

export interface RouletteSegmentConfig {
  id: string
  multiplier: RouletteMultiplierValue
  chance: number
  color: string
  prizeImage?: string
}

export interface RouletteConfig {
  version: 1
  minBet: number
  maxBet: number
  multipliers: RouletteMultiplierValue[]
  segments: RouletteSegmentConfig[]
  pendingResult: RouletteResult | null
}

export interface PendingRouletteSpin {
  amount: number
  requestId: string
  selectedMultiplier: RouletteMultiplierValue
}

export interface RouletteResult {
  requestId: string
  success: boolean
  message: string
  donate: number
  win: boolean
  bet: number
  winAmount: number
  resultMultiplier: RouletteMultiplierValue | null
  selectedMultiplier: RouletteMultiplierValue | null
  segmentId: string | null
}

export interface RouletteBridgeState {
  pending: PendingRouletteSpin | null
  result: RouletteResult | null
}

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,64}$/
const SEGMENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNonNegativeInteger(value: unknown) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function parsePayload(rawPayload: unknown) {
  if (typeof rawPayload !== 'string') return rawPayload

  try {
    return JSON.parse(rawPayload) as unknown
  } catch {
    return null
  }
}

export function isRouletteMultiplier(value: unknown): value is RouletteMultiplierValue {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && ROULETTE_MULTIPLIER_VALUES.includes(value as RouletteMultiplierValue)
}

export function multiplierLabelToValue(label: RouletteMultiplierLabel): RouletteMultiplierValue {
  return Number(label.slice(1)) as RouletteMultiplierValue
}

export function multiplierValueToLabel(value: RouletteMultiplierValue): RouletteMultiplierLabel {
  return `x${value}`
}

export function parseRouletteResult(rawPayload: unknown): RouletteResult | null {
  const payload = parsePayload(rawPayload)

  if (!isRecord(payload)) return null

  const requestId = String(payload.requestId || '').trim()
  const success = payload.success

  if (!REQUEST_ID_PATTERN.test(requestId) || typeof success !== 'boolean') {
    return null
  }

  const resultMultiplier = isRouletteMultiplier(payload.resultMultiplier)
    ? payload.resultMultiplier
    : null
  const selectedMultiplier = isRouletteMultiplier(payload.selectedMultiplier)
    ? payload.selectedMultiplier
    : null
  const segmentId = typeof payload.segmentId === 'string'
    && SEGMENT_ID_PATTERN.test(payload.segmentId)
    ? payload.segmentId
    : null

  if (success && (resultMultiplier === null || selectedMultiplier === null || segmentId === null)) return null

  return {
    requestId,
    success,
    message: typeof payload.message === 'string'
      ? payload.message.slice(0, 240)
      : success ? 'Прокрут завершён.' : 'Ошибка рулетки.',
    donate: toNonNegativeInteger(payload.donate),
    win: payload.win === true,
    bet: toNonNegativeInteger(payload.bet),
    winAmount: toNonNegativeInteger(payload.winAmount),
    resultMultiplier,
    selectedMultiplier,
    segmentId,
  }
}

export function parseRouletteConfig(rawPayload: unknown): RouletteConfig | null {
  const payload = parsePayload(rawPayload)
  if (!isRecord(payload)) return null

  const shop = isRecord(payload.shop) ? payload.shop : null
  const config = shop && isRecord(shop.roulette)
    ? shop.roulette
    : isRecord(payload.roulette) ? payload.roulette : null

  if (!config || config.version !== 1 || !Array.isArray(config.segments)) {
    return null
  }

  const minBet = toNonNegativeInteger(config.minBet)
  const maxBet = toNonNegativeInteger(config.maxBet)
  const segments: RouletteSegmentConfig[] = []

  for (const rawSegment of config.segments) {
    if (!isRecord(rawSegment)) return null

    const id = typeof rawSegment.id === 'string' ? rawSegment.id : ''
    const color = typeof rawSegment.color === 'string' ? rawSegment.color : ''
    const chance = toNonNegativeInteger(rawSegment.chance)

    if (
      !SEGMENT_ID_PATTERN.test(id)
      || !COLOR_PATTERN.test(color)
      || chance <= 0
      || !isRouletteMultiplier(rawSegment.multiplier)
    ) {
      return null
    }

    const segment: RouletteSegmentConfig = {
      id,
      color,
      chance,
      multiplier: rawSegment.multiplier,
    }

    if (typeof rawSegment.prizeImage === 'string' && rawSegment.prizeImage.startsWith('/')) {
      segment.prizeImage = rawSegment.prizeImage.slice(0, 180)
    }
    segments.push(segment)
  }

  const multipliers = [...new Set(segments.map((segment) => segment.multiplier))]
    .sort((left, right) => left - right)
  const totalChance = segments.reduce((sum, segment) => sum + segment.chance, 0)
  const pendingResult = config.pendingResult === null || config.pendingResult === undefined
    ? null
    : parseRouletteResult(config.pendingResult)

  if (
    minBet <= 0
    || maxBet < minBet
    || totalChance !== 100
    || multipliers.length === 0
    || (config.pendingResult !== null && config.pendingResult !== undefined && !pendingResult)
    || (pendingResult?.success === true && !segments.some((segment) => (
      segment.id === pendingResult.segmentId
      && segment.multiplier === pendingResult.resultMultiplier
    )))
  ) {
    return null
  }

  return {
    version: 1,
    minBet,
    maxBet,
    multipliers,
    segments,
    pendingResult,
  }
}

export function parseRouletteBridgeState(rawPayload: unknown): RouletteBridgeState | null {
  const payload = parsePayload(rawPayload)
  if (!isRecord(payload)) return null

  let pending: PendingRouletteSpin | null = null
  if (payload.pending !== null && payload.pending !== undefined) {
    if (!isRecord(payload.pending)) return null

    const requestId = String(payload.pending.requestId || '').trim()
    const amount = toNonNegativeInteger(payload.pending.amount)

    if (
      !REQUEST_ID_PATTERN.test(requestId)
      || amount <= 0
      || !isRouletteMultiplier(payload.pending.selectedMultiplier)
    ) {
      return null
    }

    pending = {
      amount,
      requestId,
      selectedMultiplier: payload.pending.selectedMultiplier,
    }
  }

  const result = payload.result === null || payload.result === undefined
    ? null
    : parseRouletteResult(payload.result)

  if (payload.result !== null && payload.result !== undefined && !result) return null
  if (result && pending?.requestId !== result.requestId) return null

  return { pending, result }
}
