import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, Send } from 'lucide-react'
import ConfirmModal from '../../components/ui/ConfirmModal'
import {
  listAlakaNotifications,
  sendAlakaNotification,
} from '../../lib/notification-functions'
import type { NotificationTarget } from '../../lib/notification-functions'
import { APP_TIME_ZONE } from '../../lib/timezone'

const alakaNotificationsQuery = queryOptions({
  queryKey: ['admin-alaka-notifications'],
  queryFn: () => listAlakaNotifications(),
})

export const Route = createFileRoute('/admin/notifikasi')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(alakaNotificationsQuery),
  component: AdminNotifikasiPage,
})

const TARGET_OPTIONS: Array<{ value: NotificationTarget; label: string }> = [
  { value: 'none', label: 'Tidak ada (hanya info)' },
  { value: 'beranda', label: 'Beranda' },
  { value: 'kalender', label: 'Daftar event' },
  { value: 'keuangan', label: 'Keuangan' },
  { value: 'profil', label: 'Profil' },
]

const TARGET_LABEL = Object.fromEntries(
  TARGET_OPTIONS.map((o) => [o.value, o.label]),
) as Record<NotificationTarget, string>

const TITLE_MAX = 120
const BODY_MAX = 500

function AdminNotifikasiPage() {
  const queryClient = useQueryClient()
  const { data: history } = useSuspenseQuery(alakaNotificationsQuery)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState<NotificationTarget>('none')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canSubmit = title.trim().length > 0 && !sending

  async function handleSend() {
    setSending(true)
    setError(null)
    setSuccess(null)
    try {
      await sendAlakaNotification({
        data: {
          title: title.trim(),
          body: body.trim() || undefined,
          target,
        },
      })
      setTitle('')
      setBody('')
      setTarget('none')
      setSuccess('Notifikasi terkirim ke semua brand jastiper.')
      await queryClient.invalidateQueries({
        queryKey: alakaNotificationsQuery.queryKey,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim notifikasi')
    } finally {
      setSending(false)
      setConfirmOpen(false)
    }
  }

  return (
    <main className="pm-wide px-4 pb-6 pt-6 lg:max-w-[760px]! lg:mx-0!">
      <Link
        to="/admin/pengaturan"
        className="mb-3 inline-flex items-center gap-1 text-sm no-underline"
        style={{ color: 'var(--app-text-soft)' }}
      >
        <ChevronLeft size={16} /> Pengaturan
      </Link>
      <h1 className="mb-1 pm-display text-[22px] leading-tight lg:text-[26px]">
        Kirim notifikasi
      </h1>
      <p className="mb-6 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Info dari ALAKA (fitur baru, promo) yang dikirim ke semua brand
        jastiper.
      </p>

      <section className="app-card mb-6 flex flex-col gap-4 p-4">
        <div>
          <label
            className="mb-1 block text-xs font-semibold"
            htmlFor="notif-title"
          >
            Judul
          </label>
          <input
            id="notif-title"
            className="app-input w-full"
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Mis. Fitur baru: tim jastiper"
            onChange={(e) => setTitle(e.target.value)}
          />
          <p
            className="mt-1 text-right text-[11px]"
            style={{ color: 'var(--app-text-mute)' }}
          >
            {title.length}/{TITLE_MAX}
          </p>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-semibold"
            htmlFor="notif-body"
          >
            Isi (opsional)
          </label>
          <textarea
            id="notif-body"
            className="app-input w-full"
            rows={4}
            value={body}
            maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
          <p
            className="mt-1 text-right text-[11px]"
            style={{ color: 'var(--app-text-mute)' }}
          >
            {body.length}/{BODY_MAX}
          </p>
        </div>

        <div>
          <label
            className="mb-1 block text-xs font-semibold"
            htmlFor="notif-target"
          >
            Saat diklik, arahkan ke
          </label>
          <select
            id="notif-target"
            className="app-input w-full"
            value={target}
            onChange={(e) => setTarget(e.target.value as NotificationTarget)}
          >
            {TARGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--app-accent)' }}>
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {success}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => setConfirmOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--app-accent)' }}
        >
          <Send size={16} /> Kirim ke semua jastiper
        </button>
      </section>

      <p
        className="mb-2 text-xs font-semibold uppercase"
        style={{ color: 'var(--app-text-mute)' }}
      >
        Riwayat terkirim
      </p>
      {history.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Belum ada notifikasi yang dikirim.
        </p>
      ) : (
        <div
          className="app-card divide-y"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {history.map((item) => (
            <div key={item.id} className="p-4">
              <p className="font-semibold">{item.title}</p>
              {item.body && (
                <p
                  className="text-sm"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {item.body}
                </p>
              )}
              <p
                className="mt-1 text-xs"
                style={{ color: 'var(--app-text-mute)' }}
              >
                {new Date(item.createdAt).toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: APP_TIME_ZONE,
                })}{' '}
                · Tujuan: {TARGET_LABEL[item.target]}
              </p>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Kirim notifikasi?"
        content={`"${title.trim()}" akan langsung muncul di lonceng semua brand jastiper. Notifikasi tidak bisa ditarik kembali.`}
        okText="Kirim"
        cancelText="Batal"
        danger={false}
        loading={sending}
        onOk={handleSend}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  )
}
