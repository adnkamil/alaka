import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import {
  acceptInvitationWithPassword,
  fetchInvitationPreview,
} from '../lib/invitation-functions'
import { isTeamErrorCode, teamErrorMessage } from '../lib/team-rules'

export const Route = createFileRoute('/undangan/$token')({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loader: ({ params }) =>
    fetchInvitationPreview({ data: { token: params.token } }),
  component: InvitationPage,
})

/** Pesan untuk `?error=` yang dibawa dari alur Google (popup menutup & membuka halaman ini). */
function googleReturnMessage(code: string | undefined) {
  if (!code) return null
  if (code === 'google_unverified') return 'Email Google belum terverifikasi.'
  if (isTeamErrorCode(code)) return teamErrorMessage(code)
  return 'Gagal masuk dengan Google. Coba lagi ya.'
}

function InvitationPage() {
  const { token } = Route.useParams()
  const { error: returnedError } = Route.useSearch()
  const preview = Route.useLoaderData()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (preview.state === 'invalid') {
    return (
      <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10 text-center">
        <span className="app-icon-tile mx-auto mb-4 h-14 w-14">
          <UserPlus size={26} />
        </span>
        <h1 className="mb-2 text-2xl font-bold">Undangan tidak bisa dipakai</h1>
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
      await acceptInvitationWithPassword({
        data: {
          token,
          name,
          email: preview.state === 'valid' ? preview.email : '',
          password,
        },
      })
      queryClient.clear()
      await navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerima undangan')
    } finally {
      setIsSubmitting(false)
    }
  }

  const brandLabel = preview.brandName?.trim() || 'sebuah brand jastip'
  const shownError = error ?? googleReturnMessage(returnedError)

  return (
    <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="app-icon-tile mb-4 h-14 w-14">
          <UserPlus size={26} />
        </span>
        <h1 className="mb-1 text-2xl font-bold">Kamu diundang jadi admin</h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {brandLabel} mengundang <strong>{preview.email}</strong> untuk ikut
          mengelola brand ini.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nama
          <input
            required
            placeholder="Nama lengkap"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="app-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            readOnly
            value={preview.email}
            className="app-input"
          />
          <span className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
            Sesuai email yang diundang
          </span>
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

        {shownError && (
          <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
            {shownError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="app-btn-primary"
        >
          {isSubmitting ? 'Memproses...' : 'Terima undangan'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{ background: 'var(--app-border)' }}
        />
        <span className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
          atau
        </span>
        <div
          className="h-px flex-1"
          style={{ background: 'var(--app-border)' }}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          window.open(
            `/api/auth/google?invite=${encodeURIComponent(token)}`,
            '_blank',
          )
        }}
        className="app-btn-outline"
      >
        Lanjutkan dengan Google
      </button>
      <p
        className="mt-2 text-center text-xs"
        style={{ color: 'var(--app-text-mute)' }}
      >
        Pakai akun Google dengan email {preview.email}
      </p>
    </main>
  )
}
