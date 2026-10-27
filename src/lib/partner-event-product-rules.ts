/**
 * Produk unggulan per event: jastiper hanya melihat beberapa produk di halaman
 * event; katalog lengkapnya lewat PDF. Dipakai di pilihan partner (server + UI)
 * dan di etalase jastiper, jadi cukup diubah di sini.
 */
export const MAX_EVENT_PRODUCTS = 6

/**
 * Susun daftar pilihan produk untuk layar "Kelola produk": produk aktif +
 * produk yang SUDAH dipilih walaupun kini nonaktif (supaya masih bisa
 * dilepas). Produk nonaktif yang tidak dipilih disembunyikan.
 */
export function selectableProducts<T extends { id: string; isActive: boolean }>(
  products: ReadonlyArray<T>,
  selectedIds: ReadonlySet<string>,
): Array<T> {
  return products.filter((p) => p.isActive || selectedIds.has(p.id))
}

/** Hasil toggle satu produk pada himpunan pilihan (tidak mengubah aslinya). */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
