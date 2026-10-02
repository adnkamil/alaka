import { useRef, useState } from 'react'
import jsQR from 'jsqr'
import { QrCode, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { getQrisInfo, isStaticQris, isValidQris } from '../lib/qris'

interface UpdateQrisModalProps {
  currentQris: string | null
  onClose: () => void
  onSubmit: (qrisImage: string, qrisString: string) => Promise<void>
}

const MAX_BYTES = 1_500_000 // ~1.5MB
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

function decodeQrisFromDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas tidak tersedia'))
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height)
      if (!qrCode) {
        reject(new Error('QR tidak terbaca'))
        return
      }
      const rawText = qrCode.data
      if (!isValidQris(rawText) || !isStaticQris(rawText)) {
        reject(new Error('Bukan QRIS statis yang valid'))
        return
      }
      resolve(rawText)
    }
    img.onerror = () => reject(new Error('Gagal memuat gambar'))
    img.src = dataUrl
  })
}

export default function UpdateQrisModal({
  currentQris,
  onClose,
  onSubmit,
}: UpdateQrisModalProps) {
  const [preview, setPreview] = useState<string | null>(currentQris)
  const [qrisPayload, setQrisPayload] = useState<string | null>(null)
  const [merchantDetail, setMerchantDetail] = useState<{
    merchantName: string
    merchantCity: string
  } | null>(null)
  const [isDecoding, setIsDecoding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useBackToClose(true, onClose)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setQrisPayload(null)
    setMerchantDetail(null)

    if (!isAcceptedImage(file)) {
      setError('Format harus PNG, JPG, JPEG, atau WEBP')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Ukuran gambar maksimal 1.5MB')
      return
    }

    try {
      setIsDecoding(true)
      const dataUrl = await fileToDataUrl(file)
      setPreview(dataUrl)
      const decoded = await decodeQrisFromDataUrl(dataUrl)
      const info = getQrisInfo(decoded)
      setQrisPayload(decoded)
      setMerchantDetail({
        merchantName: info.merchantName,
        merchantCity: info.merchantCity,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR tidak terbaca')
    } finally {
      setIsDecoding(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!preview) {
      setError('Upload gambar QRIS dulu')
      return
    }
    if (!qrisPayload) {
      setError('Bukan QRIS statis yang valid')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await onSubmit(preview, qrisPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan QRIS')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => {
          if (!isSubmitting && !isDecoding) onClose()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-[360px] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
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
            <h3 className="text-base font-bold leading-tight">
              QRIS Pembayaran PRO
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isDecoding}
            className="rounded-full p-1 hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Upload QRIS statis (PNG, JPG, JPEG, atau WEBP). Nominal akan terisi
          otomatis (QRIS dinamis) saat member mengajukan upgrade.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Kotak Preview / Area Upload QRIS */}
          <button
            type="button"
            disabled={isSubmitting || isDecoding}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4"
            style={{ borderColor: 'var(--app-border)' }}
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview QRIS"
                className="h-48 w-48 rounded-lg object-contain"
              />
            ) : (
              <>
                <QrCode size={28} style={{ color: 'var(--app-text-mute)' }} />
                <span
                  className="text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Tap untuk upload gambar QRIS
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

          {isDecoding && (
            <p
              className="text-center text-xs"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Memvalidasi QRIS...
            </p>
          )}

          {/* Konfirmasi data merchant terdeteksi dari QRIS */}
          {merchantDetail && (
            <div
              className="rounded-xl border p-3 text-xs"
              style={{
                borderColor: 'var(--app-border)',
                background: 'var(--app-surface)',
              }}
            >
              <p
                className="font-semibold"
                style={{ color: 'var(--app-accent)' }}
              >
                Merchant Terdeteksi:
              </p>
              <p className="font-medium">
                {merchantDetail.merchantName || '-'}
              </p>
              {merchantDetail.merchantCity && (
                <p style={{ color: 'var(--app-text-soft)' }}>
                  {merchantDetail.merchantCity}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
              {error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting || isDecoding}
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
              disabled={isSubmitting || isDecoding || !preview || !qrisPayload}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan QRIS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
