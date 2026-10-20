/**
 * Daftar menu yang diberi badge "New".
 *
 * Badge tampil terus selama entrinya ada di sini (tidak hilang walau menu
 * sudah dibuka). Tiap ada fitur baru:
 * 1. Tambah entri di `NEW_FEATURES` (key = nama menu, value = `true`).
 * 2. Pasang `isNew={NEW_FEATURES.xxx}` di `RowLink` menu terkait.
 * 3. Kalau sudah tidak baru lagi, hapus entrinya (atau ubah jadi `false`).
 */
export const NEW_FEATURES = {
  tim: true,
} as const
