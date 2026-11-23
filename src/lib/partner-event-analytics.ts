// Analisa event partner: ringkasan untuk mereview satu event setelah (atau
// selama) berjalan. Bagian ini murni (tanpa db) supaya bisa diuji; pengambilan
// data ada di `partner-event-analytics-functions.ts`.

export type AnalyticsLineStatus =
  | 'pengajuan'
  | 'disetujui'
  | 'disanggah'
  | 'dibatalkan'
  | null

/** Satu baris pcs: barang satuan, atau satu komponen paket (qty sudah dikali). */
export type AnalyticsLine = {
  orderId: string
  submissionId: string | null
  variantId: string | null
  productName: string
  size: string | null
  variation: string | null
  /** 'paket' = komponen dari paket; 'satuan' = barang satuan. */
  kind: 'satuan' | 'paket'
  qty: number
  status: AnalyticsLineStatus
}

export type AnalyticsInput = {
  slotEnabled: boolean
  jastiper: Array<{ eventId: string; brandId: string; brandName: string }>
  orders: Array<{ id: string; eventId: string }>
  lines: Array<AnalyticsLine>
  submissions: Array<{ id: string; eventId: string; submittedAt: Date }>
  /** Tagihan aktif (tidak termasuk yang dibatalkan). */
  invoices: Array<{
    brandId: string
    status: 'ditagih' | 'menunggu_review' | 'lunas'
    amount: number
    pcs: number
  }>
  /** Varian aktif dari produk yang dibawa partner ke event ini. */
  stockVariants: Array<{
    variantId: string
    productName: string
    size: string | null
    variation: string | null
    stockQty: number
  }>
}

/** Bagaimana sebuah baris dihitung di analisa. */
export type PcsBucket = 'terjual' | 'menunggu' | 'ditolak' | 'draft' | null

/**
 * Event dengan slot: hanya yang disetujui partner dihitung terjual. Event tanpa
 * slot tidak punya alur cek, jadi semua barang dianggap terjual.
 */
export function pcsBucket(
  status: AnalyticsLineStatus,
  slotEnabled: boolean,
): PcsBucket {
  switch (status) {
    case 'disetujui':
      return 'terjual'
    case 'pengajuan':
      return 'menunggu'
    case 'disanggah':
      return 'ditolak'
    case 'dibatalkan':
      return null
    default:
      return slotEnabled ? 'draft' : 'terjual'
  }
}

export type PcsSplit = {
  terjual: number
  menunggu: number
  ditolak: number
  draft: number
}

const emptySplit = (): PcsSplit => ({
  terjual: 0,
  menunggu: 0,
  ditolak: 0,
  draft: 0,
})

export type ProductStat = {
  productName: string
  terjual: number
  ditolak: number
  buyers: number
  jastiper: number
  variants: Array<{
    label: string
    terjual: number
    ditolak: number
  }>
}

export type JastiperStat = {
  brandId: string
  brandName: string
  buyers: number
  terjual: number
  ditolak: number
  submitCount: number
  billedAmount: number
  paidAmount: number
}

export type StockOutStat = {
  variantId: string
  productName: string
  label: string
  stockQty: number
  terjual: number
  ditolak: number
}

export type TimelineBucket = { key: string; label: string; pcs: number; submits: number }

export type EventAnalytics = {
  slotEnabled: boolean
  jastiper: { joined: number; active: number; submitted: number }
  buyers: number
  pcs: PcsSplit
  kindSplit: { satuan: number; paket: number }
  avgPcsPerBuyer: number
  billed: { total: number; lunas: number; count: number }
  products: Array<ProductStat>
  sizes: Array<{ size: string; terjual: number }>
  jastiperRanking: Array<JastiperStat>
  stockOut: Array<StockOutStat>
  lowStock: Array<StockOutStat>
  /** Ditolak terbanyak: permintaan yang tidak terpenuhi. */
  unmetDemand: Array<{ label: string; ditolak: number }>
  timeline: { granularity: 'jam' | 'hari'; buckets: Array<TimelineBucket> }
}

/** Batas stok "hampir habis". */
export const LOW_STOCK_THRESHOLD = 3

