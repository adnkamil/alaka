import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PAYMENT_PROOF_MAX_BYTES,
  detectPaymentProofContentType,
  parsePaymentProofDataUrl,
  paymentProofUrl,
  stripProofData,
} from './payment-proof'

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0]

function dataUrl(mime: string, bytes: Array<number>, padTo = 0) {
  const all = new Uint8Array(Math.max(bytes.length, padTo))
  all.set(bytes)
  return `data:${mime};base64,${Buffer.from(all).toString('base64')}`
}

describe('payment-proof', () => {
  it('mengenali PNG, JPEG, dan WebP dari byte awal', () => {
    assert.equal(
      detectPaymentProofContentType(new Uint8Array(PNG_HEADER)),
      'image/png',
    )
    assert.equal(
      detectPaymentProofContentType(new Uint8Array(JPEG_HEADER)),
      'image/jpeg',
    )
    const webp = new Uint8Array(12)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    assert.equal(detectPaymentProofContentType(webp), 'image/webp')
    assert.equal(detectPaymentProofContentType(new Uint8Array([1, 2, 3])), null)
  })

  it('menerima data URL gambar yang valid', () => {
    const parsed = parsePaymentProofDataUrl(
      dataUrl('image/png', PNG_HEADER, 32),
    )
    assert.equal(parsed.contentType, 'image/png')
    assert.equal(parsed.bytes.length, 32)
  })

  it('menolak label gambar tapi isinya bukan gambar', () => {
    assert.throws(
      () =>
        parsePaymentProofDataUrl(dataUrl('image/png', [0x3c, 0x73, 0x76, 0x67])),
      /PNG, JPEG, atau WEBP/,
    )
  })

  it('menolak format selain PNG/JPEG/WebP', () => {
    assert.throws(
      () => parsePaymentProofDataUrl(dataUrl('image/gif', PNG_HEADER)),
      /PNG, JPEG, atau WEBP/,
    )
    assert.throws(() => parsePaymentProofDataUrl('bukan data url'), /PNG, JPEG/)
  })

  it('menolak file yang lebih besar dari batas', () => {
    assert.throws(
      () =>
        parsePaymentProofDataUrl(
          dataUrl('image/png', PNG_HEADER, PAYMENT_PROOF_MAX_BYTES + 10),
        ),
      /maksimal 1.5MB/,
    )
  })

  it('stripProofData membuang base64 dan memberi penanda hasPaymentProof', () => {
    const stored = stripProofData({
      id: 'a',
      paymentProofImage: null,
      paymentProofStored: true,
    })
    assert.deepEqual(stored, { id: 'a', hasPaymentProof: true })

    const legacy = stripProofData({
      id: 'b',
      paymentProofImage: 'data:image/png;base64,AAAA',
      paymentProofStored: false,
    })
    assert.deepEqual(legacy, { id: 'b', hasPaymentProof: true })
    assert.ok(!('paymentProofImage' in legacy))

    const none = stripProofData({
      id: 'c',
      paymentProofImage: null,
      paymentProofStored: false,
    })
    assert.equal(none.hasPaymentProof, false)
  })

  it('paymentProofUrl menunjuk ke route yang wajib login', () => {
    assert.equal(paymentProofUrl('abc'), '/api/subscription-proof/abc')
  })
})
