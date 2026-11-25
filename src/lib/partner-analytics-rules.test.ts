import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allocateProductRevenue,
  allowedGranularities,
  bucketStart,
  buildEventRows,
  buildInsights,
  buildSeries,
  effectiveGranularity,
  percentChange,
  previousRange,
  resolveRange,
  sortProducts,
  summarize,
} from './partner-analytics-rules.ts'
import type { InvoiceFact } from './partner-analytics-rules.ts'

const today = '2026-11-25'

test('preset 7 & 30 hari berakhir hari ini, inklusif', () => {
  assert.deepEqual(resolveRange('7d', today).range, {
    from: '2026-11-19',
    to: today,
  })
  assert.deepEqual(resolveRange('30d', today).range, {
    from: '2026-10-27',
    to: today,
  })
})

test('bulan ini, bulan lalu, tahun ini', () => {
  assert.deepEqual(resolveRange('this_month', today).range, {
    from: '2026-11-01',
    to: today,
  })
  assert.deepEqual(resolveRange('last_month', today).range, {
    from: '2026-10-01',
    to: '2026-10-31',
  })
  assert.deepEqual(resolveRange('last_month', '2026-03-10').range, {
    from: '2026-02-01',
    to: '2026-02-28',
  })
  assert.deepEqual(resolveRange('this_year', today).range, {
    from: '2026-01-01',
    to: today,
  })
})

test('custom: tidak valid jatuh ke 30 hari, terbalik ditukar, masa depan dipotong', () => {
  assert.equal(
    resolveRange('custom', today, { from: 'x', to: today }).preset,
    '30d',
  )
  assert.deepEqual(
    resolveRange('custom', today, { from: '2026-11-10', to: '2026-11-01' })
      .range,
    { from: '2026-11-01', to: '2026-11-10' },
  )
  assert.deepEqual(
    resolveRange('custom', today, { from: '2026-11-20', to: '2026-12-31' })
      .range,
    { from: '2026-11-20', to: today },
  )
  assert.equal(
    resolveRange('custom', today, { from: '2026-02-30', to: today }).preset,
    '30d',
  )
})

test('pembanding bulan berjalan = tanggal yang sama bulan lalu', () => {
  assert.deepEqual(
    previousRange('this_month', { from: '2026-11-01', to: '2026-11-25' }),
    {
      from: '2026-10-01',
      to: '2026-10-25',
    },
  )
  // 31 Mar -> 28 Feb (dipotong ke akhir bulan)
  assert.deepEqual(
    previousRange('this_month', { from: '2026-03-01', to: '2026-03-31' }),
    {
      from: '2026-02-01',
      to: '2026-02-28',
    },
  )
})

test('pembanding bulan lalu = bulan penuh sebelumnya; lainnya jendela sama panjang', () => {
  assert.deepEqual(
    previousRange('last_month', { from: '2026-10-01', to: '2026-10-31' }),
    {
      from: '2026-09-01',
      to: '2026-09-30',
    },
  )
  assert.deepEqual(
    previousRange('7d', { from: '2026-11-19', to: '2026-11-25' }),
    {
      from: '2026-11-12',
      to: '2026-11-18',
    },
  )
})

test('minggu dimulai Senin', () => {
  // 25 Nov 2026 = Rabu
  assert.equal(bucketStart('2026-11-25', 'week'), '2026-11-23')
  assert.equal(bucketStart('2026-11-23', 'week'), '2026-11-23')
  assert.equal(bucketStart('2026-11-22', 'week'), '2026-11-16')
  assert.equal(bucketStart('2026-11-25', 'month'), '2026-11-01')
})

test('seri menutup seluruh rentang termasuk bucket nol, dipotong ke rentang', () => {
  const series = buildSeries({ from: '2026-11-19', to: '2026-11-25' }, 'week', [
    { date: '2026-11-20', amount: 100 },
    { date: '2026-11-24', amount: 50 },
    { date: '2026-11-26', amount: 999 },
  ])
  assert.deepEqual(series, [
    { from: '2026-11-19', to: '2026-11-22', amount: 100 },
    { from: '2026-11-23', to: '2026-11-25', amount: 50 },
  ])
  assert.equal(
    buildSeries({ from: '2026-11-01', to: '2026-11-30' }, 'day', []).length,
    30,
  )
})

test('agregasi yang diizinkan mengikuti panjang rentang', () => {
  assert.deepEqual(
    allowedGranularities({ from: '2026-11-19', to: '2026-11-25' }),
    ['day'],
  )
  assert.deepEqual(
    allowedGranularities({ from: '2026-01-01', to: '2026-11-25' }),
    ['week', 'month'],
  )
  assert.equal(
    effectiveGranularity({ from: '2026-11-19', to: '2026-11-25' }, 'month'),
    'day',
  )
})

