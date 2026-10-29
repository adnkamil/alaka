import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpDown, Inbox, Search, Trash2 } from 'lucide-react'
import ConfirmModal from '../../components/ui/ConfirmModal'
import Toast from '../../components/ui/Toast'
import { deleteBrandAdmin, fetchAdminUsers } from '../../lib/admin-functions'
import { getErrorMessage } from '../../lib/error-message'
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
type SortBy = 'activity' | 'newest' | 'revenue'

const SORT_LABEL: Record<SortBy, string> = {
  activity: 'Aktivitas terbaru',
  newest: 'Terbaru',
  revenue: 'Revenue tertinggi',
}
const SORT_NEXT: Record<SortBy, SortBy> = {
  activity: 'newest',
  newest: 'revenue',
  revenue: 'activity',
}

function timeOf(value: Date | string | null) {
  return value ? new Date(value).getTime() : 0
}

// Urutan default: akun aktif dulu, lalu yang aktivitas pesanannya paling baru
// (yang belum pernah ada aktivitas jatuh ke bawah), tie-break user terbaru.
function compareByActivity(a: AdminUserRow, b: AdminUserRow) {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
  return (
    timeOf(b.lastActivityAt) - timeOf(a.lastActivityAt) ||
    timeOf(b.createdAt) - timeOf(a.createdAt)
  )
}

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
  const [sortBy, setSortBy] = useState<SortBy>('activity')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

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
    .sort((a, b) => {
      if (sortBy === 'revenue') return b.revenue - a.revenue
      if (sortBy === 'newest') return timeOf(b.createdAt) - timeOf(a.createdAt)
      return compareByActivity(a, b)
    })

  return (
    <>
      <main className="px-4 pb-6 pt-6 lg:hidden">
        <h1 className="mb-1 text-xl font-bold">Customer</h1>
        <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Semua akun yang terdaftar: status langganan, aktivitas pesanan, dan
          total revenue dari pengajuan PRO yang sudah disetujui.
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
            onClick={() => setSortBy(SORT_NEXT[sortBy])}
            className="flex items-center gap-1 font-semibold"
            style={{ color: 'var(--app-accent)' }}
          >
            <ArrowUpDown size={13} />
            {SORT_LABEL[sortBy]}
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
              <CustomerCard key={user.id} user={user} onNotice={setNotice} />
            ))}
          </div>
        )}
      </main>
      <main className="pm-wide hidden flex-col gap-5 lg:flex">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="pm-display text-[26px] leading-tight">Customer</h1>
            <p
              className="mt-1 text-[13px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {visible.length} dari {users.length} customer · status langganan,
              aktivitas pesanan, dan revenue PRO.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSortBy(SORT_NEXT[sortBy])}
            className="app-btn-outline gap-2"
            style={{ minHeight: 44, fontSize: 14 }}
          >
            <ArrowUpDown size={15} />
            {SORT_LABEL[sortBy]}
          </button>
        </header>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`pm-chip ${tab === t.key ? 'pm-chip--active' : ''}`}
              >
                {t.label} {counts[t.key]}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-[336px]">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--app-text-soft)' }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau email"
              aria-label="Cari nama atau email"
              className="app-input pl-10"
              style={{ height: 42, borderRadius: 12 }}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="app-card flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Belum ada customer yang cocok.
            </p>
          </div>
        ) : (
          <div className="app-card overflow-hidden">
            <div
              className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              <span>Customer</span>
              <span>Paket</span>
              <span>Status</span>
              <span>Aktivitas terakhir</span>
              <span>Revenue</span>
              <span>Terdaftar</span>
              <span>Aksi</span>
            </div>
            {visible.map((user) => (
              <CustomerTableRow
                key={user.id}
                user={user}
                onNotice={setNotice}
              />
            ))}
          </div>
        )}
      </main>
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </>
  )
}

