import { useState } from 'react'
import {
  queryOptions,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowLeft, Check, Clock, Crown } from 'lucide-react'
import PaymentProofViewer from '../../../components/PaymentProofViewer'
import SubmitSubscriptionModal from '../../../components/SubmitSubscriptionModal'
import type { SubmitSubscriptionValue } from '../../../components/SubmitSubscriptionModal'
import { fetchCurrentUser } from '../../../lib/auth-functions'
import { formatDate } from '../../../lib/format'
import { paymentProofUrl } from '../../../lib/payment-proof'
import { discountPercent } from '../../../lib/price-discount'
import {
  fetchMySubscriptionState,
  fetchSubscriptionPaymentInfo,
  submitSubscriptionRequest,
} from '../../../lib/subscription-functions'
import type { Entitlement, SubscriptionStatus } from '../../../lib/subscription'

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

const mySubscriptionStateQuery = queryOptions({
  queryKey: ['my-subscription-state'],
  queryFn: () => fetchMySubscriptionState(),
})

const paymentInfoQuery = queryOptions({
  queryKey: ['subscription-payment-info'],
  queryFn: () => fetchSubscriptionPaymentInfo(),
})

export const Route = createFileRoute('/_app/profil/langganan')({
  loader: async ({ context }) => {
    // Langganan hanya untuk pemilik brand. Dicek SEBELUM memuat data langganan,
    // karena server function-nya menolak akun admin.
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (user?.brandRole !== 'owner') throw redirect({ to: '/profil' })
    await context.queryClient.ensureQueryData(mySubscriptionStateQuery)
  },
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
      ? `Trial · sisa ${entitlement.trialDaysLeft} hari (sampai ${formatDate(entitlement.trialEndsAt)})`
      : `Trial · sisa ${entitlement.trialDaysLeft} hari`
  }

  return entitlement.trialEndsAt
    ? `Masa trial berakhir ${formatDate(entitlement.trialEndsAt)}`
    : 'Belum berlangganan PRO'
}

const STATUS_LABEL: Record<
  SubscriptionStatus,
  { label: string; bg: string; fg: string }
> = {
  pending: {
    label: 'Menunggu verifikasi',
    bg: 'var(--app-warning-soft)',
    fg: 'var(--app-warning)',
  },
  active: {
    label: 'Aktif',
    bg: 'var(--app-success-soft)',
    fg: 'var(--app-success)',
  },
  expired: {
    label: 'Berakhir',
    bg: 'var(--app-border)',
    fg: 'var(--app-text-mute)',
  },
  rejected: {
    label: 'Ditolak',
    bg: 'var(--app-danger-soft)',
    fg: 'var(--app-danger)',
  },
}

/** Fitur yang sudah termasuk di paket FREE. */
const FREE_FEATURES = [
  'Event dan pesanan tanpa batas',
  'Laporan keuangan dasar',
]

/** Fitur tambahan di paket PRO. */
const PRO_FEATURES_LIST = [
  'Link tagihan publik untuk pelanggan',
  'Autocomplete nama dan no. HP customer',
  'Upload foto brand dan catatan',
  'Tambah admin tim',
]

type Tab = 'paket' | 'riwayat'

