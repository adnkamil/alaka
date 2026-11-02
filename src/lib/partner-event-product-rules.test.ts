import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SHOWCASE_PREVIEW_COUNT,
  deselectMany,
  selectMany,
  selectableProducts,
  selectionState,
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

test('selectMany mencentang semua tanpa batas jumlah dan tanpa mengubah aslinya', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `p${i}`)
  const base = new Set(['x'])
  const next = selectMany(base, ids)
  assert.equal(next.size, 51)
  assert.ok(next.has('x'))
  assert.deepEqual([...base], ['x'])
})

test('deselectMany hanya melepas id yang diminta', () => {
  const base = new Set(['a', 'b', 'c'])
  assert.deepEqual([...deselectMany(base, ['a', 'c'])], ['b'])
  assert.equal(base.size, 3)
})

test('selectionState membedakan none / some / all', () => {
  assert.equal(selectionState(new Set(), []), 'none')
  assert.equal(selectionState(new Set(['a']), []), 'none')
  assert.equal(selectionState(new Set(), ['a', 'b']), 'none')
  assert.equal(selectionState(new Set(['a']), ['a', 'b']), 'some')
  assert.equal(selectionState(new Set(['a', 'b', 'z']), ['a', 'b']), 'all')
})

test('etalase jastiper menampilkan 6 produk dulu', () => {
  assert.equal(SHOWCASE_PREVIEW_COUNT, 6)
})
