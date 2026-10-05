import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AVATAR_MAX_BYTES,
  detectAvatarContentType,
  parseAvatarDataUrl,
} from './avatar-validation'

function toDataUrl(type: string, bytes: Array<number>) {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
}

// "RIFF" + ukuran + "WEBP" + sedikit isi.
const WEBP = [
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 1, 2,
  3, 4,
]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test('detectAvatarContentType mengenali WebP dan JPEG dari isi file', () => {
  assert.equal(detectAvatarContentType(Uint8Array.from(WEBP)), 'image/webp')
  assert.equal(detectAvatarContentType(Uint8Array.from(JPEG)), 'image/jpeg')
  assert.equal(detectAvatarContentType(Uint8Array.from(PNG)), null)
  assert.equal(detectAvatarContentType(new Uint8Array(0)), null)
})

test('parseAvatarDataUrl menerima WebP dan JPEG yang valid', () => {
  const webp = parseAvatarDataUrl(toDataUrl('image/webp', WEBP))
  assert.equal(webp.contentType, 'image/webp')
  assert.deepEqual(Array.from(webp.bytes), WEBP)

  const jpeg = parseAvatarDataUrl(toDataUrl('image/jpeg', JPEG))
  assert.equal(jpeg.contentType, 'image/jpeg')
})

test('parseAvatarDataUrl menolak tipe selain WebP/JPEG', () => {
  assert.throws(() => parseAvatarDataUrl(toDataUrl('image/png', PNG)))
  assert.throws(() => parseAvatarDataUrl(toDataUrl('image/svg+xml', [60, 115])))
  assert.throws(() => parseAvatarDataUrl('https://example.com/a.webp'))
  assert.throws(() => parseAvatarDataUrl(''))
})

test('parseAvatarDataUrl menolak label tipe yang tidak cocok dengan isi file', () => {
  // Mengaku WebP tapi isinya JPEG, dan sebaliknya.
  assert.throws(() => parseAvatarDataUrl(toDataUrl('image/webp', JPEG)))
  assert.throws(() => parseAvatarDataUrl(toDataUrl('image/jpeg', WEBP)))
  // Mengaku JPEG tapi isinya teks/HTML.
  assert.throws(() =>
    parseAvatarDataUrl(
      toDataUrl(
        'image/jpeg',
        Array.from(Buffer.from('<script>alert(1)</script>')),
      ),
    ),
  )
})

test('parseAvatarDataUrl menolak base64 rusak dan data kosong', () => {
  assert.throws(() => parseAvatarDataUrl('data:image/webp;base64,@@@@'))
  assert.throws(() => parseAvatarDataUrl('data:image/webp;base64,'))
})

test('parseAvatarDataUrl menolak foto lebih dari 100 KB', () => {
  const big = [...WEBP, ...new Array(AVATAR_MAX_BYTES).fill(7)]
  assert.throws(() => parseAvatarDataUrl(toDataUrl('image/webp', big)), /besar/)

  // Tepat di batas masih boleh.
  const atLimit = [
    ...WEBP,
    ...new Array(AVATAR_MAX_BYTES - WEBP.length).fill(7),
  ]
  assert.equal(atLimit.length, AVATAR_MAX_BYTES)
  assert.equal(
    parseAvatarDataUrl(toDataUrl('image/webp', atLimit)).bytes.length,
    AVATAR_MAX_BYTES,
  )
})
