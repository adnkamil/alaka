// Minimal pembelian event partner. Logika murni, tanpa database.
// Total dihitung seperti tagihan: semua pcs draft digabung tanpa melihat bentuk
// paket pesanan customer, dipaketkan FIFO menurut aturan partner, sisanya satuan.
import { poolSinglesIntoBundles } from './partner-invoice-pooling'
import type { PoolRule, PoolSingle } from './partner-invoice-pooling'
import { formatRupiah } from './partner-product-rules'

/** Pcs draft dari satu sumber: barang satuan atau isi paket pesanan. */
export type DraftSource = {
  /** Id barang satuan atau id isi paket. */
  key: string
  label: string
  qty: number
  addedAt: Date
  /** Null = varian partnernya tidak ada lagi, jadi tidak bisa dihargai. */
  variant: { productId: string; size: string | null; price: number } | null
}

export type DraftBundle = {
  ruleName: string
  price: number
  parts: Array<{ label: string; qty: number }>
}

export type DraftSingle = {
  label: string
  qty: number
  unitPrice: number
  amount: number
  /** Alasan tidak jadi paket; null kalau partner tidak punya aturan paket. */
  note: string | null
}

export type DraftTotal = {
  bundles: Array<DraftBundle>
  singles: Array<DraftSingle>
  /** Barang tanpa varian partner: tidak ikut dihitung di total. */
  unpriced: Array<{ label: string; qty: number }>
  totalPcs: number
  total: number
}

export function computeDraftTotal(
  sources: Array<DraftSource>,
  rules: Array<PoolRule>,
): DraftTotal {
  const rows = sources.filter((s) => s.qty > 0)
  const priced: Array<PoolSingle> = rows.flatMap((s) =>
    s.variant
      ? [
          {
            itemId: s.key,
            submissionId: '',
            label: s.label,
            productId: s.variant.productId,
            size: s.variant.size,
            qty: s.qty,
            unitPrice: s.variant.price,
            addedAt: s.addedAt,
          },
        ]
      : [],
  )
  const pool = poolSinglesIntoBundles(priced, rules)

  const bundles = pool.bundles.map((b) => ({
    ruleName: b.ruleName,
    price: b.bundlePrice,
    parts: mergeByLabel(b.parts),
  }))

  const singles = new Map<string, DraftSingle>()
  for (const s of priced) {
    const qty = s.qty - (pool.consumed.get(s.itemId) ?? 0)
    if (qty <= 0) continue
    const note = pool.notes.get(s.itemId) ?? null
    const id = JSON.stringify([s.label, s.unitPrice, note])
    const row = singles.get(id) ?? {
      label: s.label,
      qty: 0,
      unitPrice: s.unitPrice,
      amount: 0,
      note,
    }
    row.qty += qty
    row.amount += qty * s.unitPrice
    singles.set(id, row)
  }
  const singleRows = [...singles.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  )

  return {
    bundles,
    singles: singleRows,
    unpriced: mergeByLabel(rows.filter((s) => !s.variant)),
    totalPcs: rows.reduce((sum, s) => sum + s.qty, 0),
    total:
      bundles.reduce((sum, b) => sum + b.price, 0) +
      singleRows.reduce((sum, s) => sum + s.amount, 0),
  }
}

function mergeByLabel(
  rows: Array<{ label: string; qty: number }>,
): Array<{ label: string; qty: number }> {
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.label, (map.get(r.label) ?? 0) + r.qty)
  return [...map].map(([label, qty]) => ({ label, qty }))
}

/**
 * Sidik isi draft ("id:pcs"). Dipakai server untuk memastikan yang terkirim
 * sama persis dengan yang dilihat jastiper di halaman cek.
 */
export function draftFingerprint(
  sources: Array<{ key: string; qty: number }>,
): Array<string> {
  return sources
    .filter((s) => s.qty > 0)
    .map((s) => `${s.key}:${s.qty}`)
    .sort()
}

