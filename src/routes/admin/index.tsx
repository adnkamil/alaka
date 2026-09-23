import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  Banknote,
  Check,
  Clock,
  CreditCard,
  Crown,
  Hourglass,
  Image as ImageIcon,
  Inbox,
  Pencil,
  QrCode,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import ReviewSubscriptionModal from '../../components/ReviewSubscriptionModal'
import UpdateQrisModal from '../../components/UpdateQrisModal'
import {
  approveSubscription,
  fetchAdminMetrics,
  fetchAdminSubscriptions,
  fetchSubscriptionSettingsAdmin,
  rejectSubscription,
  updateSubscriptionPrice,
  updateSubscriptionQris,
} from '../../lib/admin-functions'
import { formatDate } from '../../lib/format'
import type { AdminSubscriptionRow } from '../../lib/admin-queries'
import type { LucideIcon } from 'lucide-react'

const adminMetricsQuery = queryOptions({
  queryKey: ['admin-metrics'],
  queryFn: () => fetchAdminMetrics(),
})

const adminSubscriptionsQuery = queryOptions({
  queryKey: ['admin-subscriptions'],
  // Ambil semua status sekaligus — tab difilter di client.
  queryFn: () => fetchAdminSubscriptions({ data: undefined }),
})

const subscriptionSettingsQuery = queryOptions({
  queryKey: ['admin-subscription-settings'],
  queryFn: () => fetchSubscriptionSettingsAdmin(),
})

export const Route = createFileRoute('/admin/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminMetricsQuery),
      context.queryClient.ensureQueryData(adminSubscriptionsQuery),
      context.queryClient.ensureQueryData(subscriptionSettingsQuery),
    ]),
  component: AdminDashboardPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
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
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
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

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank: 'Transfer Bank',
  wallet: 'E-Wallet',
  qris: 'QRIS',
}

type SubStatus = 'pending' | 'active' | 'expired' | 'rejected'