function useDeleteBrand(
  user: AdminUserRow,
  onNotice: (message: string) => void,
) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const result = await deleteBrandAdmin({ data: { brandId: user.brandId } })
      setConfirmOpen(false)
      onNotice(
        `Brand "${user.brandName || user.name}" dan ${result.deletedUsers} akun dihapus`,
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] }),
      ])
    } catch (err) {
      setConfirmOpen(false)
      onNotice(getErrorMessage(err, 'Gagal menghapus brand'))
    } finally {
      setDeleting(false)
    }
  }

  return { confirmOpen, setConfirmOpen, deleting, handleDelete }
}

/** Dialog konfirmasi hapus brand, dipakai kartu mobile & baris desktop. */
function DeleteBrandModal({
  user,
  confirmOpen,
  setConfirmOpen,
  deleting,
  handleDelete,
}: { user: AdminUserRow } & ReturnType<typeof useDeleteBrand>) {
  return (
    <ConfirmModal
      open={confirmOpen}
      title={`Hapus brand "${user.brandName || user.name}"?`}
      content={`Brand ini beserta ${1 + user.adminCount} akun di dalamnya (pemilik dan admin brand) dan SEMUA datanya — event, pesanan, customer, aturan fee, langganan — akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`}
      okText="Hapus permanen"
      loading={deleting}
      onOk={handleDelete}
      onCancel={() => setConfirmOpen(false)}
    />
  )
}

/** Kartu satu customer: identitas, badge status, aktivitas, dan revenue-nya. */
function CustomerCard({
  user,
  onNotice,
}: {
  user: AdminUserRow
  onNotice: (message: string) => void
}) {
  const badge = PLAN_BADGE[user.plan]
  const del = useDeleteBrand(user, onNotice)
  const { setConfirmOpen } = del

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
            {user.adminCount > 0 && ` · ${user.adminCount} admin`}
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
          label="Aktivitas terakhir"
          value={
            user.lastActivityAt
              ? formatDateTime(user.lastActivityAt)
              : 'Belum ada aktivitas'
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

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--app-danger)' }}
      >
        <Trash2 size={13} />
        Hapus brand
      </button>

      <DeleteBrandModal user={user} {...del} />
    </div>
  )
}

const COLUMNS = 'grid-cols-[minmax(0,1fr)_90px_100px_170px_130px_150px_70px]'

/** Satu baris tabel customer di desktop. */
function CustomerTableRow({
  user,
  onNotice,
}: {
  user: AdminUserRow
  onNotice: (message: string) => void
}) {
  const badge = PLAN_BADGE[user.plan]
  const del = useDeleteBrand(user, onNotice)

  return (
    <div
      className={`grid ${COLUMNS} items-center gap-4 border-t px-5 py-3`}
      style={{ borderColor: 'var(--app-border)' }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold">
          <span className="truncate">{user.brandName || user.name}</span>
          {user.isAdmin && (
            <span
              className="app-badge shrink-0"
              style={{
                background: 'var(--app-border)',
                color: 'var(--app-text-soft)',
              }}
            >
              Admin
            </span>
          )}
        </p>
        <p
          className="truncate text-[11px]"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {user.brandName ? `${user.name} · ${user.email}` : user.email}
          {user.adminCount > 0 && ` · ${user.adminCount} admin`}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
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
      <span
        className="text-[13px] font-semibold"
        style={{
          color: user.isActive ? 'var(--app-success)' : 'var(--app-text-mute)',
        }}
      >
        {user.isActive ? 'Aktif' : 'Tidak aktif'}
      </span>
      <span className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
        {user.lastActivityAt
          ? formatDateTime(user.lastActivityAt)
          : 'Belum ada aktivitas'}
      </span>
      <span className="text-[13px] font-bold">{formatIDR(user.revenue)}</span>
      <span className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
        {formatDateTime(user.createdAt)}
      </span>
      <button
        type="button"
        onClick={() => del.setConfirmOpen(true)}
        className="self-center text-left text-[13px] font-semibold"
        style={{ color: 'var(--app-danger)' }}
      >
        Hapus
      </button>
      <DeleteBrandModal user={user} {...del} />
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
