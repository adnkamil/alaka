import { useEffect, useRef, useState } from 'react'
import { Camera, User, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { blobToDataUrl, fileToAvatarBlob } from '../lib/avatar-image'
import UserAvatar from './UserAvatar'

/** Perubahan foto yang dipilih user; undefined = foto tidak diubah. */
export type AvatarChange =
  { type: 'upload'; dataUrl: string } | { type: 'remove' }

export interface ProfileFormValue {
  name: string
  brandName: string
  avatarChange?: AvatarChange
}

interface EditProfileModalProps {
  title?: string
  submitLabel?: string
  initialValue?: ProfileFormValue
  /**
   * Kalau diisi, modal menampilkan bagian foto brand di atas form.
   * Kalau tidak, modal hanya berisi nama + nama brand.
   */
  avatar?: { userId?: string; avatarUpdatedAt?: string | null }
  onClose: () => void
  onSubmit: (value: ProfileFormValue) => Promise<void>
}

export default function EditProfileModal({
  title = 'Edit Profil',
  submitLabel = 'Simpan',
  initialValue,
  avatar,
  onClose,
  onSubmit,
}: EditProfileModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialValue?.name ?? '')
  const [brandName, setBrandName] = useState(initialValue?.brandName ?? '')
  const [pendingPhoto, setPendingPhoto] = useState<{
    blob: Blob
    url: string
  } | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasPhoto = Boolean(avatar?.avatarUpdatedAt)
  const isBusy = isProcessing || isSubmitting

  // Komponen ini cuma dirender waktu modalnya terbuka, jadi back selalu
  // ditutupin ke sini. Tombol back nutup dialog, bukan ninggalin halaman.
  useBackToClose(true, onClose)

  // Lepas object URL preview saat diganti / modal ditutup.
  useEffect(() => {
    return () => {
      if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url)
    }
  }, [pendingPhoto])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih file yang sama lagi tetap memicu onChange.
    e.target.value = ''
    if (!file) return

    setError(null)
    setIsProcessing(true)
    try {
      const blob = await fileToAvatarBlob(file)
      setPendingPhoto({ blob, url: URL.createObjectURL(blob) })
      setRemovePhoto(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses foto')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      let avatarChange: AvatarChange | undefined
      if (pendingPhoto) {
        avatarChange = {
          type: 'upload',
          dataUrl: await blobToDataUrl(pendingPhoto.blob),
        }
      } else if (removePhoto) {
        avatarChange = { type: 'remove' }
      }
      await onSubmit({
        name: name.trim(),
        brandName: brandName.trim(),
        avatarChange,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil')
    } finally {
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
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-[390px] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="app-icon-tile h-10 w-10">
              <User size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">{title}</h3>
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

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {avatar && (
            <div className="flex flex-col items-center gap-2">
              {pendingPhoto ? (
                <img
                  src={pendingPhoto.url}
                  alt="Pratinjau foto brand"
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <UserAvatar
                  userId={avatar.userId}
                  name={name}
                  avatarUpdatedAt={removePhoto ? null : avatar.avatarUpdatedAt}
                  className="h-24 w-24 text-3xl"
                />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    border: '1px solid var(--app-border)',
                    background: 'transparent',
                    color: 'var(--app-text)',
                  }}
                >
                  <Camera size={13} />
                  {isProcessing
                    ? 'Memproses...'
                    : pendingPhoto || (hasPhoto && !removePhoto)
                      ? 'Ganti foto'
                      : 'Pilih foto'}
                </button>
                {(pendingPhoto || removePhoto) && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setPendingPhoto(null)
                      setRemovePhoto(false)
                    }}
                    className="text-xs font-semibold disabled:opacity-50"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Batalkan
                  </button>
                )}
                {hasPhoto && !pendingPhoto && !removePhoto && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setRemovePhoto(true)}
                    className="text-xs font-semibold disabled:opacity-50"
                    style={{ color: 'var(--app-danger)' }}
                  >
                    Hapus foto
                  </button>
                )}
              </div>
              <p
                className="text-center text-xs"
                style={{ color: 'var(--app-text-mute)' }}
              >
                Foto dipotong persegi dan diperkecil otomatis.
              </p>
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm font-medium">
            Nama
            <input
              required
              autoFocus={!avatar}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="app-input"
              placeholder="Nama kamu"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Nama brand
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="app-input"
              placeholder="cth. ALAKA Jastip Korea"
            />
            <span className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
              Ditampilkan di halaman invoice/tagihan buat pelanggan.
            </span>
          </label>

          {error && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
              {error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2.5">
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
              type="submit"
              disabled={isBusy}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Menyimpan...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}