import { useRef, useState } from 'react'
import { QrCode, X } from 'lucide-react'

interface UpdateQrisModalProps {
  currentQris: string | null
  onClose: () => void
  onSubmit: (qrisImage: string) => Promise<void>
}

const MAX_BYTES = 1_500_000 // ~1.5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

export default function UpdateQrisModal({
  currentQris,
  onClose,
  onSubmit,
}: UpdateQrisModalProps) {
  const [preview, setPreview] = useState<string | null>(currentQris)
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
      setPreview(await fileToDataUrl(file))
    } catch {
      setError('Gagal membaca gambar, coba file lain')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!preview) {
      setError('Upload gambar QRIS dulu')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await onSubmit(preview)
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
          if (!isSubmitting) onClose()
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
            <h3 className="text-base font-bold leading-tight">QRIS Pembayaran PRO</h3>
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

        <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Gambar ini yang bakal dilihat & di-scan member saat mengajukan upgrade
          PRO. Upload gambar baru buat menggantinya.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <button
            type="button"
            disabled={isSubmitting}
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
                <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  Tap untuk upload gambar QRIS
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
              disabled={isSubmitting || !preview}
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