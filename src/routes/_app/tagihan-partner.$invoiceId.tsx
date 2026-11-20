import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Upload,
} from 'lucide-react'
import InvoiceStatusBadge from '../../components/InvoiceStatusBadge'
import PaymentProofViewer from '../../components/PaymentProofViewer'
import { getErrorMessage } from '../../lib/error-message'
import { formatWibDateTime } from '../../lib/event-slot'
import {
  claimInvoicePayment,
  getJastiperInvoice,
} from '../../lib/invoice-functions'
import { formatInvoiceNumber } from '../../lib/invoice-rules'
import { formatRupiah } from '../../lib/partner-product-rules'
import { fileToPaymentProofBlob } from '../../lib/payment-proof-image'

export const Route = createFileRoute('/_app/tagihan-partner/$invoiceId')({
  component: PartnerInvoicePage,
})

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Halaman satu tagihan dari partner untuk jastiper: rincian, rekening tujuan
 * (bisa disalin), unduh invoice, dan unggah bukti bayar.
 */
function PartnerInvoicePage() {
  const { invoiceId } = Route.useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [proofKey, setProofKey] = useState(0)
  const [copied, setCopied] = useState(false)

  const detail = useQuery({
    queryKey: ['invoice-detail', 'jastiper', invoiceId],
    queryFn: () => getJastiperInvoice({ data: { invoiceId } }),
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail'] })
      await queryClient.invalidateQueries({ queryKey: ['event-invoices'] })
      setProofKey((k) => k + 1)
      setError(null)
    },
    onError: (err) => setError(getErrorMessage(err, 'Gagal mengirim bukti bayar')),
  })

  function goBack() {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: '/' })
  }

  /** Unduh sebagai PDF lewat dialog cetak browser (pilih "Simpan sebagai PDF"). */
  function downloadInvoice(number: number) {
    const previousTitle = document.title
    document.title = formatInvoiceNumber(number)
    const restore = () => {
      document.title = previousTitle
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  const d = detail.data

  async function copyAccount() {
    if (!d?.partnerBank) return
    try {
      await navigator.clipboard.writeText(d.partnerBank.accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Salin gagal (mis. izin ditolak): nomornya tetap terlihat di layar.
    }
  }

  return (
    <main className="app-shell relative mx-auto min-h-screen max-w-lg px-4 pb-10 pt-6">
      <header className="mb-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button type="button" onClick={goBack} aria-label="Kembali">
            <ArrowLeft size={22} style={{ color: 'var(--app-text)' }} />
          </button>
          <h1 className="text-lg font-bold">Tagihan Partner</h1>
        </div>
        {d && (
          <button
            type="button"
            onClick={() => downloadInvoice(d.number)}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold"
            style={{
              borderColor: 'var(--app-border)',
              color: 'var(--app-text-soft)',
            }}
          >
            <Download size={14} />
            Unduh invoice
          </button>
        )}
      </header>

      {!d ? (
        <div className="py-16 text-center text-sm">
          {detail.isError ? (
            <>
              <p className="mb-4">
                {getErrorMessage(detail.error, 'Gagal memuat tagihan')}
              </p>
              <Link to="/" className="app-btn-outline inline-flex no-underline">
                Kembali ke Beranda
              </Link>
            </>
          ) : (
            'Memuat…'
          )}
        </div>
      ) : (
        <>
          {/* ====== INVOICE CARD ====== */}
          <div className="app-card mb-4 overflow-hidden">
            <div
              className="flex flex-col gap-1 p-5"
              style={{ background: 'var(--app-accent-soft)' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="pm-num text-lg font-bold">
                  {formatInvoiceNumber(d.number)}
                </h2>
                <InvoiceStatusBadge status={d.status} />
              </div>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {d.brandName} · Submit ke-{d.submitNos.join(', ')} · dikirim{' '}
                {formatWibDateTime(d.sentAt)}
              </p>
              {d.status === 'dibatalkan' && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Dibatalkan{' '}
                  {d.cancelledAt ? formatWibDateTime(d.cancelledAt) : ''}
                  {d.cancelReason ? ` · ${d.cancelReason}` : ''}
                </p>
              )}
              {d.status === 'menunggu_review' && d.paidClaimedAt && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Bukti bayar dikirim {formatWibDateTime(d.paidClaimedAt)}
                </p>
              )}
              {d.status === 'lunas' && d.paidConfirmedAt && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Lunas {formatWibDateTime(d.paidConfirmedAt)}
                </p>
              )}
            </div>

            {(
              [
                ['satuan', 'Satuan'],
                ['paket', 'Paket'],
              ] as const
            ).map(([kind, title]) => {
              const group = d.lines.filter((l) => l.kind === kind)
              if (group.length === 0) return null
              return (
                <section key={kind}>
                  <h3
                    className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      background: 'var(--pm-tint)',
                      color: 'var(--pm-gold)',
                    }}
                  >
                    {title}
                  </h3>
                  <ul>
                    {group.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-start justify-between gap-3 border-t px-5 py-3 first:border-t-0"
                        style={{ borderColor: 'var(--app-border)' }}
                      >
                        <div className="min-w-0">
                          {kind === 'paket' ? (
                            <PaketLine label={l.label} />
                          ) : (
                            <p className="text-sm font-medium">{l.label}</p>
                          )}
                          <p
                            className="pm-num mt-0.5 text-xs"
                            style={{ color: 'var(--app-text-soft)' }}
                          >
                            {kind === 'paket'
                              ? `${formatRupiah(l.unitPrice)} × ${l.qty} paket`
                              : `${l.qty} pcs × ${formatRupiah(l.unitPrice)} · Submit ${l.submitNo}`}
                          </p>
                        </div>
                        <span className="pm-num whitespace-nowrap text-sm font-semibold">
                          {formatRupiah(l.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}

            <div
              className="flex items-center justify-between border-t p-5"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                {d.totalPcs} pcs
              </span>
              <span
                className="pm-num text-lg font-bold"
                style={{ color: 'var(--app-accent)' }}
              >
                {formatRupiah(d.totalAmount)}
              </span>
            </div>
          </div>

          {/* ====== REKENING ====== */}
          {d.status === 'ditagih' &&
            (d.partnerBank ? (
              <div className="app-card mb-4 flex flex-col gap-1 p-5 text-[13px]">
                <p
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--pm-gold)' }}
                >
                  Transfer ke
                </p>
                <p className="font-semibold">{d.partnerBank.bankName}</p>
                <p className="pm-num text-xl font-bold tracking-wide">
                  {d.partnerBank.accountNumber}
                </p>
                <p style={{ color: 'var(--app-text-soft)' }}>
                  a.n. {d.partnerBank.accountName}
                </p>
                <p
                  className="pm-num text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Jumlah: {formatRupiah(d.totalAmount)}
                </p>
                <button
                  type="button"
                  onClick={() => void copyAccount()}
                  className="app-btn-outline mt-3 w-full print:hidden"
                  style={{ minHeight: 40, fontSize: 13 }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Nomor rekening tersalin' : 'Salin nomor rekening'}
                </button>
              </div>
            ) : (
              <p
                className="mb-4 rounded-lg px-3 py-2 text-xs"
                style={{
                  background: 'var(--pm-tint)',
                  color: 'var(--app-text-soft)',
                }}
              >
                Partner belum mengisi rekening pembayaran. Hubungi partner untuk
                menanyakan tujuan transfer.
              </p>
            ))}

          {/* ====== BUKTI BAYAR ====== */}
          <div className="app-card flex flex-col gap-3 p-5 print:hidden">
            {d.hasProof && (
              <PaymentProofViewer
                src={`/api/invoice-proof/${invoiceId}?v=${proofKey}`}
                label="Lihat bukti bayar"
                className="flex items-center gap-1.5 text-xs font-semibold"
              />
            )}

            {d.status === 'ditagih' && d.paymentRejectReason && (
              <p
                className="rounded-lg px-3 py-2 text-xs"
                style={{
                  background: 'var(--app-danger-soft, #fdecea)',
                  color: 'var(--app-danger)',
                }}
              >
                Bukti bayar ditolak partner: {d.paymentRejectReason}
              </p>
            )}

            {d.status === 'ditagih' && (
              <>
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
                {error && (
                  <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  disabled={claimMutation.isPending}
                  onClick={() => fileRef.current?.click()}
                  className="app-btn-primary w-full"
                >
                  <Upload size={18} />
                  {claimMutation.isPending
                    ? 'Mengirim…'
                    : 'Sudah bayar · unggah bukti'}
                </button>
              </>
            )}

            {d.status === 'menunggu_review' && (
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Bukti bayar sudah dikirim. Menunggu partner mengecek.
              </p>
            )}
            {d.status === 'lunas' && (
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Tagihan ini sudah lunas.
              </p>
            )}
            {d.status === 'dibatalkan' && (
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Tagihan ini dibatalkan oleh partner.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  )
}

/** Label paket "Nama: 2× A + B" dipecah jadi nama paket dan daftar isinya. */
function PaketLine({ label }: { label: string }) {
  const sep = label.indexOf(': ')
  const name = sep === -1 ? label : label.slice(0, sep)
  const items = sep === -1 ? [] : label.slice(sep + 2).split(' + ')
  return (
    <>
      <p className="text-sm font-medium">{name}</p>
      {items.length > 0 && (
        <ul
          className="mt-0.5 text-xs"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {items.map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      )}
    </>
  )
}
