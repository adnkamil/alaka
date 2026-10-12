import assert from 'node:assert/strict'
import test from 'node:test'
import { canViewSubscriptionProof } from './subscription-proof-access'

const owner = (brandId: string | null) => ({
  isAdmin: false,
  brandId,
  brandRole: 'owner' as const,
})

test('pemilik brand yang sama boleh, brand lain tidak', () => {
  const row = { brandId: 'b1' }
  assert.equal(canViewSubscriptionProof(owner('b1'), row), true)
  assert.equal(canViewSubscriptionProof(owner('b2'), row), false)
})

test('admin brand (bukan pemilik) tidak boleh melihat bukti transfer', () => {
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: false, brandId: 'b1', brandRole: 'admin' },
      { brandId: 'b1' },
    ),
    false,
  )
})

test('admin platform boleh melihat semua', () => {
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: true, brandId: 'b9', brandRole: 'owner' },
      { brandId: 'b1' },
    ),
    true,
  )
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: true, brandId: 'b9', brandRole: 'admin' },
      { brandId: null },
    ),
    true,
  )
})

test('viewer tanpa brand ditolak, termasuk saat baris juga tanpa brand', () => {
  assert.equal(canViewSubscriptionProof(owner(null), { brandId: null }), false)
  assert.equal(canViewSubscriptionProof(owner(null), { brandId: 'b1' }), false)
})

test('baris tanpa brand tidak terlihat oleh viewer yang punya brand', () => {
  assert.equal(canViewSubscriptionProof(owner('b1'), { brandId: null }), false)
})
