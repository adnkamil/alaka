import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_FAILED_PER_EMAIL,
  MAX_FAILED_PER_IP,
  emailThrottleKey,
  isLoginThrottled,
  loginThrottleKeys,
  pickClientIp,
} from './login-throttle'

describe('loginThrottleKeys', () => {
  it('email dinormalisasi (trim + huruf kecil) supaya tidak bisa dihindari lewat kapitalisasi', () => {
    assert.equal(emailThrottleKey('  Budi@Mail.COM '), 'email:budi@mail.com')
  })

  it('IP ikut dicatat kalau ada, dilewati kalau tidak', () => {
    assert.deepEqual(loginThrottleKeys('a@b.com', '1.2.3.4'), [
      'email:a@b.com',
      'ip:1.2.3.4',
    ])
    assert.deepEqual(loginThrottleKeys('a@b.com', null), ['email:a@b.com'])
  })
})

describe('isLoginThrottled', () => {
  it('belum kena selama di bawah batas', () => {
    assert.equal(
      isLoginThrottled({
        'email:a@b.com': MAX_FAILED_PER_EMAIL - 1,
        'ip:1.2.3.4': MAX_FAILED_PER_IP - 1,
      }),
      false,
    )
  })

  it('kena kalau email mencapai batas, walau IP masih aman', () => {
    assert.equal(
      isLoginThrottled({
        'email:a@b.com': MAX_FAILED_PER_EMAIL,
        'ip:1.2.3.4': 1,
      }),
      true,
    )
  })

  it('kena kalau IP mencapai batas, walau email masih aman', () => {
    assert.equal(
      isLoginThrottled({ 'email:a@b.com': 0, 'ip:1.2.3.4': MAX_FAILED_PER_IP }),
      true,
    )
  })

  it('batas IP lebih longgar daripada batas email', () => {
    assert.equal(
      isLoginThrottled({ 'ip:1.2.3.4': MAX_FAILED_PER_EMAIL }),
      false,
    )
  })
})

describe('pickClientIp', () => {
  const headers = (map: Record<string, string>) => (name: string) =>
    map[name] ?? null

  it('mengutamakan header Netlify', () => {
    assert.equal(
      pickClientIp(
        headers({
          'x-nf-client-connection-ip': '9.9.9.9',
          'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        }),
      ),
      '9.9.9.9',
    )
  })

  it('cadangan: entri pertama x-forwarded-for', () => {
    assert.equal(
      pickClientIp(headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })),
      '1.1.1.1',
    )
  })

  it('tanpa header apa pun -> null', () => {
    assert.equal(pickClientIp(headers({})), null)
  })
})
