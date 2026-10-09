import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmailVerificationMail } from './email-verification-mail'

const base = {
  name: 'Adnan',
  brand: 'Jastip ALAKA',
  verifyUrl: 'https://alaka.web.id/verifikasi-email/abc123',
  expiresHours: 24,
}

test('subject, teks, dan HTML memuat link verifikasi', () => {
  const mail = buildEmailVerificationMail(base)
  assert.equal(mail.subject, 'Verifikasi email Jastip ALAKA')
  assert.ok(mail.text.includes(base.verifyUrl))
  assert.ok(mail.html.includes(`href="${base.verifyUrl}"`))
  assert.ok(mail.text.includes('24 jam'))
})

test('nama dan brand di-escape di HTML supaya tidak bisa menyisipkan tag', () => {
  const mail = buildEmailVerificationMail({
    ...base,
    name: '<script>alert(1)</script>',
    brand: 'Toko "A" & B',
  })
  assert.ok(!mail.html.includes('<script>'))
  assert.ok(mail.html.includes('&lt;script&gt;'))
  assert.ok(mail.html.includes('Toko &quot;A&quot; &amp; B'))
})
