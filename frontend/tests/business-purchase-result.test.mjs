import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseBusinessPurchaseProgress,
  parseBusinessPurchaseResult,
} from '../src/shared/contracts/business-shop.ts'
import { isPurchaseControlDisabled } from '../src/apps/business-shop/purchase-control.ts'

test('parses the correlated business purchase result used to unlock shop buttons', () => {
  assert.deepEqual(parseBusinessPurchaseResult({
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    success: true,
    reason: '',
  }), {
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    success: true,
    reason: '',
  })
})

test('rejects malformed or unversioned business purchase results', () => {
  assert.equal(parseBusinessPurchaseResult({
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    success: true,
    reason: '',
  }), null)
  assert.equal(parseBusinessPurchaseResult({
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    success: 'yes',
    reason: '',
  }), null)
})

test('parses only the versioned idempotent retry progress state', () => {
  assert.deepEqual(parseBusinessPurchaseProgress({
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    state: 'retrying',
  }), {
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    state: 'retrying',
  })
  assert.equal(parseBusinessPurchaseProgress({
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    state: 'complete',
  }), null)
  assert.equal(parseBusinessPurchaseProgress({
    contractVersion: 1,
    businessId: 'clothing_ponsonbys',
    productId: 'hoodie_black',
    state: 'retry_available',
  })?.state, 'retry_available')
})

test('keeps the matching payment recovery action enabled after stock or fuel refreshes', () => {
  assert.equal(isPurchaseControlDisabled(true, true, true), false)
  assert.equal(isPurchaseControlDisabled(false, true, false), true)
  assert.equal(isPurchaseControlDisabled(true, false, false), true)
})
