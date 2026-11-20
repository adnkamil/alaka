import type { SubmitStatus } from './submit-status'

export type BillingComponent = {
  /** Jumlah isi per paket. */
  qty: number
  /** Status komponen di alur submit bertahap. Null = belum disubmit. */
  status: SubmitStatus | null
  /** Harga satuan varian produk partner. */
  unitPrice: number
}

/**
 * Tagihan partner untuk satu baris paket (`bundleQty` paket).
 * - Semua komponen disetujui: harga paket (`bundlePrice`, snapshot `items.hpp`).
 *   Kalau snapshot kosong, jatuh ke jumlah harga satuan isinya.
 * - Selain itu: hanya komponen yang disetujui yang ditagih, dihitung harga
 *   satuan. Komponen pengajuan dan disanggah tidak ditagih.
 */
export function bundleBillingAmount(input: {
  bundleQty: number
  bundlePrice: number | null
  components: Array<BillingComponent>
}): number {
  const { bundleQty, bundlePrice, components } = input
  const perBundleAtUnit = (include: (c: BillingComponent) => boolean) =>
    components.reduce(
      (sum, c) => sum + (include(c) ? c.qty * c.unitPrice : 0),
      0,
    )

  const allApproved =
    components.length > 0 && components.every((c) => c.status === 'disetujui')
  if (allApproved) {
    return bundleQty * (bundlePrice ?? perBundleAtUnit(() => true))
  }
  return bundleQty * perBundleAtUnit((c) => c.status === 'disetujui')
}

/** Kelompok tagihan di kartu ringkasan event partner. */
export type BillingBucket = 'approved' | 'waiting' | 'draft'

export function billingBucket(status: string | null): BillingBucket {
  switch (status) {
    case 'disetujui':
      return 'approved'
    case 'terkirim':
    case 'sanggah':
      return 'waiting'
    default:
      return 'draft'
  }
}

export type AllocComponent = {
  /** Submit asal komponen. Null = belum disubmit (tidak pernah ditagih). */
  submissionId: string | null
  /** Jumlah isi per paket. */
  qty: number
  status: SubmitStatus | null
  /** Harga satuan varian produk partner. */
  unitPrice: number
}

/**
 * Bagi tagihan satu baris paket ke submit asal tiap komponen. Jumlah seluruh
 * hasil sama dengan `bundleBillingAmount` untuk input yang sama.
 * - Paket lengkap: harga paket dibagi proporsional (qty × harga satuan) per
 *   komponen. Sisa pembulatan masuk ke komponen terakhir. Kalau total harga
 *   satuan 0, dibagi menurut jumlah pcs.
 * - Tidak lengkap: komponen disetujui × harga satuan, lainnya 0.
 */
export function allocateBundleBilling(input: {
  bundleQty: number
  bundlePrice: number | null
  components: Array<AllocComponent>
}): Map<string, number> {
  const { bundleQty, bundlePrice, components } = input
  const result = new Map<string, number>()
  const add = (submissionId: string | null, amount: number) => {
    if (submissionId === null) return
    result.set(submissionId, (result.get(submissionId) ?? 0) + amount)
  }

  const allApproved =
    components.length > 0 && components.every((c) => c.status === 'disetujui')
  if (!allApproved) {
    for (const c of components) {
      if (c.status === 'disetujui') {
        add(c.submissionId, bundleQty * c.qty * c.unitPrice)
      }
    }
    return result
  }

  const unitTotal = components.reduce((s, c) => s + c.qty * c.unitPrice, 0)
  const total = bundleQty * (bundlePrice ?? unitTotal)
  const weight = (c: AllocComponent) =>
    unitTotal > 0 ? c.qty * c.unitPrice : c.qty
  const weightTotal = components.reduce((s, c) => s + weight(c), 0)

  let allocated = 0
  components.forEach((c, i) => {
    const share =
      i === components.length - 1
        ? total - allocated
        : Math.floor((total * weight(c)) / weightTotal)
    allocated += share
    add(c.submissionId, share)
  })
  return result
}
