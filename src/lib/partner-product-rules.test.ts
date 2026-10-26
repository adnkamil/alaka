import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRODUCT_PRICE_MAX,
  parseRupiah,
  partnerProductPhotoUrl,
} from './partner-product-rules.ts'

test('parseRupiah menerima angka polos dan pemisah ribuan titik', () => {
  assert.equal(parseRupiah('189000'), 189000)
  assert.equal(parseRupiah('189.000'), 189000)
  assert.equal(parseRupiah('Rp189.000'), 189000)
  assert.equal(parseRupiah(' Rp 1.250.000 '), 1250000)
  assert.equal(parseRupiah('0'), 0)
})

test('parseRupiah menolak desimal, negatif, dan format salah', () => {
  for (const bad of [
    '',
    'abc',
    '1.5',
    '12.34',
    '1,5',
    '-100',
    '1.2345',
    'Rp',
  ]) {
    assert.equal(parseRupiah(bad), null, bad)
  }
})

test('parseRupiah menolak nilai di atas batas', () => {
  assert.equal(parseRupiah(String(PRODUCT_PRICE_MAX)), PRODUCT_PRICE_MAX)
  assert.equal(parseRupiah(String(PRODUCT_PRICE_MAX + 1)), null)
})

test('URL foto produk memakai versi dari photoUpdatedAt, null kalau belum ada foto', () => {
  assert.equal(partnerProductPhotoUrl('id1', null), null)
  const url = partnerProductPhotoUrl('id1', new Date(1700000000000))
  assert.equal(url, '/api/partner-product-photo/id1?v=1700000000000')
})
