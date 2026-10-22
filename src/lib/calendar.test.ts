import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMonthGrid,
  calendarBannerSrc,
  daysInMonth,
  formatLongDate,
  groupByDate,
  isCalendarDetailPath,
  daysBetweenIso,
  eventEndDate,
  formatDateRange,
  isCalendarEventFinished,
  isCalendarEventWithinDays,
  monthRange,
  shiftMonth,
} from './calendar'

test('shiftMonth melewati batas tahun ke dua arah', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftMonth('2026-10', 0), '2026-10')
  assert.equal(shiftMonth('2026-10', 14), '2027-12')
})

test('daysInMonth benar untuk Februari kabisat dan biasa', () => {
  assert.equal(daysInMonth('2024-02'), 29)
  assert.equal(daysInMonth('2026-02'), 28)
  assert.equal(daysInMonth('2026-10'), 31)
  assert.equal(daysInMonth('2026-11'), 30)
})

test('monthRange mengembalikan tanggal pertama dan terakhir', () => {
  assert.deepEqual(monthRange('2026-02'), {
    start: '2026-02-01',
    end: '2026-02-28',
  })
})

test('buildMonthGrid mulai dari Senin dan kelipatan 7', () => {
  // 1 Oktober 2026 = Kamis -> 3 sel kosong di depan (Sen, Sel, Rab).
  const grid = buildMonthGrid('2026-10')
  assert.equal(grid.length % 7, 0)
  assert.deepEqual(grid.slice(0, 4), [null, null, null, '2026-10-01'])
  assert.equal(grid.filter((cell) => cell !== null).length, 31)
  assert.equal(grid.filter((cell) => cell !== null).at(-1), '2026-10-31')

  // 1 Juni 2026 = Senin -> tidak ada sel kosong di depan.
  assert.equal(buildMonthGrid('2026-06')[0], '2026-06-01')
  // 1 November 2026 = Minggu -> 6 sel kosong di depan.
  assert.equal(buildMonthGrid('2026-11').indexOf('2026-11-01'), 6)
})

test('parseMonthKey menolak format yang salah', () => {
  assert.throws(() => daysInMonth('2026-13'))
  assert.throws(() => daysInMonth('2026-1'))
})

test('formatLongDate memakai nama hari dan bulan Indonesia', () => {
  assert.equal(formatLongDate('2026-10-14'), 'Rabu, 14 Oktober 2026')
})

test('groupByDate mengelompokkan per tanggal', () => {
  const grouped = groupByDate([
    { eventDate: '2026-10-14', name: 'a' },
    { eventDate: '2026-10-15', name: 'b' },
    { eventDate: '2026-10-14', name: 'c' },
  ])
  assert.deepEqual(
    grouped.get('2026-10-14')?.map((row) => row.name),
    ['a', 'c'],
  )
  assert.equal(grouped.get('2026-10-15')?.length, 1)
  assert.equal(grouped.get('2026-10-16'), undefined)
})

test('isCalendarDetailPath hanya true untuk halaman detail', () => {
  assert.equal(isCalendarDetailPath('/kalender'), false)
  assert.equal(isCalendarDetailPath('/kalender/'), false)
  assert.equal(isCalendarDetailPath('/kalender/abc-123'), true)
  assert.equal(isCalendarDetailPath('/kalender/abc-123/'), true)
  assert.equal(isCalendarDetailPath('/keuangan'), false)
})

test('calendarBannerSrc null tanpa banner, versi dari waktu penggantian', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  assert.equal(calendarBannerSrc(id, null), null)
  assert.equal(
    calendarBannerSrc(id, new Date('2026-10-14T00:00:00.000Z')),
    `/api/event-banner/${id}?v=1791936000000`,
  )
})

test('daysBetweenIso menghitung selisih hari lintas bulan dan tahun', () => {
  assert.equal(daysBetweenIso('2026-10-22', '2026-10-22'), 0)
  assert.equal(daysBetweenIso('2026-10-22', '2026-10-29'), 7)
  assert.equal(daysBetweenIso('2026-10-29', '2026-10-22'), -7)
  assert.equal(daysBetweenIso('2026-12-30', '2027-01-02'), 3)
})

