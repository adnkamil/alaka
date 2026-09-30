import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, MoreVertical, Plus, Tag } from 'lucide-react'
import { listFeeRules } from '../../../../lib/fee-rules-functions'

const feeRulesQuery = queryOptions({
  queryKey: ['fee-rules'],
  queryFn: () => listFeeRules(),
})

export const Route = createFileRoute('/_app/profil/fee-rules/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(feeRulesQuery),
  component: FeeRulesListPage,
})

function formatCompact(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function FeeRulesListPage() {
  const { data: rules } = useSuspenseQuery(feeRulesQuery)

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/profil" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Manajemen fee</h1>
      </header>

      <div
        className={
          rules.length === 0
            ? 'flex flex-1 flex-col items-center justify-center pb-16 text-center'
            : 'mb-4 flex flex-col gap-3'
        }
      >
        {rules.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada aturan fee.
          </p>
        )}
        {rules.map((rule: (typeof rules)[number]) => {
          const sortedTiers = [...rule.tiers].sort(
            (a, b) => Number(a.minPrice) - Number(b.minPrice),
          )
          const hasTiers = sortedTiers.length > 0
          const min = hasTiers ? sortedTiers[0].minPrice : null
          const max = hasTiers
            ? sortedTiers[sortedTiers.length - 1].maxPrice
            : null
          const firstTier = sortedTiers[0]
          const remainingCount = sortedTiers.length - 1

          return (
            <div key={rule.id} className="app-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="app-icon-tile h-9 w-9">
                    <Tag size={16} />
                  </span>
                  <div>
                    <p className="font-semibold">{rule.name}</p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {rule.tiers.length} tier
                      {hasTiers &&
                        ` · ${formatCompact(min!)} - ${formatCompact(max!)}`}
                    </p>
                  </div>
                </div>
                <Link
                  to="/profil/fee-rules/$feeRuleId"
                  params={{ feeRuleId: rule.id }}
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  <MoreVertical size={18} />
                </Link>
              </div>

              {hasTiers && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className="app-badge"
                    style={{
                      background: 'var(--app-card-hover)',
                      color: 'var(--app-text-soft)',
                    }}
                  >
                    {formatCompact(firstTier.minPrice)}-
                    {formatCompact(firstTier.maxPrice)} ={' '}
                    {formatCompact(firstTier.feeAmount)}
                  </span>
                  {remainingCount > 0 && (
                    <span
                      className="app-badge"
                      style={{
                        background: 'var(--app-card-hover)',
                        color: 'var(--app-text-soft)',
                      }}
                    >
                      +{remainingCount} lainnya
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t px-4 pt-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <Link
          to="/profil/fee-rules/new"
          className="app-btn-primary w-full no-underline"
        >
          <Plus size={18} />
          Tambah aturan fee
        </Link>
      </div>
    </main>
  )
}
