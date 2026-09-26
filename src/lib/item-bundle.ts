/**
 * Barang bundling: satu harga & fee untuk beberapa barang sekaligus, mis. paket
 * "100/3 item" (3 barang dibandrol satu harga).
 *
 * Sengaja tetap disimpan sebagai SATU baris `items.name` — nama barangnya
 * digabung jadi satu string dipisah `BUNDLE_SEPARATOR`. Dengan begitu harga, fee,
 * dan qty tetap per paket, dan semua halaman (invoice, tagihan, checklist
 * belanja, saran nama barang) jalan tanpa perubahan skema.
 *
 * Modul ini murni (tanpa `db`) supaya aturannya bisa diuji tanpa database —
 * dipakai form Tambah/Edit Pesanan (`AddOrderSheet`).
 */

/** Pemisah antar barang dalam satu paket bundling. */
export const BUNDLE_SEPARATOR = ' + '

/** Pecah nama barang tersimpan jadi bagian-bagiannya. */
export function splitBundleNames(name: string) {
  return name.split(BUNDLE_SEPARATOR)
}

/** Gabungkan bagian paket jadi satu nama (persis, termasuk bagian yang masih kosong). */
export function joinBundleNames(names: Array<string>) {
  return names.join(BUNDLE_SEPARATOR)
}

/**
 * Nama tersimpan ini paket bundling atau nama barang tunggal? Dipakai waktu
 * mengedit pesanan lama: nama yang mengandung pemisah otomatis dibuka sebagai
 * paket, dan waktu disimpan digabung lagi jadi string yang sama.
 */
export function isBundleName(name: string) {
  return name.includes(BUNDLE_SEPARATOR)
}

/**
 * Nama final yang disimpan: tiap bagian di-trim, bagian kosong dibuang, lalu
 * digabung. Jadi slot yang ditinggal kosong di form tidak ikut tersimpan
 * (mis. ['Kaos', '', 'Topi'] -> 'Kaos + Topi').
 */
export function cleanBundleNames(names: Array<string>) {
  return names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .join(BUNDLE_SEPARATOR)
}
