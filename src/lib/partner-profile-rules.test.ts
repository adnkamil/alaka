import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PARTNER_NAME_MAX,
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
