import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Image as ImageIcon, Inbox, ShieldCheck, X } from 'lucide-react'
import { z } from 'zod'
import ReviewSubscriptionModal from '../../components/ReviewSubscriptionModal'
import {
  approveSubscription,
  fetchAdminSubscriptions,
  rejectSubscription,
} from '../../lib/admin-functions'
import { formatDate } from '../../lib/format'
import type { AdminSubscriptionRow } from '../../lib/admin-queries'
import type { SubscriptionStatus } from '../../lib/subscription'

const searchSchema = z.object({
  status: z.enum(['pending', 'active', 'expired', 'rejected']).optional(),
})

const adminSubscriptionsQuery = queryOptions({
  queryKey: ['admin-subscriptions'],
  // Ambil semua status sekaligus — tab difilter di client, sama seperti pola
  // filter status pesanan di halaman detail event.
  queryFn: () => fetchAdminSubscriptions({ data: undefined }),
})

export const Route = createFileRoute('/admin/subscriptions')({
  validateSearch: searchSchema,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminSubscriptionsQuery),
  component: AdminSubscriptionsPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

type Tab = 'pending' | 'active' | 'all'

function statusToTab(status?: SubscriptionStatus): Tab {
  if (status === 'active') return 'active'
  if (status && status !== 'pending') return 'all'
  return 'pending'
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank: 'Transfer Bank',
  wallet: 'E-Wallet',
  qris: 'QRIS',
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const styleByStatus: Record<
    SubscriptionStatus,
    { bg: string; fg: string; label: string }
  > = {
    pending: {
      bg: 'var(--app-warning-soft)',
      fg: 'var(--app-warning)',
      label: 'Pending',
    },
    active: {
      bg: 'var(--app-success-soft)',
      fg: 'var(--app-success)',
      label: 'Aktif',
    },
    expired: {
      bg: 'var(--app-border)',
      fg: 'var(--app-text-mute)',
      label: 'Berakhir',
    },
    rejected: {
      bg: 'var(--app-danger-soft)',
      fg: 'var(--app-danger)',
      label: 'Ditolak',
    },
  }
  const s = styleByStatus[status]
  return (
    <span className="app-badge" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

function AdminSubscriptionsPage() {
  const { status: initialStatus } = Route.useSearch()
  const { data: subscriptions } = useSuspenseQuery(adminSubscriptionsQuery)
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>(statusToTab(initialStatus))
  const [reviewTarget, setReviewTarget] = useState<{
    sub: AdminSubscriptionRow
    mode: 'approve' | 'reject'
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const pending = subscriptions.filter((s) => s.status === 'pending')
  const active = subscriptions.filter((s) => s.status === 'active')

  const visible =
    tab === 'pending' ? pending : tab === 'active' ? active : subscriptions

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-metrics'] })
  }

  async function handleReviewConfirm(note: string) {
    if (!reviewTarget) return
    setIsSubmitting(true)
    setActionError(null)
    try {
      const payload = {
        data: { id: reviewTarget.sub.id, note: note || undefined },
      }
      if (reviewTarget.mode === 'approve') {
        await approveSubscription(payload)
      } else {
        await rejectSubscription(payload)
      }
      await refresh()
      setReviewTarget(null)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal memproses pengajuan',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="px-4 pb-10 pt-6">
      <h1 className="mb-1 text-xl font-bold">Langganan PRO</h1>
      <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Verifikasi pengajuan &amp; pantau status langganan user.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(
          [
            { key: 'pending', label: 'Pending', count: pending.length },
            { key: 'active', label: 'PRO Aktif', count: active.length },
            { key: 'all', label: 'Semua', count: subscriptions.length },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs font-semibold transition-all ${
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
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {actionError && (
        <p
          className="mb-3 text-xs font-medium"
          style={{ color: 'var(--app-danger)' }}
        >
          {actionError}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada data di tab ini.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub}
              onApprove={() => setReviewTarget({ sub, mode: 'approve' })}
              onReject={() => setReviewTarget({ sub, mode: 'reject' })}
            />
          ))}
        </div>
      )}

      <ReviewSubscriptionModal
        open={reviewTarget !== null}
        mode={reviewTarget?.mode ?? 'approve'}
        userLabel={reviewTarget?.sub.userName ?? ''}
        loading={isSubmitting}
        onConfirm={handleReviewConfirm}
        onCancel={() => {
          if (!isSubmitting) setReviewTarget(null)
        }}
      />
    </main>
  )
}

function SubscriptionCard({
  sub,
  onApprove,
  onReject,
}: {
  sub: AdminSubscriptionRow
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {sub.userBrandName || sub.userName}
          </p>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {sub.userName} &middot; {sub.userEmail}
          </p>
        </div>
        <StatusBadge status={sub.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Field label="Nominal" value={formatIDR(sub.amount)} />
        <Field label="Durasi" value={`${sub.durationDays} hari`} />
        <Field
          label="Metode"
          value={
            sub.paymentMethod
              ? `${PAYMENT_METHOD_LABEL[sub.paymentMethod] ?? sub.paymentMethod}${
                  sub.paymentProvider ? ` (${sub.paymentProvider})` : ''
                }`
              : '-'
          }
        />
        <Field label="Pengirim" value={sub.paymentSenderName || '-'} />
        {sub.paymentReference && (
          <Field label="Referensi" value={sub.paymentReference} />
        )}
        <Field
          label="Diajukan"
          value={
            sub.paidAt ? formatDate(sub.paidAt) : formatDate(sub.createdAt)
          }
        />
        {sub.status === 'active' && sub.endsAt && (
          <Field label="Aktif sampai" value={formatDate(sub.endsAt)} />
        )}
        {sub.reviewedAt && (
          <Field label="Direview" value={formatDate(sub.reviewedAt)} />
        )}
      </div>

      {sub.paymentNote && (
        <p
          className="mt-3 rounded-lg p-2 text-xs leading-relaxed"
          style={{
            background: 'var(--app-border)',
            color: 'var(--app-text-soft)',
          }}
        >
          Catatan user: {sub.paymentNote}
        </p>
      )}

      {sub.reviewNote && (
        <p
          className="mt-2 rounded-lg p-2 text-xs leading-relaxed"
          style={{
            background: 'var(--app-accent-soft)',
            color: 'var(--app-accent)',
          }}
        >
          Catatan admin: {sub.reviewNote}
        </p>
      )}

      {sub.paymentProofImage && (
        <a
          href={sub.paymentProofImage}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold no-underline"
          style={{ color: 'var(--app-accent)' }}
        >
          <ImageIcon size={14} />
          Lihat bukti transfer
        </a>
      )}

      {sub.status === 'pending' && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onReject}
            className="app-btn-outline flex-1 gap-1.5 text-xs"
            style={{
              color: 'var(--app-danger)',
              borderColor: 'var(--app-danger-soft)',
            }}
          >
            <X size={14} />
            Tolak
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="app-btn-primary flex-1 gap-1.5 text-xs"
            style={{ background: 'var(--app-success)' }}
          >
            <Check size={14} />
            Setujui
          </button>
        </div>
      )}

      {sub.status === 'active' && (
        <div
          className="mt-3 flex items-center gap-1.5 text-[11px] font-medium"
          style={{ color: 'var(--app-success)' }}
        >
          <ShieldCheck size={13} />
          PRO aktif
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: 'var(--app-text-mute)' }}>{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
