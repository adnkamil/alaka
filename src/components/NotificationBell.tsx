import { queryOptions, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { fetchUnreadNotificationCount } from '../lib/notification-functions'

export const unreadNotificationsQuery = queryOptions({
  queryKey: ['notifications', 'unread-count'],
  queryFn: () => fetchUnreadNotificationCount(),
  refetchInterval: 60_000,
})

/** Lonceng di pojok kanan atas beranda. Klik → halaman notifikasi. */
export default function NotificationBell() {
  const { data } = useQuery(unreadNotificationsQuery)
  const count = data?.count ?? 0

  return (
    <Link
      to="/notifikasi"
      aria-label={
        count > 0 ? `Notifikasi, ${count} belum dibaca` : 'Notifikasi'
      }
      className="relative flex h-13 w-13 shrink-0 items-center justify-center no-underline"
      style={{
        color: count > 0 ? 'var(--app-accent)' : 'var(--app-text)',
      }}
    >
      <Bell size={22} />
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: 'var(--app-accent)' }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
