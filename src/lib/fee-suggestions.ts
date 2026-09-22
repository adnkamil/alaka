/**
 * Saran tier aturan fee untuk halaman Manajemen Fee (fitur PRO
 * `fee_suggestions`).
 *
 * Idenya: jastiper sudah punya data nyata — harga barang dan fee yang dia
 * tetapkan di pesanan-pesanan sebelumnya. Dari situ kita kelompokkan harga ke
 * rentang (band) dan ambil fee yang paling "tengah" di tiap band, supaya user
 * nggak mulai dari tabel kosong waktu bikin aturan fee.
 *
 * Modul ini murni (tanpa `db`) supaya gampang dites dan bisa dipakai di dua
 * sisi; pengambilan datanya ada di `fee-suggestions-functions.ts`.
 */

export interface FeeSuggestionSample {
  originalPrice: number
  fee: number
}

export interface FeeSuggestion {
  minPrice: number
  maxPrice: number
  /** Fee yang disarankan = nilai tengah (median) fee di rentang tsb, dibulatkan. */
  feeAmount: number
  /** Jumlah barang yang jadi dasar saran ini. */
  sampleCount: number
}

export interface FeeSuggestionOptions {
  /** Lebar rentang harga. Default 50.000 (enak buat rentang harga jastip). */
  bandSize?: number
  /** Minimal jumlah barang dalam satu rentang sebelum disarankan. Default 1. */
  minSamples?: number
  /** Pembulatan fee supaya angkanya rapi. Default 500. 0 = tanpa pembulatan. */
  roundTo?: number
}

export const DEFAULT_FEE_BAND_SIZE = 50_000
const DEFAULT_ROUND_TO = 500

function median(values: Array<number>): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function roundToNearest(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

/**
 * Ubah histori (harga, fee) jadi daftar saran tier, diurutkan dari harga
 * termurah. Baris dengan harga/fee tidak valid dilewatkan.
 */
export function buildFeeSuggestions(
  samples: Array<FeeSuggestionSample>,
  options: FeeSuggestionOptions = {},
): Array<FeeSuggestion> {
  const bandSize = options.bandSize ?? DEFAULT_FEE_BAND_SIZE
  const minSamples = options.minSamples ?? 1
  const roundTo = options.roundTo ?? DEFAULT_ROUND_TO

  if (bandSize <= 0) throw new Error('bandSize harus lebih dari 0')

  const bands = new Map<number, Array<number>>()
  for (const sample of samples) {
    const { originalPrice, fee } = sample
    if (!Number.isFinite(originalPrice) || !Number.isFinite(fee)) continue
    if (originalPrice <= 0 || fee < 0) continue

    const bandIndex = Math.floor(originalPrice / bandSize)
    const fees = bands.get(bandIndex) ?? []
    fees.push(fee)
    bands.set(bandIndex, fees)
  }

  return Array.from(bands.entries())
    .filter(([, fees]) => fees.length >= minSamples)
    .map(([bandIndex, fees]) => ({
      minPrice: bandIndex * bandSize,
      // -1 biar rentang tidak tumpang tindih dengan band berikutnya.
      maxPrice: (bandIndex + 1) * bandSize - 1,
      feeAmount: roundToNearest(median(fees), roundTo),
      sampleCount: fees.length,
    }))
    .sort((a, b) => a.minPrice - b.minPrice)
}
