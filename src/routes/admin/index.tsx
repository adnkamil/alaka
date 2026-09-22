import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Banknote,
  Clock,
  CreditCard,
  Crown,
  Hourglass,
  Users,
} from 'lucide-react'
import { fetchAdminMetrics } from '../../lib/admin-functions'
import type { LucideIcon } from 'lucide-react'

const adminMetricsQuery = queryOptions({
  queryKey: ['admin-metrics'],
  queryFn: () => fetchAdminMetrics(),
})

export const Route = createFileRoute('/admin/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminMetricsQuery),
  component: AdminDashboardPage,
})

function formatIDR(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'accent',
  hint,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  hint?: string
}) {
  const toneVars: Record<string, { bg: string; fg: string }> = {
    accent: { bg: 'var(--app-accent-soft)', fg: 'var(--app-accent)' },
    success: { bg: 'var(--app-success-soft)', fg: 'var(--app-success)' },
    warning: { bg: 'var(--app-warning-soft)', fg: 'var(--app-warning)' },
    danger: { bg: 'var(--app-danger-soft)', fg: 'var(--app-danger)' },
  }
  const colors = toneVars[tone]

  return (
    <div className="app-card flex items-center justify-between p-4">
      <div>
        <p className="mb-1 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {label}
        </p>
        <p className="text-lg font-bold">{value}</p>
        {hint && (
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: 'var(--app-text-mute)' }}
          >
            {hint}
          </p>
        )}
      </div>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: colors.bg, color: colors.fg }}
      >
        <Icon size={18} />
      </span>
    </div>
  )
}

function AdminDashboardPage() {
  const { data: metrics } = useSuspenseQuery(adminMetricsQuery)

  return (
    <main className="px-4 pb-10 pt-6">
      <h1 className="mb-1 text-xl font-bold">Dashboard</h1>
      <p className="mb-6 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Ringkasan user &amp; langganan PRO.
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard
          label="Total Users"
          value={String(metrics.totalUsers)}
          icon={Users}
        />
        <MetricCard
          label="Active Users"
          value={String(metrics.activeUsers)}
          icon={Clock}
          hint="Login 14 hari terakhir"
        />
        <MetricCard
          label="PRO Active"
          value={String(metrics.proActive)}
          icon={Crown}
          tone="success"
        />
        <MetricCard
          label="PRO Pending"
          value={String(metrics.proPending)}
          icon={Hourglass}
          tone="warning"
        />
        <MetricCard
          label="PRO Revenue"
          value={formatIDR(metrics.proRevenue)}
          icon={Banknote}
          tone="accent"
          hint="Total dari semua pengajuan yang disetujui"
        />
      </section>

      {metrics.proPending > 0 && (
        <Link
          to="/admin/subscriptions"
          search={{ status: 'pending' }}
          className="app-btn-primary mt-6 flex w-full items-center justify-center gap-2 no-underline"
        >
          <CreditCard size={16} />
          Tinjau {metrics.proPending} pengajuan pending
        </Link>
      )}
    </main>
  )
}
