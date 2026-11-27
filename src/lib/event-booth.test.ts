import assert from 'node:assert/strict'
import test from 'node:test'
import {
  boothNeighbors,
  normalizeBoothText,
  searchBooths,
} from './event-booth'
import type { EventBooth } from './event-booth'

const booths: EventBooth[] = [
  { code: 'M-A01', brand: 'MOOIMOM', area: 'Main Lobby' },
  { code: 'S-B22', brand: 'MOOI HEARTMADE', area: 'Assembly Hall' },
  { code: 'A-M07', brand: 'MORINAGA', area: 'Hall A' },
  { code: 'S-B33', brand: 'GRANDVILLE', area: 'Assembly Hall' },
  { code: 'S-C21', brand: "DR TEAL'S", area: 'Assembly Hall' },
  { code: 'A-L22', brand: "DR TEAL'S", area: 'Hall A' },
  { code: 'S-C21', brand: 'MUSTELA', area: 'Assembly Hall' },
  { code: 'ED09', brand: 'KIPINÄ KIDS VILLA KEMANG', area: 'Hall B' },
  { code: 'C-H09', brand: 'SUCVENT', area: 'Cendrawasih Hall' },
]

const brands = (q: string) => searchBooths(booths, q).map((b) => b.brand)

test('normalizeBoothText membuang spasi, tanda baca, aksen, huruf besar', () => {
  assert.equal(normalizeBoothText("Dr. Teal's"), 'drteals')
  assert.equal(normalizeBoothText('Kipinä'), 'kipina')
  assert.equal(normalizeBoothText('A-M07'), 'am07')
})

test('kata kunci kosong tidak mengembalikan apa-apa', () => {
  assert.deepEqual(searchBooths(booths, '  '), [])
  assert.deepEqual(searchBooths(booths, '-'), [])
})

test('cari brand tanpa peduli spasi dan huruf besar', () => {
  assert.deepEqual(brands('mooi mom'), ['MOOIMOM'])
  assert.deepEqual(brands('drteals'), ["DR TEAL'S", "DR TEAL'S"])
  assert.deepEqual(brands('kipina'), ['KIPINÄ KIDS VILLA KEMANG'])
})

test('brand diawali kata kunci tampil sebelum yang hanya memuat', () => {
  assert.deepEqual(brands('mo'), ['MOOI HEARTMADE', 'MOOIMOM', 'MORINAGA'])
  assert.deepEqual(brands('villa'), ['KIPINÄ KIDS VILLA KEMANG'])
})

test('cari berdasarkan kode booth', () => {
  assert.deepEqual(brands('a-m07'), ['MORINAGA'])
  assert.deepEqual(brands('SC21'), ["DR TEAL'S", 'MUSTELA'])
})

test('kode booth tidak dicocokkan di tengah', () => {
  // "09" ada di tengah "ED09" dan "C-H09", tapi bukan awalan.
  assert.deepEqual(brands('09'), [])
})

test('boothNeighbors: brand lain di booth yang sama', () => {
  const teal = booths[4]
  assert.deepEqual(boothNeighbors(booths, teal), ['MUSTELA'])
  assert.deepEqual(boothNeighbors(booths, booths[0]), [])
})
