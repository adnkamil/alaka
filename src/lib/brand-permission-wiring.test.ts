import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import type { BrandAction } from './brand-permissions'

/**
 * Penjaga pemasangan izin: server function milik PEMILIK brand harus memanggil
 * `requireBrandPermission(<user>, '<aksi>')`. Tanpa test ini, fungsi baru atau
 * hasil refactor bisa diam-diam terbuka untuk akun admin (UI hanya menyembunyikan
 * tombol; yang mengikat adalah server).
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

const GUARDED: Array<{ file: string; fn: string; action: BrandAction }> = [
  {
    file: 'lib/payment-methods-functions.ts',
    fn: 'createPaymentMethod',
    action: 'paymentMethod.manage',
  },
  {
    file: 'lib/payment-methods-functions.ts',
    fn: 'updatePaymentMethod',
    action: 'paymentMethod.manage',
  },
  {
    file: 'lib/payment-methods-functions.ts',
    fn: 'setPaymentMethodActive',
    action: 'paymentMethod.manage',
  },
  {
    file: 'lib/payment-methods-functions.ts',
    fn: 'deletePaymentMethod',
    action: 'paymentMethod.manage',
  },
  {
    file: 'lib/subscription-functions.ts',
    fn: 'submitSubscriptionRequest',
    action: 'subscription.manage',
  },
  {
    file: 'lib/subscription-functions.ts',
    fn: 'fetchSubscriptionPaymentInfo',
    action: 'subscription.manage',
  },
  {
    file: 'lib/subscription-functions.ts',
    fn: 'fetchMySubscriptionState',
    action: 'subscription.manage',
  },
  {
    file: 'lib/avatar-functions.ts',
    fn: 'uploadAvatar',
    action: 'brand.profile',
  },
  {
    file: 'lib/avatar-functions.ts',
    fn: 'removeAvatar',
    action: 'brand.profile',
  },
  {
    file: 'lib/auth-functions.ts',
    fn: 'updateProfile',
    action: 'brand.profile',
  },
]

/** Isi `export const <fn> = createServerFn ...` sampai deklarasi export berikutnya. */
function functionBody(text: string, fn: string) {
  const start = text.indexOf(`export const ${fn} = createServerFn`)
  assert.notEqual(start, -1, `${fn} tidak ditemukan`)
  const next = text.indexOf('\nexport ', start + 1)
  return next === -1 ? text.slice(start) : text.slice(start, next)
}

test('server function milik pemilik brand memanggil requireBrandPermission', () => {
  const missing: Array<string> = []
  for (const { file, fn, action } of GUARDED) {
    const body = functionBody(readFileSync(join(SRC_DIR, file), 'utf8'), fn)
    const guard = new RegExp(
      `requireBrandPermission\\([^)]*['"]${action.replace('.', '\\.')}['"]`,
    )
    if (!guard.test(body)) missing.push(`${file} -> ${fn} (${action})`)
  }
  assert.deepEqual(
    missing,
    [],
    'Tambahkan requireBrandPermission(user, aksi) di fungsi di atas.',
  )
})

test('aksi operasional TIDAK dibatasi hanya untuk pemilik', () => {
  // Admin brand harus tetap bisa bekerja: fungsi data harian tidak boleh
  // tiba-tiba meminta izin pemilik.
  const operational = [
    'lib/events-functions.ts',
    'lib/customers-functions.ts',
    'lib/fee-rules-functions.ts',
    'lib/orders-functions.ts',
    'lib/finance-functions.ts',
    'lib/message-template-functions.ts',
  ]
  for (const file of operational) {
    const text = readFileSync(join(SRC_DIR, file), 'utf8')
    assert.doesNotMatch(
      text,
      /requireBrandPermission\([^)]*'(team|subscription|paymentMethod|brand\.profile)/,
      `${file} membatasi aksi operasional untuk pemilik`,
    )
  }
})

test('server function tim brand hanya lewat requireOwner (team.manage)', () => {
  const text = readFileSync(join(SRC_DIR, 'lib/team-functions.ts'), 'utf8')
  assert.match(
    text,
    /requireBrandPermission\(user, 'team\.manage'\)/,
    'requireOwner() harus memanggil requireBrandPermission(user, "team.manage")',
  )

  const missing = [
    'fetchTeam',
    'inviteAdmin',
    'cancelInvitation',
    'removeTeamAdmin',
  ].filter((fn) => !functionBody(text, fn).includes('await requireOwner()'))
  assert.deepEqual(
    missing,
    [],
    'Semua server function tim harus memanggil requireOwner().',
  )

  // Mengundang memberi orang lain akses ke brand: wajib email terverifikasi.
  assert.match(
    functionBody(text, 'inviteAdmin'),
    /requireVerifiedEmail\(user\)/,
  )
})
