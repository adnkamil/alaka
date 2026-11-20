import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatInvoiceNumber,
  hasBankAccount,
  invoiceStatusMeta,
  nextInvoiceStatus,
  submitInvoiceState,
  validateInvoiceSelection,
} from './invoice-rules'
import type { InvoiceCandidate } from './invoice-rules'

describe('submitInvoiceState', () => {
  it('belum dicek: menunggu dicek', () => {
    assert.equal(
      submitInvoiceState({ checked: false, hasActiveInvoice: false, approvedAmount: 0 }),
      'menunggu_dicek',
    )
  })
  it('sudah dicek dan ada nominal: siap ditagih', () => {
    assert.equal(
      submitInvoiceState({ checked: true, hasActiveInvoice: false, approvedAmount: 1000 }),
      'siap_ditagih',
    )
  })
  it('sudah dicek dengan nominal 0: tanpa tagihan', () => {
    assert.equal(
      submitInvoiceState({ checked: true, hasActiveInvoice: false, approvedAmount: 0 }),
      'tanpa_tagihan',
    )
  })
  it('ada di tagihan aktif: sudah ditagih', () => {
    assert.equal(
      submitInvoiceState({ checked: true, hasActiveInvoice: true, approvedAmount: 1000 }),
      'sudah_ditagih',
    )
  })
  it('isi paket ditolak dan belum diputuskan: menunggu keputusan', () => {
    assert.equal(
      submitInvoiceState({
        checked: true,
        hasActiveInvoice: false,
        approvedAmount: 1000,
        awaitingDecision: true,
      }),
      'menunggu_keputusan',
    )
  })
  it('belum dicek lebih dulu daripada menunggu keputusan', () => {
    assert.equal(
      submitInvoiceState({
        checked: false,
        hasActiveInvoice: false,
        approvedAmount: 1000,
        awaitingDecision: true,
      }),
      'menunggu_dicek',
    )
  })
  it('sudah ditagih lebih dulu daripada menunggu keputusan', () => {
    assert.equal(
      submitInvoiceState({
        checked: true,
        hasActiveInvoice: true,
        approvedAmount: 1000,
        awaitingDecision: true,
      }),
      'sudah_ditagih',
    )
  })
})

const cand = (
  id: string,
  submitNo: number,
  brandId: string,
  state: InvoiceCandidate['state'] = 'siap_ditagih',
): InvoiceCandidate => ({ id, submitNo, brandId, state })

describe('validateInvoiceSelection', () => {
  it('menunggu keputusan: ditolak dengan petunjuk tagih apa adanya', () => {
    const msg = validateInvoiceSelection({
      requestedIds: ['a'],
      candidates: [cand('a', 3, 'x', 'menunggu_keputusan')],
    })!
    assert.match(msg, /Submit ke-3/)
    assert.match(msg, /menunggu keputusan jastiper/)
    assert.match(msg, /Tagih apa adanya/)
  })
  it('pilihan valid: lolos', () => {
    assert.equal(
      validateInvoiceSelection({
        requestedIds: ['a', 'b'],
        candidates: [cand('a', 1, 'x'), cand('b', 2, 'x')],
      }),
      null,
    )
  })
  it('kosong: ditolak', () => {
    assert.match(
      validateInvoiceSelection({ requestedIds: [], candidates: [] })!,
      /minimal satu/,
    )
  })
  it('id tidak ada di event: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['z'],
        candidates: [cand('a', 1, 'x')],
      })!,
      /tidak ditemukan/,
    )
  })
  it('dua jastiper sekaligus: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a', 'b'],
        candidates: [cand('a', 1, 'x'), cand('b', 1, 'y')],
      })!,
      /satu jastiper/,
    )
  })
  it('belum dicek: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 3, 'x', 'menunggu_dicek')],
      })!,
      /Submit ke-3 belum dicek/,
    )
  })
  it('sudah ada di tagihan aktif: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 2, 'x', 'sudah_ditagih')],
      })!,
      /tagihan aktif/,
    )
  })
  it('nominal 0: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 2, 'x', 'tanpa_tagihan')],
      })!,
      /tidak punya barang/,
    )
  })
  it('isi paket pesanan tersebar di beberapa submit: tetap boleh ditagih sebagian', () => {
    assert.equal(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 1, 'x'), cand('b', 2, 'x')],
      }),
      null,
    )
  })
})

describe('formatInvoiceNumber', () => {
  it('diberi nol di depan sampai 6 digit', () => {
    assert.equal(formatInvoiceNumber(1), 'INV-000001')
    assert.equal(formatInvoiceNumber(123), 'INV-000123')
    assert.equal(formatInvoiceNumber(1234567), 'INV-1234567')
  })
})

describe('nextInvoiceStatus', () => {
  it('alur normal: ditagih -> menunggu_review -> lunas', () => {
    assert.equal(nextInvoiceStatus('ditagih', 'claim_paid'), 'menunggu_review')
    assert.equal(nextInvoiceStatus('menunggu_review', 'confirm_paid'), 'lunas')
  })
  it('tolak bukti: kembali ke ditagih', () => {
    assert.equal(nextInvoiceStatus('menunggu_review', 'reject_payment'), 'ditagih')
  })
  it('batalkan hanya dari ditagih', () => {
    assert.equal(nextInvoiceStatus('ditagih', 'cancel'), 'dibatalkan')
    assert.throws(() => nextInvoiceStatus('menunggu_review', 'cancel'), /sudah mengaku bayar/)
    assert.throws(() => nextInvoiceStatus('lunas', 'cancel'), /sudah lunas/)
    assert.throws(() => nextInvoiceStatus('dibatalkan', 'cancel'), /sudah dibatalkan/)
  })
  it('klaim bayar hanya dari ditagih', () => {
    assert.throws(() => nextInvoiceStatus('menunggu_review', 'claim_paid'), /menunggu dicek/)
    assert.throws(() => nextInvoiceStatus('lunas', 'claim_paid'), /sudah lunas/)
    assert.throws(() => nextInvoiceStatus('dibatalkan', 'claim_paid'), /dibatalkan/)
  })
  it('konfirmasi dan tolak hanya dari menunggu_review', () => {
    assert.throws(() => nextInvoiceStatus('ditagih', 'confirm_paid'), /belum mengirim/)
    assert.throws(() => nextInvoiceStatus('ditagih', 'reject_payment'), /Tidak ada bukti/)
    assert.throws(() => nextInvoiceStatus('lunas', 'confirm_paid'), /sudah lunas/)
  })
})

describe('invoiceStatusMeta', () => {
  it('lunas hijau, ditagih kuning', () => {
    assert.equal(invoiceStatusMeta('lunas').tone, 'success')
    assert.equal(invoiceStatusMeta('ditagih').label, 'Ditagih')
  })
})

describe('hasBankAccount', () => {
  it('lengkap: true', () => {
    assert.equal(
      hasBankAccount({ bankName: 'BCA', bankAccountNumber: '123456', bankAccountName: 'A' }),
      true,
    )
  })
  it('ada yang kosong atau null: false', () => {
    assert.equal(hasBankAccount({ bankName: null, bankAccountNumber: null, bankAccountName: null }), false)
    assert.equal(hasBankAccount({ bankName: 'BCA', bankAccountNumber: '', bankAccountName: 'A' }), false)
    assert.equal(hasBankAccount({ bankName: 'BCA', bankAccountNumber: '123456', bankAccountName: null }), false)
  })
})
