import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PAYMENT_PROOF_MAX_SIDE_PX,
  computeFitSize,
} from './payment-proof-image'

test('computeFitSize memperkecil sisi terpanjang ke batas dengan rasio tetap', () => {
  // Screenshot HP portrait 1080x2400 → sisi tinggi jadi 1000.
  assert.deepEqual(computeFitSize(1080, 2400, PAYMENT_PROOF_MAX_SIDE_PX), {
    width: 450,
    height: 1000,
  })
  // Landscape 4000x3000 → sisi lebar jadi 1000.
  assert.deepEqual(computeFitSize(4000, 3000, PAYMENT_PROOF_MAX_SIDE_PX), {
    width: 1000,
    height: 750,
  })
})

test('computeFitSize tidak memperbesar gambar yang sudah kecil', () => {
  assert.deepEqual(computeFitSize(800, 600, PAYMENT_PROOF_MAX_SIDE_PX), {
    width: 800,
    height: 600,
  })
  assert.deepEqual(computeFitSize(1000, 1000, PAYMENT_PROOF_MAX_SIDE_PX), {
    width: 1000,
    height: 1000,
  })
})

test('computeFitSize tidak pernah menghasilkan sisi 0', () => {
  const { width, height } = computeFitSize(10, 5000, PAYMENT_PROOF_MAX_SIDE_PX)
  assert.equal(height, 1000)
  assert.ok(width >= 1)
})