export function sameFingerprint(a: Array<string>, b: Array<string>): boolean {
  if (a.length !== b.length) return false
  const sorted = [...b].sort()
  return [...a].sort().every((value, i) => value === sorted[i])
}

/** Nominal yang masih kurang untuk submit pertama. 0 = sudah boleh kirim. */
export function minPurchaseShortfall(input: {
  total: number
  minPurchase: number | null
  isFirstSubmit: boolean
}): number {
  const { total, minPurchase, isFirstSubmit } = input
  if (!isFirstSubmit || minPurchase === null) return 0
  return Math.max(0, minPurchase - total)
}

export function minPurchaseMessage(total: number, minPurchase: number): string {
  return `Minimal pembelian ${formatRupiah(minPurchase)}. Pesanan kamu ${formatRupiah(total)}, kurang ${formatRupiah(minPurchase - total)}.`
}

export const DRAFT_CHANGED_MESSAGE =
  'Pesanan berubah sejak halaman ini dibuka. Cek ulang lalu kirim lagi.'

export const MIN_PURCHASE_LOCKED_MESSAGE =
  'Slot sudah dibuka, jadi minimal pembelian tidak bisa diubah.'

/**
 * Minimal pembelian hanya boleh diubah sebelum slot dibuka. `storedOpensAt`
 * adalah jam buka yang TERSIMPAN, bukan yang sedang dikirim partner.
 */
export function validateMinPurchaseChange(input: {
  current: number | null
  next: number | null
  storedOpensAt: Date | null
  now: Date
}): string | null {
  const { current, next, storedOpensAt, now } = input
  if (current === next) return null
  if (storedOpensAt !== null && storedOpensAt.getTime() <= now.getTime()) {
    return MIN_PURCHASE_LOCKED_MESSAGE
  }
  return null
}

/** Batas "sudah dekat minimal" untuk jastiper yang tertahan. */
const NEAR_MIN_RATIO = 0.8

/** Batas atas tiap kelompok nilai submit pertama; kelompok terakhir tanpa batas. */
export const SUBMIT_BUCKET_LIMITS = [250_000, 500_000, 1_000_000, 2_000_000]

export type MinPurchaseStats = {
  minPurchase: number | null
  joined: number
  submitted: number
  /** Punya draft, belum pernah submit, dan totalnya di bawah minimal. */
  stuck: number
  stuckAmount: number
  stuckNearMin: number
  /** Jumlah submit pertama per kelompok nilai, urut mengikuti batas. */
  buckets: Array<number>
}

export function buildMinPurchaseStats(input: {
  minPurchase: number | null
  jastiper: Array<{
    submitted: boolean
    /** Total submit pertama saat dikirim; null kalau tidak tercatat. */
    firstSubmitTotal: number | null
    draftTotal: number
  }>
}): MinPurchaseStats {
  const { minPurchase, jastiper } = input
  const stuck =
    minPurchase === null
      ? []
      : jastiper.filter(
          (j) =>
            !j.submitted && j.draftTotal > 0 && j.draftTotal < minPurchase,
        )
  const buckets = Array.from(
    { length: SUBMIT_BUCKET_LIMITS.length + 1 },
    () => 0,
  )
  for (const j of jastiper) {
    const value = j.firstSubmitTotal
    if (value === null) continue
    const index = SUBMIT_BUCKET_LIMITS.findIndex((limit) => value < limit)
    buckets[index === -1 ? SUBMIT_BUCKET_LIMITS.length : index] += 1
  }
  return {
    minPurchase,
    joined: jastiper.length,
    submitted: jastiper.filter((j) => j.submitted).length,
    stuck: stuck.length,
    stuckAmount: stuck.reduce((sum, j) => sum + j.draftTotal, 0),
    stuckNearMin: stuck.filter(
      (j) => j.draftTotal >= (minPurchase ?? 0) * NEAR_MIN_RATIO,
    ).length,
    buckets,
  }
}
