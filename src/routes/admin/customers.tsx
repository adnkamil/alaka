import { useState } from 'react'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpDown, Inbox, Search } from 'lucide-react'
import { fetchAdminUsers } from '../../lib/admin-functions'
import { formatDateTime } from '../../lib/format'
import type { AdminUserRow } from '../../lib/admin-queries'
import type { PlanKey } from '../../lib/subscription'

const adminUsersQuery = queryOptions({
  queryKey: ['admin-users'],
  queryFn: () => fetchAdminUsers(),
})

export const Route = createFileRoute('/admin/customers')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminUsersQuery),
  component: AdminCustomersPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

/** Badge status langganan — labelnya sengaja sama dengan `PLAN_INFO` di lib. */
const PLAN_BADGE: Record<PlanKey, { label: string; bg: string; fg: string }> = {
  pro: {
    label: 'PRO',
    bg: 'var(--app-success-soft)',
    fg: 'var(--app-success)',
  },
  trial: {
    label: 'Trial',
    bg: 'var(--app-accent-soft)',
    fg: 'var(--app-accent)',
  },
  free: { label: 'FREE', bg: 'var(--app-border)', fg: 'var(--app-text-mute)' },
}

type Tab = 'all' | 'pro' | 'trial' | 'pending' | 'free'
type SortBy = 'newest' | 'revenue'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'pro', label: 'PRO' },
  { key: 'trial', label: 'Trial' },
  // "Pending" itu status pengajuan, jadi bisa nempel di plan apa pun (termasuk
  // PRO yang lagi memperpanjang) — makanya jadi tab sendiri, bukan plan.
  { key: 'pending', label: 'Pending' },
  { key: 'free', label: 'FREE' },
]

function AdminCustomersPage() {
  const { data: users } = useSuspenseQuery(adminUsersQuery)
  const [tab, setTab] = useState<Tab>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  const [search, setSearch] = useState('')

  const counts: Record<Tab, number> = {
    all: users.length,
    pro: users.filter((user) => user.plan === 'pro').length,
    trial: users.filter((user) => user.plan === 'trial').length,
    pending: users.filter((user) => user.hasPending).length,
    free: users.filter((user) => user.plan === 'free').length,
  }

  const keyword = search.trim().toLowerCase()
  const visible = users
    .filter((user) => {
      if (tab === 'pending' && !user.hasPending) return false
      if (tab !== 'pending' && tab !== 'all' && user.plan !== tab) return false
      if (!keyword) return true
      return (
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword)
      )
    })
    .sort((a, b) =>
      sortBy === 'revenue'
        ? b.revenue - a.revenue
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  return (
    <main className="px-4 pb-6 pt-6">
      <h1 className="mb-1 text-xl font-bold">Customer</h1>
      <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Semua akun yang terdaftar: status langganan, aktivitas login, dan total
        revenue dari pengajuan PRO yang sudah disetujui.
      </p>

      <div
        className="mb-3 flex items-center gap-2 rounded-xl border px-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
        }}
      >
        <Search size={16} style={{ color: 'var(--app-text-mute)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau email"
          className="app-input min-w-0 flex-1 border-0 pl-0"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              tab === t.key
                ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-sm'
                : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-accent)]'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.key
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between gap-2 text-xs">
        <span style={{ color: 'var(--app-text-mute)' }}>
          {visible.length} dari {users.length} customer
        </span>
        <button
          type="button"
          onClick={() => setSortBy(sortBy === 'newest' ? 'revenue' : 'newest')}
          className="flex items-center gap-1 font-semibold"
          style={{ color: 'var(--app-accent)' }}
        >
          <ArrowUpDown size={13} />
          {sortBy === 'newest' ? 'Terbaru' : 'Revenue tertinggi'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada customer yang cocok.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((user) => (
            <CustomerCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </main>
  )
}

/** Kartu satu customer: identitas, badge status, aktivitas, dan revenue-nya. */
function CustomerCard({ user }: { user: AdminUserRow }) {
  const badge = PLAN_BADGE[user.plan]

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {user.brandName || user.name}
          </p>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {user.brandName ? `${user.name} · ${user.email}` : user.email}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {user.isAdmin && (
            <span
              className="app-badge"
              style={{
                background: 'var(--app-border)',
                color: 'var(--app-text-soft)',
              }}
            >
              Admin
            </span>
          )}
          <span
            className="app-badge"
            style={{ background: badge.bg, color: badge.fg }}
          >
            {badge.label}
          </span>
          {user.hasPending && (
            <span
              className="app-badge"
              style={{
                background: 'var(--app-warning-soft)',
                color: 'var(--app-warning)',
              }}
            >
              Pending
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Field
          label="Status aktif"
          value={user.isActive ? 'Aktif' : 'Tidak aktif'}
          valueColor={
            user.isActive ? 'var(--app-success)' : 'var(--app-text-mute)'
          }
        />
        <Field
          label="Login terakhir"
          value={
            user.lastLoginAt
              ? formatDateTime(user.lastLoginAt)
              : 'Belum pernah login'
          }
        />
        <Field label="Total revenue" value={formatIDR(user.revenue)} />
        <Field label="Terdaftar" value={formatDateTime(user.createdAt)} />
        {/* "Aktif sampai" cuma ditampilkan buat yang sedang PRO. */}
        {user.plan === 'pro' && (
          <Field
            label="Aktif sampai"
            value={user.proUntil ? formatDateTime(user.proUntil) : '-'}
          />
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div>
      <p style={{ color: 'var(--app-text-mute)' }}>{label}</p>
      <p
        className="font-medium"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
    </div>
  )
}
