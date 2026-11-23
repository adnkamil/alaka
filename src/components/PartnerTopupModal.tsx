import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { QrCode, Wallet, X } from 'lucide-react'
import { fetchPartnerTopupPaymentInfo } from '../lib/partner-credit-functions'
import { PARTNER_TOPUP_AMOUNTS } from '../lib/partner-credit'
import type { PartnerTopupAmount } from '../lib/partner-credit'
import { buildDynamicQrisPayload } from '../lib/qris-display'
import { useBackToClose } from '../lib/back-to-close'
import { fileToPaymentProofBlob } from '../lib/payment-proof-image'
import { formatRupiah } from '../lib/partner-product-rules'

interface PartnerTopupModalProps {
  onClose: () => void
  onSubmit: (value: {
    amount: PartnerTopupAmount
    paymentProofImage: string
  }) => Promise<void>
}

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/webp',
]

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp'
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Top up saldo kredit partner lewat QRIS admin: pilih nominal → QRIS dinamis
 * bernominal (fallback gambar QRIS statis) → upload bukti → admin verifikasi.
 */
export default function PartnerTopupModal({ onClose, onSubmit }: PartnerTopupModalProps) {
  const { data: paymentInfo, isLoading: infoLoading } = useQuery({
    queryKey: ['partner-topup-payment-info'],
    queryFn: () => fetchPartnerTopupPaymentInfo(),
  })
  const qrisImage = paymentInfo?.qrisImage ?? null
  const qrisString = paymentInfo?.qrisString ?? null

  const [amount, setAmount] = useState<PartnerTopupAmount>(PARTNER_TOPUP_AMOUNTS[0])
  const dynamicPayload = useMemo(
    () => buildDynamicQrisPayload(qrisString, amount),
    [qrisString, amount],
  )
  const [dynamicQrUrl, setDynamicQrUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!dynamicPayload) {
      setDynamicQrUrl(null)
      return
    }
    QRCode.toDataURL(dynamicPayload, { margin: 1, width: 320 })
      .then((url) => {
        if (!cancelled) setDynamicQrUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDynamicQrUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [dynamicPayload])

  // Fallback: kalau QRIS dinamis tidak bisa dibuat, pakai gambar QRIS statis.
  const displayQrisImage = dynamicQrUrl || qrisImage
  const isDynamicActive = Boolean(dynamicQrUrl)

  const [proofImage, setProofImage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useBackToClose(true, onClose)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (!isAcceptedImage(file)) {
      setError('Format harus PNG, JPG, JPEG, atau WEBP')
      return
    }
    // Gambar > 1MB diperkecil otomatis (maks 1000px, JPEG).
    setIsProcessing(true)
    try {
      const blob = await fileToPaymentProofBlob(file)
      setProofImage(await blobToDataUrl(blob))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membaca gambar, coba file lain')
    } finally {
      setIsProcessing(false)
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
      await onSubmit({ amount, paymentProofImage: proofImage })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim top up')
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
        aria-labelledby="partner-topup-title"
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
              <Wallet size={18} />
            </span>
            <h3 id="partner-topup-title" className="text-base font-bold leading-tight">
              Top Up Saldo
            </h3>
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

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium">Nominal</legend>
          <div className="grid grid-cols-2 gap-2">
            {PARTNER_TOPUP_AMOUNTS.map((n) => {
              const active = n === amount
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={active}
                  disabled={isSubmitting}
                  onClick={() => setAmount(n)}
                  className="pm-num rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{
                    borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                    background: active ? 'var(--app-accent-soft)' : 'transparent',
                    color: active ? 'var(--app-accent)' : 'var(--app-text)',
                  }}
                >
                  {formatRupiah(n)}
                </button>
              )
            })}
          </div>
        </fieldset>

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
          ) : displayQrisImage ? (
            <img
              src={displayQrisImage}
              alt={`QRIS top up ${formatRupiah(amount)}`}
              className="h-40 w-40 rounded-lg bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-40 w-40 flex-col items-center justify-center gap-1 text-center">
              <QrCode size={22} style={{ color: 'var(--app-text-mute)' }} />
              <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                QRIS belum tersedia, hubungi admin ALAKA.
              </span>
            </div>
          )}
          {!infoLoading && (
            <p className="pm-num text-lg font-bold" style={{ color: 'var(--app-accent)' }}>
              {formatRupiah(amount)}
            </p>
          )}
          <p className="text-center text-xs" style={{ color: 'var(--app-accent)' }}>
            {isDynamicActive
              ? 'Scan, nominal terisi otomatis, lalu upload buktinya di bawah.'
              : 'Scan lalu transfer sesuai nominal di atas, upload buktinya di bawah.'}
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Bukti transfer</span>
            <button
              type="button"
              disabled={isSubmitting || isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4"
              style={{ borderColor: 'var(--app-border)' }}
            >
              {isProcessing ? (
                <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Memproses gambar...
                </span>
              ) : proofImage ? (
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
              accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp"
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
            <p role="alert" className="text-sm" style={{ color: 'var(--app-danger)' }}>
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
              disabled={isSubmitting || !displayQrisImage || !proofImage}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Mengirim...' : 'Kirim Bukti Top Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
