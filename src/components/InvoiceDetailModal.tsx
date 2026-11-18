import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import PaymentProofViewer from './PaymentProofViewer'
import { useBackToClose } from '../lib/back-to-close'
import { getErrorMessage } from '../lib/error-message'
import { formatWibDateTime } from '../lib/event-slot'
import {
  cancelInvoice,
  claimInvoicePayment,
  confirmInvoicePaid,
  getJastiperInvoice,
  getPartnerInvoice,
  rejectInvoicePayment,
} from '../lib/invoice-functions'
import type { PartnerBankInfo } from '../lib/invoice-functions'
import { formatInvoiceNumber } from '../lib/invoice-rules'
import { fileToPaymentProofBlob } from '../lib/payment-proof-image'
import { formatRupiah } from '../lib/partner-product-rules'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(blob)
  })
}

type PartnerStep = 'cancel' | 'reject' | null

/**
 * Rincian satu tagihan dari snapshot saat tagihan dibuat (bukan hitung ulang
 * dari harga katalog).
 * - Partner: batalkan (selama ditagih), lalu setelah jastiper kirim bukti bayar
 *   tandai lunas atau tolak bukti.
 * - Jastiper: baca, dan kirim bukti bayar ("Sudah bayar") selama ditagih.
 */
export default function InvoiceDetailModal({
  invoiceId,
  mode,
  onClose,
  onChanged,
}: {
  invoiceId: string
  mode: 'partner' | 'jastiper'
  onClose: () => void
  /** Dipanggil setelah status tagihan berubah, supaya daftar di belakang ikut segar. */
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['invoice-detail', mode, invoiceId],
    queryFn: () =>
      mode === 'partner'
        ? getPartnerInvoice({ data: { invoiceId } })
        : getJastiperInvoice({ data: { invoiceId } }),
  })
  const [step, setStep] = useState<PartnerStep>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proofKey, setProofKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  async function afterChange() {
    await queryClient.invalidateQueries({ queryKey: ['invoice-detail'] })
    await queryClient.invalidateQueries({ queryKey: ['event-invoices'] })
    setProofKey((k) => k + 1)
    setStep(null)
    setReason('')
    setError(null)
    onChanged?.()
  }
  const fail = (fallback: string) => (err: unknown) =>
    setError(getErrorMessage(err, fallback))

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelInvoice({ data: { invoiceId, reason: reason.trim() || undefined } }),
    onSuccess: async () => {
      await afterChange()
      onClose()
    },
    onError: fail('Gagal membatalkan tagihan'),
  })
  const confirmMutation = useMutation({
    mutationFn: () => confirmInvoicePaid({ data: { invoiceId } }),
    onSuccess: afterChange,
    onError: fail('Gagal menandai lunas'),
  })
  const rejectMutation = useMutation({
    mutationFn: () =>
      rejectInvoicePayment({
        data: { invoiceId, reason: reason.trim() || undefined },
      }),
    onSuccess: afterChange,
    onError: fail('Gagal menolak bukti bayar'),
  })
  const claimMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) {
        throw new Error('File yang dipilih bukan gambar.')
      }
      // Gambar besar diperkecil otomatis; yang kecil dikirim apa adanya.
      const blob = await fileToPaymentProofBlob(file)
      return claimInvoicePayment({
        data: { invoiceId, proofImage: await blobToDataUrl(blob) },
      })
    },
    onSuccess: afterChange,
    onError: fail('Gagal mengirim bukti bayar'),
  })

  const busy =
    cancelMutation.isPending ||
    confirmMutation.isPending ||
    rejectMutation.isPending ||
    claimMutation.isPending

  useBackToClose(true, onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const d = detail.data
  const isPartner = mode === 'partner'
  const proofUrl = `/api/invoice-proof/${invoiceId}?v=${proofKey}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => {
          if (!busy) onClose()
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 rounded-full p-1 disabled:opacity-30"
          style={{ color: 'var(--app-text-mute)' }}
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        {!d ? (
          <p className="p-6 text-sm">
            {detail.isError
              ? getErrorMessage(detail.error, 'Gagal memuat tagihan')
              : 'Memuat…'}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1 border-b p-5 pr-12" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="pm-num text-base font-bold">{formatInvoiceNumber(d.number)}</h3>
                <InvoiceStatusBadge status={d.status} />
              </div>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {d.brandName} · Submit ke-{d.submitNos.join(', ')} · dikirim {formatWibDateTime(d.sentAt)}
              </p>
              {d.status === 'dibatalkan' && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Dibatalkan {d.cancelledAt ? formatWibDateTime(d.cancelledAt) : ''}
                  {d.cancelReason ? ` · ${d.cancelReason}` : ''}
                </p>
              )}
              {d.status === 'menunggu_review' && d.paidClaimedAt && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Jastiper mengaku sudah bayar {formatWibDateTime(d.paidClaimedAt)}
                </p>
              )}
              {d.status === 'lunas' && d.paidConfirmedAt && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Lunas {formatWibDateTime(d.paidConfirmedAt)}
                </p>
              )}
            </div>

            <div className="overflow-y-auto p-0">
              <table className="w-full text-[13px]">
                <thead style={{ background: 'var(--pm-tint)' }}>
                  <tr>
                    {['Submit', 'Barang', 'Qty', 'Harga', 'Jumlah'].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide ${['Qty', 'Harga', 'Jumlah'].includes(h) ? 'text-right' : 'text-left'}`}
                        style={{ color: 'var(--pm-gold)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                      <td className="pm-num px-4 py-2.5">{l.submitNo}</td>
                      <td className="px-4 py-2.5">
                        {l.label}
                        {l.kind === 'paket' && (
                          <span className="ml-1 text-[11px]" style={{ color: 'var(--app-text-soft)' }}>(harga paket)</span>
                        )}
                      </td>
                      <td className="pm-num px-4 py-2.5 text-right">{l.qty}</td>
                      <td className="pm-num px-4 py-2.5 text-right">{formatRupiah(l.unitPrice)}</td>
                      <td className="pm-num px-4 py-2.5 text-right font-semibold">{formatRupiah(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t p-5" style={{ borderColor: 'var(--app-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>{d.totalPcs} pcs</span>
                <span className="pm-num text-lg font-bold">{formatRupiah(d.totalAmount)}</span>
              </div>

              {d.status === 'ditagih' && (
                <BankInfo
                  bank={d.partnerBank}
                  forPartner={isPartner}
                  totalAmount={d.totalAmount}
                />
              )}

              {d.hasProof && (
                <PaymentProofViewer
                  src={proofUrl}
                  label="Lihat bukti bayar"
                  className="flex items-center gap-1.5 text-xs font-semibold"
                />
              )}

              {/* Jastiper: bukti bayar ditolak partner. */}
              {!isPartner && d.status === 'ditagih' && d.paymentRejectReason && (
                <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--app-danger-soft, #fdecea)', color: 'var(--app-danger)' }}>
                  Bukti bayar ditolak partner: {d.paymentRejectReason}
                </p>
              )}

              {/* Jastiper: kirim bukti bayar. */}
              {!isPartner && d.status === 'ditagih' && (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) {
                        setError(null)
                        claimMutation.mutate(file)
                      }
                    }}
                  />
                  {error && <p className="text-xs" style={{ color: 'var(--app-danger)' }}>{error}</p>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="app-btn-primary self-end"
                    style={{ minHeight: 40, fontSize: 13 }}
                  >
                    {claimMutation.isPending ? 'Mengirim…' : 'Sudah bayar · unggah bukti'}
                  </button>
                </div>
              )}
              {!isPartner && d.status === 'menunggu_review' && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Bukti bayar sudah dikirim. Menunggu partner mengecek.
                </p>
              )}

              {/* Partner: batalkan selama ditagih. */}
              {isPartner && d.status === 'ditagih' && step === null && (
                <button
                  type="button"
                  onClick={() => setStep('cancel')}
                  className="app-btn-outline self-end"
                  style={{ color: 'var(--app-danger)', minHeight: 40, fontSize: 13 }}
                >
                  Batalkan tagihan
                </button>
              )}

              {/* Partner: review bukti bayar. */}
              {isPartner && d.status === 'menunggu_review' && step === null && (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStep('reject')}
                    className="app-btn-outline"
                    style={{ color: 'var(--app-danger)', minHeight: 40, fontSize: 13 }}
                  >
                    Tolak bukti
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirmMutation.mutate()}
                    className="app-btn-primary"
                    style={{ minHeight: 40, fontSize: 13 }}
                  >
                    {confirmMutation.isPending ? 'Menyimpan…' : 'Tandai lunas'}
                  </button>
                </div>
              )}
              {isPartner && step === null && error && (
                <p className="text-xs" style={{ color: 'var(--app-danger)' }}>{error}</p>
              )}

              {isPartner && step !== null && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                    {step === 'cancel'
                      ? 'Submit di tagihan ini kembali ke "Siap ditagih" dan barangnya bisa dibatalkan lagi. Jastiper menerima notifikasi.'
                      : 'Tagihan kembali ke "Ditagih" dan jastiper perlu mengirim bukti bayar lagi. Jastiper menerima notifikasi.'}
                  </p>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    placeholder="Alasan (opsional)"
                    aria-label="Alasan"
                    className="app-input"
                    style={{ height: 42, borderRadius: 12 }}
                  />
                  {error && <p className="text-xs" style={{ color: 'var(--app-danger)' }}>{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setStep(null)
                        setError(null)
                      }}
                      className="app-btn-outline"
                      style={{ minHeight: 40, fontSize: 13 }}
                    >
                      Kembali
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        step === 'cancel'
                          ? cancelMutation.mutate()
                          : rejectMutation.mutate()
                      }
                      className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--app-danger)' }}
                    >
                      {busy
                        ? 'Memproses…'
                        : step === 'cancel'
                          ? 'Ya, batalkan tagihan'
                          : 'Ya, tolak bukti'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Rekening tujuan transfer. Jastiper bisa menyalin nomornya. */
function BankInfo({
  bank,
  forPartner,
  totalAmount,
}: {
  bank: PartnerBankInfo | null
  forPartner: boolean
  totalAmount: number
}) {
  const [copied, setCopied] = useState(false)
  if (!bank) {
    return (
      <p
        className="rounded-lg px-3 py-2 text-xs"
        style={{ background: 'var(--pm-tint)', color: 'var(--app-text-soft)' }}
      >
        {forPartner
          ? 'Rekening pembayaran belum diisi, jadi jastiper belum tahu ke mana harus transfer. Isi di halaman Profil.'
          : 'Partner belum mengisi rekening pembayaran. Hubungi partner untuk menanyakan tujuan transfer.'}
      </p>
    )
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(bank!.accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Salin gagal (mis. izin ditolak): nomornya tetap terlihat di layar.
    }
  }
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border px-4 py-3 text-[13px]"
      style={{ borderColor: 'var(--app-border)', background: 'var(--pm-tint)' }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pm-gold)' }}>
        {forPartner ? 'Rekening yang dilihat jastiper' : 'Transfer ke'}
      </p>
      <p className="font-semibold">{bank.bankName}</p>
      <div className="flex items-center justify-between gap-3">
        <p className="pm-num text-base font-bold tracking-wide">{bank.accountNumber}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-xs font-semibold"
          style={{ color: 'var(--app-accent)' }}
        >
          {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      <p style={{ color: 'var(--app-text-soft)' }}>a.n. {bank.accountName}</p>
      {!forPartner && (
        <p className="pm-num text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Jumlah: {formatRupiah(totalAmount)}
        </p>
      )}
    </div>
  )
}
