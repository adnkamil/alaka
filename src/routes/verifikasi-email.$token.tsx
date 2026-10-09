import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LinkIcon, MailCheck } from 'lucide-react'
import { verifyEmail } from '../lib/email-verification-functions'
import { currentUserQuery } from '../lib/queries'

export const Route = createFileRoute('/verifikasi-email/$token')({
  component: VerifyEmailPage,
})

type PageState = 'loading' | 'success' | 'dead' | 'error'

function VerifyEmailPage() {
  const { token } = Route.useParams()
  const queryClient = useQueryClient()
  const [state, setState] = useState<PageState>('loading')

  // Token dipakai dari sini (POST setelah halaman termuat), bukan saat link
  // dibuka — supaya pemindai link di email tidak menghanguskannya.
  useEffect(() => {
    let cancelled = false
    verifyEmail({ data: { token } })
      .then(({ status }) => {
        if (cancelled) return
        if (status === 'verified' || status === 'already') {
          setState('success')
          // Banner pengingat di app membaca data ini.
          void queryClient.invalidateQueries({
            queryKey: currentUserQuery.queryKey,
          })
        } else {
          setState('dead')
        }
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [token, queryClient])

  const content = {
    loading: {
      icon: <MailCheck size={26} />,
      title: 'Memverifikasi email...',
      body: 'Sebentar ya.',
    },
    success: {
      icon: <MailCheck size={26} />,
      title: 'Email terverifikasi',
      body: 'Terima kasih! Email kamu sudah terkonfirmasi.',
    },
    dead: {
      icon: <LinkIcon size={26} />,
      title: 'Link sudah tidak berlaku',
      body: 'Link verifikasi berlaku 24 jam dan cuma bisa dipakai sekali. Masuk ke aplikasi, lalu klik "Kirim ulang email" di bagian atas.',
    },
    error: {
      icon: <LinkIcon size={26} />,
      title: 'Gagal memverifikasi',
      body: 'Terjadi kendala. Coba muat ulang halaman ini sebentar lagi.',
    },
  }[state]

  return (
    <main className="app-shell mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="app-icon-tile mb-4 h-14 w-14">{content.icon}</span>
        <h1 className="mb-1 text-2xl font-bold">{content.title}</h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {content.body}
        </p>
      </div>
      {state !== 'loading' && state !== 'error' && (
        <Link
          to="/"
          className="app-btn-primary flex items-center justify-center gap-2"
        >
          Buka aplikasi
        </Link>
      )}
    </main>
  )
}
