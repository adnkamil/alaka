import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { blobToDataUrl, fileToAvatarBlob } from '../lib/avatar-image'
import UserAvatar from './UserAvatar'

interface EditAvatarModalProps {
  userId?: string
  name?: string
  avatarUpdatedAt?: string | null
  /** `dataUrl` = foto yang sudah dipotong & diperkecil (WebP/JPEG). */
  onSubmit: (dataUrl: string) => Promise<void>
  onRemove: () => Promise<void>
  onClose: () => void
}

export default function EditAvatarModal({
  userId,
  name,
  avatarUpdatedAt,
  onSubmit,
  onRemove,
  onClose,
}: EditAvatarModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ blob: Blob; url: string } | null>(
    null,
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasPhoto = Boolean(avatarUpdatedAt)
  const isBusy = isProcessing || isSubmitting

  // Komponen ini cuma dirender waktu modalnya terbuka, jadi tombol back
  // menutup dialog, bukan ninggalin halaman.
  useBackToClose(true, onClose)

  // Lepas object URL preview saat diganti / modal ditutup.
  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.url)
    }
  }, [pending])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih file yang sama lagi tetap memicu onChange.
    e.target.value = ''
    if (!file) return

    setError(null)
    setIsProcessing(true)
    try {
      const blob = await fileToAvatarBlob(file)
      setPending({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses foto')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleSave() {
    if (!pending) return
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(await blobToDataUrl(pending.blob))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan foto')
      setIsSubmitting(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setIsSubmitting(true)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus foto')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isBusy) onClose()
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
              <Camera size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">Foto Brand</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          {pending ? (
            <img
              src={pending.url}
              alt="Pratinjau foto brand"
              className="h-32 w-32 rounded-full object-cover"
            />
          ) : (
            <UserAvatar
              userId={userId}
              name={name}
              avatarUpdatedAt={avatarUpdatedAt}
              className="h-32 w-32 text-4xl"
            />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{
              border: '1px solid var(--app-border)',
              background: 'transparent',
              color: 'var(--app-text)',
            }}
          >
            {isProcessing
              ? 'Memproses...'
              : pending || hasPhoto
                ? 'Pilih foto lain'
                : 'Pilih foto'}
          </button>
          <p
            className="text-center text-xs"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Foto dipotong persegi dan diperkecil otomatis.
          </p>
        </div>

        {error && (
          <p className="mt-3 text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-2.5">
          {hasPhoto && !pending ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleRemove}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ color: 'var(--app-danger)' }}
            >
              Hapus foto
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-text-soft)',
              }}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isBusy || !pending}
              onClick={handleSave}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
