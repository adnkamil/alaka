import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildMinPurchaseStats,
  computeDraftTotal,
  draftFingerprint,
  minPurchaseShortfall,
  sameFingerprint,
  validateMinPurchaseChange,
} from './min-purchase'
import type { DraftSource } from './min-purchase'

const skirt = { productId: 'p1', size: null, price: 85_000 }
const rules = [
  {
    id: 'r1',
    name: 'Paket Skirt',
    minQty: 3,
    bundlePrice: 200_000,
    productIds: ['p1'],
  },
]
const source = (
  key: string,
  qty: number,
  variant: DraftSource['variant'] = skirt,
): DraftSource => ({
  key,
  label: 'Skirt',
  qty,
  addedAt: new Date('2026-01-01'),
  variant,
})

test('total dihitung setelah pcs dari semua pesanan dipaketkan', () => {
  const result = computeDraftTotal(
    [source('a', 3), source('b', 2), source('c', 1)],
    rules,
  )
  assert.equal(result.totalPcs, 6)
  assert.equal(result.bundles.length, 2)
  assert.equal(result.total, 400_000)
})

test('sisa pcs ditagih satuan dengan alasannya', () => {
  const result = computeDraftTotal([source('a', 5)], rules)
  assert.equal(result.total, 200_000 + 2 * 85_000)
  assert.equal(result.singles[0].qty, 2)
  assert.match(result.singles[0].note!, /Kurang 1 pcs/)
})

test('barang tanpa varian tidak ikut total', () => {
  const result = computeDraftTotal(
    [source('a', 1), source('b', 4, null)],
    rules,
  )
  assert.equal(result.total, 85_000)
  assert.deepEqual(result.unpriced, [{ label: 'Skirt', qty: 4 }])
})

test('minimal hanya berlaku di submit pertama', () => {
  const base = { total: 380_000, minPurchase: 500_000 }
  assert.equal(
    minPurchaseShortfall({ ...base, isFirstSubmit: true }),
    120_000,
  )
  assert.equal(minPurchaseShortfall({ ...base, isFirstSubmit: false }), 0)
  assert.equal(
    minPurchaseShortfall({ ...base, minPurchase: null, isFirstSubmit: true }),
    0,
  )
})

test('minimal terkunci setelah jam buka tersimpan lewat', () => {
  const now = new Date('2026-05-10T10:00:00Z')
  const change = (storedOpensAt: Date | null, next: number | null) =>
    validateMinPurchaseChange({
      current: 500_000,
      next,
      storedOpensAt,
      now,
    })
  assert.equal(change(new Date('2026-05-11T00:00:00Z'), 900_000), null)
  assert.equal(change(null, 900_000), null)
  assert.notEqual(change(new Date('2026-05-10T09:00:00Z'), 400_000), null)
  assert.notEqual(change(new Date('2026-05-10T09:00:00Z'), null), null)
  assert.equal(change(new Date('2026-05-10T09:00:00Z'), 500_000), null)
})

test('sidik draft mendeteksi barang atau qty yang berubah', () => {
  const seen = draftFingerprint([source('a', 1), source('b', 2)])
  assert.ok(
    sameFingerprint(
      seen,
      draftFingerprint([source('b', 2), source('a', 1)]),
    ),
  )
  assert.ok(!sameFingerprint(seen, draftFingerprint([source('a', 1)])))
  assert.ok(
    !sameFingerprint(
      seen,
      draftFingerprint([source('a', 1), source('b', 3)]),
    ),
  )
})

test('statistik tertahan dan sebaran submit pertama', () => {
  const j = (
    submitted: boolean,
    firstSubmitTotal: number | null,
    draftTotal: number,
  ) => ({ submitted, firstSubmitTotal, draftTotal })
  const stats = buildMinPurchaseStats({
    minPurchase: 500_000,
    jastiper: [
      j(true, 600_000, 0),
      j(true, 2_000_000, 100_000),
      j(false, null, 450_000),
      j(false, null, 100_000),
      j(false, null, 0),
      j(false, null, 700_000),
    ],
  })
  assert.equal(stats.joined, 6)
  assert.equal(stats.submitted, 2)
  assert.equal(stats.stuck, 2)
  assert.equal(stats.stuckAmount, 550_000)
  assert.equal(stats.stuckNearMin, 1)
  assert.deepEqual(stats.buckets, [0, 0, 1, 0, 1])
})
