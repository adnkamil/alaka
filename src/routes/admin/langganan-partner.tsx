import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  approvePartnerSubscription,
  fetchAdminPartnerSubscriptions,
  rejectPartnerSubscription,
} from '../../lib/admin-partner-subscription-functions'

export const Route = createFileRoute('/admin/langganan-partner')({
  component: AdminPartnerSubscriptionsPage,
})

type Status = 'pending' | 'active' | 'rejected'
const TABS: Array<{ key: Status; label: string }> = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'active', label: 'Aktif' },
  { key: 'rejected', label: 'Ditolak' },
]

function AdminPartnerSubscriptionsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Status>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryKey = ['admin-partner-subscriptions', tab]
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAdminPartnerSubscriptions({ data: { status: tab } }),
  })

  async function review(id: string, action: 'approve' | 'reject') {
    setBusyId(id)
    setError(null)
    try {
      if (action === 'approve') await approvePartnerSubscription({ data: { id } })
      else await rejectPartnerSubscription({ data: { id } })
      await queryClient.invalidateQueries({ queryKey: ['admin-partner-subscriptions'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses pengajuan')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="pm-display text-[22px] leading-tight">Langganan PRO Partner</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pm-chip ${tab === t.key ? 'pm-chip--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: '#b42318' }}>{error}</p>}
      {isLoading && <p className="text-sm">Memuat…</p>}
      {!isLoading && rows.length === 0 && (
        <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Tidak ada pengajuan di tab ini.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="app-card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{row.partnerName}</p>
                <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  Diajukan {new Date(row.createdAt).toLocaleString('id-ID')}
                </p>
              </div>
              <span className="pm-num text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
                Rp{Number(row.amount).toLocaleString('id-ID')}
              </span>
            </div>
            {row.status === 'pending' && (
              <img
                src={`/api/partner-subscription-proof/${row.id}`}
                alt="Bukti transfer"
                className="max-h-72 w-full rounded-xl border object-contain bg-white"
              />
            )}
            {row.status === 'active' && row.endsAt && (
              <p className="text-sm">Aktif s.d. {new Date(row.endsAt).toLocaleDateString('id-ID')}</p>
            )}
            {row.status === 'rejected' && row.reviewNote && (
              <p className="text-sm">Alasan: {row.reviewNote}</p>
            )}
            {row.status === 'pending' && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="app-btn-outline"
                  style={{ minHeight: 40, fontSize: 13 }}
                  disabled={busyId === row.id}
                  onClick={() => review(row.id, 'reject')}
                >
                  Tolak
                </button>
                <button
                  type="button"
                  className="app-btn-primary"
                  style={{ minHeight: 40, fontSize: 13 }}
                  disabled={busyId === row.id}
                  onClick={() => review(row.id, 'approve')}
                >
                  Setujui
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  )
}
