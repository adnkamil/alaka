import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeReviewedRows } from './partner-review-merge'
import type { ReviewRow } from './submit-review-queries'

function row(over: Partial<ReviewRow>): ReviewRow {
  return {
    kind: 'satuan',
    id: 'r',
    label: '',
    productName: 'Kingu Airlie Polo',
    size: 'L',
    variation: 'Rosewood',
    unitPrice: 30000,
    qty: 1,
    status: 'disetujui',
    bundleId: null,
    partnerVariantId: null,
    stock: null,
    ...over,
  }
}

describe('mergeReviewedRows', () => {
  it('menggabungkan satuan dan komponen paket jadi disetujui sebagian', () => {
    const [m, ...rest] = mergeReviewedRows([
      row({ id: 'a', qty: 2 }),
      row({ id: 'b', kind: 'komponen', qty: 1, status: 'disanggah' }),
    ])
    assert.equal(rest.length, 0)
    assert.equal(m.requested, 3)
    assert.equal(m.approved, 2)
    assert.equal(m.status, 'sebagian')
  })

  it('semua disetujui, semua ditolak, semua dibatalkan', () => {
    assert.equal(mergeReviewedRows([row({ qty: 2 }), row({ kind: 'komponen' })])[0].status, 'disetujui')
    assert.equal(mergeReviewedRows([row({ status: 'disanggah' })])[0].status, 'ditolak')
    assert.equal(mergeReviewedRows([row({ status: 'dibatalkan' })])[0].status, 'dibatalkan')
  })

  it('tidak menggabungkan varian berbeda', () => {
    assert.equal(mergeReviewedRows([row({}), row({ size: 'M' })]).length, 2)
  })
})

describe('mergeReviewedRows dengan harga', () => {
  it('memisahkan pcs paket dari satuan, masing-masing dengan harganya', () => {
    const rows = mergeReviewedRows(
      [
        row({ id: 'a', qty: 3 }),
        row({ id: 'b', kind: 'komponen', qty: 1, status: 'disanggah' }),
      ],
      { a: [{ ruleName: 'Paket 2', bundlePrice: 50000, bundlePcs: 2, qty: 2 }] },
    )
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((r) => [r.priceType, r.price, r.requested, r.approved, r.status]),
      [
        ['satuan', 30000, 2, 1, 'sebagian'],
        ['paket', 50000, 2, 2, 'disetujui'],
      ],
    )
  })

  it('tanpa sisa satuan, hanya baris paket', () => {
    const rows = mergeReviewedRows([row({ id: 'a', qty: 2 })], {
      a: [{ ruleName: 'Paket 2', bundlePrice: 50000, bundlePcs: 2, qty: 2 }],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].priceType, 'paket')
  })

  it('tanpa data paket: satuan berharga katalog, ditolak tanpa harga', () => {
    const [ok] = mergeReviewedRows([row({})], {})
    assert.equal(ok.priceType, 'satuan')
    assert.equal(ok.price, 30000)
    const [no] = mergeReviewedRows([row({ status: 'disanggah' })], {})
    assert.equal(no.price, null)
    // Sudah ditagih: tidak ada data harga.
    const [inv] = mergeReviewedRows([row({})])
    assert.equal(inv.price, null)
  })

  it('membawa stok varian ke baris gabungan', () => {
    const [m] = mergeReviewedRows([
      row({ id: 'a', qty: 1, stock: 7 }),
      row({ id: 'b', kind: 'komponen', qty: 1, stock: 7 }),
    ])
    assert.equal(m.stock, 7)
  })

  it('total harga baris: satuan = pcs x harga, paket = pcs x harga paket / pcs per paket', () => {
    const rows = mergeReviewedRows(
      [row({ id: 'a', qty: 5, unitPrice: 30000 })],
      { a: [{ ruleName: 'Paket 2', bundlePrice: 100000, bundlePcs: 2, qty: 4 }] },
    )
    const satuan = rows.find((r) => r.priceType === 'satuan')!
    const paket = rows.find((r) => r.priceType === 'paket')!
    assert.equal(satuan.total, 30000)
    assert.equal(paket.total, 200000)
    assert.equal(paket.bundlePcs, 2)
  })

  it('paket campur produk: harga paket dibagi rata per pcs', () => {
    // Paket 100K berisi 2 pcs; barang ini hanya 1 pcs di dalamnya.
    const [paket] = mergeReviewedRows([row({ id: 'a', qty: 1 })], {
      a: [{ ruleName: 'Paket 2', bundlePrice: 100000, bundlePcs: 2, qty: 1 }],
    })
    assert.equal(paket.total, 50000)
  })

  it('tanpa harga (belum ditagih/diketahui): total kosong', () => {
    const [m] = mergeReviewedRows([row({ id: 'a', qty: 2 })])
    assert.equal(m.total, null)
  })
})
