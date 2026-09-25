import { useState } from 'react'
import { User, X } from 'lucide-react'

export interface CustomerFormValue {
  name: string
  phone: string
  address: string
}

interface CustomerFormModalProps {
  title?: string
  submitLabel?: string
  initialValue?: CustomerFormValue
  onClose: () => void
  onSubmit: (value: CustomerFormValue) => Promise<void>
}

export default function CustomerFormModal({
  title = 'Tambah Customer',
  submitLabel = 'Simpan',
  initialValue,
  onClose,
  onSubmit,
}: CustomerFormModalProps) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [phone, setPhone] = useState(initialValue?.phone ?? '')
  const [address, setAddress] = useState(initialValue?.address ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan customer')
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
              <User size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">{title}</h3>
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
            Nama
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="app-input"
              placeholder="Nama customer"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            No. HP
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="app-input"
              placeholder="08xxxxxxxxxx"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Alamat (opsional)
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="app-input resize-y"
              placeholder="mis. Jl. Merdeka No. 10, RT 02/RW 03, Kel. Sukamaju, Bandung"
            />
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
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
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