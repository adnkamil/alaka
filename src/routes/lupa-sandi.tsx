import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, MailCheck, ShoppingBag } from 'lucide-react'
import { requestPasswordReset } from '../lib/password-reset-functions'

export const Route = createFileRoute('/lupa-sandi')({
  component: LupaSandiPage,
})

function LupaSandiPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendResetRequest() {
    setError(null)
    setIsSubmitting(true)
    try {
      await requestPasswordReset({ data: { email } })
      setIsSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim link')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await sendResetRequest()
  }

  return (
    <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="app-icon-tile mb-4 h-14 w-14">
          {isSent ? <MailCheck size={26} /> : <ShoppingBag size={26} />}
        </span>
        <h1 className="mb-1 text-2xl font-bold">
          {isSent ? 'Cek email kamu' : 'Lupa kata sandi?'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {isSent
            ? 'Kalau email itu terdaftar, kami sudah mengirim link atur ulang kata sandi. Link berlaku 1 jam dan cuma bisa dipakai sekali.'
            : 'Masukkan email yang dipakai untuk daftar, kami kirim link buat bikin kata sandi baru.'}
        </p>
      </div>

      {isSent ? (
        <div className="flex flex-col gap-4">
          <p
            className="text-center text-xs"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Tidak ketemu? Cek folder spam/promosi, atau tunggu sebentar lalu
            kirim ulang.
          </p>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void sendResetRequest()}
            className="app-btn-outline"
          >
            {isSubmitting ? 'Mengirim...' : 'Kirim ulang link'}
          </button>
          <Link
            to="/login"
            className="app-btn-primary flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Kembali ke halaman masuk
          </Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input
              type="email"
              required
              autoFocus
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {isSubmitting ? 'Memproses...' : 'Kirim link atur ulang'}
          </button>
        </form>
      )}

      {!isSent && (
        <p
          className="mt-6 text-center text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Ingat kata sandinya?{' '}
          <Link
            to="/login"
            className="font-semibold"
            style={{ color: 'var(--app-accent)' }}
          >
            Masuk
          </Link>
        </p>
      )}
    </main>
  )
}
