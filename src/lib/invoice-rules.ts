// Aturan tagihan partner (fungsi murni, tanpa database).

export type SubmitInvoiceState =
  | 'menunggu_dicek'
  | 'menunggu_keputusan'
  | 'siap_ditagih'
  | 'sudah_ditagih'
  | 'tanpa_tagihan'

/**
 * Posisi satu submit di alur tagihan.
 * - Sudah ada di tagihan aktif: sudah ditagih.
 * - Belum dicek partner, atau dibuka lagi karena ada pengganti: menunggu dicek.
 * - Ada isi paket yang ditolak dan belum diputuskan jastiper: menunggu keputusan.
 * - Sudah dicek dan ada nominal: siap ditagih.
 * - Sudah dicek tapi nominal 0 (semua ditolak / dibatalkan): tanpa tagihan.
 */
export function submitInvoiceState(input: {
  checked: boolean
  hasActiveInvoice: boolean
  approvedAmount: number
  /** Ada lubang dari isi paket yang menahan tagihan. */
  awaitingDecision?: boolean
}): SubmitInvoiceState {
  if (input.hasActiveInvoice) return 'sudah_ditagih'
  if (!input.checked) return 'menunggu_dicek'
  if (input.awaitingDecision) return 'menunggu_keputusan'
  return input.approvedAmount > 0 ? 'siap_ditagih' : 'tanpa_tagihan'
}

export const BANK_REQUIRED_MESSAGE =
  'Isi rekening pembayaran di halaman Profil dulu sebelum menagih jastiper.'

/** Partner harus punya rekening lengkap supaya jastiper tahu ke mana harus bayar. */
export function hasBankAccount(partner: {
  bankName: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
}): boolean {
  return Boolean(
    partner.bankName && partner.bankAccountNumber && partner.bankAccountName,
  )
}

export type InvoiceCandidate = {
  id: string
  submitNo: number
  brandId: string
  state: SubmitInvoiceState
}

/**
 * Cek pilihan submit untuk satu tagihan. Mengembalikan pesan kesalahan, atau
 * null kalau boleh dilanjutkan.
 */
export function validateInvoiceSelection(input: {
  requestedIds: Array<string>
  /** Submit yang ditemukan di event ini (bisa lebih sedikit dari yang diminta). */
  candidates: Array<InvoiceCandidate>
}): string | null {
  const { requestedIds, candidates } = input
  if (requestedIds.length === 0) return 'Pilih minimal satu submit.'
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const picked: Array<InvoiceCandidate> = []
  for (const id of new Set(requestedIds)) {
    const c = byId.get(id)
    if (!c) return 'Submit tidak ditemukan di event ini.'
    picked.push(c)
  }

  if (new Set(picked.map((c) => c.brandId)).size > 1) {
    return 'Satu tagihan hanya untuk satu jastiper.'
  }
  for (const c of picked) {
    switch (c.state) {
      case 'menunggu_dicek':
        return `Submit ke-${c.submitNo} belum dicek, jadi belum bisa ditagih.`
      case 'menunggu_keputusan':
        return `Submit ke-${c.submitNo} masih menunggu keputusan jastiper untuk isi paket yang ditolak (diganti atau tidak). Pilih "Tagih apa adanya" kalau barang itu tidak jadi diganti.`
      case 'sudah_ditagih':
        return `Submit ke-${c.submitNo} sudah ada di tagihan aktif.`
      case 'tanpa_tagihan':
        return `Submit ke-${c.submitNo} tidak punya barang yang bisa ditagih.`
      case 'siap_ditagih':
        break
    }
  }

  return null
}

/** Nomor tagihan untuk ditampilkan, mis. 123 → "INV-000123". */
export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(6, '0')}`
}

export type InvoiceStatus =
  | 'ditagih'
  | 'menunggu_review'
  | 'lunas'
  | 'dibatalkan'

export type InvoiceAction =
  | 'cancel'
  | 'claim_paid'
  | 'confirm_paid'
  | 'reject_payment'

const TRANSITIONS: Record<
  InvoiceAction,
  { from: InvoiceStatus; to: InvoiceStatus }
> = {
  // Partner membatalkan tagihan. Tidak boleh lagi setelah jastiper mengaku bayar.
  cancel: { from: 'ditagih', to: 'dibatalkan' },
  // Jastiper menekan "Sudah bayar" (bersama bukti).
  claim_paid: { from: 'ditagih', to: 'menunggu_review' },
  // Partner menandai lunas.
  confirm_paid: { from: 'menunggu_review', to: 'lunas' },
  // Partner menolak bukti: kembali ke ditagih.
  reject_payment: { from: 'menunggu_review', to: 'ditagih' },
}

const TRANSITION_ERRORS: Record<InvoiceAction, Partial<Record<InvoiceStatus, string>>> = {
  cancel: {
    menunggu_review:
      'Tagihan tidak bisa dibatalkan karena jastiper sudah mengaku bayar. Tolak bukti bayarnya dulu.',
    lunas: 'Tagihan sudah lunas dan tidak bisa dibatalkan.',
    dibatalkan: 'Tagihan sudah dibatalkan.',
  },
  claim_paid: {
    menunggu_review: 'Pembayaran sudah dikirim dan menunggu dicek partner.',
    lunas: 'Tagihan ini sudah lunas.',
    dibatalkan: 'Tagihan ini sudah dibatalkan.',
  },
  confirm_paid: {
    ditagih: 'Jastiper belum mengirim bukti bayar.',
    lunas: 'Tagihan ini sudah lunas.',
    dibatalkan: 'Tagihan ini sudah dibatalkan.',
  },
  reject_payment: {
    ditagih: 'Tidak ada bukti bayar yang perlu ditolak.',
    lunas: 'Tagihan ini sudah lunas.',
    dibatalkan: 'Tagihan ini sudah dibatalkan.',
  },
}

/** Status tujuan untuk satu aksi, atau lempar Error berpesan jelas kalau tidak boleh. */
export function nextInvoiceStatus(
  from: InvoiceStatus,
  action: InvoiceAction,
): InvoiceStatus {
  const t = TRANSITIONS[action]
  if (t.from === from) return t.to
  throw new Error(
    TRANSITION_ERRORS[action][from] ?? 'Aksi ini tidak bisa dilakukan pada tagihan ini.',
  )
}

/** Label dan warna badge status tagihan. */
export function invoiceStatusMeta(status: InvoiceStatus): {
  label: string
  tone: 'info' | 'success' | 'warn' | 'neutral'
} {
  switch (status) {
    case 'ditagih':
      return { label: 'Ditagih', tone: 'warn' }
    case 'menunggu_review':
      return { label: 'Menunggu review', tone: 'info' }
    case 'lunas':
      return { label: 'Lunas', tone: 'success' }
    case 'dibatalkan':
      return { label: 'Dibatalkan', tone: 'neutral' }
  }
}
