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
