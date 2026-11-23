import { useEffect, useRef, useState } from 'react'
import {
  queryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  CalendarDays,
  ChevronRight,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import {
  fetchPartnerNotifications,
  fetchPartnerUnreadCount,
  markAllPartnerNotificationsRead,
} from '../lib/partner-notification-functions'
import { APP_TIME_ZONE } from '../lib/timezone'
import type { PartnerNotificationItem } from '../lib/partner-notification-functions'
import type { LucideIcon } from 'lucide-react'

export const partnerUnreadNotificationsQuery = queryOptions({
  queryKey: ['partner-notifications', 'unread-count'],
  queryFn: () => fetchPartnerUnreadCount(),
  refetchInterval: 60_000,
})

export const partnerNotificationsQuery = queryOptions({
  queryKey: ['partner-notifications', 'list'],
  queryFn: () => fetchPartnerNotifications(),
})

export const NOTIFICATION_KIND_ICON: Record<string, LucideIcon> = {
  jastiper_ikut: CalendarDays,
  bukti_bayar: ReceiptText,
  topup_disetujui: Wallet,
  topup_ditolak: Wallet,
}

export function formatNotificationTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  })
}

const PREVIEW_COUNT = 5

/**
 * Lonceng Partner Portal (topbar desktop & header Beranda mobile). Klik membuka
 * popover berisi notifikasi terbaru; "Lihat semua" menuju halaman penuh.
 */
export default function PartnerNotificationBell() {
  const [open, setOpen] = useState(false)
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set())
  const boxRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: unread } = useQuery(partnerUnreadNotificationsQuery)
  const count = unread?.count ?? 0

  const { data: items } = useQuery({
    ...partnerNotificationsQuery,
    enabled: open,
    staleTime: 0,
  })

  // Tutup saat klik di luar atau tekan Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Titik "belum dibaca" diambil dari data saat popover dibuka, lalu semuanya
  // ditandai dibaca di belakang supaya badge lonceng hilang.
  useEffect(() => {
    if (!open) {
      snapshotRef.current = false
      return
    }
    if (!items || snapshotRef.current) return
    snapshotRef.current = true
    const ids = items.filter((i) => !i.isRead).map((i) => i.id)
    setUnreadIds(new Set(ids))
    if (ids.length === 0) return
    markAllPartnerNotificationsRead()
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: partnerUnreadNotificationsQuery.queryKey,
        }),
      )
      .catch(() => {})
  }, [open, items, queryClient])

  function openItem(item: PartnerNotificationItem) {
    setOpen(false)
    // `link` selalu path Partner Portal yang dibuat server.
    if (item.link?.startsWith('/partner')) navigate({ to: item.link })
  }

  const preview = (items ?? []).slice(0, PREVIEW_COUNT)

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          count > 0 ? `Notifikasi, ${count} belum dibaca` : 'Notifikasi'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--pm-tint)]"
        style={{ color: count > 0 ? 'var(--app-accent)' : 'var(--app-text)' }}
      >
        <Bell size={21} />
        {count > 0 && (
          <span
            className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: 'var(--app-accent)' }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifikasi"
          className="app-card absolute right-0 top-[calc(100%+8px)] z-50 flex w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden"
          style={{ boxShadow: '0 12px 32px rgba(43,33,24,0.12)' }}
        >
          <div
            className="px-4 py-3 text-sm font-bold"
            style={{ borderBottom: '1px solid var(--app-border)' }}
          >
            Notifikasi
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {!items && (
              <p
                className="px-4 py-6 text-center text-sm"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Memuat…
              </p>
            )}
            {items && preview.length === 0 && (
              <p
                className="px-4 py-6 text-center text-sm"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Belum ada notifikasi.
              </p>
            )}
            {preview.map((item) => {
              const Icon = NOTIFICATION_KIND_ICON[item.kind] ?? Bell
              const unreadItem = unreadIds.has(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  disabled={item.link === null}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--pm-tint)] disabled:cursor-default disabled:hover:bg-transparent"
                  style={{
                    background: unreadItem ? 'var(--app-accent-soft)' : undefined,
                  }}
                >
                  <span className="app-icon-tile h-9 w-9 shrink-0">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.title}
                    </span>
                    {item.body && (
                      <span
                        className="block text-xs"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        {item.body}
                      </span>
                    )}
                    <span
                      className="block text-[11px]"
                      style={{ color: 'var(--app-text-mute)' }}
                    >
                      {formatNotificationTime(item.createdAt)}
                    </span>
                  </span>
                  {item.link !== null && (
                    <ChevronRight
                      size={16}
                      className="mt-2 shrink-0"
                      style={{ color: 'var(--app-text-mute)' }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <Link
            to="/partner/notifikasi"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-center text-sm font-bold no-underline hover:bg-[var(--pm-tint)]"
            style={{
              color: 'var(--app-accent)',
              borderTop: '1px solid var(--app-border)',
            }}
          >
            Lihat semua
          </Link>
        </div>
      )}
    </div>
  )
}
