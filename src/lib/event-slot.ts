import { APP_TIME_ZONE } from './timezone'

// Alur slot event partner (fungsi murni, tanpa database).
//
// Ringkasan alur:
//   draft -> (partner membuka slot) -> jastiper submit -> terkunci
//   -> partner mengecek barang -> sanggah (per paket: ganti / tidak ganti)
//   -> disetujui.
// Event tanpa waktu buka/tutup slot, dan event yang bukan milik partner,
// memakai alur lama: pesanan bebas diubah.

export type SlotConfig = {
  /** `calendar_event.partner_id`. Null = event admin / event jastiper sendiri. */
  partnerId: string | null
  opensAt: Date | null
  closesAt: Date | null
}

/** Alur slot hanya aktif untuk event partner yang waktu buka dan tutupnya terisi. */
export function isSlotEnabled(config: SlotConfig | null | undefined): boolean {
  return (
    config !== null &&
    config !== undefined &&
    config.partnerId !== null &&
    config.opensAt !== null &&
    config.closesAt !== null
  )
}

export type SlotPhase = 'belum_dibuka' | 'terbuka' | 'ditutup'

export function slotPhase(config: SlotConfig, now: Date): SlotPhase {
  if (config.opensAt && now.getTime() < config.opensAt.getTime()) {
    return 'belum_dibuka'
  }
  if (config.closesAt && now.getTime() >= config.closesAt.getTime()) {
    return 'ditutup'
  }
  return 'terbuka'
}

/** Partner mengisi waktu buka dan tutup bersamaan, dan tutup harus setelah buka. */
export function validateSlotWindow(
  opensAt: Date | null,
  closesAt: Date | null,
): string | null {
  if (opensAt === null && closesAt === null) return null
  if (opensAt === null || closesAt === null) {
    return 'Isi waktu buka dan waktu tutup slot, atau kosongkan keduanya.'
  }
  if (closesAt.getTime() <= opensAt.getTime()) {
    return 'Waktu tutup slot harus setelah waktu buka.'
  }
  return null
}

export type SubmitCheck = { ok: true } | { ok: false; reason: string }

export function checkCanSubmit(input: {
  config: SlotConfig | null
  submittedAt: Date | null
  /** Jumlah barang dengan qty > 0 di semua pesanan event ini. */
  itemCount: number
  now: Date
}): SubmitCheck {
  if (!isSlotEnabled(input.config)) {
    return { ok: false, reason: 'Event ini tidak memakai alur slot.' }
  }
  if (input.submittedAt !== null) {
    return { ok: false, reason: 'Pesanan sudah dikirim ke partner.' }
  }
  const phase = slotPhase(input.config as SlotConfig, input.now)
  if (phase === 'belum_dibuka') {
    return { ok: false, reason: 'Slot pemesanan belum dibuka oleh partner.' }
  }
  if (phase === 'ditutup') {
    return { ok: false, reason: 'Slot pemesanan sudah ditutup.' }
  }
  if (input.itemCount <= 0) {
    return { ok: false, reason: 'Belum ada barang untuk dikirim ke partner.' }
  }
  return { ok: true }
}

export const ORDERS_LOCKED_MESSAGE =
  'Pesanan sudah dikirim ke partner dan terkunci, jadi tidak bisa diubah.'

/** Setelah submit, isi pesanan terkunci. Perubahan hanya lewat jalur sanggah. */
export function isOrderLocked(event: { submittedAt: Date | null }): boolean {
  return event.submittedAt !== null
}

export function assertOrdersEditable(event: {
  submittedAt: Date | null
}): void {
  if (isOrderLocked(event)) throw new Error(ORDERS_LOCKED_MESSAGE)
}

// ---------------------------------------------------------------------------
// Hasil pengecekan partner

