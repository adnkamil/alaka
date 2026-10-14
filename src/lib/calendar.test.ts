import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMonthGrid,
  daysInMonth,
  formatLongDate,
  groupByDate,
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
