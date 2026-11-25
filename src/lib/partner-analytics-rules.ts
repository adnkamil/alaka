import { partnerEventStatus } from './partner-event-rules'
import type { PartnerEventStatus } from './partner-event-rules'

/**
 * Aturan murni halaman Analytics Partner (tanpa `db`, supaya bisa dites dan
 * dipakai bersama di server & client).
 *
 * Definisi keuangan (satu definisi, dipakai di seluruh halaman):
 * - Sumber angka = tagihan (invoice) partner ke jastiper yang TIDAK
 *   dibatalkan. Nominal tagihan adalah snapshot harga saat tagihan terbit,
 *   jadi tidak ikut berubah kalau harga katalog diubah.
 * - Revenue = Net Sales = total nilai tagihan. Harga paket (diskon paket)
 *   sudah ada di dalamnya. Diskon tidak tercatat terpisah, jadi Gross Sales
 *   dan Discounts tidak ditampilkan sebagai angka sendiri.
 * - Tidak termasuk: ongkir (tidak ada di tagihan), biaya admin ALAKA (dipotong
 *   dari saldo kredit, bukan dari penjualan), dan status bayar (lunas/belum
 *   adalah soal penagihan, bukan penjualan).
 * - Tagihan (`orders`) = tagihan aktif yang terbit ke jastiper. Jumlah pembeli
 *   jastiper sengaja tidak dibuka ke partner, jadi tidak disebut "pesanan".
 * - Pcs ditagih (`units`) = pcs di tagihan aktif (isi paket dihitung per pcs).
 *   Pcs yang sudah disetujui tapi belum ditagih belum masuk.
 * - Rata-rata per tagihan (`aov`) = Net Sales / Tagihan.
 * - Tanggal transaksi = tanggal tagihan terbit (`sent_at`) dalam WIB.
 * - Pembatalan: tagihan dibatalkan dikeluarkan seluruhnya. Belum ada fitur
 *   retur/refund, jadi tidak ada pengurang lain.
 */

export const ANALYTICS_PRESETS = [
  '7d',
  '30d',
  'this_month',
  'last_month',
  'this_year',
  'custom',
] as const
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number]

export type Granularity = 'day' | 'week' | 'month'

/** Rentang tanggal kalender WIB, inklusif, format `YYYY-MM-DD`. */
export type DateRange = { from: string; to: string }

/** Batas rentang custom, supaya query tetap ringan. */
export const MAX_RANGE_DAYS = 731

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

export function isoFromDayNumber(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return isoFromDayNumber(dayNumber(iso) + days)
}

