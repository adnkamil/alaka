import { useState } from 'react'
import { MailWarning } from 'lucide-react'
import { resendVerificationEmail } from '../lib/email-verification-functions'
import { getErrorMessage } from '../lib/error-message'

/**
 * Pengingat di atas halaman app selama email user belum diverifikasi.
 * Tidak memblokir apa pun: user tetap bisa memakai app, dan banner hilang
 * sendiri begitu `emailVerified` pada data user berubah jadi true.
 */
export default function VerifyEmailBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleResend() {
    setStatus('sending')
    setError(null)
    try {
      await resendVerificationEmail()
      setStatus('sent')
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengirim email'))
      setStatus('idle')
    }
  }

  return (
    <div
      role="status"
      className="mt-3 flex items-start gap-3 rounded-2xl p-3 text-sm"
      style={{
        background: 'var(--app-warning-soft)',
        color: 'var(--app-warning)',
      }}
    >
      <MailWarning size={18} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">Email kamu belum diverifikasi</p>
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {status === 'sent'
            ? `Link verifikasi sudah dikirim ke ${email}. Cek inbox dan folder spam.`
            : `Kami kirim link verifikasi ke ${email}. Cek inbox dan folder spam.`}
        </p>
        {error && (
          <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}
        {status !== 'sent' && (
          <button
            type="button"
            onClick={handleResend}
            disabled={status === 'sending'}
            className="self-start text-xs font-semibold underline disabled:opacity-60"
          >
            {status === 'sending' ? 'Mengirim...' : 'Kirim ulang email'}
          </button>
        )}
      </div>
    </div>
  )
}
