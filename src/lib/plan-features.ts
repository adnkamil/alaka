/**
 * Teks perbandingan paket FREE vs PRO — dipakai halaman `/profil/langganan`
 * dan landing page publik supaya isinya selalu sama.
 *
 * Murni teks tampilan: fitur yang benar-benar digerbang server ada di
 * `PRO_FEATURES` (`subscription.ts`). Lihat catatan di PRD §4.12.
 */

/** Fitur paket FREE. */
export const FREE_FEATURES = [
  'Event dan pesanan tanpa batas',
  'Laporan keuangan dasar',
]

/** Fitur tambahan di paket PRO. */
export const PRO_FEATURES_LIST = [
  'Link tagihan publik untuk pelanggan',
  'Autocomplete nama dan no. HP customer',
  'Upload foto brand dan catatan',
  'Tambah admin tim',
]
