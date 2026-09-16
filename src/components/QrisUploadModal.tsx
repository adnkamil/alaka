import { useRef, useState } from 'react'
import { QrCode, Trash2, X } from 'lucide-react'

const MAX_BYTES = 1_500_000 // ~1.5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

interface QrisUploadModalProps {
  initialImage?: string | null
  onClose: () => void
  onSubmit: (image: string) => Promise<void>
  onRemove: () => Promise<void>
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

export default function QrisUploadModal({
  initialImage,
  onClose,
  onSubmit,
  onRemove,
}: QrisUploadModalProps) {
  const [preview, setPreview] = useState<string | null>(initialImage ?? null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
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
      const dataUrl = await fileToDataUrl(file)
      setPreview(dataUrl)
    } catch {
      setError('Gagal membaca gambar, coba file lain')
    }
  }

  async function handleSave() {
    if (!preview) return
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan QRIS')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setIsRemoving(true)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus QRIS')
    } finally {
      setIsRemoving(false)
    }
  }

  const busy = isSubmitting || isRemoving

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!busy) onClose()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-[390px] overflow-hidden rounded-2xl border p-5 shadow-2xl"
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
            <h3 className="text-base font-bold leading-tight">QRIS</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-3 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Upload gambar QRIS kamu — nanti tampil di halaman invoice/tagihan
          supaya customer tinggal scan buat bayar.
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="mb-3 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4"
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
              <QrCode size={32} style={{ color: 'var(--app-text-mute)' }} />
              <span
                className="text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Tap untuk pilih gambar QRIS
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
          <p className="mb-3 text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          {initialImage && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-danger)',
              }}
            >
              <Trash2 size={14} />
              {isRemoving ? 'Menghapus...' : 'Hapus'}
            </button>
          )}
          <button
            type="button"
            disabled={busy || !preview || preview === initialImage}
            onClick={handleSave}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--app-accent)' }}
          >
            {isSubmitting ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}