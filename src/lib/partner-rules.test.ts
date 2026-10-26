import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PARTNER_INVITATION_TTL_DAYS,
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
