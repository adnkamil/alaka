import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NOTE_OUTSIDE_RULE,
  applyPoolToBilling,
  poolSinglesIntoBundles,
} from './partner-invoice-pooling'
import type {
  PoolRule,
  PoolSingle,
  PoolableBilling,
} from './partner-invoice-pooling'

const t = (n: number) => new Date(2026, 10, 2, 10, n)

const rule100k2: PoolRule = {
  id: 'r1',
  name: '100K / 2pcs',
  minQty: 2,
  bundlePrice: 100_000,
  productIds: ['pX', 'pY'],
  productSizes: { pX: ['M', 'L'], pY: ['M'] },
}

const rule90k3: PoolRule = {
  id: 'r2',
  name: '90K / 3pcs',
  minQty: 3,
  bundlePrice: 90_000,
  productIds: ['pZ'],
  productSizes: { pZ: ['S'] },
}

const single = (over: Partial<PoolSingle> & { itemId: string }): PoolSingle => ({
  submissionId: 's1',
  label: 'Item X (M)',
  productId: 'pX',
  size: 'M',
  qty: 1,
  unitPrice: 60_000,
  addedAt: t(1),
  ...over,
})

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

describe('poolSinglesIntoBundles', () => {
  it('item X dari dua customer di submit berbeda jadi satu paket 100K', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'aa', submissionId: 's1', addedAt: t(1) }),
        single({ itemId: 'ab', submissionId: 's2', addedAt: t(2) }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.saving, 20_000)
    assert.equal(sum(r.bundles[0].amountBySubmission), 100_000)
    assert.equal(r.bundles[0].amountBySubmission.get('s1'), 50_000)
    assert.equal(r.bundles[0].amountBySubmission.get('s2'), 50_000)
    assert.equal(r.consumed.get('aa'), 1)
    assert.equal(r.consumed.get('ab'), 1)
    assert.equal(r.bundles[0].lines.length, 2)
  })

  it('satu pcs saja tidak jadi paket', () => {
    const r = poolSinglesIntoBundles([single({ itemId: 'aa' })], [rule100k2])
    assert.equal(r.bundles.length, 0)
    assert.equal(r.consumed.size, 0)
    assert.equal(r.saving, 0)
  })

  it('3 pcs untuk aturan 2 pcs: satu paket, satu sisa FIFO', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'c', addedAt: t(3) }),
        single({ itemId: 'a', addedAt: t(1) }),
        single({ itemId: 'b', addedAt: t(2) }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.consumed.get('a'), 1)
    assert.equal(r.consumed.get('b'), 1)
    assert.equal(r.consumed.has('c'), false)
  })

  it('satu baris qty 3 dipecah: dua pcs masuk paket, satu sisa', () => {
    const r = poolSinglesIntoBundles([single({ itemId: 'a', qty: 3 })], [rule100k2])
    assert.equal(r.bundles.length, 1)
    assert.equal(r.consumed.get('a'), 2)
  })

  it('ukuran di luar aturan tidak ikut', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', size: 'XL' }),
        single({ itemId: 'b', size: 'XL', submissionId: 's2' }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 0)
  })

  it('produk di luar aturan tidak ikut', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', productId: 'pQ' }),
        single({ itemId: 'b', productId: 'pQ', submissionId: 's2' }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 0)
  })

  it('produk berbeda dalam aturan yang sama bisa digabung', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', productId: 'pX', label: 'X (M)' }),
        single({
          itemId: 'b',
          productId: 'pY',
          label: 'Y (M)',
          submissionId: 's2',
          unitPrice: 70_000,
        }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.saving, 30_000)
  })

  it('aturan berbeda tidak saling tercampur', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a' }),
        single({ itemId: 'z', productId: 'pZ', size: 'S', label: 'Z (S)' }),
      ],
      [rule100k2, rule90k3],
    )
    assert.equal(r.bundles.length, 0)
  })

  it('harga paket lebih mahal dari satuan: tetap jadi paket', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', unitPrice: 40_000 }),
        single({ itemId: 'b', unitPrice: 40_000, submissionId: 's2' }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(sum(r.bundles[0].amountBySubmission), 100_000)
    assert.equal(r.saving, -20_000)
  })

  it('harga paket sama dengan jumlah satuan: tetap jadi paket', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', unitPrice: 50_000 }),
        single({ itemId: 'b', unitPrice: 50_000, submissionId: 's2' }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.saving, 0)
  })

  it('isi paket dari satu submit digabung jadi satu baris dengan 2×', () => {
    const r = poolSinglesIntoBundles(
      [single({ itemId: 'a', qty: 2, submissionId: 's1' })],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.bundles[0].lines.length, 1)
    assert.equal(r.bundles[0].lines[0].label, '100K / 2pcs: 2× Item X (M)')
    assert.equal(r.bundles[0].lines[0].amount, 100_000)
    assert.equal(r.bundles[0].lines[0].qty, 1)
  })

  it('label baris tidak memuat nama customer, hanya submit dan isi', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', submissionId: 's1' }),
        single({ itemId: 'b', submissionId: 's2' }),
      ],
      [rule100k2],
    )
    const labels = r.bundles[0].lines.map((l) => l.label)
    assert.deepEqual(labels, [
      '100K / 2pcs: Item X (M)',
      '100K / 2pcs: Item X (M)',
    ])
    assert.deepEqual(
      r.bundles[0].lines.map((l) => l.submissionId),
      ['s1', 's2'],
    )
  })

  it('pembulatan: jumlah baris selalu sama dengan harga paket', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', submissionId: 's1', unitPrice: 33_333 }),
        single({ itemId: 'b', submissionId: 's2', unitPrice: 33_333 }),
        single({ itemId: 'c', submissionId: 's3', unitPrice: 33_334 }),
      ],
      [{ ...rule100k2, minQty: 3, bundlePrice: 99_999, productIds: ['pX'], productSizes: { pX: ['M'] } }],
    )
    assert.equal(r.bundles.length, 1)
    const total = r.bundles[0].lines.reduce((s, l) => s + l.amount, 0)
    assert.equal(total, 99_999)
  })

  it('dua paket dari empat pcs lintas tiga submit', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', submissionId: 's1', addedAt: t(1) }),
        single({ itemId: 'b', submissionId: 's2', addedAt: t(2) }),
        single({ itemId: 'c', submissionId: 's3', addedAt: t(3) }),
        single({ itemId: 'd', submissionId: 's1', addedAt: t(4) }),
      ],
      [rule100k2],
    )
    assert.equal(r.bundles.length, 2)
    assert.equal(r.saving, 40_000)
    assert.equal(
      r.bundles.reduce((s, b) => s + sum(b.amountBySubmission), 0),
      200_000,
    )
  })

  it('qty 0 diabaikan dan input kosong aman', () => {
    assert.equal(
      poolSinglesIntoBundles([single({ itemId: 'a', qty: 0 })], [rule100k2])
        .bundles.length,
      0,
    )
    const empty = poolSinglesIntoBundles([], [rule100k2])
    assert.equal(empty.bundles.length, 0)
    assert.equal(empty.saving, 0)
  })

  it('tanpa aturan aktif tidak ada paket', () => {
    const r = poolSinglesIntoBundles(
      [single({ itemId: 'a' }), single({ itemId: 'b', submissionId: 's2' })],
      [],
    )
    assert.equal(r.bundles.length, 0)
  })

  it('produk tanpa ukuran ikut aturan yang tidak memilih ukuran', () => {
    const r = poolSinglesIntoBundles(
      [
        single({ itemId: 'a', size: null, productId: 'pN' }),
        single({ itemId: 'b', size: null, productId: 'pN', submissionId: 's2' }),
      ],
      [{ ...rule100k2, productIds: ['pN'], productSizes: {} }],
    )
    assert.equal(r.bundles.length, 1)
  })
})