/** Satuan: `qty` menjadi jumlah yang dapat, `requestedQty` menyimpan permintaan asli. */
export function applySatuanApproval(
  row: { qty: number; requestedQty: number | null },
  approvedQty: number,
): { qty: number; requestedQty: number } {
  const requested = row.requestedQty ?? row.qty
  if (!Number.isInteger(approvedQty) || approvedQty < 0) {
    throw new Error('Jumlah yang dapat harus bilangan bulat, minimal 0.')
  }
  if (approvedQty > requested) {
    throw new Error('Jumlah yang dapat tidak boleh melebihi yang diminta.')
  }
  return { qty: approvedQty, requestedQty: requested }
}

export type Demand = { key: string; qty: number; at: Date }

/**
 * Partner mengecek per varian dan tidak melihat nama pemesan, jadi pcs yang
 * disetujui dibagikan ke pemesan yang masuk lebih dulu (waktu masuk paling
 * lama, pemecah: key). Hasilnya: jumlah disetujui per baris permintaan.
 */
export function allocateApproval(
  demands: Array<Demand>,
  approvedTotal: number,
): Map<string, number> {
  const total = demands.reduce((sum, d) => sum + d.qty, 0)
  if (!Number.isInteger(approvedTotal) || approvedTotal < 0) {
    throw new Error('Jumlah yang dapat harus bilangan bulat, minimal 0.')
  }
  if (approvedTotal > total) {
    throw new Error('Jumlah yang dapat tidak boleh melebihi yang diminta.')
  }
  let left = approvedTotal
  const result = new Map<string, number>()
  const ordered = demands.slice().sort((a, b) => {
    const diff = a.at.getTime() - b.at.getTime()
    if (diff !== 0) return diff
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
  for (const d of ordered) {
    const take = Math.min(d.qty, left)
    result.set(d.key, take)
    left -= take
  }
  return result
}

export function checkComponentApproval(qty: number, approvedQty: number): void {
  if (!Number.isInteger(approvedQty) || approvedQty < 0) {
    throw new Error('Jumlah yang disetujui harus bilangan bulat, minimal 0.')
  }
  if (approvedQty > qty) {
    throw new Error('Jumlah yang disetujui tidak boleh melebihi yang diminta.')
  }
}

export type ItemApprovalKind = 'dapat' | 'sebagian' | 'tidak_dapat'

export function approvalKind(
  requested: number,
  approved: number,
): ItemApprovalKind {
  if (approved <= 0) return 'tidak_dapat'
  return approved >= requested ? 'dapat' : 'sebagian'
}

// ---------------------------------------------------------------------------
// Status paket dan status event

export type ComponentState = { qty: number; approvedQty: number | null }

/**
 * - `ok`: semua isi paket disetujui penuh
 * - `sanggah`: ada isi yang tidak/sebagian dapat; jastiper harus memutuskan
 * - `verifikasi`: ada barang pengganti yang menunggu verifikasi partner
 * Sanggah didahulukan karena jastiper yang harus bertindak lebih dulu.
 */
export type BundleReviewState = 'ok' | 'sanggah' | 'verifikasi'

export function bundleReviewState(
  components: Array<ComponentState>,
): BundleReviewState {
  if (components.some((c) => c.approvedQty !== null && c.approvedQty < c.qty)) {
    return 'sanggah'
  }
  if (components.some((c) => c.approvedQty === null)) return 'verifikasi'
  return 'ok'
}

export type SlotStatus =
  | 'belum_dibuka'
  | 'draft'
  | 'ditutup'
  | 'terkirim'
  | 'sanggah'
  | 'menunggu_verifikasi'
  | 'menyetujui'
  | 'disetujui'

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  belum_dibuka: 'Slot belum dibuka',
  draft: 'Draft',
  ditutup: 'Slot ditutup',
  terkirim: 'Menunggu dicek partner',
  sanggah: 'Sanggah',
  menunggu_verifikasi: 'Menunggu verifikasi barang pengganti',
  menyetujui: 'Jastiper menyetujui pesanan',
  disetujui: 'Disetujui',
}

/** Status event jastiper. Null = event tidak memakai alur slot. */
export function deriveSlotStatus(input: {
  config: SlotConfig | null
  submittedAt: Date | null
  reviewedAt: Date | null
  decidedAt: Date | null
  bundleStates: Array<BundleReviewState>
  now: Date
}): SlotStatus | null {
  if (!isSlotEnabled(input.config)) return null
  if (input.submittedAt === null) {
    const phase = slotPhase(input.config as SlotConfig, input.now)
    if (phase === 'belum_dibuka') return 'belum_dibuka'
    if (phase === 'ditutup') return 'ditutup'
    return 'draft'
  }
  if (input.reviewedAt === null) return 'terkirim'
  if (input.bundleStates.includes('verifikasi')) return 'menunggu_verifikasi'
  if (input.bundleStates.includes('sanggah')) return 'sanggah'
  return input.decidedAt !== null ? 'menyetujui' : 'disetujui'
}

// ---------------------------------------------------------------------------
// Batas waktu sanggah

/**
 * Batas sanggah harus di masa depan. Kalau sudah pernah diisi, hanya boleh
 * diperpanjang, tidak dipersingkat, supaya jastiper tidak dirugikan.
 */
export function validateSanggahDeadline(
  deadline: Date,
  now: Date,
  existing: Date | null,
): string | null {
  if (Number.isNaN(deadline.getTime()))
    return 'Batas waktu sanggah tidak valid.'
  if (deadline.getTime() <= now.getTime()) {
    return 'Batas waktu sanggah harus di masa depan.'
  }
  if (existing !== null && deadline.getTime() < existing.getTime()) {
    return 'Batas waktu sanggah hanya boleh diperpanjang, tidak dipersingkat.'
  }
  return null
}

export function isSanggahExpired(deadline: Date | null, now: Date): boolean {
  return deadline !== null && deadline.getTime() <= now.getTime()
}

// ---------------------------------------------------------------------------
// Penggantian komponen paket

export type ReplacementPlan =
  { kind: 'swap' } | { kind: 'split'; keepQty: number; newQty: number }

/**
 * Rencana penggantian satu komponen yang bermasalah.
 * - tidak dapat sama sekali (disetujui 0): variannya diganti, qty tetap.
 * - dapat sebagian: komponen lama diperkecil jadi yang dapat, sisanya jadi
 *   komponen baru dengan varian pengganti.
 */
export function planReplacement(
  component: ComponentState,
  sameVariant: boolean,
): ReplacementPlan {
  if (component.approvedQty === null) {
    throw new Error('Barang ini belum dicek partner.')
  }
  if (component.approvedQty >= component.qty) {
    throw new Error('Barang ini tidak bermasalah, jadi tidak perlu diganti.')
  }
  if (sameVariant) {
    throw new Error('Pilih barang pengganti yang berbeda dari barang semula.')
  }
  if (component.approvedQty === 0) return { kind: 'swap' }
  return {
    kind: 'split',
    keepQty: component.approvedQty,
    newQty: component.qty - component.approvedQty,
  }
}

/**
 * Pcs yang dikembalikan ke satuan saat jastiper memilih "tidak ganti".
 * `returnQty` = yang dapat (boleh 0, tampil sebagai "tidak dapat"),
 * `requestedQty` = yang semula diminta.
 */
export function componentsToReturn<T extends ComponentState>(
  components: Array<T>,
): Array<T & { returnQty: number; requestedQty: number }> {
  return components.map((c) => ({
    ...c,
    returnQty: c.approvedQty ?? 0,
    requestedQty: c.qty,
  }))
}

// ---------------------------------------------------------------------------
// Hitung mundur

/** "2 hari 3 jam", "3 jam 12 mnt", "5 mnt 10 dtk", "30 dtk", atau null kalau sudah lewat. */
export function formatRemaining(target: Date, now: Date): string | null {
  let seconds = Math.floor((target.getTime() - now.getTime()) / 1000)
  if (seconds <= 0) return null
  const days = Math.floor(seconds / 86400)
  seconds -= days * 86400
  const hours = Math.floor(seconds / 3600)
  seconds -= hours * 3600
  const minutes = Math.floor(seconds / 60)
  seconds -= minutes * 60
  if (days > 0) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`
  if (hours > 0)
    return minutes > 0 ? `${hours} jam ${minutes} mnt` : `${hours} jam`
  if (minutes > 0)
    return seconds > 0 ? `${minutes} mnt ${seconds} dtk` : `${minutes} mnt`
  return `${seconds} dtk`
}

// ---------------------------------------------------------------------------
// Waktu WIB untuk input `datetime-local`

const WIB_OFFSET_MS = 7 * 3600 * 1000

/** "2026-11-10T19:30" (jam dinding WIB) -> instant. Null kalau kosong/tidak valid. */
export function parseWibLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+07:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Instant -> "YYYY-MM-DDTHH:mm" jam dinding WIB, format `datetime-local`. */
export function toWibLocal(date: Date): string {
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16)
}

const wibDateTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** "9 Nov, 18.00 WIB" */
export function formatWibDateTime(date: Date | string): string {
  return `${wibDateTime.format(new Date(date))} WIB`
}

// ---------------------------------------------------------------------------
// Notifikasi perubahan status ke jastiper

export type SlotNotice = { kind: 'status_pesanan'; title: string; body: string }

/**
 * Isi notifikasi untuk jastiper saat status pesanannya berubah karena partner
 * (selesai cek, koreksi, verifikasi pengganti) atau karena batas sanggah lewat.
 * Null = tidak ada yang perlu diberitahukan.
 */
export function slotStatusNotice(input: {
  reason: 'review' | 'expired'
  status: SlotStatus | null
  previous: SlotStatus | null
  firstReview: boolean
  /** Hasil cek berubah (jumlah dapat / pengganti) sejak sebelum disimpan. */
  resultsChanged: boolean
  eventName: string
  sanggahDeadline: Date | null
  /** Pengganti belum mencukupi dan paketnya langsung difinalkan (sanggah hanya sekali). */
  finalizedShortage?: boolean
}): SlotNotice | null {
  const { status, eventName } = input
  if (status === null) return null

  if (
    input.finalizedShortage === true &&
    (status === 'disetujui' || status === 'menyetujui')
  ) {
    return {
      kind: 'status_pesanan',
      title: `Pesanan final: ${eventName}`,
      body: 'Barang pengganti belum mencukupi. Kesempatan mengganti hanya sekali, jadi barang yang tidak dapat tidak masuk tagihan.',
    }
  }

  if (input.reason === 'expired') {
    return {
      kind: 'status_pesanan',
      title: `Batas sanggah lewat: ${eventName}`,
      body: 'Paket yang bermasalah diproses tanpa pengganti. Pesananmu sudah final.',
    }
  }

  const changed = status !== input.previous
  if (!input.firstReview && !changed && !input.resultsChanged) return null

  if (status === 'sanggah') {
    return {
      kind: 'status_pesanan',
      title: `Ada barang kurang di ${eventName}`,
      body: input.sanggahDeadline
        ? `Putuskan ganti atau tidak ganti sebelum ${formatWibDateTime(input.sanggahDeadline)}.`
        : 'Putuskan ganti atau tidak ganti paket yang bermasalah.',
    }
  }
  if ((status === 'disetujui' || status === 'menyetujui') && changed) {
    return {
      kind: 'status_pesanan',
      title: `Pesanan disetujui: ${eventName}`,
      body: 'Partner sudah selesai mengecek barangmu. Buka pesanan untuk melihat hasil akhirnya.',
    }
  }
  return {
    kind: 'status_pesanan',
    title: `Hasil pengecekan diperbarui: ${eventName}`,
    body: 'Partner memperbarui hasil cek. Buka pesanan untuk melihat jumlah terbaru.',
  }
}

/** Pesan WhatsApp partner ke jastiper (tombol "Kabari jastiper"). */
export function buildKabariMessage(input: {
  status: SlotStatus | null
  brandName: string
  eventName: string
  totalAmount: number
  sanggahDeadline: Date | null
}): string {
  const rupiah = `Rp${Math.round(input.totalAmount).toLocaleString('id-ID')}`
  const head = `Halo ${input.brandName}, ini update pesanan kamu di ${input.eventName}.`
  if (input.status === 'sanggah') {
    const until = input.sanggahDeadline
      ? ` sebelum ${formatWibDateTime(input.sanggahDeadline)}`
      : ''
    return `${head} Ada barang yang kurang. Mohon putuskan ganti atau tidak ganti di ALAKA${until}.`
  }
  if (input.status === 'disetujui' || input.status === 'menyetujui') {
    return `${head} Pesanan kamu sudah disetujui. Total tagihan ${rupiah}. Terima kasih!`
  }
  return `${head} Silakan cek statusnya di ALAKA.`
}

// ---------------------------------------------------------------------------
// Badge dan teks status di sisi partner

export type PartnerBadgeTone = 'neutral' | 'info' | 'warn' | 'success'

/** Label badge status pesanan jastiper di Partner Portal. */
export function partnerStatusBadge(status: SlotStatus | null): {
  label: string
  tone: PartnerBadgeTone
} {
  switch (status) {
    case 'terkirim':
    case 'menunggu_verifikasi':
      return { label: 'Pengajuan', tone: 'info' }
    case 'sanggah':
      return { label: 'Pesanan dikembalikan', tone: 'warn' }
    case 'menyetujui':
    case 'disetujui':
      return { label: 'Disetujui', tone: 'success' }
    default:
      return { label: 'Draft', tone: 'neutral' }
  }
}

/** Judul dan keterangan kartu status di halaman detail jastiper (partner). */
export function partnerStatusCopy(input: {
  status: SlotStatus | null
  hasItems: boolean
  sanggahCount: number
}): { title: string; description: string } {
  switch (input.status) {
    case 'terkirim':
      return {
        title: 'Cek pesanan ini',
        description: 'Isi jumlah yang dapat di tabel, lalu tekan Selesai dicek.',
      }
    case 'menunggu_verifikasi':
      return {
        title: 'Cek pengganti',
        description:
          'Jastiper sudah mengganti barang yang kurang. Isi jumlah pengganti yang dapat, lalu tekan Selesai dicek. Ini kesempatan terakhir: kalau masih kurang, hasilnya final.',
      }
    case 'sanggah':
      return {
        title: 'Menunggu jawaban jastiper',
        description: `${input.sanggahCount > 0 ? `${input.sanggahCount} paket kurang barang. ` : ''}Jastiper memilih ganti atau tidak ganti.`,
      }
    case 'menyetujui':
      return {
        title: 'Hasil final',
        description:
          'Jastiper memilih tidak mengganti. Barang yang tidak dapat tidak masuk tagihan.',
      }
    case 'disetujui':
      return {
        title: 'Hasil final',
        description:
          'Semua barang sudah dicek. Yang tidak dapat tidak masuk tagihan.',
      }
    default:
      return input.hasItems
        ? {
            title: 'Menunggu jastiper',
            description: 'Jastiper belum menekan Submit. Pesanan belum bisa dicek.',
          }
        : {
            title: 'Menunggu jastiper',
            description:
              'Jastiper belum memasukkan pesanan. Barang muncul di sini begitu jastiper menambahkannya, bahkan sebelum submit.',
          }
  }
}

export type PartnerStatusFilter =
  | 'semua'
  | 'draft'
  | 'pengajuan'
  | 'dikembalikan'
  | 'disetujui'

export const PARTNER_STATUS_FILTERS: Array<{
  key: PartnerStatusFilter
  label: string
}> = [
  { key: 'semua', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'pengajuan', label: 'Pengajuan' },
  { key: 'dikembalikan', label: 'Pesanan dikembalikan' },
  { key: 'disetujui', label: 'Disetujui' },
]

/** Kelompok filter chip daftar jastiper untuk satu status slot. */
export function partnerStatusFilterKey(
  status: SlotStatus | null,
): Exclude<PartnerStatusFilter, 'semua'> {
  switch (status) {
    case 'terkirim':
    case 'menunggu_verifikasi':
      return 'pengajuan'
    case 'sanggah':
      return 'dikembalikan'
    case 'menyetujui':
    case 'disetujui':
      return 'disetujui'
    default:
      return 'draft'
  }
}

/** Subjudul halaman detail jastiper di Partner Portal. */
export function partnerPageSubtitle(status: SlotStatus | null): string {
  switch (status) {
    case 'terkirim':
      return 'Cek pesanan jastiper di event ini'
    case 'menunggu_verifikasi':
      return 'Cek pesanan jastiper di event ini · sudah ada pengganti'
    case 'menyetujui':
    case 'disetujui':
      return 'Hasil pesanan jastiper di event ini · hanya baca'
    default:
      return 'Detail pesanan jastiper di event ini · hanya baca'
  }
}

// ---------------------------------------------------------------------------
// Penguncian hasil cek dan perubahan slot

/** Hasil cek terkunci setelah dikembalikan ke jastiper atau sudah final. */
export function reviewLockedReason(status: SlotStatus | null): string | null {
  if (status === 'sanggah' || status === 'disetujui' || status === 'menyetujui') {
    return 'Hasil pengecekan sudah dikunci.'
  }
  return null
}

/**
 * Setelah ada jastiper yang mengirim pesanan, urutan antrean tidak boleh
 * berubah: slot tidak bisa dimatikan, waktu buka tidak boleh lebih lambat dari
 * pengiriman pertama, dan waktu tutup hanya boleh diperpanjang.
 */
export function validateSlotChange(input: {
  current: { opensAt: Date | null; closesAt: Date | null }
  next: { opensAt: Date | null; closesAt: Date | null }
  earliestSubmittedAt: Date | null
}): string | null {
  const { current, next, earliestSubmittedAt } = input
  if (earliestSubmittedAt === null) return null
  if (next.opensAt === null || next.closesAt === null) {
    return 'Sudah ada jastiper yang mengirim pesanan, jadi slot tidak bisa dimatikan.'
  }
  if (next.opensAt.getTime() > earliestSubmittedAt.getTime()) {
    return `Waktu buka tidak boleh lebih lambat dari pesanan pertama yang sudah dikirim (${formatWibDateTime(earliestSubmittedAt)}).`
  }
  if (
    current.closesAt !== null &&
    next.closesAt.getTime() < current.closesAt.getTime()
  ) {
    return 'Sudah ada pesanan yang dikirim, jadi waktu tutup hanya boleh diperpanjang.'
  }
  return null
}

/** Peringatan lunak (tidak memblokir) untuk pengaturan slot. */
export function slotWindowWarnings(input: {
  closesAt: Date | null
  /** Tanggal event berakhir, format YYYY-MM-DD. */
  eventEndDate: string | null
}): Array<string> {
  if (input.closesAt === null || input.eventEndDate === null) return []
  const endOfEvent = parseWibLocal(`${input.eventEndDate.slice(0, 10)}T23:59`)
  if (endOfEvent && input.closesAt.getTime() > endOfEvent.getTime()) {
    return [
      'Slot ditutup setelah event berakhir. Pastikan ini memang disengaja.',
    ]
  }
  return []
}
