import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INVITATION_TTL_DAYS,
  TeamError,
  getMaxAdmins,
  isPlausibleEmail,
  normalizeInviteEmail,
} from './team-rules'

test('email undangan dinormalisasi: dipangkas dan huruf kecil', () => {
  assert.equal(normalizeInviteEmail('  Adm@Contoh.ID '), 'adm@contoh.id')
})

test('validasi email dasar', () => {
  assert.equal(isPlausibleEmail('a@b.co'), true)
  assert.equal(isPlausibleEmail('a@b'), false)
  assert.equal(isPlausibleEmail('a b@c.id'), false)
  assert.equal(isPlausibleEmail(''), false)
})

test('batas admin saat ini 1 dan undangan berlaku 7 hari', () => {
  assert.equal(getMaxAdmins(), 1)
  assert.equal(INVITATION_TTL_DAYS, 7)
})

test('TeamError membawa kode dan pesan berbahasa Indonesia', () => {
  const error = new TeamError('SLOT_PENUH')
  assert.equal(error.code, 'SLOT_PENUH')
  assert.equal(error.name, 'TeamError')
  assert.match(error.message, /batas/)
  assert.ok(error instanceof Error)
})
