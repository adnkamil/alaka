import { useState } from 'react'
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Check, Clock, Crown, Lock } from 'lucide-react'
import SubmitSubscriptionModal from '../../../components/SubmitSubscriptionModal'
import type { SubmitSubscriptionValue } from '../../../components/SubmitSubscriptionModal'
import { fetchCurrentUser } from '../../../lib/auth-functions'
import { formatDate } from '../../../lib/format'
import {
  fetchMySubscriptionState,
  submitSubscriptionRequest,
} from '../../../lib/subscription-functions'
import {
  PLAN_INFO,
  PRO_FEATURES,
  PRO_FEATURE_INFO,
  canUseFeature,
  planLabel,
} from '../../../lib/subscription'
import type { Entitlement, SubscriptionStatus } from '../../../lib/subscription'

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

const mySubscriptionStateQuery = queryOptions({
  queryKey: ['my-subscription-state'],
  queryFn: () => fetchMySubscriptionState(),
})

export const Route = createFileRoute('/_app/profil/langganan')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(currentUserQuery),
      context.queryClient.ensureQueryData(mySubscriptionStateQuery),
    ]),
  component: SubscriptionPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

/** Kalimat periode plan, mis. "Sisa 12 hari (sampai 12 Februari 2026)". */
function periodText(entitlement: Entitlement) {
  if (entitlement.plan === 'pro') {
    return entitlement.proUntil
      ? `Aktif sampai ${formatDate(entitlement.proUntil)}`
      : 'Aktif'
  }

  if (entitlement.plan === 'trial') {
    return entitlement.trialEndsAt
      ? `Sisa ${entitlement.trialDaysLeft} hari (sampai ${formatDate(entitlement.trialEndsAt)})`
      : `Sisa ${entitlement.trialDaysLeft} hari`
  }

  return entitlement.trialEndsAt
    ? `Masa trial berakhir ${formatDate(entitlement.trialEndsAt)}`
    : 'Belum berlangganan PRO'
}

const STATUS_LABEL: Record<SubscriptionStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Menunggu verifikasi', bg: 'var(--app-warning-soft)', fg: 'var(--app-warning)' },
  active: { label: 'Aktif', bg: 'var(--app-success-soft)', fg: 'var(--app-success)' },
  expired: { label: 'Berakhir', bg: 'var(--app-border)', fg: 'var(--app-text-mute)' },
  rejected: { label: 'Ditolak', bg: 'var(--app-danger-soft)', fg: 'var(--app-danger)' },
}

function SubscriptionPage() {
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const { data: subscriptionState } = useSuspenseQuery(mySubscriptionStateQuery)
  const [modalOpen, setModalOpen] = useState(false)

  // Layout `_app` sudah redirect ke /login kalau sesinya habis; ini cuma jaring
  // pengaman buat tipe.
  if (!user) return null

  // Satu sumber: entitlement user dari server. Nggak ada hitung-hitungan plan
  // di sini supaya UI & server nggak bisa beda pendapat.
  const entitlement = user.entitlements
  const { pending, subscriptions: allSubscriptions } = subscriptionState
  // Yang pending sudah ditampilkan di kartu status di atas, jadi riwayat di
  // bawah cukup yang sudah selesai diproses (active/expired/rejected).
  const history = allSubscriptions.filter((row) => row.status !== 'pending')

  async function handleSubmit(value: SubmitSubscriptionValue) {
    await submitSubscriptionRequest({
      data: { paymentProofImage: value.paymentProofImage },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-subscription-state'] }),
      queryClient.invalidateQueries({ queryKey: ['current-user'] }),
    ])
    setModalOpen(false)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/profil" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Paket &amp; Langganan</h1>
      </header>

      <section className="app-card mb-6 p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
          >
            <Crown size={20} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Paket {planLabel(entitlement.plan)}</p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              {periodText(entitlement)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--app-text-soft)' }}>
          {PLAN_INFO[entitlement.plan].description}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--app-text-mute)' }}>
          Fitur PRO
        </h2>
        <div className="app-card flex flex-col divide-y" style={{ borderColor: 'var(--app-border)' }}>
          {PRO_FEATURES.map((feature) => {
            const unlocked = canUseFeature(entitlement, feature)
            const info = PRO_FEATURE_INFO[feature]
            return (
              <div key={feature} className="flex items-start gap-3 p-4" style={{ borderColor: 'var(--app-border)' }}>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: unlocked ? 'var(--app-accent-soft)' : 'var(--app-border)',
                    color: unlocked ? 'var(--app-accent)' : 'var(--app-text-mute)',
                  }}
                >
                  {unlocked ? <Check size={15} /> : <Lock size={14} />}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{info.label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--app-text-soft)' }}>
                    {info.description}
                  </p>
                </div>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: unlocked ? 'var(--app-accent)' : 'var(--app-text-mute)' }}
                >
                  {unlocked ? 'Terbuka' : 'Terkunci'}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {!entitlement.isPro && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--app-text-mute)' }}>
            Upgrade ke PRO
          </h2>

          {pending ? (
            <div className="app-card p-4">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--app-warning-soft)', color: 'var(--app-warning)' }}
                >
                  <Clock size={16} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Pengajuan sedang diverifikasi</p>
                  <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                    Diajukan {formatDate(pending.paidAt ?? pending.createdAt)}
                  </p>
                </div>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span style={{ color: 'var(--app-text-mute)' }}>Nominal</span>
                <span className="font-semibold">{formatIDR(pending.amount)}</span>
              </div>
              {pending.paymentProofImage && (
                <a
                  href={pending.paymentProofImage}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold no-underline"
                  style={{ color: 'var(--app-accent)' }}
                >
                  📎 Lihat bukti transfer yang kamu kirim
                </a>
              )}
              <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--app-text-mute)' }}>
                Admin akan memverifikasi bukti transfer ini, biasanya 1x24 jam. Status
                PRO otomatis aktif begitu disetujui.
              </p>
            </div>
          ) : (
            <div className="app-card p-4">
              <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--app-text-soft)' }}>
                Transfer sesuai nominal paket PRO, lalu ajukan lewat form — sertakan
                bukti transfer. Setelah diverifikasi admin, fitur yang terkunci
                otomatis terbuka.
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="app-btn-primary w-full"
              >
                Ajukan Upgrade ke PRO
              </button>
            </div>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--app-text-mute)' }}>
            Riwayat Pengajuan
          </h2>
          <div className="flex flex-col gap-2">
            {history.map((row) => {
              const status = STATUS_LABEL[row.status]
              return (
                <div key={row.id} className="app-card flex items-center justify-between p-3 text-xs">
                  <div>
                    <p className="font-medium">{formatIDR(row.amount)}</p>
                    <p style={{ color: 'var(--app-text-mute)' }}>
                      {formatDate(row.paidAt ?? row.createdAt)}
                    </p>
                  </div>
                  <span
                    className="app-badge"
                    style={{ background: status.bg, color: status.fg }}
                  >
                    {status.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {modalOpen && (
        <SubmitSubscriptionModal
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  )
}