import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canUsePartnerFeature,
  hasPartnerPro,
} from './partner-entitlement'

const now = new Date('2026-10-29T10:00:00Z')
const day = 86400000
const active = (endsInDays: number) => ({
  status: 'active' as const,
  startedAt: new Date(now.getTime() - day),
  endsAt: new Date(now.getTime() + endsInDays * day),
})

describe('hasPartnerPro', () => {
  it('false kalau belum pernah berlangganan', () => {
    assert.equal(hasPartnerPro([], now), false)
  })
  it('true kalau langganan aktif dan belum habis', () => {
    assert.equal(hasPartnerPro([active(10)], now), true)
  })
  it('false kalau masa berlaku sudah habis', () => {
    assert.equal(hasPartnerPro([active(-1)], now), false)
  })
  it('false kalau statusnya masih pending', () => {
    assert.equal(
      hasPartnerPro(
        [{ status: 'pending', startedAt: null, endsAt: null }],
        now,
      ),
      false,
    )
  })
})

describe('canUsePartnerFeature', () => {
  it('fitur varian terbuka hanya untuk partner PRO', () => {
    assert.equal(canUsePartnerFeature('partner_variants', [active(5)], now), true)
    assert.equal(canUsePartnerFeature('partner_variants', [], now), false)
  })
})