export function rangeLength(range: DateRange): number {
  return dayNumber(range.to) - dayNumber(range.from) + 1
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  return isoFromDayNumber(dayNumber(value)) === value
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

function ymd(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Geser satu tanggal N bulan, tanggalnya dipotong ke akhir bulan bila perlu. */
function shiftMonths(date: string, months: number): string {
  const { y, m, d } = ymd(date)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return toIso(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/**
 * Rentang dari preset, dihitung terhadap `today` (WIB). Custom yang tidak
 * valid jatuh ke 30 hari terakhir; terbalik ditukar; terlalu panjang dipotong
 * dari awal. Rentang tidak pernah melewati hari ini.
 */
export function resolveRange(
  preset: AnalyticsPreset,
  today: string,
  custom?: { from?: string; to?: string },
): { preset: AnalyticsPreset; range: DateRange } {
  const { y, m } = ymd(today)
  switch (preset) {
    case '7d':
      return { preset, range: { from: addDays(today, -6), to: today } }
    case '30d':
      return { preset, range: { from: addDays(today, -29), to: today } }
    case 'this_month':
      return { preset, range: { from: toIso(y, m, 1), to: today } }
    case 'last_month': {
      const first = shiftMonths(toIso(y, m, 1), -1)
      const p = ymd(first)
      return {
        preset,
        range: { from: first, to: toIso(p.y, p.m, daysInMonth(p.y, p.m)) },
      }
    }
    case 'this_year':
      return { preset, range: { from: toIso(y, 1, 1), to: today } }
    case 'custom': {
      if (!isValidIsoDate(custom?.from) || !isValidIsoDate(custom.to)) {
        return resolveRange('30d', today)
      }
      let from = custom.from
      let to = custom.to
      if (from > to) [from, to] = [to, from]
      if (to > today) to = today
      if (from > to) from = to
      if (rangeLength({ from, to }) > MAX_RANGE_DAYS) {
        from = addDays(to, -(MAX_RANGE_DAYS - 1))
      }
      return { preset, range: { from, to } }
    }
  }
}

/**
 * Periode pembanding.
 * - Bulan ini / tahun ini: tanggal yang sama di bulan / tahun sebelumnya
 *   (1–25 Nov dibanding 1–25 Okt), supaya bulan berjalan tidak dibandingkan
 *   dengan bulan penuh.
 * - Bulan lalu: bulan penuh sebelumnya.
 * - Lainnya: jendela dengan panjang sama tepat sebelum rentang.
 */
export function previousRange(
  preset: AnalyticsPreset,
  range: DateRange,
): DateRange {
  if (preset === 'this_month') {
    return { from: shiftMonths(range.from, -1), to: shiftMonths(range.to, -1) }
  }
  if (preset === 'this_year') {
    return {
      from: shiftMonths(range.from, -12),
      to: shiftMonths(range.to, -12),
    }
  }
  if (preset === 'last_month') {
    const first = shiftMonths(range.from, -1)
    const p = ymd(first)
    return { from: first, to: toIso(p.y, p.m, daysInMonth(p.y, p.m)) }
  }
  const len = rangeLength(range)
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) }
}

export const COMPARISON_LABELS: Record<AnalyticsPreset, string> = {
  '7d': '7 hari sebelumnya',
  '30d': '30 hari sebelumnya',
  this_month: 'periode yang sama bulan lalu',
  last_month: 'bulan sebelumnya',
  this_year: 'periode yang sama tahun lalu',
  custom: 'periode sebelumnya',
}

/** Agregasi grafik yang masuk akal untuk panjang rentang ini. */
export function allowedGranularities(range: DateRange): Array<Granularity> {
  const len = rangeLength(range)
  const out: Array<Granularity> = []
  if (len <= 92) out.push('day')
  if (len >= 14) out.push('week')
  if (len >= 45) out.push('month')
  return out.length ? out : ['day']
}

export function defaultGranularity(range: DateRange): Granularity {
  const len = rangeLength(range)
  if (len <= 31) return 'day'
  if (len <= 120) return 'week'
  return 'month'
}

export function effectiveGranularity(
  range: DateRange,
  requested: Granularity | undefined,
): Granularity {
  const allowed = allowedGranularities(range)
  return requested && allowed.includes(requested)
    ? requested
    : defaultGranularity(range)
}

/** Awal bucket untuk satu tanggal: minggu mulai Senin (ISO), bulan tanggal 1. */
export function bucketStart(date: string, granularity: Granularity): string {
  if (granularity === 'day') return date
  if (granularity === 'month') return `${date.slice(0, 8)}01`
  const n = dayNumber(date)
  // 1 Jan 1970 = Kamis. (n + 3) % 7 = 0 untuk Senin.
  const weekday = (((n + 3) % 7) + 7) % 7
  return isoFromDayNumber(n - weekday)
}

function nextBucket(start: string, granularity: Granularity): string {
  if (granularity === 'day') return addDays(start, 1)
  if (granularity === 'week') return addDays(start, 7)
  return shiftMonths(start, 1)
}

export type SeriesBucket = {
  /** Awal & akhir bucket, sudah dipotong ke dalam rentang. */
  from: string
  to: string
  amount: number
}

/**
 * Bucket berurutan yang menutup seluruh rentang, termasuk yang nol, supaya
 * grafik jujur soal hari/minggu tanpa penjualan.
 */
export function buildSeries(
  range: DateRange,
  granularity: Granularity,
  points: Array<{ date: string; amount: number }>,
): Array<SeriesBucket> {
  const buckets: Array<SeriesBucket> = []
  const index = new Map<string, SeriesBucket>()
  for (
    let start = bucketStart(range.from, granularity);
    start <= range.to && buckets.length < 800;
    start = nextBucket(start, granularity)
  ) {
    const end = addDays(nextBucket(start, granularity), -1)
    const bucket = {
      from: start < range.from ? range.from : start,
      to: end > range.to ? range.to : end,
      amount: 0,
    }
    buckets.push(bucket)
    index.set(start, bucket)
  }
  for (const p of points) {
    if (p.date < range.from || p.date > range.to) continue
    const b = index.get(bucketStart(p.date, granularity))
    if (b) b.amount += p.amount
  }
  return buckets
}

export type ComparedBucket = SeriesBucket & {
  /** Nilai bucket ke-i di periode pembanding; null kalau tidak ada padanannya. */
  previous: number | null
  previousFrom: string | null
  previousTo: string | null
}

/** Sandingkan bucket periode ini dengan bucket periode pembanding per urutan. */
export function compareSeries(
  current: Array<SeriesBucket>,
  previous: Array<SeriesBucket>,
): Array<ComparedBucket> {
  return current.map((b, i) => ({
    ...b,
    previous: previous[i]?.amount ?? null,
    previousFrom: previous[i]?.from ?? null,
    previousTo: previous[i]?.to ?? null,
  }))
}

/** Persentase perubahan; null kalau pembandingnya nol (tidak bermakna). */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (!(previous > 0)) return null
  return ((current - previous) / previous) * 100
}

export type InvoiceFact = {
  calendarEventId: string
  /** Tanggal tagihan terbit, WIB. */
  date: string
  amount: number
  pcs: number
}

export type SalesSummary = {
  netSales: number
  orders: number
  units: number
  /** null kalau belum ada pesanan. */
  aov: number | null
}

export function summarize(facts: Array<InvoiceFact>): SalesSummary {
  let netSales = 0
  let units = 0
  for (const f of facts) {
    netSales += f.amount
    units += f.pcs
  }
  const orders = facts.length
  return { netSales, orders, units, aov: orders > 0 ? netSales / orders : null }
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to
}

/** Jumlah tagihan per tanggal, untuk grafik. */
export function dailyAmounts(
  facts: Array<InvoiceFact>,
): Array<{ date: string; amount: number }> {
  const map = new Map<string, number>()
  for (const f of facts) map.set(f.date, (map.get(f.date) ?? 0) + f.amount)
  return [...map.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Produk
// ---------------------------------------------------------------------------

export type ProductLine = {
  submissionId: string
  productKey: string
  qty: number
  /** Harga satuan katalog; hanya dipakai sebagai bobot alokasi. */
  unitPrice: number
}

/**
 * Alokasikan nilai tagihan per submit (snapshot) ke produk di dalamnya,
 * sebanding qty × harga katalog. Kalau semua bobot nol, dibagi menurut pcs.
 * Hasilnya: jumlah revenue semua produk = jumlah nilai submit yang punya
 * baris produk, jadi angka produk selalu cocok dengan Revenue.
 */
export function allocateProductRevenue(
  submissions: Array<{ submissionId: string; amount: number }>,
  lines: Array<ProductLine>,
): Map<string, { units: number; revenue: number }> {
  const bySub = new Map<string, Array<ProductLine>>()
  for (const l of lines) {
    if (l.qty <= 0) continue
    const list = bySub.get(l.submissionId) ?? []
    list.push(l)
    bySub.set(l.submissionId, list)
  }
  const out = new Map<string, { units: number; revenue: number }>()
  const add = (key: string, units: number, revenue: number) => {
    const cur = out.get(key) ?? { units: 0, revenue: 0 }
    cur.units += units
    cur.revenue += revenue
    out.set(key, cur)
  }
  for (const sub of submissions) {
    const list = bySub.get(sub.submissionId)
    if (!list?.length) continue
    const byPrice = list.reduce(
      (s, l) => s + l.qty * Math.max(0, l.unitPrice),
      0,
    )
    const weight = (l: ProductLine) =>
      byPrice > 0 ? l.qty * Math.max(0, l.unitPrice) : l.qty
    const totalWeight =
      byPrice > 0 ? byPrice : list.reduce((s, l) => s + l.qty, 0)
    // Dibulatkan ke rupiah; sisa pembulatan masuk ke baris terakhir supaya
    // totalnya tetap persis sama dengan nilai submit.
    let allocated = 0
    list.forEach((l, i) => {
      const share =
        i === list.length - 1
          ? sub.amount - allocated
          : Math.round((sub.amount * weight(l)) / totalWeight)
      allocated += share
      add(l.productKey, l.qty, share)
    })
  }
  return out
}

export type AnalyticsProductRow = {
  /** Id produk katalog, atau `name:<nama>` untuk isi paket lama tanpa varian. */
  key: string
  name: string
  sku: string | null
  photoUrl: string | null
  units: number
  revenue: number
}

export type ProductSort = 'units' | 'revenue'

export function sortProducts<
  T extends { name: string; units: number; revenue: number },
>(rows: Array<T>, sort: ProductSort): Array<T> {
  return [...rows].sort((a, b) =>
    sort === 'units'
      ? b.units - a.units ||
        b.revenue - a.revenue ||
        a.name.localeCompare(b.name)
      : b.revenue - a.revenue ||
        b.units - a.units ||
        a.name.localeCompare(b.name),
  )
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export type AnalyticsEventInput = {
  id: string
  name: string
  eventDate: string
  endDate: string | null
  isEnded: boolean
}

export type EventPerformanceRow = {
  eventId: string
  name: string
  eventDate: string
  endDate: string | null
  status: PartnerEventStatus
  revenue: number
  orders: number
  units: number
  /** % perubahan revenue event ini vs periode pembanding; null = tidak ada pembanding. */
  growth: number | null
}

/**
 * Baris tabel Event Performance: event yang punya penjualan di rentang ini
 * atau yang periodenya beririsan dengan rentang ini (supaya event yang sedang
 * berjalan tanpa penjualan tetap terlihat).
 */
export function buildEventRows(input: {
  events: Array<AnalyticsEventInput>
  current: Array<InvoiceFact>
  previous: Array<InvoiceFact>
  range: DateRange
  today: string
}): Array<EventPerformanceRow> {
  const cur = new Map<string, Array<InvoiceFact>>()
  for (const f of input.current) {
    const list = cur.get(f.calendarEventId) ?? []
    list.push(f)
    cur.set(f.calendarEventId, list)
  }
  const prevRevenue = new Map<string, number>()
  for (const f of input.previous) {
    prevRevenue.set(
      f.calendarEventId,
      (prevRevenue.get(f.calendarEventId) ?? 0) + f.amount,
    )
  }
  return input.events
    .filter((e) => {
      const end = e.endDate ?? e.eventDate
      return (
        cur.has(e.id) ||
        (e.eventDate <= input.range.to && end >= input.range.from)
      )
    })
    .map((e) => {
      const s = summarize(cur.get(e.id) ?? [])
      return {
        eventId: e.id,
        name: e.name,
        eventDate: e.eventDate,
        endDate: e.endDate,
        status: partnerEventStatus(e, input.today),
        revenue: s.netSales,
        orders: s.orders,
        units: s.units,
        growth: percentChange(s.netSales, prevRevenue.get(e.id) ?? 0),
      }
    })
}

export type EventSort = 'revenue' | 'units'

export function sortEvents(
  rows: Array<EventPerformanceRow>,
  sort: EventSort,
): Array<EventPerformanceRow> {
  return [...rows].sort((a, b) =>
    sort === 'revenue'
      ? b.revenue - a.revenue ||
        b.units - a.units ||
        b.eventDate.localeCompare(a.eventDate)
      : b.units - a.units ||
        b.revenue - a.revenue ||
        b.eventDate.localeCompare(a.eventDate),
  )
}

// ---------------------------------------------------------------------------
// Insight
// ---------------------------------------------------------------------------

export type Insight = {
  key: string
  tone: 'up' | 'down' | 'neutral'
  text: string
}

/** Perubahan di bawah ini dianggap stabil, bukan naik/turun. */
const FLAT_THRESHOLD = 1

/**
 * Kalimat insight per bahasa. Default-nya Indonesia (`INSIGHT_COPY_ID`);
 * Partner Portal mengirim versi bahasa aktif dari kamus `t.analytics`.
 */
export type InsightCopy = {
  trendFlat: (comparison: string) => string
  trendChange: (up: boolean, pct: string, comparison: string) => string
  topEvent: (name: string, money: string, pct: string) => string
  topProduct: (name: string, units: string) => string
  concentration: (pct: string, name: string) => string
  aov: (up: boolean, pct: string, money: string) => string
  /** Pemisah desimal untuk persen, mis. ',' (id) atau '.' (en). */
  decimalSeparator: string
  /** Locale `Intl` untuk angka pcs. */
  numberLocale: string
}

export const INSIGHT_COPY_ID: InsightCopy = {
  trendFlat: (comparison) => `Penjualan stabil dibandingkan ${comparison}.`,
  trendChange: (up, pct, comparison) =>
    `Penjualan ${up ? 'naik' : 'turun'} ${pct} dibandingkan ${comparison}.`,
  topEvent: (name, money, pct) =>
    `${name} menghasilkan omzet tertinggi: ${money} (${pct} dari total).`,
  topProduct: (name, units) => `${name} paling laris dengan ${units} pcs ditagih.`,
  concentration: (pct, name) =>
    `${pct} omzet produk berasal dari ${name}. Penjualan masih bertumpu pada satu produk.`,
  aov: (up, pct, money) =>
    `Rata-rata nilai per tagihan ${up ? 'naik' : 'turun'} ${pct} menjadi ${money}.`,
  decimalSeparator: ',',
  numberLocale: 'id-ID',
}

function formatPct(n: number, decimalSeparator: string): string {
  const abs = Math.abs(n)
  return `${abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10}%`.replace(
    '.',
    decimalSeparator,
  )
}

/**
 * Kalimat insight dari data aktual. Tiap kalimat hanya muncul kalau datanya
 * cukup; tidak ada penjualan = tidak ada insight.
 */
export function buildInsights(input: {
  current: SalesSummary
  previous: SalesSummary
  comparisonLabel: string
  events: Array<EventPerformanceRow>
  /** true kalau filter event = semua event. */
  allEvents: boolean
  products: Array<{ name: string; units: number; revenue: number }>
  formatMoney: (n: number) => string
  copy?: InsightCopy
}): Array<Insight> {
  const { current, previous, formatMoney } = input
  const copy = input.copy ?? INSIGHT_COPY_ID
  const pct = (n: number) => formatPct(n, copy.decimalSeparator)
  if (current.orders === 0) return []
  const out: Array<Insight> = []

  const change = percentChange(current.netSales, previous.netSales)
  if (change !== null) {
    if (Math.abs(change) < FLAT_THRESHOLD) {
      out.push({
        key: 'trend',
        tone: 'neutral',
        text: copy.trendFlat(input.comparisonLabel),
      })
    } else {
      out.push({
        key: 'trend',
        tone: change > 0 ? 'up' : 'down',
        text: copy.trendChange(change > 0, pct(change), input.comparisonLabel),
      })
    }
  }

  const earning = input.events.filter((e) => e.revenue > 0)
  if (input.allEvents && earning.length >= 2) {
    const top = [...earning].sort((a, b) => b.revenue - a.revenue)[0]
    const share = (top.revenue / current.netSales) * 100
    out.push({
      key: 'top-event',
      tone: 'neutral',
      text: copy.topEvent(top.name, formatMoney(top.revenue), pct(share)),
    })
  }

  const sold = input.products.filter((p) => p.units > 0)
  if (sold.length > 0) {
    const top = sortProducts(sold, 'units')[0]
    out.push({
      key: 'top-product',
      tone: 'neutral',
      text: copy.topProduct(
        top.name,
        top.units.toLocaleString(copy.numberLocale),
      ),
    })
  }
  if (sold.length >= 3) {
    const totalRevenue = sold.reduce((s, p) => s + p.revenue, 0)
    const lead = sortProducts(sold, 'revenue')[0]
    const share = totalRevenue > 0 ? (lead.revenue / totalRevenue) * 100 : 0
    if (share >= 50) {
      out.push({
        key: 'concentration',
        tone: 'neutral',
        text: copy.concentration(pct(share), lead.name),
      })
    }
  }

  if (current.aov !== null && previous.aov !== null) {
    const aovChange = percentChange(current.aov, previous.aov)
    if (aovChange !== null && Math.abs(aovChange) >= 5) {
      out.push({
        key: 'aov',
        tone: aovChange > 0 ? 'up' : 'down',
        text: copy.aov(aovChange > 0, pct(aovChange), formatMoney(current.aov)),
      })
    }
  }

  return out
}
