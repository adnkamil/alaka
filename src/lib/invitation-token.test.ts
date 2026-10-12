import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateInvitationToken,
  hashInvitationToken,
} from './invitation-token'

test('token acak, panjang cukup, dan unik', () => {
  const a = generateInvitationToken()
  const b = generateInvitationToken()
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a.token, b.token)
})

test('hash deterministik, hex 64 karakter, dan berbeda dari token', () => {
  const { token, tokenHash } = generateInvitationToken()
  assert.equal(tokenHash, hashInvitationToken(token))
  assert.match(tokenHash, /^[0-9a-f]{64}$/)
  assert.notEqual(tokenHash, token)
  assert.notEqual(hashInvitationToken('lain'), tokenHash)
})
