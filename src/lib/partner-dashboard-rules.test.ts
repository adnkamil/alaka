import assert from 'node:assert/strict'
import test from 'node:test'
import {
  gainHint,
  matchesSearch,
  relativeDayLabel,
} from './partner-dashboard-rules.ts'

// 28 Okt 2026 10.00 WIB
const now = new Date('2026-10-28T03:00:00Z')

test('hari yang sama (WIB) = hari ini', () => {
  assert.equal(
    relativeDayLabel(new Date('2026-10-28T00:10:00Z'), now),
    'hari ini',
  )
})

test('semalam jam 23.00 WIB tetap kemarin walau < 24 jam', () => {
  assert.equal(
    relativeDayLabel(new Date('2026-10-27T16:00:00Z'), now),
    'kemarin',
  )
})

test('batas hari mengikuti WIB, bukan UTC', () => {
  // 27 Okt 18.00 UTC = 28 Okt 01.00 WIB -> masih hari ini
  assert.equal(
    relativeDayLabel(new Date('2026-10-27T18:00:00Z'), now),
    'hari ini',
  )
})

test('beberapa hari lalu', () => {
  assert.equal(
    relativeDayLabel(new Date('2026-10-26T03:00:00Z'), now),
    '2 hari lalu',
  )
  assert.equal(
    relativeDayLabel(new Date('2026-10-25T03:00:00Z'), now),
    '3 hari lalu',
  )
})

test('lewat 30 hari memakai tanggal pendek', () => {
  assert.equal(relativeDayLabel(new Date('2026-09-01T03:00:00Z'), now), '1 Sep')
})

test('waktu di masa depan tidak negatif', () => {
  assert.equal(
    relativeDayLabel(new Date('2026-10-30T03:00:00Z'), now),
    'hari ini',
  )
})

test('gainHint hanya muncul kalau ada kenaikan', () => {
  assert.equal(gainHint(3, 'bulan ini'), '+3 bulan ini')
  assert.equal(gainHint(0, 'minggu ini'), null)
})

test('matchesSearch: kosong tidak cocok, huruf besar/kecil diabaikan', () => {
  assert.equal(matchesSearch('  ', 'Imbex Fair'), false)
  assert.equal(matchesSearch('imbex', 'Imbex Fair 2026'), true)
  assert.equal(matchesSearch('xyz', 'Imbex', null), false)
  assert.equal(matchesSearch('sku-1', 'Tas', 'SKU-123'), true)
})
