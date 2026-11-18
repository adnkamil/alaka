import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PARTNER_NAME_MAX,
  normalizePartnerBankAccount,
  normalizePartnerProfile,
} from './partner-profile-rules.ts'

test('nama dirapikan, nomor WA dinormalkan ke format lokal', () => {
  const r = normalizePartnerProfile({
    name: '  Wikibex Official ',
    waNumber: '+62 812-3456-7890',
  })
  assert.deepEqual(r, {
    ok: true,
    value: { name: 'Wikibex Official', waNumber: '081234567890' },
  })
})

test('nomor WA kosong = dihapus (null), bukan error', () => {
  const r = normalizePartnerProfile({ name: 'A', waNumber: '   ' })
  assert.deepEqual(r, { ok: true, value: { name: 'A', waNumber: null } })
})

test('nama kosong atau terlalu panjang ditolak', () => {
  assert.equal(normalizePartnerProfile({ name: '  ', waNumber: '' }).ok, false)
  const long = 'x'.repeat(PARTNER_NAME_MAX + 1)
  assert.equal(normalizePartnerProfile({ name: long, waNumber: '' }).ok, false)
  assert.equal(
    normalizePartnerProfile({
      name: 'x'.repeat(PARTNER_NAME_MAX),
      waNumber: '',
    }).ok,
    true,
  )
})

test('nomor WA yang bukan nomor Indonesia ditolak', () => {
  for (const bad of ['123', 'abc', '0812', '+1 202 555 0100']) {
    const r = normalizePartnerProfile({ name: 'A', waNumber: bad })
    assert.equal(r.ok, false, bad)
  }
})

test('rekening kosong semua = dihapus (null)', () => {
  const r = normalizePartnerBankAccount({
    bankName: ' ',
    bankAccountNumber: '',
    bankAccountName: '',
  })
  assert.deepEqual(r, {
    ok: true,
    value: { bankName: null, bankAccountNumber: null, bankAccountName: null },
  })
})

test('rekening lengkap dirapikan: nomor hanya angka', () => {
  const r = normalizePartnerBankAccount({
    bankName: ' BCA ',
    bankAccountNumber: '123 456-7890',
    bankAccountName: ' Wikibex Official ',
  })
  assert.deepEqual(r, {
    ok: true,
    value: {
      bankName: 'BCA',
      bankAccountNumber: '1234567890',
      bankAccountName: 'Wikibex Official',
    },
  })
})

test('rekening sebagian terisi ditolak', () => {
  const base = { bankName: 'BCA', bankAccountNumber: '1234567890', bankAccountName: 'A' }
  assert.equal(normalizePartnerBankAccount({ ...base, bankName: '' }).ok, false)
  assert.equal(normalizePartnerBankAccount({ ...base, bankAccountNumber: '' }).ok, false)
  assert.equal(normalizePartnerBankAccount({ ...base, bankAccountName: '' }).ok, false)
})

test('nomor rekening bukan angka atau panjangnya tidak wajar ditolak', () => {
  const base = { bankName: 'BCA', bankAccountName: 'A' }
  assert.equal(
    normalizePartnerBankAccount({ ...base, bankAccountNumber: '12ab567' }).ok,
    false,
  )
  assert.equal(
    normalizePartnerBankAccount({ ...base, bankAccountNumber: '1234' }).ok,
    false,
  )
  assert.equal(
    normalizePartnerBankAccount({ ...base, bankAccountNumber: '1'.repeat(26) }).ok,
    false,
  )
})
