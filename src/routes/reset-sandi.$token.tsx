import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, Eye, EyeOff, LinkIcon, ShoppingBag } from 'lucide-react'
import {
  resetPassword,
  validateResetToken,
} from '../lib/password-reset-functions'

function resetTokenQuery(token: string) {
  return queryOptions({
    queryKey: ['reset-token', token],
    queryFn: () => validateResetToken({ data: { token } }),
  })
}

export const Route = createFileRoute('/reset-sandi/$token')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(resetTokenQuery(params.token)),
  component: ResetSandiPage,
})

function ResetSandiPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const { data } = useSuspenseQuery(resetTokenQuery(token))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama')
      return
    }

    setIsSubmitting(true)
    try {
      await resetPassword({ data: { token, password } })
      // resetPassword sudah bikin session baru, jadi langsung masuk ke app.
      await navigate({ to: '/' })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menyimpan kata sandi',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!data.valid) {
    return (
      <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="app-icon-tile mb-4 h-14 w-14">
            <LinkIcon size={26} />
          </span>
          <h1 className="mb-1 text-2xl font-bold">Link sudah tidak berlaku</h1>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Link atur ulang kata sandi cuma bisa dipakai sekali dan berlaku 1
            jam. Minta link baru ya.
          </p>
        </div>
        <Link
          to="/lupa-sandi"
          className="app-btn-primary flex items-center justify-center gap-2"
        >
          <ArrowLeft size={18} />
          Minta link baru
        </Link>
      </main>
    )
  }

  return (
    <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="app-icon-tile mb-4 h-14 w-14">
          <ShoppingBag size={26} />
        </span>
        <h1 className="mb-1 text-2xl font-bold">Buat kata sandi baru</h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Setelah disimpan, kamu langsung masuk dan perangkat lain yang masih
          login akan keluar.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Kata sandi baru
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoFocus
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
          Konfirmasi kata sandi baru
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Ulangi kata sandi baru"
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
          {isSubmitting ? 'Menyimpan...' : 'Simpan & masuk'}
        </button>
      </form>
    </main>
  )
}
