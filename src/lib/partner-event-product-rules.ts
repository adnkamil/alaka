/**
 * Produk partner di satu event. Tidak ada batas jumlah: partner boleh mencentang
 * seluruh katalognya (server tetap memastikan semua id milik partner itu sendiri).
 *
 * Di halaman event jastiper, etalase menampilkan beberapa produk dulu supaya
 * halaman tidak panjang, lalu sisanya dibuka lewat tombol "Lihat semua".
 */
export const SHOWCASE_PREVIEW_COUNT = 6

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

/** Centang semua `ids` sekaligus (pilihan lain tetap), tanpa mengubah aslinya. */
export function selectMany(
  selected: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(selected)
  for (const id of ids) next.add(id)
  return next
}

/** Lepas centang semua `ids` sekaligus (pilihan lain tetap). */
export function deselectMany(
  selected: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(selected)
  for (const id of ids) next.delete(id)
  return next
}

/** Status centang "pilih semua" untuk sekelompok `ids`. */
export function selectionState(
  selected: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): 'none' | 'some' | 'all' {
  if (ids.length === 0) return 'none'
  const count = ids.reduce((n, id) => (selected.has(id) ? n + 1 : n), 0)
  if (count === 0) return 'none'
  return count === ids.length ? 'all' : 'some'
}
