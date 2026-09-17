import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react'
import { getFinanceSummary } from '../../lib/finance-functions'

const financeQuery = queryOptions({
  queryKey: ['finance-summary'],
  queryFn: () => getFinanceSummary(),
})

export const Route = createFileRoute('/_app/keuangan')({
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery),
  component: KeuanganPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

const monthLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

function KeuanganPage() {
  const { data } = useSuspenseQuery(financeQuery)
  const maxRevenue = Math.max(
    1,
    ...data.monthly.map((row) => Number(row.revenue)),
  )

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <h1 className="mb-6 text-xl font-bold">Keuangan</h1>

      <section className="mb-6 flex flex-col gap-3">
        <div className="app-card flex items-center justify-between p-4">
          <div>
            <p
              className="mb-1 text-sm"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Total pemasukan
            </p>
            <p className="text-xl font-bold">
              {formatIDR(data.totals.totalIn)}
            </p>
          </div>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: 'var(--app-success-soft)',
              color: 'var(--app-success)',
            }}
          >
            <TrendingUp size={18} />
          </span>
        </div>

        <div className="app-card flex items-center justify-between p-4">
          <div>
            <p
              className="mb-1 text-sm"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Total modal keluar
            </p>
            <p className="text-xl font-bold">
              {formatIDR(data.totals.totalOut)}
            </p>
          </div>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: 'var(--app-danger-soft)',
              color: 'var(--app-danger)',
            }}
          >
            <TrendingDown size={18} />
          </span>
        </div>

        <div
          className="flex items-center justify-between rounded-2xl p-4"
          style={{ background: 'var(--app-accent-soft)' }}
        >
          <div>
            <p className="mb-1 text-sm" style={{ color: 'var(--app-accent)' }}>
              Untung bersih
            </p>
            <p
              className="text-xl font-bold"
              style={{ color: 'var(--app-accent)' }}
            >
              {formatIDR(data.totals.netProfit)}
            </p>
          </div>
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: 'var(--app-card)',
              color: 'var(--app-accent)',
            }}
          >
            <DollarSign size={18} />
          </span>
        </div>
      </section>

      <h2 className="mb-1 font-bold">Pendapatan bulanan</h2>
      <p className="mb-3 text-sm" style={{ color: 'var(--app-text-soft)' }}>
        Hanya pesanan lunas
      </p>
      <div className="app-card mb-6 flex h-40 gap-2 p-4">
        {data.monthly.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada data.
          </p>
        )}
        {data.monthly.map((row) => (
          <div
            key={row.month}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className="w-full rounded-t-md"
              style={{
                background: 'var(--app-accent)',
                height: `${(Number(row.revenue) / maxRevenue) * 100}%`,
              }}
            />
            <span
              className="text-[10px]"
              style={{ color: 'var(--app-text-mute)' }}
            >
              {monthLabels[Number(row.month.split('-')[1]) - 1]}
            </span>
          </div>
        ))}
      </div>

      <h2 className="mb-3 font-bold">Rincian per event</h2>
      <div className="flex flex-col gap-3">
        {data.perEvent.map((row) => (
          <div
            key={row.eventId}
            className="app-card flex items-center justify-between p-4"
          >
            <div>
              <p className="mb-1 font-semibold">{row.eventName}</p>
              <p
                className="mb-0.5 text-xs"
                style={{ color: 'var(--app-text-mute)' }}
              >
                {new Date(row.eventDate).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Masuk {formatIDR(row.amountIn)} · Keluar{' '}
                {formatIDR(row.amountOut)}
              </p>
            </div>
            <span
              className="font-semibold"
              style={{ color: 'var(--app-accent)' }}
            >
              {formatIDR(row.profit)}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}