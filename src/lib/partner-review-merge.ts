import type { ReviewRow } from './submit-review-queries'

export type MergedReviewStatus =
  | 'disetujui'
  | 'sebagian'
  | 'ditolak'
  | 'dibatalkan'

/** Pcs satu barang yang masuk satu paket saat ditagih. */
export type PaketUse = {
  ruleName: string
  /** Harga satu paket. */
  bundlePrice: number
  /** Jumlah pcs dalam satu paket. */
  bundlePcs: number
  /** Pcs barang ini di dalam paket jenis tersebut. */
  qty: number
}

export type MergedReviewRow = {
  key: string
  productName: string
  size: string | null
  variation: string | null
  /** Total pcs yang diminta (satuan + komponen paket). */
  requested: number
  /** Total pcs yang disetujui. */
  approved: number
  status: MergedReviewStatus
  /** Satuan = harga per pcs, paket = harga satu paket. Null = belum ada harga. */
  priceType: 'satuan' | 'paket' | null
  price: number | null
  /** Jumlah pcs per paket, hanya untuk priceType paket. */
  bundlePcs: number | null
  /**
   * Total harga baris ini: pcs × harga satuan, atau untuk paket pcs × harga
   * paket ÷ pcs per paket (harga paket dibagi rata per pcs, dibulatkan ke
   * rupiah). Null = belum ada harga.
   */
  total: number | null
  /** Nama aturan paket, hanya untuk priceType paket. */
  ruleName: string | null
  /** Stok varian saat ini (live). Null = barang tidak terhubung ke katalog. */
  stock: number | null
}

function statusOf(
  requested: number,
  approved: number,
  rejected: number,
): MergedReviewStatus {
  if (approved === requested) return 'disetujui'
  if (approved > 0) return 'sebagian'
  return rejected > 0 ? 'ditolak' : 'dibatalkan'
}

/**
 * Gabungkan baris satuan dan komponen paket yang produk, ukuran, dan variasinya
 * sama. Hanya untuk submit yang sudah selesai dicek, jadi tidak ada baris
 * `pengajuan`. Urutan kemunculan pertama dipertahankan.
 *
 * Kalau `paketByItem` diberikan (submit belum ditagih), pcs yang masuk paket
 * dipisah jadi baris bertipe paket dengan harga paketnya, dan sisanya satuan
 * dengan harga per pcs. Tanpa itu, kolom harga dikosongkan.
 */
export function mergeReviewedRows(
  rows: Array<ReviewRow>,
  paketByItem?: Record<string, Array<PaketUse>>,
): Array<MergedReviewRow> {
  const groups = new Map<
    string,
    {
      first: ReviewRow
      requested: number
      approved: number
      rejected: number
      unitPrice: number | null
      paket: Map<string, PaketUse>
    }
  >()
  for (const r of rows) {
    const key = [r.productName, r.size ?? '', r.variation ?? ''].join('\u0000')
    let g = groups.get(key)
    if (!g) {
      g = {
        first: r,
        requested: 0,
        approved: 0,
        rejected: 0,
        unitPrice: null,
        paket: new Map(),
      }
      groups.set(key, g)
    }
    g.requested += r.qty
    if (r.status === 'disetujui') {
      g.approved += r.qty
      g.unitPrice ??= r.unitPrice
      for (const use of paketByItem?.[r.id] ?? []) {
        const k = `${use.ruleName}\u0000${use.bundlePrice}`
        const cur = g.paket.get(k)
        if (cur) cur.qty += use.qty
        else g.paket.set(k, { ...use })
      }
    } else if (r.status === 'disanggah') g.rejected += r.qty
  }

  const result: Array<MergedReviewRow> = []
  for (const [key, g] of groups) {
    const base = {
      productName: g.first.productName,
      size: g.first.size,
      variation: g.first.variation,
    }
    const paketQty = [...g.paket.values()].reduce((n, u) => n + u.qty, 0)
    const requested = g.requested - paketQty
    const approved = g.approved - paketQty
    // Seluruh pcs masuk paket: tidak ada lagi baris satuan.
    if (requested > 0 || paketQty === 0) {
      result.push({
        ...base,
        key: `${key}\u0000satuan`,
        requested,
        approved,
        status: statusOf(requested, approved, g.rejected),
        priceType: paketByItem && approved > 0 ? 'satuan' : null,
        price: paketByItem && approved > 0 ? g.unitPrice : null,
        bundlePcs: null,
        total:
          paketByItem && approved > 0 && g.unitPrice !== null
            ? approved * g.unitPrice
            : null,
        ruleName: null,
        stock: g.first.stock,
      })
    }
    for (const [k, use] of g.paket) {
      result.push({
        ...base,
        key: `${key}\u0000paket\u0000${k}`,
        requested: use.qty,
        approved: use.qty,
        status: 'disetujui',
        priceType: 'paket',
        price: use.bundlePrice,
        bundlePcs: use.bundlePcs,
        total:
          use.bundlePcs > 0
            ? Math.round((use.qty * use.bundlePrice) / use.bundlePcs)
            : null,
        ruleName: use.ruleName,
        stock: g.first.stock,
      })
    }
  }
  return result
}