test('persentase perubahan null kalau pembanding nol', () => {
  assert.equal(percentChange(100, 0), null)
  assert.equal(percentChange(150, 100), 50)
})

test('ringkasan: AOV = net sales / pesanan; tanpa pesanan AOV null', () => {
  const facts: Array<InvoiceFact> = [
    { calendarEventId: 'a', date: '2026-11-01', amount: 300_000, pcs: 3 },
    { calendarEventId: 'a', date: '2026-11-02', amount: 100_000, pcs: 2 },
  ]
  assert.deepEqual(summarize(facts), {
    netSales: 400_000,
    orders: 2,
    units: 5,
    aov: 200_000,
  })
  assert.equal(summarize([]).aov, null)
})

test('alokasi produk: sebanding harga, total sama persis dengan nilai submit', () => {
  // Paket 2 pcs seharga 150rb (harga satuan 100rb + 100rb): diskon paket ikut
  // terbagi rata ke kedua produk.
  const result = allocateProductRevenue(
    [{ submissionId: 's1', amount: 150_001 }],
    [
      { submissionId: 's1', productKey: 'A', qty: 1, unitPrice: 100_000 },
      { submissionId: 's1', productKey: 'B', qty: 1, unitPrice: 100_000 },
    ],
  )
  assert.equal(result.get('A')!.revenue + result.get('B')!.revenue, 150_001)
  assert.equal(result.get('A')!.units, 1)
})

test('alokasi produk: bobot nol dibagi menurut pcs, submit tanpa baris dilewati', () => {
  const result = allocateProductRevenue(
    [
      { submissionId: 's1', amount: 90 },
      { submissionId: 's2', amount: 500 },
    ],
    [
      { submissionId: 's1', productKey: 'A', qty: 2, unitPrice: 0 },
      { submissionId: 's1', productKey: 'B', qty: 1, unitPrice: 0 },
    ],
  )
  assert.deepEqual(result.get('A'), { units: 2, revenue: 60 })
  assert.deepEqual(result.get('B'), { units: 1, revenue: 30 })
})

test('urutan produk: Most Sold vs Highest Revenue', () => {
  const rows = [
    { name: 'A', units: 10, revenue: 100 },
    { name: 'B', units: 5, revenue: 500 },
  ]
  assert.equal(sortProducts(rows, 'units')[0].name, 'A')
  assert.equal(sortProducts(rows, 'revenue')[0].name, 'B')
})

test('event: tampil kalau ada penjualan atau periodenya beririsan', () => {
  const rows = buildEventRows({
    events: [
      {
        id: 'a',
        name: 'A',
        eventDate: '2026-11-20',
        endDate: null,
        isEnded: false,
      },
      {
        id: 'b',
        name: 'B',
        eventDate: '2026-12-10',
        endDate: null,
        isEnded: false,
      },
      {
        id: 'c',
        name: 'C',
        eventDate: '2026-08-01',
        endDate: null,
        isEnded: true,
      },
    ],
    current: [
      { calendarEventId: 'c', date: '2026-11-20', amount: 100, pcs: 1 },
    ],
    previous: [
      { calendarEventId: 'c', date: '2026-11-10', amount: 50, pcs: 1 },
    ],
    range: { from: '2026-11-19', to: today },
    today,
  })
  assert.deepEqual(
    rows.map((r) => [r.eventId, r.status, r.growth]),
    [
      ['a', 'selesai', null],
      ['c', 'selesai', 100],
    ],
  )
})

test('insight: tidak ada pesanan = tidak ada insight', () => {
  const empty = summarize([])
  assert.deepEqual(
    buildInsights({
      current: empty,
      previous: empty,
      comparisonLabel: 'bulan lalu',
      events: [],
      allEvents: true,
      products: [],
      formatMoney: String,
    }),
    [],
  )
})

test('insight: tren hanya muncul kalau ada pembanding', () => {
  const cur = { netSales: 115, orders: 1, units: 1, aov: 115 }
  const base = {
    current: cur,
    comparisonLabel: 'bulan lalu',
    events: [],
    allEvents: true,
    products: [],
    formatMoney: String,
  }
  const up = buildInsights({
    ...base,
    previous: { netSales: 100, orders: 1, units: 1, aov: 100 },
  })
  assert.equal(up[0].text, 'Penjualan naik 15% dibandingkan bulan lalu.')
  assert.equal(up[0].tone, 'up')
  const none = buildInsights({
    ...base,
    previous: { netSales: 0, orders: 0, units: 0, aov: null },
  })
  assert.equal(
    none.some((i) => i.key === 'trend'),
    false,
  )
})
