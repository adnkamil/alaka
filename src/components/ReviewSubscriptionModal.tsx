import { useEffect, useState } from 'react'
import { Check, X, XCircle } from 'lucide-react'

interface ReviewSubscriptionModalProps {
  open: boolean
  mode: 'approve' | 'reject'
  userLabel: string
  loading?: boolean
  onConfirm: (note: string) => void | Promise<void>
  onCancel: () => void
}

export default function ReviewSubscriptionModal({
  open,
  mode,
  userLabel,
  loading = false,
  onConfirm,
  onCancel,
}: ReviewSubscriptionModalProps) {
  const [note, setNote] = useState('')
  const isApprove = mode === 'approve'

  useEffect(() => {
    if (open) setNote('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!loading) onCancel()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-2xl border p-5 shadow-2xl transition-all"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="absolute right-4 top-4 rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
          style={{ color: 'var(--app-text-mute)' }}
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3.5 pr-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              background: isApprove
                ? 'var(--app-success-soft)'
                : 'var(--app-danger-soft)',
              color: isApprove ? 'var(--app-success)' : 'var(--app-danger)',
            }}
          >
            {isApprove ? (
              <Check size={20} strokeWidth={2.2} />
            ) : (
              <XCircle size={20} strokeWidth={2.2} />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold leading-tight">
              {isApprove ? 'Setujui pengajuan PRO?' : 'Tolak pengajuan PRO?'}
            </h3>
            <p
              className="mt-1.5 text-xs leading-relaxed"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {userLabel}
              {isApprove
                ? ' langsung aktif PRO begitu disetujui.'
                : ' bisa mengajukan lagi setelah ini.'}
            </p>
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-xs font-medium">
          Catatan {isApprove ? '(opsional)' : '— alasan penolakan'}
          <textarea
            className="app-input min-h-[72px] resize-none text-sm font-normal"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isApprove
                ? 'mis. cocok dengan bukti transfer'
                : 'mis. bukti transfer tidak sesuai nominal'
            }
            maxLength={500}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 hover:bg-black/5 dark:hover:bg-white/5"
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
            disabled={loading}
            onClick={() => onConfirm(note)}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: isApprove
                ? 'var(--app-success)'
                : 'var(--app-danger)',
            }}
          >
            {loading ? 'Memproses...' : isApprove ? 'Setujui' : 'Tolak'}
          </button>
        </div>
      </div>
    </div>
  )
}
