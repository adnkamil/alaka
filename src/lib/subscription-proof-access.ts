/**
 * Siapa yang boleh melihat bukti transfer sebuah pengajuan PRO.
 *
 * Pengajuan itu milik BRAND (bukan satu akun), jadi semua anggota brand yang
 * sama boleh melihatnya. Admin platform boleh melihat semuanya.
 *
 * Perhatian khusus: `brandId` kosong tidak boleh dianggap "sama" dengan
 * `brandId` kosong di baris pengajuan (`null !== null` itu `false` di JS), jadi
 * viewer tanpa brand selalu ditolak.
 */
export function canViewSubscriptionProof(
  viewer: { isAdmin: boolean; brandId: string | null },
  row: { brandId: string | null },
): boolean {
  if (viewer.isAdmin) return true
  if (!viewer.brandId) return false
  return row.brandId === viewer.brandId
}
