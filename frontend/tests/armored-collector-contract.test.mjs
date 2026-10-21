import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canSelectArmoredCollectorRoute,
  getArmoredCollectorLevelProgress,
  getArmoredCollectorRefreshSeconds,
  isArmoredCollectorAppAvailable,
} from '../src/shared/contracts/armored-collector.ts'

const route = {
  routeId: 'route-1',
}

const payload = {
  available: true,
  shift: { active: true },
  status: 'ready',
  request: { pending: false },
  activeRoute: null,
  serverNow: 1_000_000,
  nextRefreshAt: 1_300_000,
}

test('shows the app only while the server reports an active collector shift', () => {
  assert.equal(isArmoredCollectorAppAvailable(payload), true)
  assert.equal(isArmoredCollectorAppAvailable({ ...payload, available: false }), false)
  assert.equal(isArmoredCollectorAppAvailable({ ...payload, shift: { active: false } }), false)
  assert.equal(isArmoredCollectorAppAvailable(null), false)
})

test('uses server timestamps for the five-minute refresh countdown', () => {
  assert.equal(getArmoredCollectorRefreshSeconds(payload, 50_000, 50_000), 300)
  assert.equal(getArmoredCollectorRefreshSeconds(payload, 51_000, 50_000), 299)
  assert.equal(getArmoredCollectorRefreshSeconds({ ...payload, nextRefreshAt: 999_999 }, 50_000), 0)
})

test('clamps the visual level progress without deriving any payout', () => {
  assert.equal(getArmoredCollectorLevelProgress({ currentLevelXp: 25, nextLevelXp: 100 }), 25)
  assert.equal(getArmoredCollectorLevelProgress({ currentLevelXp: 140, nextLevelXp: 100 }), 100)
  assert.equal(getArmoredCollectorLevelProgress({ currentLevelXp: 1, nextLevelXp: null }), 100)
})

test('allows a route only when shift, board and server route state allow it', () => {
  assert.equal(canSelectArmoredCollectorRoute(payload, route), true)
  assert.equal(canSelectArmoredCollectorRoute({ ...payload, status: 'loading' }, route), false)
  assert.equal(canSelectArmoredCollectorRoute({ ...payload, request: { pending: true } }, route), false)
  assert.equal(canSelectArmoredCollectorRoute({ ...payload, activeRoute: { routeId: 'active' } }, route), false)
  assert.equal(canSelectArmoredCollectorRoute(payload, { ...route, canSelect: false }), false)
})
