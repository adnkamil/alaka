import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { billingBucket, bundleBillingAmount } from './partner-billing'
import type { SubmitStatus } from './submit-status'

const comps = (statuses: Array<SubmitStatus | null>) =>
  statuses.map((status) => ({ qty: 1, status, unitPrice: 30_000 }))

describe('bundleBillingAmount', () => {
  it('semua komponen disetujui: pakai harga paket', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 2,
        bundlePrice: 100_000,
        components: comps(['disetujui', 'disetujui', 'disetujui']),
      }),
      200_000,
    )
  })

  it('semua disetujui tapi harga paket kosong: jatuh ke harga satuan', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: null,
        components: comps(['disetujui', 'disetujui']),
      }),
      60_000,
    )
  })

  it('ada pengajuan: hanya komponen disetujui yang ditagih', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: 80_000,
        components: comps(['disetujui', 'disetujui', 'pengajuan']),
      }),
      60_000,
    )
  })

  it('ada disanggah: yang disanggah tidak ditagih', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: 80_000,
        components: comps(['disetujui', 'disanggah', 'disetujui']),
      }),
      60_000,
    )
  })

  it('belum disubmit: tidak ada yang ditagih', () => {
    assert.equal(
      bundleBillingAmount({
        bundleQty: 1,
        bundlePrice: 80_000,
        components: comps([null, null, null]),
      }),
      0,
    )
  })
})

describe('billingBucket', () => {
  it('memetakan status ke kelompok tagihan', () => {
    assert.equal(billingBucket('disetujui'), 'approved')
    assert.equal(billingBucket('terkirim'), 'waiting')
    assert.equal(billingBucket('sanggah'), 'waiting')
    assert.equal(billingBucket('draft'), 'draft')
    assert.equal(billingBucket('belum_dibuka'), 'draft')
    assert.equal(billingBucket(null), 'draft')
  })
})
