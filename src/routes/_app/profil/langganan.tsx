import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Check, Crown, Lock } from 'lucide-react'
import { fetchCurrentUser } from '../../../lib/auth-functions'
import { formatDate } from '../../../lib/format'
import {
  PLAN_INFO,
  PRO_FEATURES,
  PRO_FEATURE_INFO,
  canUseFeature,
  planLabel,
} from '../../../lib/subscription'
import type { Entitlement } from '../../../lib/subscription'

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

export const Route = createFileRoute('/_app/profil/langganan')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(currentUserQuery),
  component: SubscriptionPage,
})

// Aktivasi PRO masih diverifikasi manual oleh admin (lihat `subscriptions` di
// schema), jadi di sini cuma panduan langkahnya — belum ada pengajuan pembayaran
// dari dalam aplikasi.
const UPGRADE_STEPS = [
  'Hubungi admin untuk mengaktifkan paket PRO.',
  'Bayar sesuai nominal paket PRO yang diberikan admin (transfer manual).',
  'Kirim bukti transfer ke admin. Setelah diverifikasi, status PRO langsung aktif.',
]

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

function SubscriptionPage() {
  const { data: user } = useSuspenseQuery(currentUserQuery)

  // Layout `_app` sudah redirect ke /login kalau sesinya habis; ini cuma jaring
  // pengaman buat tipe.
  if (!user) return null

  // Satu sumber: entitlement user dari server. Nggak ada hitung-hitungan plan
  // di sini supaya UI & server nggak bisa beda pendapat.
  const entitlement = user.entitlements

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
            style={{
              background: 'var(--app-accent-soft)',
              color: 'var(--app-accent)',
            }}
          >
            <Crown size={20} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Paket {planLabel(entitlement.plan)}
            </p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              {periodText(entitlement)}
            </p>
          </div>
        </div>
        <p
          className="mt-3 text-xs leading-relaxed"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {PLAN_INFO[entitlement.plan].description}
        </p>
      </section>

      <section className="mb-6">
        <h2
          className="mb-2 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Fitur PRO
        </h2>
        <div
          className="app-card flex flex-col divide-y"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {PRO_FEATURES.map((feature) => {
            const unlocked = canUseFeature(entitlement, feature)
            const info = PRO_FEATURE_INFO[feature]

            return (
              <div
                key={feature}
                className="flex items-start gap-3 p-4"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: unlocked
                      ? 'var(--app-accent-soft)'
                      : 'var(--app-border)',
                    color: unlocked
                      ? 'var(--app-accent)'
                      : 'var(--app-text-mute)',
                  }}
                >
                  {unlocked ? <Check size={15} /> : <Lock size={14} />}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{info.label}</p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {info.description}
                  </p>
                </div>
                <span
                  className="text-[11px] font-semibold"
                  style={{
                    color: unlocked
                      ? 'var(--app-accent)'
                      : 'var(--app-text-mute)',
                  }}
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
          <h2
            className="mb-2 text-xs font-semibold uppercase"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Cara upgrade ke PRO
          </h2>
          <div className="app-card p-4">
            <ol className="flex flex-col gap-3">
              {UPGRADE_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{
                      background: 'var(--app-accent-soft)',
                      color: 'var(--app-accent)',
                    }}
                  >
                    {index + 1}
                  </span>
                  <p
                    className="flex-1 text-xs leading-relaxed"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {step}
                  </p>
                </li>
              ))}
            </ol>
            <p
              className="mt-4 text-xs leading-relaxed"
              style={{ color: 'var(--app-text-mute)' }}
            >
              Aktivasi PRO dilakukan manual oleh admin. Fitur yang terkunci
              otomatis terbuka begitu status PRO aktif.
            </p>
          </div>
        </section>
      )}
    </main>
  )
}
