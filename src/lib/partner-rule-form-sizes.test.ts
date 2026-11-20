import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bulkToggleSize,
  canAddProduct,
  freeSizes,
  productsMissingSizes,
  sizesUsedByOtherRules,
  toggleSize
  
} from './partner-rule-form-sizes'
import type {FormOtherRule} from './partner-rule-form-sizes';

const shirt = { id: 'shirt', name: 'Kemeja', sizes: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'] }
const shoe = { id: 'shoe', name: 'Sepatu', sizes: ['38', '39', '40'] }
const bag = { id: 'bag', name: 'Tas', sizes: [] }

const rules: Array<FormOtherRule> = [
  { id: 'r100', name: '100K / 3pcs', productIds: ['shirt'], productSizes: { shirt: ['S', 'M', 'L'] } },
  { id: 'r-bag', name: 'Tas 2pcs', productIds: ['bag'], productSizes: {} },
]

describe('sizesUsedByOtherRules', () => {
  it('menandai ukuran yang dipakai aturan lain beserta nama aturannya', () => {
    const used = sizesUsedByOtherRules(rules, 'r110', 'shirt')
    assert.deepEqual([...used.keys()], ['S', 'M', 'L'])
    assert.equal(used.get('M'), '100K / 3pcs')
  })

  it('mengabaikan aturan yang sedang diedit', () => {
    assert.equal(sizesUsedByOtherRules(rules, 'r100', 'shirt').size, 0)
  })
})

describe('freeSizes dan canAddProduct', () => {
  it('produk yang sudah di aturan 100K masih bisa ditambah ke aturan lain untuk XL–XXXL', () => {
    assert.deepEqual(freeSizes(shirt, rules, 'r110'), ['XL', 'XXL', 'XXXL'])
    assert.equal(canAddProduct(shirt, rules, 'r110'), true)
  })

  it('produk yang semua ukurannya terpakai tidak bisa ditambah', () => {
    const all: Array<FormOtherRule> = [
      { id: 'a', name: 'A', productIds: ['shoe'], productSizes: { shoe: ['38', '39', '40'] } },
    ]
    assert.equal(canAddProduct(shoe, all, 'b'), false)
  })

  it('produk tanpa ukuran hanya boleh di satu aturan', () => {
    assert.equal(canAddProduct(bag, rules, 'r110'), false)
    assert.equal(canAddProduct(bag, rules, 'r-bag'), true)
  })
})

describe('toggleSize dan bulkToggleSize', () => {
  it('toggleSize menambah dan melepas', () => {
    assert.deepEqual(toggleSize(undefined, 'XL'), ['XL'])
    assert.deepEqual(toggleSize(['XL', 'XXL'], 'XL'), ['XXL'])
  })

  it('bulk menambah ukuran hanya ke produk yang punya ukuran itu', () => {
    const next = bulkToggleSize({}, [shirt, shoe], [], undefined, 'XL')
    assert.deepEqual(next, { shirt: ['XL'] })
  })

  it('bulk melewati ukuran yang dipakai aturan lain', () => {
    const next = bulkToggleSize({}, [shirt], rules, 'r110', 'M')
    assert.deepEqual(next, {})
  })

  it('bulk melepas ukuran kalau semua produk yang bisa sudah memilihnya', () => {
    const next = bulkToggleSize({ shirt: ['XL', 'XXL'] }, [shirt], [], undefined, 'XL')
    assert.deepEqual(next, { shirt: ['XXL'] })
  })
})

describe('productsMissingSizes', () => {
  it('menandai produk berukuran tanpa ukuran terpilih, bukan produk tanpa ukuran', () => {
    const missing = productsMissingSizes([shirt, shoe, bag], { shirt: ['XL'] })
    assert.deepEqual(missing.map((p) => p.id), ['shoe'])
  })
})
