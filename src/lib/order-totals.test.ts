import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { billableQty, lineTotal, summarizeItems, totalUnits } from './order-totals'

describe('barang disanggah tidak dihitung', () => {
  const approved = { originalPrice: 30_000, fee: 4_000, qty: 2, submitStatus: 'disetujui' }
  const pending = { originalPrice: 30_000, fee: 4_000, qty: 1, submitStatus: 'pengajuan' }
  const rejected = { originalPrice: 30_000, fee: 4_000, qty: 3, submitStatus: 'disanggah' }

  it('billableQty 0 untuk disanggah, qty asli untuk status lain', () => {
    assert.equal(billableQty(rejected), 0)
    assert.equal(billableQty(approved), 2)
    assert.equal(billableQty(pending), 1)
    assert.equal(billableQty({ qty: 4, submitStatus: null }), 4)
  })

  it('lineTotal barang disanggah = 0', () => {
    assert.equal(lineTotal(rejected), 0)
    assert.equal(lineTotal(approved), 68_000)
  })

  it('summarizeItems mengabaikan barang disanggah', () => {
    const s = summarizeItems([approved, pending, rejected])
    assert.equal(s.subtotal, 90_000)
    assert.equal(s.totalFee, 12_000)
    assert.equal(s.total, 102_000)
  })

  it('totalUnits tidak menghitung barang disanggah', () => {
    assert.equal(totalUnits([approved, pending, rejected]), 3)
  })

  it('tanpa status submit, perhitungan tetap seperti sebelumnya', () => {
    const plain = { originalPrice: 10_000, fee: 0, qty: 5 }
    assert.equal(summarizeItems([plain]).total, 50_000)
    assert.equal(totalUnits([plain]), 5)
  })
})
