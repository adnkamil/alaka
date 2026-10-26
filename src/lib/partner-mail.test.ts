import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPartnerInvitationMail } from './partner-mail.ts'

const base = {
  partnerName: 'Wikibex Official',
  inviteUrl: 'https://alaka.web.id/undangan-partner/abc',
  expiresDays: 7,
}

test('email undangan partner memuat tautan, nama, dan masa berlaku', () => {
  const mail = buildPartnerInvitationMail(base)
  assert.match(mail.subject, /Wikibex Official/)
  assert.ok(mail.text.includes(base.inviteUrl))
  assert.ok(mail.text.includes('7 hari'))
  assert.ok(mail.html.includes(`href="${base.inviteUrl}"`))
})

test('nama partner di-escape di HTML supaya tidak bisa menyisipkan tag', () => {
  const mail = buildPartnerInvitationMail({
    ...base,
    partnerName: '<script>alert(1)</script> & "Co"',
  })
  assert.ok(!mail.html.includes('<script>'))
  assert.ok(mail.html.includes('&lt;script&gt;'))
  assert.ok(mail.html.includes('&amp;'))
})
