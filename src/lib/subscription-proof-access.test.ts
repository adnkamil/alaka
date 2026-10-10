import assert from 'node:assert/strict'
import test from 'node:test'
import { canViewSubscriptionProof } from './subscription-proof-access'

test('anggota brand yang sama boleh, brand lain tidak', () => {
  const row = { brandId: 'b1' }
  assert.equal(
    canViewSubscriptionProof({ isAdmin: false, brandId: 'b1' }, row),
    true,
  )
  assert.equal(
    canViewSubscriptionProof({ isAdmin: false, brandId: 'b2' }, row),
    false,
  )
})

test('admin platform boleh melihat semua', () => {
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: true, brandId: null },
      { brandId: 'b1' },
    ),
    true,
  )
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: true, brandId: 'b9' },
      { brandId: null },
    ),
    true,
  )
})

test('viewer tanpa brand ditolak, termasuk saat baris juga tanpa brand', () => {
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: false, brandId: null },
      { brandId: null },
    ),
    false,
  )
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: false, brandId: null },
      { brandId: 'b1' },
    ),
    false,
  )
})

test('baris tanpa brand tidak terlihat oleh viewer yang punya brand', () => {
  assert.equal(
    canViewSubscriptionProof(
      { isAdmin: false, brandId: 'b1' },
      { brandId: null },
    ),
    false,
  )
})
