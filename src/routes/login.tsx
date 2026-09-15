import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, ShoppingBag } from 'lucide-react'
import { z } from 'zod'
import { loginUser } from '../lib/auth-functions'

const searchSchema = z.object({
  error: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage,
})

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google: 'Gagal masuk dengan Google. Coba lagi ya.',
  google_state: 'Sesi login Google kedaluwarsa. Coba lagi.',
  google_config: 'Login Google belum dikonfigurasi di server.',
}

function LoginPage() {
  const navigate = useNavigate()
  const { error: googleError } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await loginUser({ data: { email, password } })
      await navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="app-icon-tile mb-4 h-14 w-14">
          <ShoppingBag size={26} />
        </span>
        <h1 className="mb-1 text-2xl font-bold">Selamat datang kembali</h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Masuk untuk kelola jastip kamu
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            placeholder="nama@email.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="app-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Kata sandi
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Kata sandi"
              required
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

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            Ingat saya
          </label>
          <Link
            to="/lupa-sandi"
            className="font-semibold"
            style={{ color: 'var(--app-accent)' }}
          >
            Lupa sandi?
          </Link>
        </div>

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
          {isSubmitting ? 'Memproses...' : 'Masuk'}
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

      {googleError && GOOGLE_ERROR_MESSAGES[googleError] && (
        <p
          className="mb-3 text-center text-sm"
          style={{ color: 'var(--app-danger)' }}
        >
          {GOOGLE_ERROR_MESSAGES[googleError]}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          window.open('/api/auth/google', '_blank')
        }}
        className="app-btn-outline"
      >
        Lanjutkan dengan Google
      </button>

      <p
        className="mt-6 text-center text-sm"
        style={{ color: 'var(--app-text-soft)' }}
      >
        Belum punya akun?{' '}
        <Link
          to="/register"
          className="font-semibold"
          style={{ color: 'var(--app-accent)' }}
        >
          Daftar
        </Link>
      </p>
    </main>
  )
}
