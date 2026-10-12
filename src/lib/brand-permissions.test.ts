import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BrandPermissionError,
  can,
  requireBrandPermission,
} from './brand-permissions'
import type { BrandAction } from './brand-permissions'

const ALL_ACTIONS: Array<BrandAction> = [
  'team.manage',
  'subscription.manage',
  'paymentMethod.manage',
  'brand.profile',
  'brand.messageTemplate',
  'operations',
]

test('owner boleh semua aksi', () => {
  for (const action of ALL_ACTIONS) assert.equal(can('owner', action), true)
})

test('admin hanya boleh operasional harian dan template pesan', () => {
  const allowed = ALL_ACTIONS.filter((action) => can('admin', action))
  assert.deepEqual(allowed.sort(), ['brand.messageTemplate', 'operations'])
})

test('admin tidak boleh mengelola tim, langganan, rekening, dan profil brand', () => {
  for (const action of [
    'team.manage',
    'subscription.manage',
    'paymentMethod.manage',
    'brand.profile',
  ] as const) {
    assert.equal(can('admin', action), false, action)
  }
})

test('requireBrandPermission melempar BrandPermissionError untuk admin', () => {
  assert.throws(
    () => requireBrandPermission({ brandRole: 'admin' }, 'team.manage'),
    (error: unknown) =>
      error instanceof BrandPermissionError && error.action === 'team.manage',
  )
  assert.doesNotThrow(() =>
    requireBrandPermission({ brandRole: 'owner' }, 'team.manage'),
  )
  assert.doesNotThrow(() =>
    requireBrandPermission({ brandRole: 'admin' }, 'operations'),
  )
})
