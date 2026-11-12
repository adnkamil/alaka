import { useEffect, useRef, useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Megaphone,
} from 'lucide-react'
import { unreadNotificationsQuery } from '../../components/NotificationBell'
import {
  fetchNotifications,
  markAllNotificationsRead,
} from '../../lib/notification-functions'
import type { NotificationItem } from '../../lib/notification-functions'
import { APP_TIME_ZONE } from '../../lib/timezone'

const notificationsQuery = queryOptions({
  queryKey: ['notifications', 'list'],
  queryFn: () => fetchNotifications(),
})

export const Route = createFileRoute('/_app/notifikasi')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notificationsQuery),
  component: NotifikasiPage,
})

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  })
}

function hasAction(item: NotificationItem) {
  return item.target !== 'none'
}

function NotifikasiPage() {
  const { data: items } = useSuspenseQuery(notificationsQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const markedRef = useRef(false)

  // Status "belum dibaca" diambil dari data SAAT halaman dibuka, supaya titik
  // unread tetap terlihat walau semuanya langsung ditandai dibaca di belakang.
  const [unreadIds] = useState(
    () => new Set(items.filter((i) => !i.isRead).map((i) => i.id)),
  )

  useEffect(() => {
    if (markedRef.current) return
    markedRef.current = true
    if (unreadIds.size === 0) return
    markAllNotificationsRead()
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: unreadNotificationsQuery.queryKey,
        })
        queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey })
      })
      .catch(() => {})
  }, [queryClient, unreadIds])

  function openItem(item: NotificationItem) {
    if (item.target === 'kalender' && item.calendarEventId) {
      navigate({
        to: '/kalender/$eventId',
        params: { eventId: item.calendarEventId },
      })
      return
    }
    if (item.target === 'event' && item.eventId) {
      navigate({ to: '/events/$eventId', params: { eventId: item.eventId } })
      return
    }
    switch (item.target) {
      case 'beranda':
        navigate({ to: '/' })
        return
      case 'kalender':
        navigate({ to: '/kalender' })
        return
      case 'keuangan':
        navigate({ to: '/keuangan' })
        return
      case 'profil':
        navigate({ to: '/profil' })
        return
      default:
        return
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Kembali"
          className="flex h-9 w-9 items-center justify-center rounded-full no-underline"
          style={{ color: 'var(--app-text)' }}
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="text-lg font-bold">Notifikasi</h1>
      </header>

      {items.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Belum ada notifikasi.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.kind === 'event_baru' ? CalendarDays : Megaphone
          const unread = unreadIds.has(item.id)
          const clickable = hasAction(item)
          const content = (
            <>
              <span className="app-icon-tile h-10 w-10 flex-shrink-0">
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{item.title}</span>
                  {unread && (
                    <span
                      aria-label="Belum dibaca"
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: 'var(--app-accent)' }}
                    />
                  )}
                </span>
                {item.body && (
                  <span
                    className="block text-sm"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {item.body}
                  </span>
                )}
                <span
                  className="block text-xs"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  {formatWaktu(item.createdAt)}
                </span>
              </span>
              {clickable && (
                <ChevronRight
                  size={18}
                  style={{ color: 'var(--app-text-mute)' }}
                />
              )}
            </>
          )

          return clickable ? (
            <button
              key={item.id}
              type="button"
              onClick={() => openItem(item)}
              className="app-card flex w-full items-center gap-3 p-4 text-left"
            >
              {content}
            </button>
          ) : (
            <div key={item.id} className="app-card flex items-center gap-3 p-4">
              {content}
            </div>
          )
        })}
      </div>
    </main>
  )
}
