import { useState } from 'react'
import { Store, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { getErrorMessage } from '../lib/error-message'
import { isValidIndonesianPhone, toLocalPhoneNumber } from '../lib/format'

export interface PartnerFormValue {
  name: string
  email: string
  waNumber: string
}

interface PartnerFormModalProps {
  onClose: () => void
  onSubmit: (value: PartnerFormValue) => Promise<void>
  /** Diisi saat mengubah partner yang sudah ada; kosong = mendaftarkan baru. */
  initial?: PartnerFormValue
  /** Catatan di bawah isian (default: penjelasan undangan email). */
  note?: string
}

/** Form admin untuk mendaftarkan partner baru (undangan lewat email) atau mengubah yang sudah ada. */
export default function PartnerFormModal({
  onClose,
  onSubmit,
  initial,
  note,
}: PartnerFormModalProps) {
  const editing = initial !== undefined
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [waNumber, setWaNumber] = useState(initial?.waNumber ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useBackToClose(true, onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const wa = waNumber.trim()
    if (wa && !isValidIndonesianPhone(wa)) {
      setError('Nomor WhatsApp tidak valid')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        waNumber: wa ? toLocalPhoneNumber(wa) : '',
      })
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          editing ? 'Gagal menyimpan partner' : 'Gagal mendaftarkan partner',
        ),
      )
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
              <Store size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">
              {editing ? 'Ubah Partner' : 'Tambah Partner'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nama partner
            <input
              required
              autoFocus={!editing}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="app-input"
              placeholder="mis. Wikibex Official"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Email (untuk login)
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="app-input"
              placeholder="admin@brand.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            No. WhatsApp (opsional)
            <input
              type="tel"
              value={waNumber}
              onChange={(e) => setWaNumber(e.target.value)}
              className="app-input"
              placeholder="08xxxxxxxxxx"
            />
          </label>

          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {note ??
              'Partner menerima email berisi tautan untuk membuat kata sandi sendiri, lalu masuk lewat halaman login biasa.'}
          </p>

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
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting
                ? editing
                  ? 'Menyimpan...'
                  : 'Mengirim...'
                : editing
                  ? 'Simpan'
                  : 'Kirim undangan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
