import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PWA_SOURCE, shouldShowLanding } from './landing'

describe('shouldShowLanding', () => {
  it('pengunjung belum login di / dari browser → landing', () => {
    assert.equal(
      shouldShowLanding({ isLoggedIn: false, pathname: '/', search: {} }),
      true,
    )
  })

  it('dibuka dari ikon PWA (?source=pwa) → bukan landing (ke /login)', () => {
    assert.equal(
      shouldShowLanding({
        isLoggedIn: false,
        pathname: '/',
        search: { source: PWA_SOURCE },
      }),
      false,
    )
  })

  it('source lain (mis. iklan) tetap landing', () => {
    assert.equal(
      shouldShowLanding({
        isLoggedIn: false,
        pathname: '/',
        search: { source: 'instagram' },
      }),
      true,
    )
  })

  it('sudah login → dashboard, bukan landing', () => {
    assert.equal(
      shouldShowLanding({ isLoggedIn: true, pathname: '/', search: {} }),
      false,
    )
  })

  it('belum login di halaman lain → bukan landing (ke /login)', () => {
    assert.equal(
      shouldShowLanding({
        isLoggedIn: false,
        pathname: '/keuangan',
        search: {},
      }),
      false,
    )
  })
})
