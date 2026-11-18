import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateBundleBilling,
  billingBucket,
  bundleBillingAmount,
} from './partner-billing'
import type { AllocComponent } from './partner-billing'
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

const sum = (m: Map<string, number>) =>
  [...m.values()].reduce((s, n) => s + n, 0)

const comp = (
  submissionId: string | null,
  qty: number,
  status: AllocComponent['status'],
  unitPrice: number,
): AllocComponent => ({ submissionId, qty, status, unitPrice })

/** Hasil harus selalu sama dengan bundleBillingAmount. */
function check(input: Parameters<typeof allocateBundleBilling>[0]) {
  const result = allocateBundleBilling(input)
  assert.equal(
    sum(result),
    bundleBillingAmount({
      bundleQty: input.bundleQty,
      bundlePrice: input.bundlePrice,
      components: input.components.map((c) => ({
        qty: c.qty,
        status: c.status,
        unitPrice: c.unitPrice,
      })),
    }),
  )
  return result
}

describe('allocateBundleBilling', () => {
  it('paket lengkap dari satu submit: seluruh harga paket', () => {
    const r = check({
      bundleQty: 2,
      bundlePrice: 90_000,
      components: [
        comp('a', 1, 'disetujui', 50_000),
        comp('a', 1, 'disetujui', 50_000),
      ],
    })
    assert.equal(r.get('a'), 180_000)
    assert.equal(r.size, 1)
  })

  it('paket lengkap lintas dua submit: dibagi proporsional', () => {
    const r = check({
      bundleQty: 1,
      bundlePrice: 90_000,
      components: [
        comp('a', 1, 'disetujui', 60_000),
        comp('b', 1, 'disetujui', 30_000),
      ],
    })
    assert.equal(r.get('a'), 60_000)
    assert.equal(r.get('b'), 30_000)
  })

  it('paket tidak lengkap: hanya komponen disetujui × harga satuan', () => {
    const r = check({
      bundleQty: 2,
      bundlePrice: 90_000,
      components: [
        comp('a', 1, 'disetujui', 60_000),
        comp('b', 1, 'pengajuan', 30_000),
        comp('b', 1, 'disanggah', 30_000),
        comp('c', 1, 'dibatalkan', 30_000),
      ],
    })
    assert.equal(r.get('a'), 120_000)
    assert.equal(r.has('b'), false)
    assert.equal(r.has('c'), false)
  })

  it('pembulatan: 100.000 dibagi 3 komponen harga sama', () => {
    const r = check({
      bundleQty: 1,
      bundlePrice: 100_000,
      components: [
        comp('a', 1, 'disetujui', 40_000),
        comp('b', 1, 'disetujui', 40_000),
        comp('c', 1, 'disetujui', 40_000),
      ],
    })
    assert.equal(r.get('a'), 33_333)
    assert.equal(r.get('b'), 33_333)
    assert.equal(r.get('c'), 33_334)
    assert.equal(sum(r), 100_000)
  })

  it('harga paket kosong: jatuh ke jumlah harga satuan', () => {
    const r = check({
      bundleQty: 3,
      bundlePrice: null,
      components: [
        comp('a', 2, 'disetujui', 10_000),
        comp('b', 1, 'disetujui', 5_000),
      ],
    })
    assert.equal(r.get('a'), 60_000)
    assert.equal(r.get('b'), 15_000)
  })

  it('harga satuan semua 0: dibagi menurut pcs', () => {
    const r = check({
      bundleQty: 1,
      bundlePrice: 90_000,
      components: [
        comp('a', 2, 'disetujui', 0),
        comp('b', 1, 'disetujui', 0),
      ],
    })
    assert.equal(r.get('a'), 60_000)
    assert.equal(r.get('b'), 30_000)
  })

  it('tanpa komponen: kosong', () => {
    const r = check({ bundleQty: 1, bundlePrice: 50_000, components: [] })
    assert.equal(r.size, 0)
  })

  it('jumlah selalu sama dengan bundleBillingAmount (acak)', () => {
    const statuses: Array<AllocComponent['status']> = [
      'disetujui',
      'disetujui',
      'disetujui',
      'pengajuan',
      'disanggah',
      'dibatalkan',
    ]
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let i = 0; i < 300; i++) {
      const n = 1 + rnd(5)
      const components = Array.from({ length: n }, () =>
        comp(
          `s${rnd(3)}`,
          1 + rnd(3),
          statuses[rnd(statuses.length)],
          rnd(4) * 7_500,
        ),
      )
      check({
        bundleQty: 1 + rnd(4),
        bundlePrice: rnd(5) === 0 ? null : rnd(20) * 5_000 + 1_001,
        components,
      })
    }
  })
})
