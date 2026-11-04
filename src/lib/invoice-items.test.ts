import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildInvoiceBlocks, type InvoiceItemInput } from './invoice-items'

const single: InvoiceItemInput = {
  id: 's1', name: 'Bib Bayi Katun', qty: 1, originalPrice: '15000', fee: '0', isBundle: false, components: [],
}
const bundle: InvoiceItemInput = {
  id: 'b1', name: 'Set A + Set B + Topi', qty: 1, originalPrice: '80000', fee: '10000', isBundle: true,
  components: [
    { id: 'c1', productName: 'Set Piyama', size: 'Newborn', variation: 'Pink', qty: 1 },
    { id: 'c2', productName: 'Set Piyama', size: 'Newborn', variation: 'Biru', qty: 1 },
    { id: 'c3', productName: 'Topi Bayi', size: null, variation: 'Rajut', qty: 2 },
  ],
}

describe('buildInvoiceBlocks', () => {
  it('barang satuan selalu di atas, lalu paket', () => {
    const blocks = buildInvoiceBlocks([bundle, single])
    assert.deepEqual(blocks.map((b) => b.kind), ['single', 'bundle'])
  })

  it('baris paket hanya berisi komponen tanpa harga', () => {
    const blocks = buildInvoiceBlocks([bundle])
    const block = blocks[0]
    assert.equal(block.kind, 'bundle')
    if (block.kind !== 'bundle') return
    assert.deepEqual(block.lines.map((l) => l.text), [
      '1× Set Piyama (Newborn / Pink)',
      '1× Set Piyama (Newborn / Biru)',
      '2× Topi Bayi (Rajut)',
    ])
    for (const line of block.lines) {
      assert.equal(line.text.includes('Rp'), false)
    }
  })
})