function StatusBadge({ status }: { status: SubStatus }) {
  const styleByStatus: Record<SubStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: 'var(--app-warning-soft)', fg: 'var(--app-warning)', label: 'Pending' },
    active: { bg: 'var(--app-success-soft)', fg: 'var(--app-success)', label: 'Aktif' },
    expired: { bg: 'var(--app-border)', fg: 'var(--app-text-mute)', label: 'Berakhir' },
    rejected: { bg: 'var(--app-danger-soft)', fg: 'var(--app-danger)', label: 'Ditolak' },
  }
  const s = styleByStatus[status]
  return (
    <span className="app-badge" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

type Tab = 'pending' | 'active' | 'all'

function AdminDashboardPage() {
  const queryClient = useQueryClient()
  const { data: metrics } = useSuspenseQuery(adminMetricsQuery)
  const { data: subscriptions } = useSuspenseQuery(adminSubscriptionsQuery)
  const { data: subscriptionSettings } = useSuspenseQuery(subscriptionSettingsQuery)

  const [tab, setTab] = useState<Tab>('pending')
  const [qrisModalOpen, setQrisModalOpen] = useState(false)
  const [priceEditing, setPriceEditing] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<{
    sub: AdminSubscriptionRow
    mode: 'approve' | 'reject'
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const pending = subscriptions.filter((s) => s.status === 'pending')
  const active = subscriptions.filter((s) => s.status === 'active')
  const visible = tab === 'pending' ? pending : tab === 'active' ? active : subscriptions

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-metrics'] })
  }

  async function handleReviewConfirm(note: string) {
    if (!reviewTarget) return
    setIsSubmitting(true)
    setActionError(null)
    try {
      const payload = { data: { id: reviewTarget.sub.id, note: note || undefined } }
      if (reviewTarget.mode === 'approve') {
        await approveSubscription(payload)
      } else {
        await rejectSubscription(payload)
      }
      await refresh()
      setReviewTarget(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memproses pengajuan')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdateQris(qrisImage: string) {
    await updateSubscriptionQris({ data: { qrisImage } })
    await queryClient.invalidateQueries({ queryKey: ['admin-subscription-settings'] })
    setQrisModalOpen(false)
  }

  function openPriceEditor() {
    setPriceInput(String(Math.round(Number(subscriptionSettings?.proPrice ?? '0'))))
    setPriceError(null)
    setPriceEditing(true)
  }

  async function handleSavePrice() {
    const value = Number(priceInput.replace(/\D/g, ''))
    if (!priceInput || Number.isNaN(value) || value < 0) {
      setPriceError('Harga tidak valid')
      return
    }
    setPriceSaving(true)
    setPriceError(null)
    try {
      await updateSubscriptionPrice({ data: { proPrice: value } })
      await queryClient.invalidateQueries({ queryKey: ['admin-subscription-settings'] })
      setPriceEditing(false)
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Gagal menyimpan harga')
    } finally {
      setPriceSaving(false)
    }
  }

  return (
    <main className="px-4 pb-10 pt-6">
      <h1 className="mb-1 text-xl font-bold">Dashboard</h1>
      <p className="mb-6 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Ringkasan user &amp; verifikasi langganan PRO.
      </p>

      <section className="app-card mb-6 divide-y" style={{ borderColor: 'var(--app-border)' }}>
        <p className="px-4 pt-4 text-xs font-semibold uppercase" style={{ color: 'var(--app-text-mute)' }}>
          Pengaturan Pembayaran PRO
        </p>
        <div className="flex items-center gap-3 p-4" style={{ borderColor: 'var(--app-border)' }}>
          {subscriptionSettings?.qrisImage ? (
            <img
              src={subscriptionSettings.qrisImage}
              alt="QRIS pembayaran PRO"
              className="h-14 w-14 shrink-0 rounded-lg object-contain"
              style={{ border: '1px solid var(--app-border)' }}
            />
          ) : (
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--app-warning-soft)', color: 'var(--app-warning)' }}
            >
              <QrCode size={22} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">QRIS Pembayaran</p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              {subscriptionSettings?.qrisImage
                ? 'Ditampilkan ke member saat mengajukan upgrade.'
                : 'Belum ada QRIS — member belum bisa mengajukan upgrade.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQrisModalOpen(true)}
            className="app-btn-outline shrink-0 text-xs"
          >
            {subscriptionSettings?.qrisImage ? 'Ganti' : 'Upload'}
          </button>
        </div>

        <div className="p-4" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
            >
              <Banknote size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Harga Membership</p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Nominal yang wajib ditransfer member saat mengajukan upgrade.
              </p>
              {!priceEditing && (
                <p className="mt-1 text-base font-bold">
                  {formatIDR(subscriptionSettings?.proPrice ?? '0')}
                </p>
              )}
            </div>
            {!priceEditing && (
              <button
                type="button"
                onClick={openPriceEditor}
                className="app-btn-outline flex shrink-0 items-center gap-1.5 text-xs"
              >
                <Pencil size={13} />
                Ubah
              </button>
            )}
          </div>

          {priceEditing && (
            <div className="mt-3">
              <div
                className="flex items-center overflow-hidden rounded-xl border"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span
                  className="shrink-0 whitespace-nowrap px-3 text-sm"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Rp
                </span>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={priceInput ? Number(priceInput).toLocaleString('id-ID') : ''}
                  onChange={(e) => {
                    const digits = e.target.value
                      .replace(/\D/g, '')
                      .replace(/^0+(?=\d)/, '')
                    setPriceInput(digits)
                  }}
                  className="app-input min-w-0 flex-1 border-0 pl-0"
                  placeholder="29.000"
                />
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={priceSaving}
                  onClick={() => setPriceEditing(false)}
                  className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text-soft)',
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={priceSaving}
                  onClick={handleSavePrice}
                  className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--app-accent)' }}
                >
                  {priceSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          )}
          {priceError && (
            <p className="mt-2 text-xs" style={{ color: 'var(--app-danger)' }}>
              {priceError}
            </p>
          )}
        </div>
      </section>

      {/* Kartu metrik selalu 2 per baris. Sengaja `grid-cols-2` polos, BUKAN
          `sm:grid-cols-2`: `sm:` itu breakpoint viewport, jadi di layar ponsel
          (< 640px) ia tidak pernah aktif dan kartu jatuh menumpuk satu-satu —
          padahal shell 480px ini cukup buat dua kartu. */}
      <section className="grid grid-cols-2 gap-3">
        <MetricCard label="Total Users" value={String(metrics.totalUsers)} icon={Users} />
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

      {metrics.proPending > 0 && tab !== 'pending' && (
        <button
          type="button"
          onClick={() => setTab('pending')}
          className="app-btn-primary mt-6 flex w-full items-center justify-center gap-2"
        >
          <CreditCard size={16} />
          Tinjau {metrics.proPending} pengajuan pending
        </button>
      )}

      <section className="mt-8">
        <h2 className="mb-1 text-base font-bold">Langganan PRO</h2>
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
          <p className="mb-3 text-xs font-medium" style={{ color: 'var(--app-danger)' }}>
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
      </section>

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

      {qrisModalOpen && (
        <UpdateQrisModal
          currentQris={subscriptionSettings?.qrisImage ?? null}
          onClose={() => setQrisModalOpen(false)}
          onSubmit={handleUpdateQris}
        />
      )}
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
          <p className="truncate text-sm font-semibold">{sub.userBrandName || sub.userName}</p>
          <p className="truncate text-xs" style={{ color: 'var(--app-text-soft)' }}>
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
        {sub.paymentReference && <Field label="Referensi" value={sub.paymentReference} />}
        <Field
          label="Diajukan"
          value={sub.paidAt ? formatDate(sub.paidAt) : formatDate(sub.createdAt)}
        />
        {sub.status === 'active' && sub.endsAt && (
          <Field label="Aktif sampai" value={formatDate(sub.endsAt)} />
        )}
        {sub.reviewedAt && <Field label="Direview" value={formatDate(sub.reviewedAt)} />}
      </div>

      {sub.paymentNote && (
        <p
          className="mt-3 rounded-lg p-2 text-xs leading-relaxed"
          style={{ background: 'var(--app-border)', color: 'var(--app-text-soft)' }}
        >
          Catatan user: {sub.paymentNote}
        </p>
      )}

      {sub.reviewNote && (
        <p
          className="mt-2 rounded-lg p-2 text-xs leading-relaxed"
          style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
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
            style={{ color: 'var(--app-danger)', borderColor: 'var(--app-danger-soft)' }}
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