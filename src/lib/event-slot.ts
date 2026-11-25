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

/** Satuan: `qty` menjadi jumlah yang dapat, `requestedQty` menyimpan permintaan asli. */
/**
 * Partner mengecek per varian dan tidak melihat nama pemesan, jadi pcs yang
 * disetujui dibagikan ke pemesan yang masuk lebih dulu (waktu masuk paling
 * lama, pemecah: key). Hasilnya: jumlah disetujui per baris permintaan.
 */
/**
 * - `ok`: semua isi paket disetujui penuh
 * - `sanggah`: ada isi yang tidak/sebagian dapat; jastiper harus memutuskan
 * - `verifikasi`: ada barang pengganti yang menunggu verifikasi partner
 * Sanggah didahulukan karena jastiper yang harus bertindak lebih dulu.
 */
export type SlotStatus =
  | 'belum_dibuka'
  | 'draft'
  | 'ditutup'
  | 'terkirim'
  | 'sanggah'
  | 'disetujui'

/**
 * Status event jastiper dari hitungan baris submit (alur submit bertahap).
 * Null = event tidak memakai alur slot.
 * - belum submit: ikut jadwal slot (draft / belum dibuka / ditutup)
 * - masih ada pengajuan yang menunggu partner: terkirim
 * - ada barang disanggah dan tidak ada yang menunggu: sanggah (kirim pengganti)
 * - selain itu: disetujui
 */
export function deriveSlotStatus(input: {
  config: SlotConfig | null
  submittedAt: Date | null
  pendingCount: number
  disanggahCount: number
  now: Date
}): SlotStatus | null {
  if (!isSlotEnabled(input.config)) return null
  if (input.submittedAt === null) {
    const phase = slotPhase(input.config as SlotConfig, input.now)
    if (phase === 'belum_dibuka') return 'belum_dibuka'
    if (phase === 'ditutup') return 'ditutup'
    return 'draft'
  }
  if (input.pendingCount > 0) return 'terkirim'
  if (input.disanggahCount > 0) return 'sanggah'
  return 'disetujui'
}

// ---------------------------------------------------------------------------
// Batas waktu sanggah

/**
 * Batas sanggah harus di masa depan. Kalau sudah pernah diisi, hanya boleh
 * diperpanjang, tidak dipersingkat, supaya jastiper tidak dirugikan.
 */
/**
 * Rencana penggantian satu komponen yang bermasalah.
 * - tidak dapat sama sekali (disetujui 0): variannya diganti, qty tetap.
 * - dapat sebagian: komponen lama diperkecil jadi yang dapat, sisanya jadi
 *   komponen baru dengan varian pengganti.
 */
/** "2 hari 3 jam", "3 jam 12 mnt", "5 mnt 10 dtk", "30 dtk", atau null kalau sudah lewat. */
// ---------------------------------------------------------------------------
// Waktu WIB untuk input `datetime-local`

const WIB_OFFSET_MS = 7 * 3600 * 1000

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

const wibDateTimeFormats = new Map<string, Intl.DateTimeFormat>()

function wibDateTime(locale: string) {
  let format = wibDateTimeFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    wibDateTimeFormats.set(locale, format)
  }
  return format
}

/** "9 Nov, 18.00 WIB" */
export function formatWibDateTime(
  date: Date | string,
  locale = 'id-ID',
): string {
  return `${wibDateTime(locale).format(new Date(date))} WIB`
}

// ---------------------------------------------------------------------------
// Notifikasi perubahan status ke jastiper

/**
 * Isi notifikasi untuk jastiper saat status pesanannya berubah karena partner
 * (selesai cek, koreksi, verifikasi pengganti) atau karena batas sanggah lewat.
 * Null = tidak ada yang perlu diberitahukan.
 */
export type PartnerBadgeTone = 'neutral' | 'info' | 'warn' | 'success'

/** Label badge status pesanan jastiper di Partner Portal. */
export function partnerStatusBadge(status: SlotStatus | null): {
  label: string
  tone: PartnerBadgeTone
} {
  switch (status) {
    case 'terkirim':
      return { label: 'Pengajuan', tone: 'info' }
    case 'sanggah':
      return { label: 'Pesanan dikembalikan', tone: 'warn' }
    case 'disetujui':
      return { label: 'Disetujui', tone: 'success' }
    default:
      return { label: 'Draft', tone: 'neutral' }
  }
}

export type PartnerStatusFilter =
  | 'semua'
  | 'draft'
  | 'pengajuan'
  | 'selesai'

export const PARTNER_STATUS_FILTERS: Array<{
  key: PartnerStatusFilter
  label: string
}> = [
  { key: 'semua', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'pengajuan', label: 'Pengajuan' },
  { key: 'selesai', label: 'Selesai dicek' },
]

/** Kelompok filter chip daftar jastiper untuk satu status slot. */
export function partnerStatusFilterKey(
  status: SlotStatus | null,
): Exclude<PartnerStatusFilter, 'semua'> {
  switch (status) {
    case 'terkirim':
      return 'pengajuan'
    case 'sanggah':
    case 'disetujui':
      return 'selesai'
    default:
      return 'draft'
  }
}

/** Hasil cek terkunci setelah dikembalikan ke jastiper atau sudah final. */
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
  /** Teks peringatan per bahasa; default bahasa Indonesia. */
  closesAfterEventMessage?: string
}): Array<string> {
  if (input.closesAt === null || input.eventEndDate === null) return []
  const endOfEvent = parseWibLocal(`${input.eventEndDate.slice(0, 10)}T23:59`)
  if (endOfEvent && input.closesAt.getTime() > endOfEvent.getTime()) {
    return [
      input.closesAfterEventMessage ??
        'Slot ditutup setelah event berakhir. Pastikan ini memang disengaja.',
    ]
  }
  return []
}
