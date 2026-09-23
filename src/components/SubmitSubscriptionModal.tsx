import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QrCode, X } from 'lucide-react'
import { fetchSubscriptionPaymentInfo } from '../lib/subscription-functions'

export type SubmitSubscriptionValue = {
  paymentProofImage: string
}

interface SubmitSubscriptionModalProps {
  onClose: () => void
  onSubmit: (value: SubmitSubscriptionValue) => Promise<void>
}

const MAX_BYTES = 1_500_000 // ~1.5MB, sama dengan validasi di server
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

export default function SubmitSubscriptionModal({
  onClose,
  onSubmit,
}: SubmitSubscriptionModalProps) {
  const { data: paymentInfo, isLoading: infoLoading } = useQuery({
    queryKey: ['subscription-payment-info'],
    queryFn: () => fetchSubscriptionPaymentInfo(),
  })
  const qrisImage = paymentInfo?.qrisImage ?? null
  const proPrice = paymentInfo?.proPrice ?? '0'

  const [proofImage, setProofImage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Format harus PNG, JPEG, atau WEBP')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Ukuran gambar maksimal 1.5MB')
      return
    }

    try {
      setProofImage(await fileToDataUrl(file))
    } catch {
      setError('Gagal membaca gambar, coba file lain')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!proofImage) {
      setError('Upload bukti transfer dulu')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({ paymentProofImage: proofImage })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-[390px] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="app-icon-tile h-10 w-10">
              <QrCode size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">Ajukan Upgrade PRO</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1 hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="mb-4 flex flex-col items-center gap-2 rounded-xl p-4"
          style={{ background: 'var(--app-accent-soft)' }}
        >
          {infoLoading ? (
            <div className="flex h-40 w-40 items-center justify-center">
              <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Memuat...
              </span>
            </div>
          ) : qrisImage ? (
            <img
              src={qrisImage}
              alt="QRIS pembayaran PRO"
              className="h-40 w-40 rounded-lg bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-40 w-40 flex-col items-center justify-center gap-1 text-center">
              <QrCode size={22} style={{ color: 'var(--app-text-mute)' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                QRIS belum tersedia, hubungi admin.
              </span>
            </div>
          )}

          {!infoLoading && (
            <p className="text-lg font-bold" style={{ color: 'var(--app-accent)' }}>
              {formatIDR(proPrice)}
            </p>
          )}
          <p className="text-center text-xs" style={{ color: 'var(--app-accent)' }}>
            Scan lalu transfer sesuai nominal di atas, upload buktinya di bawah.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Bukti transfer</span>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4"
              style={{ borderColor: 'var(--app-border)' }}
            >
              {proofImage ? (
                <img
                  src={proofImage}
                  alt="Preview bukti transfer"
                  className="h-40 w-40 rounded-lg object-contain"
                />
              ) : (
                <>
                  <span className="text-2xl">📎</span>
                  <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                    Tap untuk upload screenshot transfer
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            {proofImage && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setProofImage(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="self-start text-xs font-semibold disabled:opacity-50"
                style={{ color: 'var(--app-danger)' }}
              >
                Hapus gambar ini
              </button>
            )}
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
              {error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-text-soft)',
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !qrisImage}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Mengirim...' : 'Kirim Pengajuan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}