/** Label varian: variasi dulu, baru ukuran. Mis. "Marine Cove · M". */
export function variantLabel(size: string | null, variation: string | null) {
  return [variation, size].filter(Boolean).join(' · ') || 'Standar'
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/**
 * Kelompokkan pcs yang disubmit per jam (rentang <= 2 hari) atau per hari,
 * dalam WIB. Jam/hari kosong di antaranya tetap muncul supaya grafik jujur.
 */
export function buildTimeline(
  points: Array<{ at: Date; pcs: number }>,
): EventAnalytics['timeline'] {
  if (points.length === 0) return { granularity: 'jam', buckets: [] }
  const times = points.map((p) => p.at.getTime())
  const min = Math.min(...times)
  const max = Math.max(...times)
  const granularity = max - min <= 48 * 60 * 60 * 1000 ? 'jam' : 'hari'
  const step = granularity === 'jam' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  // Awal bucket dihitung di jam WIB, lalu dikembalikan ke UTC.
  const floor = (t: number) => Math.floor((t + WIB_OFFSET_MS) / step) * step - WIB_OFFSET_MS
  const label = (t: number) => {
    const d = new Date(t + WIB_OFFSET_MS)
    const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
    return granularity === 'jam'
      ? `${day}, ${String(d.getUTCHours()).padStart(2, '0')}.00`
      : day
  }
  const buckets = new Map<number, TimelineBucket>()
  // Batasi jumlah bucket supaya data aneh tidak membuat ribuan batang.
  for (let t = floor(min), i = 0; t <= floor(max) && i < 400; t += step, i++) {
    buckets.set(t, { key: String(t), label: label(t), pcs: 0, submits: 0 })
  }
  for (const p of points) {
    const b = buckets.get(floor(p.at.getTime()))
    if (b) {
      b.pcs += p.pcs
      b.submits += 1
    }
  }
  return { granularity, buckets: [...buckets.values()] }
}

export function buildEventAnalytics(input: AnalyticsInput): EventAnalytics {
  const { slotEnabled } = input
  const brandByEvent = new Map(input.jastiper.map((j) => [j.eventId, j.brandId]))
  const brandByOrder = new Map(
    input.orders.map((o) => [o.id, brandByEvent.get(o.eventId) ?? null]),
  )

  const pcs = emptySplit()
  const kindSplit = { satuan: 0, paket: 0 }
  const buyerOrders = new Set<string>()
  const productMap = new Map<
    string,
    {
      terjual: number
      ditolak: number
      buyers: Set<string>
      brands: Set<string>
      variants: Map<string, { terjual: number; ditolak: number }>
    }
  >()
  const sizeMap = new Map<string, number>()
  const byVariant = new Map<string, { terjual: number; ditolak: number }>()
  const unmet = new Map<string, number>()
  const brandStats = new Map<
    string,
    { buyers: Set<string>; terjual: number; ditolak: number }
  >()
  const pcsBySubmission = new Map<string, number>()

  for (const line of input.lines) {
    const bucket = pcsBucket(line.status, slotEnabled)
    if (!bucket || line.qty <= 0) continue
    pcs[bucket] += line.qty
    if (line.submissionId && bucket !== 'draft') {
      pcsBySubmission.set(
        line.submissionId,
        (pcsBySubmission.get(line.submissionId) ?? 0) + line.qty,
      )
    }
    if (bucket !== 'terjual' && bucket !== 'ditolak') continue

    const brandId = brandByOrder.get(line.orderId) ?? null
    const vLabel = variantLabel(line.size, line.variation)
    let product = productMap.get(line.productName)
    if (!product) {
      product = {
        terjual: 0,
        ditolak: 0,
        buyers: new Set(),
        brands: new Set(),
        variants: new Map(),
      }
      productMap.set(line.productName, product)
    }
    let variant = product.variants.get(vLabel)
    if (!variant) {
      variant = { terjual: 0, ditolak: 0 }
      product.variants.set(vLabel, variant)
    }
    let brand = brandId ? brandStats.get(brandId) : undefined
    if (brandId && !brand) {
      brand = { buyers: new Set(), terjual: 0, ditolak: 0 }
      brandStats.set(brandId, brand)
    }
    if (line.variantId) {
      const v = byVariant.get(line.variantId) ?? { terjual: 0, ditolak: 0 }
      v[bucket] += line.qty
      byVariant.set(line.variantId, v)
    }

    if (bucket === 'terjual') {
      product.terjual += line.qty
      variant.terjual += line.qty
      product.buyers.add(line.orderId)
      if (brandId) product.brands.add(brandId)
      kindSplit[line.kind] += line.qty
      buyerOrders.add(line.orderId)
      if (brand) {
        brand.terjual += line.qty
        brand.buyers.add(line.orderId)
      }
      if (line.size) sizeMap.set(line.size, (sizeMap.get(line.size) ?? 0) + line.qty)
    } else {
      product.ditolak += line.qty
      variant.ditolak += line.qty
      if (brand) brand.ditolak += line.qty
      const key = `${line.productName} — ${vLabel}`
      unmet.set(key, (unmet.get(key) ?? 0) + line.qty)
    }
  }

  const products: Array<ProductStat> = [...productMap.entries()]
    .map(([productName, p]) => ({
      productName,
      terjual: p.terjual,
      ditolak: p.ditolak,
      buyers: p.buyers.size,
      jastiper: p.brands.size,
      variants: [...p.variants.entries()]
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.terjual - a.terjual || b.ditolak - a.ditolak),
    }))
    .sort(
      (a, b) =>
        b.terjual - a.terjual ||
        b.ditolak - a.ditolak ||
        a.productName.localeCompare(b.productName),
    )

  const submitCountByEvent = new Map<string, number>()
  for (const s of input.submissions) {
    submitCountByEvent.set(s.eventId, (submitCountByEvent.get(s.eventId) ?? 0) + 1)
  }
  const billedByBrand = new Map<string, { billed: number; paid: number }>()
  for (const inv of input.invoices) {
    const b = billedByBrand.get(inv.brandId) ?? { billed: 0, paid: 0 }
    b.billed += inv.amount
    if (inv.status === 'lunas') b.paid += inv.amount
    billedByBrand.set(inv.brandId, b)
  }

  const jastiperRanking: Array<JastiperStat> = input.jastiper
    .map((j) => {
      const s = brandStats.get(j.brandId)
      const billed = billedByBrand.get(j.brandId)
      return {
        brandId: j.brandId,
        brandName: j.brandName,
        buyers: s?.buyers.size ?? 0,
        terjual: s?.terjual ?? 0,
        ditolak: s?.ditolak ?? 0,
        submitCount: submitCountByEvent.get(j.eventId) ?? 0,
        billedAmount: billed?.billed ?? 0,
        paidAmount: billed?.paid ?? 0,
      }
    })
    .sort(
      (a, b) =>
        b.buyers - a.buyers ||
        b.terjual - a.terjual ||
        a.brandName.localeCompare(b.brandName),
    )

  const stockRows: Array<StockOutStat> = input.stockVariants.map((v) => ({
    variantId: v.variantId,
    productName: v.productName,
    label: variantLabel(v.size, v.variation),
    stockQty: v.stockQty,
    terjual: byVariant.get(v.variantId)?.terjual ?? 0,
    ditolak: byVariant.get(v.variantId)?.ditolak ?? 0,
  }))
  const byDemand = (a: StockOutStat, b: StockOutStat) =>
    b.terjual + b.ditolak - (a.terjual + a.ditolak) ||
    a.productName.localeCompare(b.productName) ||
    a.label.localeCompare(b.label)
  const stockOut = stockRows.filter((v) => v.stockQty <= 0).sort(byDemand)
  const lowStock = stockRows
    .filter((v) => v.stockQty > 0 && v.stockQty <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stockQty - b.stockQty || byDemand(a, b))

  const submittedAtById = new Map(input.submissions.map((s) => [s.id, s.submittedAt]))
  const timeline = buildTimeline(
    [...pcsBySubmission.entries()].flatMap(([id, qty]) => {
      const at = submittedAtById.get(id)
      return at ? [{ at, pcs: qty }] : []
    }),
  )

  const billed = { total: 0, lunas: 0, count: input.invoices.length }
  for (const inv of input.invoices) {
    billed.total += inv.amount
    if (inv.status === 'lunas') billed.lunas += inv.amount
  }

  return {
    slotEnabled,
    jastiper: {
      joined: input.jastiper.length,
      active: jastiperRanking.filter((j) => j.terjual > 0).length,
      submitted: input.jastiper.filter((j) => submitCountByEvent.has(j.eventId)).length,
    },
    buyers: buyerOrders.size,
    pcs,
    kindSplit,
    avgPcsPerBuyer: buyerOrders.size ? pcs.terjual / buyerOrders.size : 0,
    billed,
    products,
    sizes: [...sizeMap.entries()]
      .map(([size, terjual]) => ({ size, terjual }))
      .sort((a, b) => b.terjual - a.terjual),
    jastiperRanking,
    stockOut,
    lowStock,
    unmetDemand: [...unmet.entries()]
      .map(([label, ditolak]) => ({ label, ditolak }))
      .sort((a, b) => b.ditolak - a.ditolak)
      .slice(0, 8),
    timeline,
  }
}
