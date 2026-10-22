import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calendarEventFieldsSchema,
  isEndDateValid,
  isRealIsoDate,
  normalizeEndDate,
  normalizeExhibitors,
} from './calendar-event-input'

const valid = {
  name: ' Bazar Jastip ',
  location: 'Makassar',
  eventDate: '2026-10-20',
  endDate: null,
  isOnline: false,
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

test('calendarEventFieldsSchema mewajibkan isOnline bertipe boolean', () => {
  assert.equal(
    calendarEventFieldsSchema.parse({ ...valid, isOnline: true }).isOnline,
    true,
  )
  const { isOnline: _omit, ...withoutFlag } = valid
  assert.equal(calendarEventFieldsSchema.safeParse(withoutFlag).success, false)
  assert.equal(
    calendarEventFieldsSchema.safeParse({ ...valid, isOnline: 'true' }).success,
    false,
  )
})

test('isEndDateValid: kosong atau sama/setelah tanggal mulai valid', () => {
  assert.equal(isEndDateValid('2026-10-23', null), true)
  assert.equal(isEndDateValid('2026-10-23', ''), true)
  assert.equal(isEndDateValid('2026-10-23', '2026-10-23'), true)
  assert.equal(isEndDateValid('2026-10-23', '2026-10-25'), true)
  assert.equal(isEndDateValid('2026-10-23', '2026-10-22'), false)
  // Lintas bulan dan tahun dibandingkan sebagai tanggal, bukan angka hari.
  assert.equal(isEndDateValid('2026-10-31', '2026-11-01'), true)
  assert.equal(isEndDateValid('2026-12-31', '2027-01-01'), true)
  assert.equal(isEndDateValid('2027-01-01', '2026-12-31'), false)
})

test('normalizeEndDate: sehari disimpan sebagai null', () => {
  assert.equal(normalizeEndDate('2026-10-23', null), null)
  assert.equal(normalizeEndDate('2026-10-23', ''), null)
  assert.equal(normalizeEndDate('2026-10-23', '2026-10-23'), null)
  assert.equal(normalizeEndDate('2026-10-23', '2026-10-25'), '2026-10-25')
})

test('calendarEventFieldsSchema: endDate null atau tanggal nyata saja', () => {
  assert.equal(
    calendarEventFieldsSchema.parse({ ...valid, endDate: '2026-10-22' })
      .endDate,
    '2026-10-22',
  )
  assert.equal(
    calendarEventFieldsSchema.safeParse({ ...valid, endDate: '2026-02-31' })
      .success,
    false,
  )
  assert.equal(
    calendarEventFieldsSchema.safeParse({ ...valid, endDate: '' }).success,
    false,
  )
  const { endDate: _omit, ...withoutEnd } = valid
  assert.equal(calendarEventFieldsSchema.safeParse(withoutEnd).success, false)
})
