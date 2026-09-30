import { useRef, useState } from 'react'
import { MessageSquareText, RefreshCcw } from 'lucide-react'
import {
  DEFAULT_WA_MESSAGE_TEMPLATE,
  MESSAGE_TEMPLATE_SAMPLE,
  MESSAGE_TEMPLATE_VARIABLES,
  renderMessageTemplate,
} from '../lib/message-template'

interface MessageTemplateFormProps {
  initialValue?: string
  submitLabel: string
  onSubmit: (template: string) => Promise<void>
}

/** Batas server: `updateMessageTemplate` menolak template > 2000 karakter. */
const MAX_TEMPLATE_LENGTH = 2000

/**
 * Form Template Chat WA di halaman `/profil/template-chat`.
 *
 * Dulu form ini modal. Di layar HP, isinya (textarea + chips variabel +
 * preview) bikin modal lebih tinggi dari viewport sehingga tombol Simpan
 * ketutup. Sekarang dipakai sebagai halaman biasa: kontennya cukup di-scroll,
 * tombol Simpan ada di ujung form, dan "batal" cukup lewat tombol back di
 * header halaman.
 */
export default function MessageTemplateForm({
  initialValue,
  submitLabel,
  onSubmit,
}: MessageTemplateFormProps) {
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
      setError(err instanceof Error ? err.message : 'Gagal menyimpan template')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Pesan template
        <textarea
          ref={textareaRef}
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
              className="rounded-lg px-2 py-1 font-mono text-xs font-semibold transition-colors hover:opacity-80"
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

      <button
        type="submit"
        disabled={isSubmitting || tooLong}
        className="app-btn-primary"
      >
        {isSubmitting ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
  )
}
