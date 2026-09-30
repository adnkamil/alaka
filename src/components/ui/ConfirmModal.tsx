import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useBackToClose } from '../../lib/back-to-close'

interface ConfirmModalProps {
  open: boolean
  title: string
  content?: string
  okText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
  onOk: () => void | Promise<void>
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  content,
  okText = 'Konfirmasi',
  cancelText = 'Batal',
  danger = true,
  loading = false,
  onOk,
  onCancel,
}: ConfirmModalProps) {
  // Lock scroll & handle Esc key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, loading, onCancel])

  // Tombol back HP/browser nutup dialog, bukan ninggalin halaman.
  useBackToClose(open, onCancel)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur & smooth dark overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!loading) onCancel()
        }}
        aria-hidden="true"
      />

      {/* Modal Dialog with Ant Design proportion & theme variables */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-[390px] overflow-hidden rounded-2xl border p-5 shadow-2xl transition-all"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        {/* Close Button */}
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

        <div className="flex items-start gap-3.5">
          {/* Ant Design-like Alert Icon Circle */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              background: danger
                ? 'var(--app-danger-soft)'
                : 'var(--app-accent-soft)',
              color: danger ? 'var(--app-danger)' : 'var(--app-accent)',
            }}
          >
            <AlertTriangle size={20} strokeWidth={2.2} />
          </div>

          <div className="flex-1 pr-4">
            <h3 className="text-base font-bold leading-tight">{title}</h3>
            {content && (
              <p
                className="mt-1.5 text-xs leading-relaxed"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {content}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end gap-2.5">
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
            {cancelText}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onOk}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: danger ? 'var(--app-danger)' : 'var(--app-accent)',
            }}
          >
            {loading ? 'Menghapus...' : okText}
          </button>
        </div>
      </div>
    </div>
  )
}
