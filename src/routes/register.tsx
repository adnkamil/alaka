import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, ShoppingBag } from 'lucide-react'
import { registerUser } from '../lib/auth-functions'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak sama')
      return
    }

    setIsSubmitting(true)
    try {
      await registerUser({ data: { name, brandName, email, password } })
      queryClient.clear()
      await navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar')
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
        <h1 className="mb-1 text-2xl font-bold">
          Mulai kelola jastip kamu dalam satu tempat
        </h1>
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
          Nama brand jastip
          <input
            placeholder="cth. Jastip ALAKA"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="app-input"
          />
          <span className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
            Opsional, tampil di struk pelanggan
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            required
            placeholder="nama@email.com"
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
          {isSubmitting ? 'Memproses...' : 'Daftar'}
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
        Sudah punya akun?{' '}
        <Link
          to="/login"
          className="font-semibold"
          style={{ color: 'var(--app-accent)' }}
        >
          Masuk
        </Link>
      </p>
    </main>
  )
}
