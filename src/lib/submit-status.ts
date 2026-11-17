// Alur submit bertahap (fungsi murni, tanpa database).
//
// Aturan:
// - Setiap baris (satuan maupun komponen paket) punya status: null (belum
//   disubmit, masih bisa diubah), pengajuan, disetujui, atau disanggah.
// - Setelah disubmit, qty dan hapus terkunci. Yang masih bisa diubah hanya
//   harga jual dan fee.
// - Sanggah dilakukan per item. Bagian yang disetujui kembali ke satuan dengan
//   status disetujui. Bagian yang disanggah tetap jadi riwayat (disanggah) dan
//   tidak dihitung ke total maupun tagihan.
// - Tidak ada batas waktu sanggah dan tidak ada batasan jumlah submit ulang.

export type SubmitStatus = 'pengajuan' | 'disetujui' | 'disanggah' | 'dibatalkan'

export type SubmitLine = {
  qty: number
  status: SubmitStatus | null
}

export type ReviewSplit = {
  /** Baris disetujui (boleh 0 = tidak dibuat). */
  approved: number
  /** Baris disanggah (boleh 0 = tidak dibuat). */
  rejected: number
}

/** Baris belum disubmit boleh diubah qty-nya. Selain itu terkunci. */
export function isQtyLocked(line: SubmitLine): boolean {
  return line.status !== null
}

/** Hapus ikut terkunci dengan qty. */
export function isDeleteLocked(line: SubmitLine): boolean {
  return line.status !== null
}

/** Harga jual dan fee tetap bisa diubah walau sudah disubmit. */
export function isPriceEditable(): boolean {
  return true
}

/** Hanya baris disetujui yang masuk tagihan. */
export function isBillable(line: SubmitLine): boolean {
  return line.status === 'disetujui'
}

/** Total pcs yang masuk tagihan. */
export function billableQty(lines: Array<SubmitLine>): number {
  return lines.reduce((sum, l) => sum + (isBillable(l) ? l.qty : 0), 0)
}

/**
 * Partner memberi jumlah yang disetujui untuk satu baris berstatus pengajuan.
 * Hasilnya dipecah jadi dua bagian: disetujui dan disanggah. Bagian yang 0
 * tidak perlu dibuat sebagai baris.
 */
export function splitReview(qty: number, approvedQty: number): ReviewSplit {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Jumlah baris harus bilangan bulat lebih dari 0.')
  }
  if (!Number.isInteger(approvedQty) || approvedQty < 0) {
    throw new Error('Jumlah yang disetujui harus bilangan bulat, minimal 0.')
  }
  if (approvedQty > qty) {
    throw new Error('Jumlah yang disetujui tidak boleh melebihi yang diajukan.')
  }
  return { approved: approvedQty, rejected: qty - approvedQty }
}

/**
 * Status paket dari isi komponennya:
 * - `pengajuan`: masih ada komponen yang menunggu cek partner
 * - `sanggah`: ada komponen yang disanggah dan tidak ada yang menunggu
 * - `lengkap`: semua komponen disetujui
 * Komponen null (belum disubmit) dianggap belum punya status.
 */
export type BundleState = 'belum_disubmit' | 'pengajuan' | 'sanggah' | 'lengkap'

export function bundleState(components: Array<SubmitLine>): BundleState {
  if (components.length === 0) return 'belum_disubmit'
  if (components.every((c) => c.status === null)) return 'belum_disubmit'
  if (components.some((c) => c.status === 'pengajuan')) return 'pengajuan'
  if (components.some((c) => c.status === 'disanggah')) return 'sanggah'
  return 'lengkap'
}

/** Nomor submit berikutnya untuk satu event. Submit pertama = 1. */
export function nextSubmitNo(existing: Array<number>): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1
}

/** Label kolom "submit ke" di halaman detil event partner. */
export function submitLabel(submitNo: number): string {
  return `Submit ke-${submitNo}`
}

/**
 * Info pada baris yang sudah disetujui di sisi partner, kalau jastiper masih
 * punya pengajuan di submit lain. Null = tidak perlu info.
 */
export function pendingSubmitNotice(
  pendingSubmitNos: Array<number>,
): string | null {
  if (pendingSubmitNos.length === 0) return null
  const list = [...new Set(pendingSubmitNos)].sort((a, b) => a - b)
  return `jastiper ini masih memiliki barang pengajuan di submit ke ${list.join(', ')}`
}

export const LOCKED_QTY_MESSAGE =
  'Barang ini sudah dikirim ke partner, jadi jumlahnya tidak bisa diubah atau dihapus. Harga jual dan fee tetap bisa diubah.'

export const LOCKED_ORDER_MESSAGE =
  'Pesanan ini punya barang yang sudah dikirim ke partner, jadi tidak bisa diubah atau dihapus sebagai satu pesanan.'

/** Baris yang sudah disubmit tidak boleh diubah jumlahnya atau dihapus. */
export function assertQtyEditable(row: { submitStatus: SubmitStatus | null }): void {
  if (row.submitStatus !== null) throw new Error(LOCKED_QTY_MESSAGE)
}

/** Pesanan yang punya barang terkirim tidak boleh diubah atau dihapus sebagai satu kesatuan. */
export function assertNoSubmittedRows(
  rows: Array<{ submitStatus: SubmitStatus | null }>,
): void {
  if (rows.some((r) => r.submitStatus !== null)) {
    throw new Error(LOCKED_ORDER_MESSAGE)
  }
}

/**
 * Status baris paket setelah cek partner. Kalau masih ada komponen yang
 * disanggah, paket ini tidak ditagih (pcs yang disetujui sudah pindah ke
 * barang satuan dan ditagih di sana). Null = paket tetap ditagih seperti biasa.
 */
export function bundleRowStatusAfterReview(
  remaining: Array<{ submitStatus: SubmitStatus | null }>,
): 'disanggah' | null {
  return remaining.some((c) => c.submitStatus === 'disanggah') ? 'disanggah' : null
}
