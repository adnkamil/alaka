import assert from 'node:assert/strict'
import test from 'node:test'
import { partnerEventStatus } from './partner-event-rules.ts'

const today = '2026-10-28'
const ev = (eventDate: string, endDate: string | null, isEnded = false) => ({
  eventDate,
  endDate,
  isEnded,
})

test('event yang belum mulai = mendatang', () => {
  assert.equal(partnerEventStatus(ev('2026-10-29', null), today), 'mendatang')
  assert.equal(
    partnerEventStatus(ev('2026-11-02', '2026-11-15'), today),
    'mendatang',
  )
})

test('event sehari di hari ini = berjalan sampai hari itu berakhir', () => {
  assert.equal(partnerEventStatus(ev('2026-10-28', null), today), 'berjalan')
})

test('event beberapa hari yang sedang lewat tengah = berjalan', () => {
  assert.equal(
    partnerEventStatus(ev('2026-10-26', '2026-10-30'), today),
    'berjalan',
  )
  // Hari terakhirnya adalah hari ini: masih berjalan.
  assert.equal(
    partnerEventStatus(ev('2026-10-26', '2026-10-28'), today),
    'berjalan',
  )
})

test('tanggal terakhir sudah lewat = selesai', () => {
  assert.equal(partnerEventStatus(ev('2026-10-27', null), today), 'selesai')
  assert.equal(
    partnerEventStatus(ev('2026-10-20', '2026-10-27'), today),
    'selesai',
  )
})

test('diakhiri manual = selesai walau tanggalnya belum lewat', () => {
  assert.equal(
    partnerEventStatus(ev('2026-10-26', '2026-11-30', true), today),
    'selesai',
  )
  assert.equal(
    partnerEventStatus(ev('2026-12-01', null, true), today),
    'selesai',
  )
})
