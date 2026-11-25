import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  TRANSLATED_MESSAGES,
  translatePartnerMessage,
} from './i18n/partner/server-errors'
import { isPartnerPortalPath, partnerLocaleFromCookie } from './partner-locale'

test('pesan persis diterjemahkan ke Inggris', () => {
  assert.equal(
    translatePartnerMessage('Event tidak ditemukan', 'en'),
    'Event not found',
  )
  assert.equal(
    translatePartnerMessage('Kata sandi lama salah', 'en'),
    'The current password is incorrect',
  )
})

test('bahasa Indonesia dan pesan tak dikenal dibiarkan apa adanya', () => {
  assert.equal(
    translatePartnerMessage('Event tidak ditemukan', 'id'),
    'Event tidak ditemukan',
  )
  assert.equal(
    translatePartnerMessage('Pesan baru dari server', 'en'),
    'Pesan baru dari server',
  )
})

test('pesan dinamis memakai pola', () => {
  assert.equal(
    translatePartnerMessage(
      'Submit ke-3 belum dicek, jadi belum bisa ditagih.',
      'en',
    ),
    'Submission #3 has not been checked yet, so it cannot be invoiced.',
  )
  assert.equal(
    translatePartnerMessage('Deskripsi maksimal 500 karakter', 'en'),
    'Description can be at most 500 characters',
  )
  assert.equal(
    translatePartnerMessage(
      'Stok tidak cukup: Kaos (M): stok tinggal 2, diminta 5',
      'en',
    ),
    'Not enough stock: Kaos (M): 2 left in stock, 5 requested',
  )
})

test('pesan validasi zod (JSON) diterjemahkan per issue', () => {
  const raw = JSON.stringify([
    { code: 'too_small', message: 'Nama produk wajib diisi', path: ['name'] },
  ])
  const translated = JSON.parse(translatePartnerMessage(raw, 'en')) as Array<{
    message: string
  }>
  assert.equal(translated[0].message, 'Product name is required')
})

test('cookie & path Partner Portal', () => {
  assert.equal(partnerLocaleFromCookie(''), 'en')
  assert.equal(partnerLocaleFromCookie('a=1; alaka_partner_lang=id'), 'id')
  assert.equal(partnerLocaleFromCookie('alaka_partner_lang=xx'), 'en')
  assert.equal(isPartnerPortalPath('/partner'), true)
  assert.equal(isPartnerPortalPath('/partner/event/1'), true)
  assert.equal(isPartnerPortalPath('/partners'), false)
  assert.equal(isPartnerPortalPath('/admin/partner'), false)
})

/**
 * Penjaga: setiap kunci kamus harus masih muncul persis di kode `src/lib`.
 * Kalau teks error di server diubah, test ini gagal supaya terjemahannya
 * ikut diperbarui.
 */
test('semua pesan di kamus masih ada di kode server', () => {
  const libDir = fileURLToPath(new URL('.', import.meta.url))
  const sources = readdirSync(libDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => readFileSync(join(libDir, f), 'utf8'))
    .join('\n')
  const missing = TRANSLATED_MESSAGES.filter((m) => !sources.includes(m))
  assert.deepEqual(missing, [])
})
