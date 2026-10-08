import assert from 'node:assert/strict'
import test from 'node:test'
import { getErrorMessage } from './error-message'

const FALLBACK = 'Gagal'

test('pesan error biasa dipakai apa adanya', () => {
  assert.equal(
    getErrorMessage(new Error('Email ini belum terdaftar'), FALLBACK),
    'Email ini belum terdaftar',
  )
})

test('ZodError (JSON array) diambil pesan issue pertamanya', () => {
  const zod = JSON.stringify([
    {
      origin: 'string',
      code: 'invalid_format',
      format: 'email',
      path: ['email'],
      message: 'Email tidak valid',
    },
  ])
  assert.equal(getErrorMessage(new Error(zod), FALLBACK), 'Email tidak valid')
})

test('objek dengan field issues juga didukung', () => {
  const zod = JSON.stringify({
    issues: [{ message: 'Password minimal 8 karakter' }],
  })
  assert.equal(
    getErrorMessage(new Error(zod), FALLBACK),
    'Password minimal 8 karakter',
  )
})

test('JSON tanpa pesan atau JSON rusak jatuh ke fallback', () => {
  assert.equal(getErrorMessage(new Error('[]'), FALLBACK), FALLBACK)
  assert.equal(getErrorMessage(new Error('[{"x":1}]'), FALLBACK), FALLBACK)
  assert.equal(getErrorMessage(new Error('[ rusak'), FALLBACK), FALLBACK)
})

test('bukan Error atau pesan kosong jatuh ke fallback', () => {
  assert.equal(getErrorMessage('string biasa', FALLBACK), FALLBACK)
  assert.equal(getErrorMessage(new Error('  '), FALLBACK), FALLBACK)
})