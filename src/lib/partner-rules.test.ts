import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_PARTNER_RESET_REQUESTS_PER_WINDOW,
  PARTNER_INVITATION_TTL_DAYS,
  PARTNER_RESET_TTL_MINUTES,
  PARTNER_RESET_WINDOW_MINUTES,
  PartnerError,
  isPlausiblePartnerEmail,
  normalizePartnerEmail,
  partnerErrorMessage,
  partnerStatus,
} from './partner-rules.ts'

test('email partner dinormalkan ke huruf kecil tanpa spasi', () => {
  assert.equal(normalizePartnerEmail('  Admin@Brand.COM '), 'admin@brand.com')
})

test('validasi email partner', () => {
  assert.equal(isPlausiblePartnerEmail('a@b.co'), true)
  assert.equal(isPlausiblePartnerEmail('tanpa-at'), false)
  assert.equal(isPlausiblePartnerEmail('a@b'), false)
  assert.equal(isPlausiblePartnerEmail('a b@c.com'), false)
})

test('status partner: Diundang sampai kata sandi dibuat', () => {
  assert.equal(partnerStatus({ activatedAt: null }), 'diundang')
  assert.equal(partnerStatus({ activatedAt: new Date() }), 'aktif')
  assert.equal(partnerStatus({ activatedAt: '2026-10-26T00:00:00Z' }), 'aktif')
  // Dinonaktifkan mengalahkan status lain, termasuk yang masih "Diundang".
  assert.equal(
    partnerStatus({ activatedAt: new Date(), disabledAt: new Date() }),
    'nonaktif',
  )
  assert.equal(
    partnerStatus({ activatedAt: null, disabledAt: '2026-10-26T00:00:00Z' }),
    'nonaktif',
  )
  assert.equal(
    partnerStatus({ activatedAt: null, disabledAt: null }),
    'diundang',
  )
})

test('PartnerError membawa kode dan pesan yang ramah', () => {
  const error = new PartnerError('EMAIL_TERDAFTAR')
  assert.equal(error.code, 'EMAIL_TERDAFTAR')
  assert.equal(error.message, partnerErrorMessage('EMAIL_TERDAFTAR'))
  assert.ok(error instanceof Error)
})

test('masa berlaku undangan partner sama dengan undangan admin brand (7 hari)', () => {
  assert.equal(PARTNER_INVITATION_TTL_DAYS, 7)
})

test('kode error atur ulang kata sandi punya pesan sendiri', () => {
  for (const code of [
    'BELUM_AKTIF',
    'TERLALU_BANYAK_PERMINTAAN',
    'LINK_RESET_TIDAK_VALID',
  ] as const) {
    assert.ok(partnerErrorMessage(code).length > 10, code)
    assert.equal(new PartnerError(code).code, code)
  }
})

test('batas atur ulang: 1 jam berlaku, 3 permintaan per 15 menit', () => {
  assert.equal(PARTNER_RESET_TTL_MINUTES, 60)
  assert.equal(PARTNER_RESET_WINDOW_MINUTES, 15)
  assert.equal(MAX_PARTNER_RESET_REQUESTS_PER_WINDOW, 3)
})
