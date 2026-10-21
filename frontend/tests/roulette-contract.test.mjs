import assert from 'node:assert/strict'
import test from 'node:test'

import {
  multiplierLabelToValue,
  multiplierValueToLabel,
  parseRouletteBridgeState,
  parseRouletteConfig,
  parseRouletteResult,
} from '../src/apps/f2-menu/roulette-contract.ts'

test('parses an authoritative successful roulette result', () => {
  assert.deepEqual(parseRouletteResult({
    requestId: 'roulette:123:abc',
    success: true,
    message: 'Вы выиграли 50 Twinkle Coin.',
    donate: 140,
    win: true,
    bet: 10,
    winAmount: 50,
    resultMultiplier: 5,
    selectedMultiplier: 5,
    segmentId: 'x5-small',
  }), {
    requestId: 'roulette:123:abc',
    success: true,
    message: 'Вы выиграли 50 Twinkle Coin.',
    donate: 140,
    win: true,
    bet: 10,
    winAmount: 50,
    resultMultiplier: 5,
    selectedMultiplier: 5,
    segmentId: 'x5-small',
  })
})

test('rejects malformed or non-authoritative success payloads', () => {
  assert.equal(parseRouletteResult('{bad json'), null)
  assert.equal(parseRouletteResult({ requestId: '../bad', success: false }), null)
  assert.equal(parseRouletteResult({
    requestId: 'roulette:123:abc',
    success: true,
    resultMultiplier: 7,
    selectedMultiplier: 5,
    segmentId: 'x5-small',
  }), null)
  assert.equal(parseRouletteResult({
    requestId: 'roulette:123:abc',
    success: true,
    resultMultiplier: '5',
    selectedMultiplier: 5,
    segmentId: 'x5-small',
  }), null)
})

test('preserves supported multiplier mappings', () => {
  assert.equal(multiplierLabelToValue('x10'), 10)
  assert.equal(multiplierValueToLabel(3), 'x3')
})

test('parses server-provided roulette configuration and recoverable bridge state', () => {
  const config = parseRouletteConfig({
    shop: {
      roulette: {
        version: 1,
        minBet: 1,
        maxBet: 100000,
        multipliers: [2, 3, 5, 10],
        pendingResult: {
          requestId: 'roulette:reconnect:1',
          success: true,
          message: 'Сохранённый выигрыш',
          donate: 140,
          win: true,
          bet: 10,
          winAmount: 50,
          resultMultiplier: 5,
          selectedMultiplier: 5,
          segmentId: 'x5',
        },
        segments: [
          { id: 'x2', multiplier: 2, chance: 45, color: '#dedede' },
          { id: 'x3', multiplier: 3, chance: 31, color: '#e40000' },
          { id: 'x5', multiplier: 5, chance: 17, color: '#19c994' },
          { id: 'x10', multiplier: 10, chance: 7, color: '#f0e600' },
        ],
      },
    },
  })
  assert.equal(config?.segments.length, 4)
  assert.deepEqual(config?.multipliers, [2, 3, 5, 10])
  assert.equal(config?.pendingResult?.requestId, 'roulette:reconnect:1')

  const state = parseRouletteBridgeState({
    pending: {
      amount: 10,
      requestId: 'roulette:recover:1',
      selectedMultiplier: 5,
    },
    result: {
      requestId: 'roulette:recover:1',
      success: true,
      message: 'Выигрыш',
      donate: 140,
      win: true,
      bet: 10,
      winAmount: 50,
      resultMultiplier: 5,
      selectedMultiplier: 5,
      segmentId: 'x5',
    },
  })
  assert.equal(state?.pending?.requestId, 'roulette:recover:1')
  assert.equal(state?.result?.segmentId, 'x5')
})
