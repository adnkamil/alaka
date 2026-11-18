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
})

const cand = (
  id: string,
  submitNo: number,
  brandId: string,
  state: InvoiceCandidate['state'] = 'siap_ditagih',
): InvoiceCandidate => ({ id, submitNo, brandId, state })

describe('validateInvoiceSelection', () => {
  it('pilihan valid: lolos', () => {
    assert.equal(
      validateInvoiceSelection({
        requestedIds: ['a', 'b'],
        candidates: [cand('a', 1, 'x'), cand('b', 2, 'x')],
        crossBundles: [],
      }),
      null,
    )
  })
  it('kosong: ditolak', () => {
    assert.match(
      validateInvoiceSelection({ requestedIds: [], candidates: [], crossBundles: [] })!,
      /minimal satu/,
    )
  })
  it('id tidak ada di event: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['z'],
        candidates: [cand('a', 1, 'x')],
        crossBundles: [],
      })!,
      /tidak ditemukan/,
    )
  })
  it('dua jastiper sekaligus: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a', 'b'],
        candidates: [cand('a', 1, 'x'), cand('b', 1, 'y')],
        crossBundles: [],
      })!,
      /satu jastiper/,
    )
  })
  it('belum dicek: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 3, 'x', 'menunggu_dicek')],
        crossBundles: [],
      })!,
      /Submit ke-3 belum dicek/,
    )
  })
  it('sudah ada di tagihan aktif: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 2, 'x', 'sudah_ditagih')],
        crossBundles: [],
      })!,
      /tagihan aktif/,
    )
  })
  it('nominal 0: ditolak', () => {
    assert.match(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 2, 'x', 'tanpa_tagihan')],
        crossBundles: [],
      })!,
      /tidak punya barang/,
    )
  })
  it('paket lintas submit, sebagian dipilih: ditolak dengan nomor submit lain', () => {
    const crossBundles = [
      {
        bundleName: 'Beli 3',
        submissions: [
          { id: 'a', submitNo: 1 },
          { id: 'b', submitNo: 2 },
        ],
      },
    ]
    assert.equal(
      validateInvoiceSelection({
        requestedIds: ['a'],
        candidates: [cand('a', 1, 'x'), cand('b', 2, 'x')],
        crossBundles,
      }),
      'Paket Beli 3 juga berisi barang dari Submit ke-2. Tagih bersama submit itu.',
    )
  })
  it('paket lintas submit, semuanya dipilih: lolos', () => {
    assert.equal(
      validateInvoiceSelection({
        requestedIds: ['a', 'b'],
        candidates: [cand('a', 1, 'x'), cand('b', 2, 'x')],
        crossBundles: [
          {
            bundleName: 'Beli 3',
            submissions: [
              { id: 'a', submitNo: 1 },
              { id: 'b', submitNo: 2 },
            ],
          },
        ],
      }),
      null,
    )
  })
  it('paket lintas submit yang tidak menyentuh pilihan: lolos', () => {
    assert.equal(
      validateInvoiceSelection({
        requestedIds: ['c'],
        candidates: [cand('c', 3, 'x')],
        crossBundles: [
          {
            bundleName: 'Beli 3',
            submissions: [
              { id: 'a', submitNo: 1 },
              { id: 'b', submitNo: 2 },
            ],
          },
        ],
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