describe('applyPoolToBilling', () => {
  const billingOf = (
    submissionId: string,
    itemId: string,
    qty: number,
    unitPrice = 60_000,
  ): PoolableBilling => ({
    approvedAmount: qty * unitPrice,
    lines: [
      {
        submissionId,
        kind: 'satuan',
        label: 'Item X (M)',
        qty,
        unitPrice,
        amount: qty * unitPrice,
        itemId,
      },
    ],
  })

  it('AA dan AB: 120K jadi 100K, baris satuan diganti baris paket', () => {
    const by = new Map([
      ['s1', billingOf('s1', 'aa', 1)],
      ['s2', billingOf('s2', 'ab', 1)],
    ])
    const pool = poolSinglesIntoBundles(
      [
        single({ itemId: 'aa', submissionId: 's1', addedAt: t(1) }),
        single({ itemId: 'ab', submissionId: 's2', addedAt: t(2) }),
      ],
      [rule100k2],
    )
    const out = applyPoolToBilling(by, pool)
    const total = [...out.values()].reduce((s, b) => s + b.approvedAmount, 0)
    assert.equal(total, 100_000)
    for (const b of out.values()) {
      assert.equal(b.lines.length, 1)
      assert.equal(b.lines[0].kind, 'paket')
      assert.equal(b.approvedAmount, b.lines[0].amount)
    }
  })

  it('sisa satuan tetap ditagih satuan, qty baris dikurangi', () => {
    const by = new Map([['s1', billingOf('s1', 'a', 3)]])
    const pool = poolSinglesIntoBundles(
      [single({ itemId: 'a', qty: 3 })],
      [rule100k2],
    )
    const b = applyPoolToBilling(by, pool).get('s1')!
    assert.equal(b.approvedAmount, 100_000 + 60_000)
    const satuan = b.lines.find((l) => l.kind === 'satuan')!
    assert.equal(satuan.qty, 1)
    assert.equal(satuan.amount, 60_000)
    assert.equal(b.lines.filter((l) => l.kind === 'paket').length, 1)
  })

  it('tanpa paket terbentuk, nominal tagihan tidak berubah', () => {
    const by = new Map([['s1', billingOf('s1', 'a', 1)]])
    const pool = poolSinglesIntoBundles([single({ itemId: 'a' })], [rule100k2])
    const b = applyPoolToBilling(by, pool).get('s1')!
    const before = by.get('s1')!
    assert.equal(b.approvedAmount, before.approvedAmount)
    assert.equal(b.lines.length, 1)
    assert.equal(b.lines[0].amount, before.lines[0].amount)
    assert.equal(b.lines[0].qty, before.lines[0].qty)
  })

  it('sisa kurang dari paket diberi alasan jumlah pcs yang kurang', () => {
    const by = new Map([['s1', billingOf('s1', 'a', 1)]])
    const pool = poolSinglesIntoBundles([single({ itemId: 'a' })], [rule100k2])
    const b = applyPoolToBilling(by, pool).get('s1')!
    assert.equal(b.lines[0].note, 'Kurang 1 pcs lagi untuk 100K / 2pcs')
  })

  it('sisa dari beberapa baris memakai jumlah kurang yang sama', () => {
    // 3 pcs aturan 2pcs: 1 paket terbentuk, 1 pcs sisa kurang 1 pcs lagi.
    const by = new Map([['s1', billingOf('s1', 'a', 3)]])
    const pool = poolSinglesIntoBundles(
      [single({ itemId: 'a', qty: 3 })],
      [rule100k2],
    )
    const satuan = applyPoolToBilling(by, pool)
      .get('s1')!
      .lines.find((l) => l.kind === 'satuan')!
    assert.equal(satuan.note, 'Kurang 1 pcs lagi untuk 100K / 2pcs')
  })

  it('produk di luar semua aturan diberi alasan di luar aturan paket', () => {
    const by = new Map([['s1', billingOf('s1', 'a', 1)]])
    const pool = poolSinglesIntoBundles(
      [single({ itemId: 'a', productId: 'pLain' })],
      [rule100k2],
    )
    const b = applyPoolToBilling(by, pool).get('s1')!
    assert.equal(b.lines[0].note, NOTE_OUTSIDE_RULE)
  })

  it('pcs yang habis masuk paket tidak diberi alasan', () => {
    const by = new Map([
      ['s1', billingOf('s1', 'aa', 1)],
      ['s2', billingOf('s2', 'ab', 1)],
    ])
    const pool = poolSinglesIntoBundles(
      [
        single({ itemId: 'aa', submissionId: 's1' }),
        single({ itemId: 'ab', submissionId: 's2', addedAt: t(2) }),
      ],
      [rule100k2],
    )
    const out = applyPoolToBilling(by, pool)
    for (const b of out.values()) {
      assert.equal(b.lines.some((l) => l.note !== undefined), false)
    }
  })

  it('tidak mengubah objek asal', () => {
    const by = new Map([
      ['s1', billingOf('s1', 'aa', 1)],
      ['s2', billingOf('s2', 'ab', 1)],
    ])
    const before = JSON.stringify([...by])
    const pool = poolSinglesIntoBundles(
      [
        single({ itemId: 'aa', submissionId: 's1' }),
        single({ itemId: 'ab', submissionId: 's2' }),
      ],
      [rule100k2],
    )
    applyPoolToBilling(by, pool)
    assert.equal(JSON.stringify([...by]), before)
  })

  it('submit di luar tagihan tidak mendapat baris paket', () => {
    const by = new Map([['s1', billingOf('s1', 'aa', 1)]])
    const pool = poolSinglesIntoBundles(
      [
        single({ itemId: 'aa', submissionId: 's1' }),
        single({ itemId: 'ab', submissionId: 's9' }),
      ],
      [rule100k2],
    )
    const out = applyPoolToBilling(by, pool)
    assert.equal(out.has('s9'), false)
  })
})
