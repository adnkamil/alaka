import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { chunk } from './chunk'

describe('chunk', () => {
  it('memecah sesuai ukuran dan menjaga urutan', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  })

  it('array kosong menghasilkan tanpa potongan', () => {
    assert.deepEqual(chunk([], 3), [])
  })

  it('ukuran lebih besar dari jumlah baris menghasilkan satu potongan', () => {
    assert.deepEqual(chunk([1, 2], 500), [[1, 2]])
  })

  it('menolak ukuran tidak valid', () => {
    assert.throws(() => chunk([1], 0))
    assert.throws(() => chunk([1], 1.5))
  })
})
