// Alur pengganti barang yang disanggah (fungsi murni, tanpa database).
//
// Aturan:
// - Setiap baris disanggah adalah "lubang". Jastiper memutuskan per lubang:
//   ganti (kirim pengganti) atau tidak diganti.
// - Pengganti tinggal di submit yang sama dengan barang yang ditolak. Submit
//   itu dibuka lagi (menunggu dicek) dan didahulukan di antrean.
// - Pengganti selalu dikirim sebagai barang satuan di pesanan yang sama.
// - Hanya lubang yang berasal dari isi paket yang menahan tagihan: komponen
//   paket disanggah, atau pengganti (berantai) untuk komponen itu. Lubang
//   satuan biasa boleh diganti, tapi tidak wajib diputuskan.
// - Pengganti yang disanggah lagi menjadi lubang baru (berantai).
// - Partner bisa "tagih apa adanya": semua lubang yang menahan tagihan
//   ditandai tidak diganti.
import type { SubmitStatus } from './submit-status'

export type ReplacementRowKind = 'satuan' | 'komponen'

/** Baris satuan atau komponen paket yang sudah disubmit. */
export type ReplacementRow = {
  id: string
  kind: ReplacementRowKind
  submissionId: string
  status: SubmitStatus
  qty: number
  /** Id baris disanggah yang digantikan baris ini. Null = bukan pengganti. */
  replacesId: string | null
  /** Terisi kalau baris disanggah ini diputuskan tidak diganti. */
  waivedAt: Date | null
}

export type HoleStatus =
  /** Belum diganti penuh dan belum diputuskan. */
  | 'perlu_keputusan'
  /** Pengganti sudah dikirim, belum dicek partner. */
  | 'menunggu_cek'
  /** Pengganti sudah dicek. Kalau penggantinya disanggah, itu lubang tersendiri. */
  | 'diganti'
  | 'tidak_diganti'

export type HoleReplacement = {
  id: string
  submissionId: string
  status: SubmitStatus
  qty: number
}

export type Hole = {
  id: string
  kind: ReplacementRowKind
  submissionId: string
  qty: number
  status: HoleStatus
  /** Pcs yang masih bisa diganti. 0 kalau sudah tertutup atau tidak diganti. */
  openQty: number
  /** Berasal dari isi paket (langsung atau lewat rantai pengganti). */
  fromPaket: boolean
  /** Lubang dari isi paket yang belum diputuskan: menahan tagihan. */
  blocking: boolean
  replacements: Array<HoleReplacement>
}

/**
 * Status setiap baris disanggah. Pengganti yang dibatalkan partner tidak
 * menutup lubang, jadi lubangnya terbuka lagi. `rows` harus memuat seluruh
 * submit supaya rantai pengganti bisa ditelusuri.
 */
export function analyzeHoles(rows: Array<ReplacementRow>): Array<Hole> {
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const paketMemo = new Map<string, boolean>()
  const fromPaket = (r: ReplacementRow, seen = new Set<string>()): boolean => {
    const cached = paketMemo.get(r.id)
    if (cached !== undefined) return cached
    let result = r.kind === 'komponen'
    if (!result && r.replacesId && !seen.has(r.id)) {
      seen.add(r.id)
      const parent = rowById.get(r.replacesId)
      result = parent ? fromPaket(parent, seen) : false
    }
    paketMemo.set(r.id, result)
    return result
  }

  const byHole = new Map<string, Array<HoleReplacement>>()
  for (const r of rows) {
    if (!r.replacesId) continue
    const list = byHole.get(r.replacesId) ?? []
    list.push({
      id: r.id,
      submissionId: r.submissionId,
      status: r.status,
      qty: r.qty,
    })
    byHole.set(r.replacesId, list)
  }

  return rows
    .filter((r) => r.status === 'disanggah')
    .map((r) => {
      const replacements = byHole.get(r.id) ?? []
      const active = replacements.filter((x) => x.status !== 'dibatalkan')
      const covered = active.reduce((n, x) => n + x.qty, 0)
      const openQty = r.waivedAt ? 0 : Math.max(0, r.qty - covered)

      let status: HoleStatus
      if (r.waivedAt) status = 'tidak_diganti'
      else if (openQty > 0) status = 'perlu_keputusan'
      else if (active.some((x) => x.status === 'pengajuan')) {
        status = 'menunggu_cek'
      } else status = 'diganti'

      const paket = fromPaket(r)
      return {
        id: r.id,
        kind: r.kind,
        submissionId: r.submissionId,
        qty: r.qty,
        status,
        openQty,
        fromPaket: paket,
        blocking: paket && status === 'perlu_keputusan',
        replacements,
      }
    })
}

export type GroupSubmit = {
  id: string
  /** Sudah dicek partner. */
  checked: boolean
}