test('eventEndDate: event sehari berakhir di tanggal mulainya', () => {
  assert.equal(
    eventEndDate({ eventDate: '2026-11-20', endDate: null }),
    '2026-11-20',
  )
  assert.equal(
    eventEndDate({ eventDate: '2026-11-20', endDate: '2026-11-22' }),
    '2026-11-22',
  )
})

test('isCalendarEventFinished: berjalan sampai 23.59 di tanggal terakhir', () => {
  const event = {
    eventDate: '2026-10-23',
    endDate: '2026-10-25',
    isEnded: false,
  }
  // Hari terakhir (25) masih berjalan; baru selesai begitu tanggal WIB jadi 26.
  assert.equal(isCalendarEventFinished(event, '2026-10-22'), false)
  assert.equal(isCalendarEventFinished(event, '2026-10-24'), false)
  assert.equal(isCalendarEventFinished(event, '2026-10-25'), false)
  assert.equal(isCalendarEventFinished(event, '2026-10-26'), true)
})

test('isCalendarEventFinished: event sehari dan penutupan manual', () => {
  const oneDay = { eventDate: '2026-10-22', endDate: null, isEnded: false }
  assert.equal(isCalendarEventFinished(oneDay, '2026-10-22'), false)
  assert.equal(isCalendarEventFinished(oneDay, '2026-10-23'), true)
  // Diakhiri admin: selesai walau tanggal terakhirnya masih di depan.
  assert.equal(
    isCalendarEventFinished(
      { eventDate: '2026-10-23', endDate: '2026-10-30', isEnded: true },
      '2026-10-22',
    ),
    true,
  )
})

test('isCalendarEventWithinDays: event yang sudah mulai tapi belum selesai ikut terhitung', () => {
  const today = '2026-10-22'
  // Mulai kemarin, selesai 2 hari lagi -> sedang berlangsung, masuk filter 7 hari.
  assert.equal(
    isCalendarEventWithinDays(
      { eventDate: '2026-10-21', endDate: '2026-10-24' },
      today,
      7,
    ),
    true,
  )
  // Mulai di batas 7 hari masuk, 8 hari tidak.
  assert.equal(
    isCalendarEventWithinDays(
      { eventDate: '2026-10-29', endDate: null },
      today,
      7,
    ),
    true,
  )
  assert.equal(
    isCalendarEventWithinDays(
      { eventDate: '2026-10-30', endDate: null },
      today,
      7,
    ),
    false,
  )
  // Hari terakhir adalah hari ini -> masih terhitung; kemarin -> tidak.
  assert.equal(
    isCalendarEventWithinDays(
      { eventDate: '2026-10-20', endDate: '2026-10-22' },
      today,
      7,
    ),
    true,
  )
  assert.equal(
    isCalendarEventWithinDays(
      { eventDate: '2026-10-20', endDate: '2026-10-21' },
      today,
      7,
    ),
    false,
  )
  // Event panjang yang mulai 10 hari lagi tetap di luar filter 7 hari.
  assert.equal(
    isCalendarEventWithinDays(
      { eventDate: '2026-11-01', endDate: '2026-11-05' },
      today,
      7,
    ),
    false,
  )
})

test('formatDateRange: sehari format panjang, beberapa hari format ringkas', () => {
  assert.equal(formatDateRange('2026-10-14', null), 'Rabu, 14 Oktober 2026')
  assert.equal(
    formatDateRange('2026-10-14', '2026-10-14'),
    'Rabu, 14 Oktober 2026',
  )
  assert.equal(formatDateRange('2026-11-20', '2026-11-22'), '20 – 22 Nov 2026')
  assert.equal(
    formatDateRange('2026-10-28', '2026-11-02'),
    '28 Okt – 2 Nov 2026',
  )
  assert.equal(
    formatDateRange('2026-12-30', '2027-01-02'),
    '30 Des 2026 – 2 Jan 2027',
  )
})
