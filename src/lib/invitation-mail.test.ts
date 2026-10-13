import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInvitationMail } from './invitation-mail'

const base = {
  inviterName: 'Adnan',
  brand: 'Jastip ALAKA',
  inviteUrl: 'https://alaka.web.id/undangan/abc123',
  expiresDays: 7,
}

test('subject, teks, dan HTML memuat pengundang, brand, dan link undangan', () => {
  const mail = buildInvitationMail(base)
  assert.equal(mail.subject, 'Adnan mengundang kamu jadi admin Jastip ALAKA')
  assert.ok(mail.text.includes(base.inviteUrl))
  assert.ok(mail.html.includes(`href="${base.inviteUrl}"`))
  assert.ok(mail.text.includes('7 hari'))
})

test('nama pengundang dan brand di-escape di HTML supaya tidak bisa menyisipkan tag', () => {
  const mail = buildInvitationMail({
    ...base,
    inviterName: '<script>alert(1)</script>',
    brand: 'Toko "A" & B',
  })
  assert.ok(!mail.html.includes('<script>'))
  assert.ok(mail.html.includes('&lt;script&gt;'))
  assert.ok(mail.html.includes('Toko &quot;A&quot; &amp; B'))
})