export type ReplacementGroupState =
  /** Submit belum dicek (termasuk dibuka lagi karena ada pengganti). */
  | 'menunggu_dicek'
  /** Ada isi paket disanggah yang belum diputuskan jastiper. */
  | 'menunggu_keputusan'
  /** Siap dihitung dan ditagih. */
  | 'siap'

/** Posisi satu submit di alur pengganti. Satu submit = satu unit tagihan. */
export type ReplacementGroup = {
  submissionId: string
  state: ReplacementGroupState
  blockingHoleIds: Array<string>
}

/** Tentukan posisi tiap submit: menunggu dicek, menunggu keputusan, atau siap. */
export function replacementGroups(input: {
  submits: Array<GroupSubmit>
  holes: Array<Hole>
}): Map<string, ReplacementGroup> {
  const blocking = new Map<string, Array<string>>()
  for (const h of input.holes) {
    if (!h.blocking) continue
    const list = blocking.get(h.submissionId) ?? []
    list.push(h.id)
    blocking.set(h.submissionId, list)
  }

  const result = new Map<string, ReplacementGroup>()
  for (const s of input.submits) {
    const blockingHoleIds = blocking.get(s.id) ?? []
    result.set(s.id, {
      submissionId: s.id,
      state: !s.checked
        ? 'menunggu_dicek'
        : blockingHoleIds.length > 0
          ? 'menunggu_keputusan'
          : 'siap',
      blockingHoleIds,
    })
  }
  return result
}

/**
 * Cek permintaan pengganti untuk satu lubang. Mengembalikan pesan kesalahan,
 * atau null kalau boleh dilanjutkan.
 */
export function validateReplacement(input: {
  hole: Hole | undefined
  qty: number
  /** Submit ini sudah ada di tagihan aktif. */
  groupInvoiced: boolean
  /** Untuk komponen paket: varian pengganti masuk aturan paket yang sama. */
  variantAllowed: boolean
}): string | null {
  const { hole, qty } = input
  if (!hole) return 'Barang yang mau diganti tidak ditemukan.'
  if (input.groupInvoiced) {
    return 'Submit ini sudah ditagih. Minta partner membatalkan tagihannya dulu untuk mengganti barang.'
  }
  if (hole.status === 'tidak_diganti') {
    return 'Barang ini sudah diputuskan tidak diganti.'
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return 'Jumlah pengganti harus bilangan bulat lebih dari 0.'
  }
  if (hole.openQty === 0) return 'Barang ini sudah punya pengganti.'
  if (qty > hole.openQty) return `Jumlah pengganti maksimal ${hole.openQty} pcs.`
  if (!input.variantAllowed) {
    return 'Pengganti harus produk yang masuk aturan paket yang sama.'
  }
  return null
}

/** Cek keputusan "tidak diganti" untuk satu lubang. */
export function validateWaive(input: {
  hole: Hole | undefined
  groupInvoiced: boolean
}): string | null {
  const { hole } = input
  if (!hole) return 'Barang tidak ditemukan.'
  if (input.groupInvoiced) return 'Submit ini sudah ditagih.'
  if (hole.status === 'tidak_diganti') {
    return 'Barang ini sudah diputuskan tidak diganti.'
  }
  if (hole.openQty === 0) {
    return 'Barang ini sudah punya pengganti untuk semua pcs-nya.'
  }
  return null
}

/**
 * Lubang yang ditandai tidak diganti saat partner menekan "Tagih apa adanya".
 * Hanya boleh kalau submit sudah dicek, supaya pengganti yang sudah dikirim
 * jastiper tidak terlewat.
 */
export function holesToWaiveForInvoice(group: ReplacementGroup): Array<string> {
  if (group.state === 'menunggu_dicek') {
    throw new Error('Cek dulu barang pengganti di submit ini sebelum menagih.')
  }
  return group.blockingHoleIds
}

export type QueueEntry = {
  queueSeq: number
  /** Terisi kalau submit dibuka lagi karena ada pengganti. */
  reopenedAt: Date | null
  /** Sudah dicek partner. */
  checked: boolean
}

/**
 * Urutan antrean cek: submit yang dibuka lagi karena ada pengganti dan belum
 * dicek didahulukan (yang lebih dulu dibuka lebih dulu), lalu sisanya sesuai
 * urutan masuk (`queueSeq`). Submit yang sudah dicek kembali ke tempat
 * `queueSeq`-nya, jadi nomor urut riwayat tidak bergeser. Dipakai daftar
 * submit partner; pengecekan otomatis memakai aturan yang sama di
 * `loadPendingQueue`.
 */
export function compareCheckQueue(a: QueueEntry, b: QueueEntry): number {
  const ra = a.reopenedAt && !a.checked ? a.reopenedAt : null
  const rb = b.reopenedAt && !b.checked ? b.reopenedAt : null
  if (ra && rb) return ra.getTime() - rb.getTime() || a.queueSeq - b.queueSeq
  if (ra) return -1
  if (rb) return 1
  return a.queueSeq - b.queueSeq
}
