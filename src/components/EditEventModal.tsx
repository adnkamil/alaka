import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'

export interface EditEventValue {
  name: string
  /** Format `YYYY-MM-DD` (sesuai `<input type="date">`), dalam zona WIB. */
  eventDate: string
  description: string
}

interface EditEventModalProps {
  initialValue: EditEventValue
  onClose: () => void
  onSubmit: (value: EditEventValue) => Promise<void>
}

export default function EditEventModal({
  initialValue,
  onClose,
  onSubmit,
}: EditEventModalProps) {
  const [name, setName] = useState(initialValue.name)
  const [eventDate, setEventDate] = useState(initialValue.eventDate)
  const [description, setDescription] = useState(initialValue.description)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Komponen ini cuma dirender waktu modalnya terbuka, jadi tombol back
  // menutup dialog, bukan ninggalin halaman.
  useBackToClose(true, onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        eventDate,
        description: description.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan event')
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
              <CalendarDays size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">Ubah Event</h3>
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
            Nama event
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="app-input"
              placeholder="cth. Open PO Korea Trip"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Tanggal event
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="app-input"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Deskripsi (opsional)
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="app-input resize-y"
              placeholder="Catatan singkat tentang event ini"
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
              disabled={isSubmitting || !name.trim() || !eventDate}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}