function SubscriptionPage() {
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const { data: subscriptionState } = useSuspenseQuery(mySubscriptionStateQuery)
  const { data: paymentInfo } = useQuery(paymentInfoQuery)
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('paket')

  // Layout `_app` sudah redirect ke /login kalau sesinya habis; ini cuma jaring
  // pengaman buat tipe.
  if (!user) return null

  // Satu sumber: entitlement user dari server. Nggak ada hitung-hitungan plan
  // di sini supaya UI & server nggak bisa beda pendapat.
  const entitlement = user.entitlements
  const isPro = entitlement.isPro
  const { pending, subscriptions: allSubscriptions } = subscriptionState
  const proPrice = paymentInfo ? formatIDR(paymentInfo.proPrice) : null
  // Harga coret & persen diskon hanya tampil kalau harga awal memang lebih besar.
  const discount = paymentInfo
    ? discountPercent(paymentInfo.originalPrice, paymentInfo.proPrice)
    : null
  const originalPriceText =
    discount !== null && paymentInfo?.originalPrice
      ? formatIDR(paymentInfo.originalPrice)
      : null

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

      <div
        role="tablist"
        className="mb-5 grid grid-cols-2 gap-1 rounded-full p-1"
        style={{ background: 'var(--app-border)' }}
      >
        {(['paket', 'riwayat'] as const).map((key) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className="rounded-full py-2 text-sm font-semibold transition-colors"
              style={{
                background: active ? 'var(--app-card)' : 'transparent',
                color: active ? 'var(--app-text)' : 'var(--app-text-mute)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {key === 'paket' ? 'Paket' : 'Riwayat'}
            </button>
          )
        })}
      </div>

      {tab === 'paket' && (
        <section className="flex flex-col gap-3">
          {/* Banner status: pengajuan yang sedang diverifikasi, atau masa aktif plan. */}
          {pending ? (
            <div
              className="flex items-start gap-3 rounded-2xl p-4"
              style={{ background: 'var(--app-warning-soft)' }}
            >
              <Clock
                size={18}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--app-warning)' }}
              />
              <div className="flex-1 text-xs">
                <p className="font-semibold">Pengajuan sedang diverifikasi</p>
                <p style={{ color: 'var(--app-text-soft)' }}>
                  Nominal {formatIDR(pending.amount)} · diajukan{' '}
                  {formatDate(pending.paidAt ?? pending.createdAt)}
                </p>
                {pending.hasPaymentProof && (
                  <PaymentProofViewer
                    src={paymentProofUrl(pending.id)}
                    label="Lihat bukti transfer"
                    className="mt-1 flex items-center gap-1.5 font-semibold"
                  />
                )}
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-3 rounded-2xl p-4 text-xs"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-text-soft)',
              }}
            >
              <Crown size={16} style={{ color: 'var(--app-accent)' }} />
              {periodText(entitlement)}
            </div>
          )}

          {/* Kartu FREE */}
          <div
            className="app-card p-5"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold">Free</p>
              {!isPro && (
                <span
                  className="app-badge"
                  style={{
                    background: 'var(--app-border)',
                    color: 'var(--app-text-soft)',
                  }}
                >
                  Paket saat ini
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-2.5">
              {FREE_FEATURES.map((text) => (
                <li key={text} className="flex items-center gap-2.5 text-sm">
                  <Check size={16} style={{ color: 'var(--app-accent)' }} />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Kartu PRO */}
          <div
            className="app-card p-5"
            style={{ borderColor: 'var(--app-accent)' }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div
                className="flex items-center gap-2"
                style={{ color: 'var(--app-accent)' }}
              >
                <Crown size={18} />
                <p className="text-base font-bold">PRO</p>
                {discount !== null && !isPro && (
                  <span
                    className="app-badge"
                    style={{
                      background: 'var(--app-accent-soft)',
                      color: 'var(--app-accent)',
                    }}
                  >
                    Hemat {discount}%
                  </span>
                )}
                {isPro && (
                  <span
                    className="app-badge"
                    style={{
                      background: 'var(--app-accent-soft)',
                      color: 'var(--app-accent)',
                    }}
                  >
                    Paket saat ini
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end">
                {originalPriceText && (
                  <span
                    className="text-xs line-through"
                    style={{ color: 'var(--app-text-mute)' }}
                  >
                    {originalPriceText}
                  </span>
                )}
                <p className="text-2xl font-bold">
                  {proPrice ?? '—'}
                  <span
                    className="text-xs font-normal"
                    style={{ color: 'var(--app-text-mute)' }}
                  >
                    {' '}
                    /bulan
                  </span>
                </p>
              </div>
            </div>
            <ul className="mb-4 flex flex-col gap-2.5">
              {PRO_FEATURES_LIST.map((text) => (
                <li key={text} className="flex items-center gap-2.5 text-sm">
                  <Check size={16} style={{ color: 'var(--app-accent)' }} />
                  {text}
                </li>
              ))}
            </ul>

            {!isPro && !pending && (
              <>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  disabled={!user.emailVerified}
                  className="app-btn-primary w-full disabled:opacity-50"
                >
                  Ajukan Upgrade ke PRO
                </button>
                {!user.emailVerified && (
                  <p
                    className="mt-2 text-center text-xs"
                    style={{ color: 'var(--app-warning)' }}
                  >
                    Verifikasi email kamu dulu untuk mengajukan upgrade.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {tab === 'riwayat' && (
        <section className="flex flex-col gap-2">
          {allSubscriptions.length === 0 && (
            <p
              className="py-10 text-center text-sm"
              style={{ color: 'var(--app-text-mute)' }}
            >
              Belum ada transaksi langganan.
            </p>
          )}

          {allSubscriptions.map((row) => {
            const status = STATUS_LABEL[row.status]
            return (
              <div
                key={row.id}
                className="app-card flex items-center justify-between p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold">
                    PRO · {formatIDR(row.amount)}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--app-text-mute)' }}
                  >
                    {formatDate(row.paidAt ?? row.createdAt)}
                  </p>
                  {row.hasPaymentProof && (
                    <PaymentProofViewer
                      src={paymentProofUrl(row.id)}
                      label="Lihat bukti transfer"
                      className="mt-1 flex items-center gap-1.5 text-xs font-semibold"
                    />
                  )}
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
