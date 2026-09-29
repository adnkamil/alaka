export interface FeeTierInput {
  minPrice: number
  maxPrice: number
  feeAmount: number
}

export interface FeeTierOverlapError {
  index: number
  message: string
}

/**
 * Returns overlap errors for tiers within the same fee rule. A tier is
 * invalid if its own min > max, or if its [min, max] range intersects
 * another tier's range (inclusive on both ends).
 */
export function validateFeeTiers(
  tiers: Array<FeeTierInput>,
): Array<FeeTierOverlapError> {
  const errors: Array<FeeTierOverlapError> = []

  tiers.forEach((tier, index) => {
    if (tier.minPrice > tier.maxPrice) {
      errors.push({
        index,
        message: 'Harga min tidak boleh lebih besar dari harga maks',
      })
      return
    }

    for (let otherIndex = 0; otherIndex < tiers.length; otherIndex++) {
      if (otherIndex === index) continue
      const other = tiers[otherIndex]
      const overlaps =
        tier.minPrice <= other.maxPrice && other.minPrice <= tier.maxPrice
      if (overlaps) {
        errors.push({
          index,
          message: `Tumpang tindih dengan tier #${otherIndex + 1}`,
        })
        break
      }
    }
  })

  return errors
}

/**
 * Harga min untuk tier baru pada form Tambah/Edit aturan fee: lanjutan dari
 * tier terakhir (`harga maks tier terakhir + 1`), sesuai rekomendasi di
 * prd.md §4.9 supaya tier baru tidak tumpang tindih dan user tidak perlu
 * menghitung sendiri. Kalau belum ada tier sama sekali, mulai dari 0.
 *
 * "Tier terakhir" = baris terakhir di daftar form, karena urutan tier di form
 * itulah yang dibaca user ("tier sebelumnya" = kartu di atasnya).
 */
export function nextTierMinPrice(tiers: Array<FeeTierInput>): number {
  if (tiers.length === 0) return 0
  return tiers[tiers.length - 1].maxPrice + 1
}

export function findFeeForPrice(
  tiers: Array<FeeTierInput>,
  price: number,
): number | null {
  const match = tiers.find(
    (tier) => price >= tier.minPrice && price <= tier.maxPrice,
  )
  return match ? match.feeAmount : null
}
