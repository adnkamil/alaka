import { useRef, useState } from 'react'
import { MessageSquareText, RefreshCcw, X } from 'lucide-react'
import {
  DEFAULT_WA_MESSAGE_TEMPLATE,
  MESSAGE_TEMPLATE_SAMPLE,
  MESSAGE_TEMPLATE_VARIABLES,
  renderMessageTemplate,
} from '../lib/message-template'

interface MessageTemplateModalProps {
  title?: string
  submitLabel?: string
  initialValue?: string
  onClose: () => void
  onSubmit: (template: string) => Promise<void>
}

const MAX_TEMPLATE_LENGTH = 2000

export default function MessageTemplateModal({
  title = 'Template Chat WA',
  submitLabel = 'Simpan',
  initialValue,
  onClose,
  onSubmit,
}: MessageTemplateModalProps) {
  const [template, setTemplate] = useState(
    initialValue ?? DEFAULT_WA_MESSAGE_TEMPLATE,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const preview = renderMessageTemplate(template, MESSAGE_TEMPLATE_SAMPLE)
  const tooLong = template.length > MAX_TEMPLATE_LENGTH

  function insertVariable(key: string) {
    const el = textareaRef.current
    if (!el) {
      setTemplate((prev) => prev + key)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = template.slice(0, start) + key + template.slice(end)
    setTemplate(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + key.length
      el.setSelectionRange(pos, pos)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (tooLong) {
      setError(`Template maksimal ${MAX_TEMPLATE_LENGTH} karakter`)
      return
    }
    setIsSubmitting(true)
    try {
      await onSubmit(template)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menyimpan template',
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
              <MessageSquareText size={18} />
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
            Pesan template
            <textarea
              ref={textareaRef}
              autoFocus
              rows={9}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Halo kak {customer}, ini invoice belanja di *{event}* ya kak..."
              className="app-input resize-y font-mono"
              style={{ minHeight: '9rem' }}
            />
            <span
              className="text-xs"
              style={{
                color: tooLong ? 'var(--app-danger)' : 'var(--app-text-mute)',
              }}
            >
              {template.length} / {MAX_TEMPLATE_LENGTH} karakter
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
              Tap variabel untuk tersisip di posisi kursor:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  onClick={() => insertVariable(variable.key)}
                  title={variable.description}
                  className="rounded-lg px-2 py-1 text-xs font-mono font-semibold transition-colors hover:opacity-80"
                  style={{
                    background: 'var(--app-accent-soft)',
                    color: 'var(--app-accent)',
                  }}
                >
                  {variable.key}
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: 'var(--app-accent-soft)' }}
          >
            <p
              className="mb-1 flex items-center gap-1.5 text-xs font-bold"
              style={{ color: 'var(--app-accent)' }}
            >
              <MessageSquareText size={13} />
              Preview (data contoh)
            </p>
            <pre
              className="whitespace-pre-wrap text-xs leading-relaxed"
              style={{ color: 'var(--app-text)' }}
            >
              {preview}
            </pre>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setTemplate(DEFAULT_WA_MESSAGE_TEMPLATE)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:opacity-75 disabled:opacity-50"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <RefreshCcw size={13} />
            Reset ke template default
          </button>

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
              disabled={isSubmitting || tooLong}
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