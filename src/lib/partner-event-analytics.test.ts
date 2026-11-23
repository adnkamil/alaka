import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildEventAnalytics,
  buildTimeline,
  pcsBucket,
  variantLabel,
} from './partner-event-analytics'
import type { AnalyticsInput, AnalyticsLine } from './partner-event-analytics'

const line = (over: Partial<AnalyticsLine>): AnalyticsLine => ({
  orderId: 'o1',
  submissionId: 's1',
  variantId: 'v-kana-m',
  productName: 'Kana Pants',
  size: 'M',
  variation: null,
  kind: 'satuan',
  qty: 1,
  status: 'disetujui',
  ...over,
})

const input = (over: Partial<AnalyticsInput>): AnalyticsInput => ({
  slotEnabled: true,
  jastiper: [
    { eventId: 'e1', brandId: 'b1', brandName: 'Toko A' },
    { eventId: 'e2', brandId: 'b2', brandName: 'Toko B' },
  ],
  orders: [
    { id: 'o1', eventId: 'e1' },
    { id: 'o2', eventId: 'e1' },
    { id: 'o3', eventId: 'e2' },
  ],
  lines: [],
  submissions: [
    { id: 's1', eventId: 'e1', submittedAt: new Date('2026-11-19T03:00:00Z') },
    { id: 's2', eventId: 'e2', submittedAt: new Date('2026-11-19T05:30:00Z') },
  ],
  invoices: [],
  stockVariants: [],
  ...over,
})

describe('pcsBucket', () => {
  it('draft hanya ada di event dengan slot', () => {
    assert.equal(pcsBucket(null, true), 'draft')
    assert.equal(pcsBucket(null, false), 'terjual')
    assert.equal(pcsBucket('dibatalkan', true), null)
    assert.equal(pcsBucket('disanggah', true), 'ditolak')
  })
})

describe('buildEventAnalytics', () => {
  it('menghitung pembeli, produk terlaris, dan peringkat jastiper', () => {
    const out = buildEventAnalytics(
      input({
        lines: [
          line({ orderId: 'o1', qty: 2 }),
          line({ orderId: 'o2', productName: 'Bara Top', variantId: 'v-bara', kind: 'paket' }),
          line({ orderId: 'o3', submissionId: 's2', qty: 1 }),
          line({ orderId: 'o3', submissionId: 's2', status: 'disanggah', qty: 4 }),
          line({ orderId: 'o3', status: 'pengajuan', qty: 5 }),
        ],
      }),
    )
    assert.equal(out.buyers, 3)
    assert.deepEqual(out.pcs, { terjual: 4, menunggu: 5, ditolak: 4, draft: 0 })
    assert.deepEqual(out.kindSplit, { satuan: 3, paket: 1 })
    assert.equal(out.products[0].productName, 'Kana Pants')
    assert.equal(out.products[0].terjual, 3)
    assert.equal(out.products[0].ditolak, 4)
    assert.equal(out.products[0].jastiper, 2)
    assert.equal(out.jastiperRanking[0].brandName, 'Toko A')
    assert.equal(out.jastiperRanking[0].buyers, 2)
    assert.equal(out.jastiperRanking[1].ditolak, 4)
    assert.deepEqual(out.unmetDemand, [{ label: 'Kana Pants — M', ditolak: 4 }])
  })

  it('memisahkan stok habis dan hampir habis beserta permintaannya', () => {
    const out = buildEventAnalytics(
      input({
        lines: [line({ qty: 2 }), line({ status: 'disanggah', qty: 1 })],
        stockVariants: [
          { variantId: 'v-kana-m', productName: 'Kana Pants', size: 'M', variation: null, stockQty: 0 },
          { variantId: 'v-kana-l', productName: 'Kana Pants', size: 'L', variation: null, stockQty: 2 },
          { variantId: 'v-kana-xl', productName: 'Kana Pants', size: 'XL', variation: null, stockQty: 10 },
        ],
      }),
    )
    assert.equal(out.stockOut.length, 1)
    assert.equal(out.stockOut[0].terjual, 2)
    assert.equal(out.stockOut[0].ditolak, 1)
    assert.deepEqual(out.lowStock.map((s) => s.label), ['L'])
  })

  it('menjumlahkan tagihan per jastiper', () => {
    const out = buildEventAnalytics(
      input({
        invoices: [
          { brandId: 'b1', status: 'lunas', amount: 100, pcs: 1 },
          { brandId: 'b1', status: 'ditagih', amount: 50, pcs: 1 },
        ],
      }),
    )
    assert.deepEqual(out.billed, { total: 150, lunas: 100, count: 2 })
    const a = out.jastiperRanking.find((j) => j.brandId === 'b1')!
    assert.equal(a.billedAmount, 150)
    assert.equal(a.paidAmount, 100)
  })
})

describe('variantLabel', () => {
  it('variasi dulu, baru ukuran', () => {
    assert.equal(variantLabel('M', 'Marine Cove'), 'Marine Cove · M')
    assert.equal(variantLabel('M', null), 'M')
    assert.equal(variantLabel(null, null), 'Standar')
  })
})

describe('buildTimeline', () => {
  it('per jam dalam WIB, jam kosong tetap muncul', () => {
    const t = buildTimeline([
      { at: new Date('2026-11-19T03:10:00Z'), pcs: 2 },
      { at: new Date('2026-11-19T05:59:00Z'), pcs: 3 },
    ])
    assert.equal(t.granularity, 'jam')
    assert.deepEqual(
      t.buckets.map((b) => [b.label, b.pcs]),
      [
        ['19 Nov, 10.00', 2],
        ['19 Nov, 11.00', 0],
        ['19 Nov, 12.00', 3],
      ],
    )
  })

  it('per hari kalau rentang lebih dari dua hari', () => {
    const t = buildTimeline([
      { at: new Date('2026-11-18T20:00:00Z'), pcs: 1 },
      { at: new Date('2026-11-22T01:00:00Z'), pcs: 1 },
    ])
    assert.equal(t.granularity, 'hari')
    assert.equal(t.buckets[0].label, '19 Nov')
    assert.equal(t.buckets.length, 4)
  })
})
