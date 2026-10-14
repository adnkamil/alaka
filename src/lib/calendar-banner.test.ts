import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CALENDAR_BANNER_MAX_BYTES,
  parseCalendarBannerDataUrl,
} from './calendar-banner'
import { computeCoverCrop } from './calendar-banner-image'

function toDataUrl(type: string, bytes: Uint8Array) {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

test('parseCalendarBannerDataUrl menerima WebP dan JPEG yang valid', () => {
  assert.equal(
    parseCalendarBannerDataUrl(toDataUrl('image/webp', WEBP)).contentType,
    'image/webp',
  )
  assert.equal(
    parseCalendarBannerDataUrl(toDataUrl('image/jpeg', JPEG)).contentType,
    'image/jpeg',
  )
})

test('parseCalendarBannerDataUrl menolak tipe yang diklaim tidak sesuai isi', () => {
  assert.throws(() => parseCalendarBannerDataUrl(toDataUrl('image/jpeg', WEBP)))
  assert.throws(() =>
    parseCalendarBannerDataUrl(
      toDataUrl('image/webp', Uint8Array.from([1, 2, 3])),
    ),
  )
})

test('parseCalendarBannerDataUrl menolak format lain dan data rusak', () => {
  assert.throws(() => parseCalendarBannerDataUrl('data:image/png;base64,AAAA'))
  assert.throws(() => parseCalendarBannerDataUrl('bukan data url'))
  assert.throws(() => parseCalendarBannerDataUrl('data:image/webp;base64,'))
})

test('parseCalendarBannerDataUrl menolak file di atas batas ukuran', () => {
  const big = new Uint8Array(CALENDAR_BANNER_MAX_BYTES + 1)
  big.set(WEBP)
  assert.throws(() => parseCalendarBannerDataUrl(toDataUrl('image/webp', big)))

  const exact = new Uint8Array(CALENDAR_BANNER_MAX_BYTES)
  exact.set(WEBP)
  assert.equal(
    parseCalendarBannerDataUrl(toDataUrl('image/webp', exact)).bytes.length,
    CALENDAR_BANNER_MAX_BYTES,
  )
})

test('computeCoverCrop memotong tengah sesuai rasio', () => {
  const ratio = 16 / 9
  // Lebih lebar dari 16:9 -> sisi kiri-kanan dipotong.
  assert.deepEqual(computeCoverCrop(2000, 1000, ratio), {
    sx: 111,
    sy: 0,
    sw: 1777,
    sh: 1000,
  })
  // Persegi -> sisi atas-bawah dipotong.
  assert.deepEqual(computeCoverCrop(1000, 1000, ratio), {
    sx: 0,
    sy: 219,
    sw: 1000,
    sh: 562,
  })
  // Sudah 16:9 -> tidak dipotong.
  assert.deepEqual(computeCoverCrop(1600, 900, ratio), {
    sx: 0,
    sy: 0,
    sw: 1600,
    sh: 900,
  })
})
