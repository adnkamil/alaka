import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { billingBucket, bundleBillingAmount } from './partner-billing'

const comps = (approved: Array<number | null>) =>
  approved.map((approvedQty) => ({ qty: 1, approvedQty, unitPrice: 30_000 }))

describe('bundleBillingAmount', () => {
  it('belum dicek: pakai harga paket', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 2,
        bundlePrice: 100_000,
        components: comps([null, null, null]),
        reviewed: false,
      }),
      200_000,
    )
  })

  it('sudah dicek dan lengkap: pakai harga paket, bukan jumlah satuan', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: 80_000,
        components: comps([1, 1, 1]),
        reviewed: true,
      }),
      80_000,
    )
  })

  it('sanggah: pcs yang dapat dihitung harga satuan sementara', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: 80_000,
        components: comps([1, 0, 1]),
        reviewed: true,
      }),
      60_000,
    )
  })

  it('menunggu verifikasi: pengganti dihitung harga satuan sementara', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: 80_000,
        components: comps([1, 1, null]),
        reviewed: true,
      }),
      90_000,
    )
  })

  it('harga paket kosong: jatuh ke jumlah harga satuan', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: null,
        components: comps([1, 1]),
        reviewed: true,
      }),
      60_000,
    )
  })
})

describe('billingBucket', () => {
  it('memetakan status ke kelompok tagihan', () => {
    assert.equal(billingBucket('disetujui'), 'approved')
    assert.equal(billingBucket('menyetujui'), 'approved')
    assert.equal(billingBucket('terkirim'), 'waiting')
    assert.equal(billingBucket('sanggah'), 'waiting')
    assert.equal(billingBucket('menunggu_verifikasi'), 'waiting')
    assert.equal(billingBucket('draft'), 'draft')
    assert.equal(billingBucket('belum_dibuka'), 'draft')
    assert.equal(billingBucket(null), 'draft')
  })
})
