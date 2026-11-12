import { bundleReviewState } from './event-slot'

export type BillingComponent = {
  /** Jumlah isi per paket. */
  qty: number
  /** Jumlah yang disetujui partner; null = belum dicek / pengganti menunggu verifikasi. */
  approvedQty: number | null
  /** Harga satuan varian produk partner. */
  unitPrice: number
}

/**
 * Tagihan partner untuk satu baris paket (`bundleQty` paket).
 * - Paket lengkap (atau belum dicek): harga paket (`bundlePrice`, snapshot
 *   `items.hpp`). Kalau snapshot kosong, jatuh ke jumlah harga satuan isinya.
 * - Paket belum lengkap (sanggah / menunggu verifikasi): belum ditagih sebagai
 *   paket. Pcs yang sudah disetujui dihitung harga satuan sementara; pengganti
 *   yang belum diverifikasi ikut dihitung sementara.
 */
export function bundleBillingAmount(input: {
  bundleQty: number
  bundlePrice: number | null
  components: Array<BillingComponent>
  reviewed: boolean
}): number {
  const { bundleQty, bundlePrice, components, reviewed } = input
  const perBundleAtUnit = (pick: (c: BillingComponent) => number) =>
    components.reduce((sum, c) => sum + pick(c) * c.unitPrice, 0)

  const complete = !reviewed || bundleReviewState(components) === 'ok'
  if (complete) {
    return bundleQty * (bundlePrice ?? perBundleAtUnit((c) => c.qty))
  }
  return bundleQty * perBundleAtUnit((c) => c.approvedQty ?? c.qty)
}

/** Kelompok tagihan di kartu ringkasan event partner. */
export type BillingBucket = 'approved' | 'waiting' | 'draft'

export function billingBucket(status: string | null): BillingBucket {
  switch (status) {
    case 'disetujui':
    case 'menyetujui':
      return 'approved'
    case 'terkirim':
    case 'sanggah':
    case 'menunggu_verifikasi':
      return 'waiting'
    default:
      return 'draft'
  }
}
