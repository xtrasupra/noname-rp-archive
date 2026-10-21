import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPresentedInterfaces,
  hasForegroundInterface,
} from '../src/core/interfaces/interface-presentation.ts'

const entry = (id, gameplayChrome = false, alwaysVisible = false) => ({
  id,
  definition: { alwaysVisible, gameplayChrome },
})

test('gameplay chrome remains visible during ordinary gameplay', () => {
  const entries = [
    entry('hud', true),
    entry('vehicle', true),
    entry('notifications', true, true),
  ]

  assert.equal(hasForegroundInterface(entries), false)
  assert.deepEqual(
    getPresentedInterfaces(entries).map(({ id }) => id),
    ['hud', 'vehicle', 'notifications'],
  )
})

test('pages suppress ordinary HUD chrome but retain global notifications', () => {
  const entries = [
    entry('hud', true),
    entry('vehicle', true),
    entry('notifications', true, true),
    entry('businessShop'),
  ]

  assert.equal(hasForegroundInterface(entries), true)
  assert.deepEqual(
    getPresentedInterfaces(entries).map(({ id }) => id),
    ['notifications', 'businessShop'],
  )
})

test('modal overlays suppress gameplay chrome without hiding one another', () => {
  const entries = [
    entry('hud', true),
    entry('notifications', true, true),
    entry('npcDialog'),
    entry('licenseDocument'),
  ]

  assert.deepEqual(
    getPresentedInterfaces(entries).map(({ id }) => id),
    ['notifications', 'npcDialog', 'licenseDocument'],
  )
})

test('closing the foreground restores the preserved gameplay entries', () => {
  const gameplayEntries = [entry('hud', true), entry('notifications', true, true)]
  const withDialog = [...gameplayEntries, entry('npcDialog')]

  assert.deepEqual(
    getPresentedInterfaces(withDialog).map(({ id }) => id),
    ['notifications', 'npcDialog'],
  )
  assert.deepEqual(
    getPresentedInterfaces(gameplayEntries).map(({ id }) => id),
    ['hud', 'notifications'],
  )
})
