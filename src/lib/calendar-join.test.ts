import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildJoinedEventDescription,
  buildJoinedEventValues,
  isCalendarEventJoinable,
} from './calendar-join'
import { toLocalPhoneNumber } from './format'

test('event bisa diikuti selama belum diakhiri dan tanggal terakhirnya belum lewat', () => {
  const base = { eventDate: '2026-11-20', endDate: '2026-11-22' }
  assert.equal(
    isCalendarEventJoinable({ ...base, isEnded: false }, '2026-11-10'),
    true,
  )
  // Hari terakhir event masih bisa.
  assert.equal(
    isCalendarEventJoinable({ ...base, isEnded: false }, '2026-11-22'),
    true,
  )
  assert.equal(
    isCalendarEventJoinable({ ...base, isEnded: false }, '2026-11-23'),
    false,
  )
  // Diakhiri admin sebelum tanggalnya.
  assert.equal(
    isCalendarEventJoinable({ ...base, isEnded: true }, '2026-11-10'),
    false,
  )
})

test('event sehari memakai tanggal mulai sebagai tanggal terakhir', () => {
  const event = { eventDate: '2026-11-20', endDate: null, isEnded: false }
  assert.equal(isCalendarEventJoinable(event, '2026-11-20'), true)
  assert.equal(isCalendarEventJoinable(event, '2026-11-21'), false)
})

test('deskripsi event belanja memuat lokasi lalu deskripsi asli', () => {
  assert.equal(
    buildJoinedEventDescription({
      location: ' Gudang Brand, Makassar ',
      description: ' Diskon besar. ',
    }),
    'Lokasi: Gudang Brand, Makassar\n\nDiskon besar.',
  )
  assert.equal(
    buildJoinedEventDescription({ location: 'Online', description: null }),
    'Lokasi: Online',
  )
  assert.equal(
    buildJoinedEventDescription({ location: '  ', description: '  ' }),
    '',
  )
})

test('nilai event belanja: nama, deskripsi, dan tanggal mulai event kalender', () => {
  const values = buildJoinedEventValues({
    name: 'Cuci Gudang Akhir Tahun',
    location: 'Gudang Brand, Makassar',
    eventDate: '2026-11-20',
    endDate: '2026-11-22',
    isOnline: false,
    description: null,
  })
  assert.equal(values.name, 'Cuci Gudang Akhir Tahun')
  assert.equal(values.description, 'Lokasi: Gudang Brand, Makassar')
  assert.equal(values.eventDate.toISOString(), '2026-11-20T00:00:00.000Z')
})

test('toLocalPhoneNumber menyeragamkan nomor ke format lokal 08...', () => {
  assert.equal(toLocalPhoneNumber('+62 853-9735-6608'), '085397356608')
  assert.equal(toLocalPhoneNumber('6285397356608'), '085397356608')
  assert.equal(toLocalPhoneNumber('85397356608'), '085397356608')
  assert.equal(toLocalPhoneNumber('0853 9735 6608'), '085397356608')
  assert.equal(toLocalPhoneNumber(''), '')
  assert.equal(toLocalPhoneNumber(null), '')
})
