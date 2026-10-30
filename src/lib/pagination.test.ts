import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  clampPage,
  pageCount,
  pageOffset,
  pageParamsSchema,
  pageRange,
  parsePageInput,
} from './pagination.ts'

describe('pageCount', () => {
  it('membulatkan ke atas dan minimal 1', () => {
    assert.equal(pageCount(0, 10), 1)
    assert.equal(pageCount(1, 10), 1)
    assert.equal(pageCount(10, 10), 1)
    assert.equal(pageCount(11, 10), 2)
    assert.equal(pageCount(1610, 10), 161)
  })
})

describe('clampPage', () => {
  it('membatasi ke 1..halaman terakhir', () => {
    assert.equal(clampPage(0, 25, 10), 1)
    assert.equal(clampPage(-3, 25, 10), 1)
    assert.equal(clampPage(2, 25, 10), 2)
    assert.equal(clampPage(9, 25, 10), 3)
    assert.equal(clampPage(5, 0, 10), 1)
    assert.equal(clampPage(Number.NaN, 25, 10), 1)
  })
})

describe('pageOffset & pageRange', () => {
  it('menghitung offset dan rentang tampil', () => {
    assert.equal(pageOffset(1, 10), 0)
    assert.equal(pageOffset(3, 20), 40)
    assert.deepEqual(pageRange(1, 10, 25), { from: 1, to: 10 })
    assert.deepEqual(pageRange(3, 10, 25), { from: 21, to: 25 })
    assert.deepEqual(pageRange(1, 10, 0), { from: 0, to: 0 })
  })
})

describe('parsePageInput', () => {
  it('menerima angka bulat positif dan membatasi ke halaman terakhir', () => {
    assert.equal(parsePageInput('3', 10), 3)
    assert.equal(parsePageInput(' 7 ', 10), 7)
    assert.equal(parsePageInput('99', 10), 10)
  })
  it('menolak isian kosong, nol, desimal, dan bukan angka', () => {
    assert.equal(parsePageInput('', 10), null)
    assert.equal(parsePageInput('0', 10), null)
    assert.equal(parsePageInput('2.5', 10), null)
    assert.equal(parsePageInput('abc', 10), null)
    assert.equal(parsePageInput('-1', 10), null)
  })
})

describe('pageParamsSchema', () => {
  it('menerima halaman dan ukuran yang wajar', () => {
    assert.ok(pageParamsSchema.safeParse({ page: 1, pageSize: 10 }).success)
  })
  it('menolak halaman 0, ukuran terlalu besar, dan pecahan', () => {
    assert.ok(!pageParamsSchema.safeParse({ page: 0, pageSize: 10 }).success)
    assert.ok(!pageParamsSchema.safeParse({ page: 1, pageSize: 101 }).success)
    assert.ok(!pageParamsSchema.safeParse({ page: 1.5, pageSize: 10 }).success)
  })
})

describe('konstanta', () => {
  it('ukuran default ada di daftar pilihan', () => {
    assert.ok(
      (PAGE_SIZE_OPTIONS as ReadonlyArray<number>).includes(DEFAULT_PAGE_SIZE),
    )
  })
})
