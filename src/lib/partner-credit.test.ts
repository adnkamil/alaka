import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PARTNER_TOPUP_AMOUNTS,
  centsToDecimal,
  computeAdminFee,
  isPartnerTopupAmount,
  nextBalance,
  toCents,
} from './partner-credit'

describe('isPartnerTopupAmount', () => {
  it('hanya menerima pilihan nominal', () => {
    for (const n of PARTNER_TOPUP_AMOUNTS) assert.equal(isPartnerTopupAmount(n), true)
    assert.equal(isPartnerTopupAmount(5_000), false)
    assert.equal(isPartnerTopupAmount(15_000), false)
    assert.equal(isPartnerTopupAmount(200_000), false)
  })
  it('minimal 10rb', () => {
    assert.equal(Math.min(...PARTNER_TOPUP_AMOUNTS), 10_000)
  })
})

describe('toCents / centsToDecimal', () => {
  it('bolak-balik string decimal dari db', () => {
    assert.equal(toCents('12500.50'), 1_250_050)
    assert.equal(centsToDecimal(1_250_050), '12500.50')
    assert.equal(centsToDecimal(-5), '-0.05')
    assert.equal(centsToDecimal(0), '0.00')
  })
  it('tidak kena galat floating point', () => {
    assert.equal(centsToDecimal(toCents('0.1') + toCents('0.2')), '0.30')
  })
  it('menolak nilai tidak valid', () => {
    assert.throws(() => toCents('abc'))
    assert.throws(() => centsToDecimal(1.5))
  })
})

describe('nextBalance', () => {
  it('top up menambah, fee mengurangi', () => {
    assert.equal(nextBalance('0.00', 50_000), '50000.00')
    assert.equal(nextBalance('50000.00', '-1250.00'), '48750.00')
  })
  it('boleh negatif (tunggakan) dan tertutup oleh top up', () => {
    assert.equal(nextBalance('1000.00', -3000), '-2000.00')
    assert.equal(nextBalance('-2000.00', 10_000), '8000.00')
  })
})

describe('computeAdminFee', () => {
  it('persen dari total, dibulatkan ke rupiah', () => {
    assert.equal(computeAdminFee('1500000.00', '2.50'), 37_500)
    assert.equal(computeAdminFee('189000.00', '3'), 5_670)
    assert.equal(computeAdminFee('333.00', '10'), 33) // 33,3 → 33
  })
  it('setengah dibulatkan ke atas tanpa galat floating point', () => {
    assert.equal(computeAdminFee('1000.00', '2.55'), 26) // 25,5 → 26
    assert.equal(computeAdminFee('150.00', '1'), 2) // 1,5 → 2
  })
  it('persen 0 atau total 0 = tanpa fee', () => {
    assert.equal(computeAdminFee('1500000.00', '0'), 0)
    assert.equal(computeAdminFee('0.00', '5'), 0)
  })
  it('total besar tidak overflow', () => {
    assert.equal(computeAdminFee('999999999999.99', '100'), 1_000_000_000_000)
  })
})
