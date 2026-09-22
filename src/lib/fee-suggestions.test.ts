import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_FEE_BAND_SIZE, buildFeeSuggestions } from './fee-suggestions'

/**
 * Tes pengubah histori (harga, fee) -> saran tier aturan fee.
 * Modulnya murni, jadi bisa diuji tanpa database (`pnpm test`).
 */

describe('buildFeeSuggestions', () => {
  it('tanpa data -> tanpa saran', () => {
    assert.deepEqual(buildFeeSuggestions([]), [])
  })

  it('mengelompokkan harga per rentang 50.000 dan ambil fee tengahnya', () => {
    const suggestions = buildFeeSuggestions([
      { originalPrice: 20_000, fee: 10_000 },
      { originalPrice: 30_000, fee: 12_000 },
      { originalPrice: 120_000, fee: 25_000 },
    ])

    assert.deepEqual(suggestions, [
      { minPrice: 0, maxPrice: 49_999, feeAmount: 11_000, sampleCount: 2 },
      {
        minPrice: 100_000,
        maxPrice: 149_999,
        feeAmount: 25_000,
        sampleCount: 1,
      },
    ])
  })

  it('fee hasilnya median, dibulatkan ke 500 terdekat', () => {
    const suggestions = buildFeeSuggestions([
      { originalPrice: 10_000, fee: 11_200 },
      { originalPrice: 20_000, fee: 11_300 },
      { originalPrice: 30_000, fee: 11_600 },
    ])

    // median 11.300 -> dibulatkan ke 500 terdekat = 11.500
    assert.equal(suggestions[0].feeAmount, 11_500)
    assert.equal(suggestions[0].sampleCount, 3)
  })

  it('median genap dirata-rata lalu dibulatkan', () => {
    const suggestions = buildFeeSuggestions([
      { originalPrice: 10_000, fee: 10_000 },
      { originalPrice: 20_000, fee: 11_000 },
    ])

    // median (10.000 + 11.000) / 2 = 10.500 -> tetap 10.500
    assert.equal(suggestions[0].feeAmount, 10_500)
  })

  it('urutan saran dari harga termurah dan rentangnya tidak tumpang tindih', () => {
    const suggestions = buildFeeSuggestions([
      { originalPrice: 500_000, fee: 50_000 },
      { originalPrice: 20_000, fee: 10_000 },
      { originalPrice: 120_000, fee: 20_000 },
    ])

    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.minPrice),
      [0, 100_000, 500_000],
    )
    for (let i = 1; i < suggestions.length; i += 1) {
      assert.ok(suggestions[i].minPrice > suggestions[i - 1].maxPrice)
    }
  })

  it('baris tidak valid dilewatkan (harga 0/negatif, fee negatif, NaN)', () => {
    const suggestions = buildFeeSuggestions([
      { originalPrice: 0, fee: 5_000 },
      { originalPrice: -10_000, fee: 5_000 },
      { originalPrice: 20_000, fee: -1 },
      { originalPrice: Number.NaN, fee: 5_000 },
      { originalPrice: 20_000, fee: Number.POSITIVE_INFINITY },
      { originalPrice: 25_000, fee: 8_000 },
    ])

    assert.deepEqual(suggestions, [
      { minPrice: 0, maxPrice: 49_999, feeAmount: 8_000, sampleCount: 1 },
    ])
  })

  it('bandSize & minSamples bisa diatur', () => {
    const samples = [
      { originalPrice: 10_000, fee: 5_000 },
      { originalPrice: 15_000, fee: 6_000 },
      { originalPrice: 30_000, fee: 9_000 },
    ]

    const wide = buildFeeSuggestions(samples, { bandSize: 100_000 })
    assert.equal(wide.length, 1)
    assert.equal(wide[0].maxPrice, 99_999)
    assert.equal(wide[0].sampleCount, 3)

    const multiSample = buildFeeSuggestions(samples, {
      bandSize: 10_000,
      minSamples: 2,
    })
    assert.deepEqual(multiSample, [
      { minPrice: 10_000, maxPrice: 19_999, feeAmount: 5_500, sampleCount: 2 },
    ])
  })

  it('roundTo 0 = tanpa pembulatan', () => {
    const suggestions = buildFeeSuggestions(
      [{ originalPrice: 10_000, fee: 11_234 }],
      { roundTo: 0 },
    )

    assert.equal(suggestions[0].feeAmount, 11_234)
  })

  it('bandSize tidak valid ditolak', () => {
    assert.throws(() => buildFeeSuggestions([], { bandSize: 0 }))
  })

  it('ukuran rentang default 50.000', () => {
    assert.equal(DEFAULT_FEE_BAND_SIZE, 50_000)
    const suggestions = buildFeeSuggestions([{ originalPrice: 1, fee: 500 }])

    assert.deepEqual(suggestions[0], {
      minPrice: 0,
      maxPrice: 49_999,
      feeAmount: 500,
      sampleCount: 1,
    })
  })
})
