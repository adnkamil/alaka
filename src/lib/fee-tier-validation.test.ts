import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findFeeForPrice,
  nextTierMinPrice,
  validateFeeTiers,
} from './fee-tier-validation'

/**
 * Tes aturan tier fee: harga min tier baru (auto-lanjut dari tier sebelumnya)
 * dan validasi overlap. Modulnya murni, jadi bisa diuji tanpa database
 * (`pnpm test`).
 */

describe('nextTierMinPrice', () => {
  it('belum ada tier -> mulai dari 0', () => {
    assert.equal(nextTierMinPrice([]), 0)
  })

  it('lanjut dari harga maks tier sebelumnya + 1', () => {
    const tiers = [{ minPrice: 0, maxPrice: 19_900, feeAmount: 4_000 }]
    assert.equal(nextTierMinPrice(tiers), 19_901)
  })

  it('pakai tier terakhir di daftar, bukan yang harga maksnya terbesar', () => {
    const tiers = [
      { minPrice: 0, maxPrice: 19_900, feeAmount: 4_000 },
      { minPrice: 100_000, maxPrice: 199_000, feeAmount: 13_000 },
      { minPrice: 20_000, maxPrice: 39_900, feeAmount: 6_000 },
    ]
    assert.equal(nextTierMinPrice(tiers), 39_901)
  })

  it('tier baru hasilnya tidak tumpang tindih dengan tier sebelumnya', () => {
    const tiers = [
      { minPrice: 0, maxPrice: 19_900, feeAmount: 4_000 },
      { minPrice: 20_000, maxPrice: 39_900, feeAmount: 6_000 },
    ]
    const nextTier = {
      minPrice: nextTierMinPrice(tiers),
      maxPrice: 69_900,
      feeAmount: 8_000,
    }

    assert.deepEqual(validateFeeTiers([...tiers, nextTier]), [])
  })

  it('tier baru tetap kelebihan 1 supaya tidak overlap dengan tier maks 0', () => {
    // Tier pertama belum diisi harga maks (0) — tier baru mulai dari 1.
    assert.equal(
      nextTierMinPrice([{ minPrice: 0, maxPrice: 0, feeAmount: 0 }]),
      1,
    )
  })
})

describe('validateFeeTiers', () => {
  it('min lebih besar dari maks -> error', () => {
    const errors = validateFeeTiers([
      { minPrice: 20_000, maxPrice: 19_900, feeAmount: 4_000 },
    ])
    assert.equal(errors.length, 1)
    assert.equal(errors[0].index, 0)
  })

  it('tier yang nempel (maks + 1) tidak overlap', () => {
    const errors = validateFeeTiers([
      { minPrice: 0, maxPrice: 19_900, feeAmount: 4_000 },
      { minPrice: 19_901, maxPrice: 39_900, feeAmount: 6_000 },
    ])
    assert.deepEqual(errors, [])
  })

  it('tier yang berbagi batas harga -> overlap', () => {
    const errors = validateFeeTiers([
      { minPrice: 0, maxPrice: 19_900, feeAmount: 4_000 },
      { minPrice: 19_900, maxPrice: 39_900, feeAmount: 6_000 },
    ])
    assert.equal(errors.length, 2)
    assert.deepEqual(
      errors.map((error) => error.index),
      [0, 1],
    )
  })
})

describe('findFeeForPrice', () => {
  const tiers = [
    { minPrice: 1_000, maxPrice: 19_900, feeAmount: 4_000 },
    { minPrice: 20_000, maxPrice: 39_900, feeAmount: 6_000 },
  ]

  it('harga di dalam tier -> fee tier itu', () => {
    assert.equal(findFeeForPrice(tiers, 20_000), 6_000)
  })

  it('harga di luar semua tier -> null', () => {
    assert.equal(findFeeForPrice(tiers, 999), null)
  })
})
