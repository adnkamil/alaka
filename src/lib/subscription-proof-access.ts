import { can } from './brand-permissions'
import type { BrandRole } from './brand-permissions'

/**
 * Siapa yang boleh melihat bukti transfer sebuah pengajuan PRO.
 *
 * Pengajuan itu milik BRAND (bukan satu akun). Yang boleh melihat bukti: PEMILIK
 * brand itu (anggota ber-peran admin tidak; lihat `can(role, 'subscription.manage')`)
 * dan admin platform.
 *
 * Perhatian khusus: `brandId` kosong tidak boleh dianggap "sama" dengan
 * `brandId` kosong di baris pengajuan (`null !== null` itu `false` di JS), jadi
 * viewer tanpa brand selalu ditolak.
 */
export function canViewSubscriptionProof(
  viewer: { isAdmin: boolean; brandId: string | null; brandRole: BrandRole },
  row: { brandId: string | null },
): boolean {
  if (viewer.isAdmin) return true
  if (!viewer.brandId) return false
  if (!can(viewer.brandRole, 'subscription.manage')) return false
  return row.brandId === viewer.brandId
}
