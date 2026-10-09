import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMAIL_NOT_VERIFIED_MESSAGE,
  EmailNotVerifiedError,
  isEmailVerified,
  requireVerifiedEmail,
} from './email-verified'

describe('email-verified', () => {
  it('menganggap emailVerifiedAt null sebagai belum terverifikasi', () => {
    assert.equal(isEmailVerified({ emailVerifiedAt: null }), false)
    assert.equal(isEmailVerified({ emailVerifiedAt: new Date() }), true)
  })

  it('requireVerifiedEmail melempar EmailNotVerifiedError untuk akun belum terverifikasi', () => {
    assert.throws(
      () => requireVerifiedEmail({ emailVerifiedAt: null }),
      (err: unknown) =>
        err instanceof EmailNotVerifiedError &&
        err.message === EMAIL_NOT_VERIFIED_MESSAGE,
    )
  })

  it('requireVerifiedEmail lolos untuk akun terverifikasi', () => {
    assert.doesNotThrow(() =>
      requireVerifiedEmail({ emailVerifiedAt: new Date() }),
    )
  })
})
