import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bell, ChevronRight } from 'lucide-react'
import {
  NOTIFICATION_KIND_ICON,
  formatNotificationTime,
  partnerNotificationsQuery,
} from '../../components/PartnerNotificationBell'
import { markAllPartnerNotificationsRead } from '../../lib/partner-notification-functions'
import type { PartnerNotificationItem } from '../../lib/partner-notification-functions'

export const Route = createFileRoute('/partner/notifikasi')({
  loader: ({ context }) =>
    context.queryClient.fetchQuery({
      ...partnerNotificationsQuery,
      staleTime: 0,
    }),
  component: PartnerNotificationsPage,
})

function PartnerNotificationsPage() {
  const { data: items } = useSuspenseQuery(partnerNotificationsQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const markedRef = useRef(false)

  // Titik "belum dibaca" diambil dari data SAAT halaman dibuka, supaya tetap
  // terlihat walau semuanya langsung ditandai dibaca di belakang.
  const [unreadIds] = useState(
    () => new Set(items.filter((i) => !i.isRead).map((i) => i.id)),
  )

  useEffect(() => {
    if (markedRef.current) return
    markedRef.current = true
    if (unreadIds.size === 0) return
    markAllPartnerNotificationsRead()
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ['partner-notifications'] }),
      )
      .catch(() => {})
  }, [queryClient, unreadIds])

  function openItem(item: PartnerNotificationItem) {
    // `link` selalu path Partner Portal yang dibuat server.
    if (item.link?.startsWith('/partner')) navigate({ to: item.link })
  }

  return (
    <main className="flex flex-col gap-4 px-5 pb-6 pt-4 lg:px-0">
      <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">Notifikasi</h1>

      {items.length === 0 && (
        <div
          className="app-card flex flex-col items-center gap-2 p-8 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          <Bell size={28} style={{ color: 'var(--app-text-mute)' }} />
          Belum ada notifikasi.
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {items.map((item) => {
          const Icon = NOTIFICATION_KIND_ICON[item.kind] ?? Bell
          const unread = unreadIds.has(item.id)
          const clickable = item.link !== null
          const content = (
            <>
              <span className="app-icon-tile h-10 w-10 shrink-0">
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{item.title}</span>
                  {unread && (
                    <span
                      aria-label="Belum dibaca"
                      className="h-2 w-2 shrink-0 rounded-full"
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
                  {formatNotificationTime(item.createdAt)}
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
