import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calendarEventFieldsSchema,
  isRealIsoDate,
  normalizeExhibitors,
} from './calendar-event-input'

const valid = {
  name: ' Bazar Jastip ',
  location: 'Makassar',
  eventDate: '2026-10-20',
  description: '',
  exhibitors: ['COSRX'],
}

test('isRealIsoDate menolak tanggal yang tidak ada', () => {
  assert.equal(isRealIsoDate('2026-10-20'), true)
  assert.equal(isRealIsoDate('2024-02-29'), true)
  assert.equal(isRealIsoDate('2026-02-29'), false)
  assert.equal(isRealIsoDate('2026-02-31'), false)
  assert.equal(isRealIsoDate('2026-13-01'), false)
  assert.equal(isRealIsoDate('2026-1-1'), false)
  assert.equal(isRealIsoDate(''), false)
})

test('normalizeExhibitors merapikan spasi, kosong, dan duplikat', () => {
  assert.deepEqual(
    normalizeExhibitors([
      '  COSRX ',
      'cosrx',
      '',
      '   ',
      'Hada   Labo',
      'COSRX',
    ]),
    ['COSRX', 'Hada Labo'],
  )
})

test('calendarEventFieldsSchema merapikan nama dan menerima input valid', () => {
  const parsed = calendarEventFieldsSchema.parse(valid)
  assert.equal(parsed.name, 'Bazar Jastip')
})

test('calendarEventFieldsSchema menolak nama/lokasi kosong dan tanggal salah', () => {
  assert.equal(
    calendarEventFieldsSchema.safeParse({ ...valid, name: '   ' }).success,
    false,
  )
  assert.equal(
    calendarEventFieldsSchema.safeParse({ ...valid, location: '' }).success,
    false,
  )
  assert.equal(
    calendarEventFieldsSchema.safeParse({ ...valid, eventDate: '2026-02-31' })
      .success,
    false,
  )
})

test('calendarEventFieldsSchema membatasi jumlah dan panjang brand', () => {
  assert.equal(
    calendarEventFieldsSchema.safeParse({
      ...valid,
      exhibitors: Array.from({ length: 31 }, (_, i) => `Brand ${i}`),
    }).success,
    false,
  )
  assert.equal(
    calendarEventFieldsSchema.safeParse({
      ...valid,
      exhibitors: ['x'.repeat(61)],
    }).success,
    false,
  )
})
