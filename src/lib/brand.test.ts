import assert from 'node:assert/strict'
import test from 'node:test'
import { applyBrandIdentity, brandIdOf } from './brand'

const user = {
  id: 'u1',
  name: 'Nama User',
  brandName: 'Nama Lama',
  waMessageTemplate: 'template lama',
  trialStartedAt: new Date('2026-01-01T00:00:00Z'),
  trialEndsAt: new Date('2026-01-31T00:00:00Z'),
  avatarUpdatedAt: new Date('2026-02-01T00:00:00Z'),
}

test('brand menimpa nama, template, dan trial; kolom lain tetap', () => {
  const brand = {
    name: 'Nama Brand',
    waMessageTemplate: 'template brand',
    trialStartedAt: new Date('2026-03-01T00:00:00Z'),
    trialEndsAt: new Date('2026-03-15T00:00:00Z'),
  }
  const result = applyBrandIdentity(user, brand)
  assert.equal(result.brandName, 'Nama Brand')
  assert.equal(result.waMessageTemplate, 'template brand')
  assert.equal(result.trialStartedAt, brand.trialStartedAt)
  assert.equal(result.trialEndsAt, brand.trialEndsAt)
  assert.equal(result.id, 'u1')
  assert.equal(result.name, 'Nama User')
  assert.equal(result.avatarUpdatedAt, user.avatarUpdatedAt)
  // objek asli tidak dimutasi
  assert.equal(user.brandName, 'Nama Lama')
})

test('brand menang walau namanya sengaja kosong', () => {
  const result = applyBrandIdentity(user, {
    name: null,
    waMessageTemplate: null,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
  })
  assert.equal(result.brandName, null)
  assert.equal(result.waMessageTemplate, null)
})

test('tanpa brand (belum di-backfill) user dikembalikan apa adanya', () => {
  assert.equal(applyBrandIdentity(user, null), user)
  assert.equal(applyBrandIdentity(user, undefined), user)
})

test('brandIdOf mengembalikan brandId, dan melempar kalau kosong', () => {
  assert.equal(brandIdOf({ brandId: 'b1' }), 'b1')
  assert.throws(() => brandIdOf({ brandId: null }), /belum siap/)
})
