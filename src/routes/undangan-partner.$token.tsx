import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, Store } from 'lucide-react'
import {
  acceptPartnerInvitationWithPassword,
  fetchPartnerInvitationPreview,
} from '../lib/partner-functions'
import { getErrorMessage } from '../lib/error-message'

export const Route = createFileRoute('/undangan-partner/$token')({
  loader: ({ params }) =>
    fetchPartnerInvitationPreview({ data: { token: params.token } }),
  component: PartnerInvitationPage,
})

function PartnerInvitationPage() {
  const { token } = Route.useParams()
  const preview = Route.useLoaderData()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (preview.state === 'invalid') {
    return (
      <main className="app-shell pm mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10 text-center">
        <span className="app-icon-tile mx-auto mb-4 h-14 w-14">
          <Store size={26} />
        </span>
        <h1 className="mb-2 pm-display text-[26px] leading-tight">
          Undangan tidak bisa dipakai
        </h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {preview.message}
        </p>
        <Link to="/login" className="app-btn-outline">
          Ke halaman masuk
        </Link>
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak sama')
      return
    }

    setIsSubmitting(true)
    try {
      await acceptPartnerInvitationWithPassword({ data: { token, password } })
      queryClient.clear()
      await navigate({ to: '/partner' })
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal membuat kata sandi'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell pm mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="app-icon-tile mb-4 h-14 w-14">
          <Store size={26} />
        </span>
        <h1 className="mb-1 pm-display text-[26px] leading-tight">
          Buat kata sandi
        </h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          <strong>{preview.partnerName}</strong> sudah didaftarkan sebagai
          Partner ALAKA. Buat kata sandi untuk masuk.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            readOnly
            value={preview.email}
            className="app-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Kata sandi
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              placeholder="Minimal 8 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="app-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center"
              style={{ color: 'var(--app-text-mute)' }}
              aria-label="Tampilkan kata sandi"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Konfirmasi kata sandi
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Ulangi kata sandi"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="app-input"
          />
        </label>

        {error && (
          <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="app-btn-primary"
        >
          {isSubmitting ? 'Memproses...' : 'Simpan dan masuk'}
        </button>
      </form>
    </main>
  )
}
