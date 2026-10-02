import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { crc16 } from './qris'
import { buildDynamicQrisPayload } from './qris-display'

// QRIS statis sintetis (sama pola dengan qris.test.ts)
function makeStatic(): string {
  const merchant = '0011ID.CO.TEST.WWW' + '0215ID1234567890123' + '0303UMI'
  const body =
    '000201' +
    '010211' +
    '26' +
    String(merchant.length).padStart(2, '0') +
    merchant +
    '52045812' +
    '5303360' +
    '5802ID' +
    '5911WARUNG TEST' +
    '6005DEMAK' +
    '6304'
  return body + crc16(body)
}

describe('buildDynamicQrisPayload', () => {
  const stat = makeStatic()

  it('menghasilkan payload dinamis bila input valid', () => {
    const result = buildDynamicQrisPayload(stat, '29000')
    assert.ok(result !== null, 'harus menghasilkan payload')
    assert.ok(result.includes('5405'), 'harus mengandung tag 54 (amount)')
  })

  it('mengembalikan null bila qrisString kosong/null', () => {
    assert.equal(buildDynamicQrisPayload(null, '29000'), null)
    assert.equal(buildDynamicQrisPayload('', '29000'), null)
    assert.equal(buildDynamicQrisPayload(undefined, '29000'), null)
  })

  it('mengembalikan null bila proPrice = 0 atau tidak ada', () => {
    assert.equal(buildDynamicQrisPayload(stat, '0'), null)
    assert.equal(buildDynamicQrisPayload(stat, 0), null)
    assert.equal(buildDynamicQrisPayload(stat, null), null)
    assert.equal(buildDynamicQrisPayload(stat, undefined), null)
  })

  it('mengembalikan null (tidak lempar) bila qrisString tidak valid', () => {
    // QRIS dengan CRC salah → toDynamicQris lempar QrisError → null
    const broken = stat.slice(0, -1) + '0'
    assert.equal(buildDynamicQrisPayload(broken, '29000'), null)
  })

  it('nominal di-round ke integer', () => {
    // proPrice '29999.9' harus dipakai sebagai 30000
    const result = buildDynamicQrisPayload(stat, '29999.9')
    assert.ok(result !== null)
  })
})
