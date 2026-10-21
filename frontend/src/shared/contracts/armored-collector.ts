export type ArmoredCollectorBoardState = 'loading' | 'ready' | 'error'
export type ArmoredCollectorRouteStage =
  | 'to_pickup'
  | 'collecting'
  | 'loading_vehicle'
  | 'to_dropoff'
  | 'unloading'
  | (string & {})

export interface ArmoredCollectorLocation {
  x: number
  y: number
  z: number
  heading: number
  dimension: number
  label: string
  address: string
}

export interface ArmoredCollectorShift {
  active: boolean
  startedAt: number
  vehicleLabel: string
}

export interface ArmoredCollectorLevelBonus {
  unlockLevel: number
  amount: number
  kind: 'cash' | 'percent'
  unlocked: boolean
}

export interface ArmoredCollectorLevelPayTier {
  level: number
  percent: number
  flatBonus: number
}

export interface ArmoredCollectorProfile {
  level: number
  xp: number
  currentLevelXp: number
  nextLevelXp: number | null
  completedRoutes: number
  totalEarned: number
  levelPayPercent: number
  levelBonus: ArmoredCollectorLevelBonus
}

export interface ArmoredCollectorRoute {
  routeId: string
  title: string
  pickup: ArmoredCollectorLocation
  unload: ArmoredCollectorLocation
  dropoff: ArmoredCollectorLocation
  distanceToPickupM: number
  distanceM: number
  routeDistanceM: number
  bags: number
  bagCount: number
  targetSeconds: number
  estimatedDurationSeconds: number
  basePay: number
  levelBonus: number
  veteranBonus: number
  speedBonus: number
  maxPayout: number
  estimatedPayout: ArmoredCollectorEstimatedPayout
  availableUntil: number
  expiresAt: number
  canSelect?: boolean
  disabledReasons?: string[]
}

export interface ArmoredCollectorEstimatedPayout {
  minimum: number
  maximum: number
}

export interface ArmoredCollectorActiveRoute {
  runId: string
  routeId: string
  title: string
  stage: ArmoredCollectorRouteStage
  phase: 'pickup' | 'unload'
  point: ArmoredCollectorLocation
  pickup: ArmoredCollectorLocation
  unload: ArmoredCollectorLocation
  distanceM: number
  routeDistanceM: number
  bags: number
  bagCount: number
  bagsLoaded: number
  carrying: boolean
  cancelFee: number
  selectedAt: number
  targetSeconds: number
  estimatedDurationSeconds: number
  estimatedPayout: ArmoredCollectorEstimatedPayout
}

export interface ArmoredCollectorRequest {
  pending: boolean
  errorMessage?: string | null
}

export interface ArmoredCollectorTabletPayload {
  available: boolean
  revision: string
  serverNow: number
  refreshIntervalMs: number
  nextRefreshAt: number
  status: ArmoredCollectorBoardState
  errorMessage?: string | null
  shift: ArmoredCollectorShift
  profile: ArmoredCollectorProfile
  activeRoute: ArmoredCollectorActiveRoute | null
  request: ArmoredCollectorRequest
  levelPayScale: ArmoredCollectorLevelPayTier[]
  routes: ArmoredCollectorRoute[]
}

export interface ArmoredCollectorSelectRouteRequest {
  routeId: string
  revision: string
}

export interface ArmoredCollectorCancelRouteRequest {
  routeId: string
  runId: string
}

export function isArmoredCollectorAppAvailable(payload?: ArmoredCollectorTabletPayload | null) {
  return payload?.available === true && payload.shift.active === true
}

export function getArmoredCollectorLevelProgress(profile?: ArmoredCollectorProfile | null) {
  if (!profile) return 0
  if (profile.nextLevelXp === null) return 100

  const required = Math.max(1, Number(profile.nextLevelXp) || 0)
  const current = Math.max(0, Number(profile.currentLevelXp) || 0)
  return Math.max(0, Math.min(100, current / required * 100))
}

export function getArmoredCollectorRefreshSeconds(
  payload: Pick<ArmoredCollectorTabletPayload, 'serverNow' | 'nextRefreshAt'> | null | undefined,
  localNow: number,
  payloadReceivedAt = localNow,
) {
  if (!payload) return 0

  const serverNow = Number(payload.serverNow)
  const nextRefreshAt = Number(payload.nextRefreshAt)
  const receivedAt = Number(payloadReceivedAt)
  if (!Number.isFinite(serverNow) || !Number.isFinite(nextRefreshAt) || !Number.isFinite(receivedAt)) return 0

  const estimatedServerNow = serverNow + Math.max(0, localNow - receivedAt)
  return Math.max(0, Math.ceil((nextRefreshAt - estimatedServerNow) / 1000))
}

export function canSelectArmoredCollectorRoute(
  payload: ArmoredCollectorTabletPayload | null | undefined,
  route: ArmoredCollectorRoute | null | undefined,
) {
  return Boolean(
    payload
    && route
    && isArmoredCollectorAppAvailable(payload)
    && payload.status === 'ready'
    && !payload.request.pending
    && !payload.activeRoute
    && route.canSelect !== false,
  )
}
