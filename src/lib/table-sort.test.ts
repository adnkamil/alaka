import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextSort, sortRows } from './table-sort'

describe('nextSort', () => {
  it('memutar asc → desc → normal', () => {
    const a = nextSort(null, 'name')
    assert.deepEqual(a, { key: 'name', dir: 'asc' })
    const b = nextSort(a, 'name')
    assert.deepEqual(b, { key: 'name', dir: 'desc' })
    assert.equal(nextSort(b, 'name'), null)
  })

  it('kolom lain mulai lagi dari asc', () => {
    assert.deepEqual(nextSort({ key: 'name', dir: 'desc' }, 'price'), {
      key: 'price',
      dir: 'asc',
    })
  })
})

describe('sortRows', () => {
  const rows = [
    { name: 'b', n: 10 as number | null },
    { name: 'A', n: null },
    { name: 'c', n: 2 },
  ]
  const getters = { name: (r: (typeof rows)[number]) => r.name, n: (r: (typeof rows)[number]) => r.n }

  it('tanpa sort mengembalikan urutan asli', () => {
    assert.deepEqual(sortRows(rows, null, getters), rows)
  })

  it('angka diurutkan sebagai angka, kosong selalu di bawah', () => {
    assert.deepEqual(sortRows(rows, { key: 'n', dir: 'asc' }, getters).map((r) => r.n), [2, 10, null])
    assert.deepEqual(sortRows(rows, { key: 'n', dir: 'desc' }, getters).map((r) => r.n), [10, 2, null])
  })

  it('teks tidak peka huruf besar/kecil dan tidak mengubah array asli', () => {
    const sorted = sortRows(rows, { key: 'name', dir: 'asc' }, getters)
    assert.deepEqual(sorted.map((r) => r.name), ['A', 'b', 'c'])
    assert.deepEqual(rows.map((r) => r.name), ['b', 'A', 'c'])
  })
})
