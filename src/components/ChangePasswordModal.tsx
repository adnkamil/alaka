import { useState } from 'react'
import { Eye, EyeOff, KeyRound, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'

export interface ChangePasswordFormValue {
  currentPassword: string
  newPassword: string
}

/** Teks modal; default bahasa Indonesia. Partner Portal mengirim terjemahan. */
export interface ChangePasswordText {
  close: string
  currentLabel: string
  currentPlaceholder: string
  showCurrent: string
  newLabel: string
  newPlaceholder: string
  showNew: string
  confirmLabel: string
  confirmPlaceholder: string
  otherDevicesNote: string
  cancel: string
  saving: string
  tooShort: string
  mismatch: string
  failed: string
}

const DEFAULT_TEXT: ChangePasswordText = {
  close: 'Tutup',
  currentLabel: 'Kata sandi sekarang',
  currentPlaceholder: 'Kata sandi yang dipakai sekarang',
  showCurrent: 'Tampilkan kata sandi sekarang',
  newLabel: 'Kata sandi baru',
  newPlaceholder: 'Minimal 8 karakter',
  showNew: 'Tampilkan kata sandi baru',
  confirmLabel: 'Konfirmasi kata sandi baru',
  confirmPlaceholder: 'Ulangi kata sandi baru',
  otherDevicesNote:
    'Setelah diganti, perangkat lain yang masih login otomatis keluar.',
  cancel: 'Batal',
  saving: 'Menyimpan...',
  tooShort: 'Password minimal 8 karakter',
  mismatch: 'Konfirmasi kata sandi tidak sama',
  failed: 'Gagal mengubah kata sandi',
}

interface ChangePasswordModalProps {
  title?: string
  submitLabel?: string
  text?: ChangePasswordText
  onClose: () => void
  onSubmit: (value: ChangePasswordFormValue) => Promise<void>
}

export default function ChangePasswordModal({
  title = 'Ubah Kata Sandi',
  submitLabel = 'Simpan',
  text = DEFAULT_TEXT,
  onClose,
  onSubmit,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Komponen ini cuma dirender waktu modalnya terbuka, jadi back selalu
  // ditutupin ke sini. Tombol back nutup dialog, bukan ninggalin halaman.
  useBackToClose(true, onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError(text.tooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(text.mismatch)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({ currentPassword, newPassword })
    } catch (err) {
      setError(err instanceof Error ? err.message : text.failed)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isSubmitting) onClose()
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
              <KeyRound size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label={text.close}
          >
            <X size={18} />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {text.currentLabel}
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                autoFocus
                placeholder={text.currentPlaceholder}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="app-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center"
                style={{ color: 'var(--app-text-mute)' }}
                aria-label={text.showCurrent}
              >
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {text.newLabel}
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                placeholder={text.newPlaceholder}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="app-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center"
                style={{ color: 'var(--app-text-mute)' }}
                aria-label={text.showNew}
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {text.confirmLabel}
            <input
              type={showNew ? 'text' : 'password'}
              required
              placeholder={text.confirmPlaceholder}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="app-input"
            />
            <span className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
              {text.otherDevicesNote}
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
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-text-soft)',
              }}
            >
              {text.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-[var(--app-on-solid)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? text.saving : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
