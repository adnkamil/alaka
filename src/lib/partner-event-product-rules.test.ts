import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_EVENT_PRODUCTS,
  selectableProducts,
  toggleSelection,
} from './partner-event-product-rules.ts'

const products = [
  { id: 'a', isActive: true },
  { id: 'b', isActive: false },
  { id: 'c', isActive: false },
]

test('produk nonaktif hanya muncul kalau sudah dipilih', () => {
  assert.deepEqual(
    selectableProducts(products, new Set()).map((p) => p.id),
    ['a'],
  )
  assert.deepEqual(
    selectableProducts(products, new Set(['b'])).map((p) => p.id),
    ['a', 'b'],
  )
})

test('toggleSelection menambah/melepas tanpa mengubah himpunan asli', () => {
  const base = new Set(['a'])
  const added = toggleSelection(base, 'b')
  assert.deepEqual([...added].sort(), ['a', 'b'])
  assert.deepEqual([...base], ['a'])
  assert.deepEqual([...toggleSelection(added, 'a')], ['b'])
})

test('batas produk unggulan per event', () => {
  assert.equal(MAX_EVENT_PRODUCTS, 6)
})
