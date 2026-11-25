import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import PartnerAnalyticsChart from '../../components/PartnerAnalyticsChart'
import PartnerLogo from '../../components/PartnerLogo'
import { usePartnerI18n } from '../../components/PartnerI18n'
import PartnerNotificationBell from '../../components/PartnerNotificationBell'
import { formatRangeLabel } from '../../components/PartnerAnalyticsFormat'
import {
  BusinessInsights,
  EventPerformance,
  KpiCards,
  MetricDefinitions,
  Panel,
  TopProducts,
} from '../../components/PartnerAnalyticsPanels'
import type { AnalyticsParams } from '../../lib/partner-analytics-functions'
import {
  ANALYTICS_PRESETS,
  allowedGranularities,
  buildInsights,
  buildSeries,
  compareSeries,
  effectiveGranularity,
} from '../../lib/partner-analytics-rules'
import type { AnalyticsPreset } from '../../lib/partner-analytics-rules'
import { formatRupiah } from '../../lib/partner-product-rules'
import { partnerInitials } from '../../lib/partner-logo-rules'
import { currentPartnerQuery, partnerAnalyticsQuery } from '../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../lib/timezone'

const GRANULARITIES = ['day', 'week', 'month'] as const

const searchSchema = z.object({
  range: z.enum(ANALYTICS_PRESETS).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  event: z.uuid().optional().catch(undefined),
  g: z.enum(GRANULARITIES).optional().catch(undefined),
})

type AnalyticsSearch = z.infer<typeof searchSchema>

const DEFAULT_PRESET: AnalyticsPreset = '30d'

/** Parameter server dari URL. Agregasi grafik (`g`) diolah di client saja. */
function toParams(search: AnalyticsSearch): AnalyticsParams {
  const preset = search.range ?? DEFAULT_PRESET
  return {
    preset,
    ...(preset === 'custom' ? { from: search.from, to: search.to } : {}),
    ...(search.event ? { calendarEventId: search.event } : {}),
  }
}

export const Route = createFileRoute('/partner/')({
  validateSearch: searchSchema,
  // Sengaja tanpa `loaderDeps`: ganti filter tidak memblok navigasi (tidak
  // muncul skeleton); komponen mengambil data baru sambil menahan tampilan
  // lama. Loader hanya menyiapkan data untuk pembukaan pertama (termasuk SSR).
  loader: ({ context, location }) =>
    Promise.all([
      context.queryClient.ensureQueryData(currentPartnerQuery),
      context.queryClient.ensureQueryData(
        partnerAnalyticsQuery(toParams(searchSchema.parse(location.search))),
      ),
    ]),
  component: PartnerDashboardPage,
})

/**
 * Header khusus mobile. Di mobile tidak ada topbar, jadi ini satu-satunya
 * jalan ke Profil (lewat logo) dan Notifikasi (lonceng).
 */
function MobileHeader() {
  const { data: partner } = useSuspenseQuery(currentPartnerQuery)
  const { t } = usePartnerI18n()
  // Layout `/partner` sudah memastikan partner ada; ini cuma penyempit tipe.
  if (!partner) return null
  return (
    <div className="flex items-center gap-3 lg:hidden">
      <Link to="/partner/profil" aria-label={t.shell.profile} className="shrink-0">
        <PartnerLogo
          name={partner.name}
          logoUrl={partner.logoUrl}
          size={44}
          shape="circle"
          initials={partnerInitials(partner.name)}
          className="pm-display"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {t.analytics.greeting}
        </p>
        <p className="pm-display truncate text-base">{partner.name}</p>
      </div>
      <PartnerNotificationBell />
    </div>
  )
}

function PartnerDashboardPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { t, intlLocale } = usePartnerI18n()
  const params = toParams(search)
  const { data, isFetching, isError, refetch } = useQuery({
    ...partnerAnalyticsQuery(params),
    placeholderData: keepPreviousData,
  })

  const setSearch = (patch: Partial<AnalyticsSearch>) =>
    navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    })

  const granularity = data ? effectiveGranularity(data.range, search.g) : 'day'

  const series = useMemo(() => {
    if (!data) return []
    return compareSeries(
      buildSeries(data.range, granularity, data.currentDaily),
      buildSeries(data.previousRange, granularity, data.previousDaily),
    )
  }, [data, granularity])

  // Label pembanding dari kamus (bukan `data.comparisonLabel` dari server)
  // supaya ikut bahasa aktif.
  const comparisonLabel = data ? t.analytics.comparison[data.preset] : ''

  const insights = useMemo(
    () =>
      data
        ? buildInsights({
            current: data.current,
            previous: data.previous,
            comparisonLabel,
            events: data.events,
            allEvents: data.calendarEventId === null,
            products: data.products,
            formatMoney: formatRupiah,
            copy: t.analytics.insightCopy,
          })
        : [],
    [data, comparisonLabel, t],
  )

  return (
    <main className="pa pm-wide flex flex-col px-5 pb-10 pt-4">
      <div className="flex w-full flex-col gap-5 lg:gap-6">
        <MobileHeader />
        <header className="flex flex-col gap-1">
          <h1
            className="pm-display text-[22px] leading-tight lg:text-[26px]"
            style={{ color: 'var(--app-text)' }}
          >
            {t.analytics.title}
          </h1>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {t.analytics.subtitle}
          </p>
        </header>

        <Filters
          search={search}
          events={data?.eventOptions ?? []}
          onChange={(patch) => setSearch(patch)}
        />

        {isError && !data ? (
          <Panel>
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              {t.analytics.loadFailed}
            </p>
            <button
              type="button"
              className="app-btn-outline self-start"
              onClick={() => refetch()}
            >
              {t.analytics.retry}
            </button>
          </Panel>
        ) : data ? (
          <div
            className="flex flex-col gap-5 transition-opacity lg:gap-6"
            style={{ opacity: isFetching ? 0.55 : 1 }}
            aria-busy={isFetching}
          >
            <p
              className="-mt-2 text-xs"
              style={{ color: 'var(--app-text-mute)' }}
            >
              {formatRangeLabel(data.range, intlLocale)} ·{' '}
              {t.analytics.comparedWith}{' '}
              {formatRangeLabel(data.previousRange, intlLocale)} ·{' '}
              {t.analytics.timezone}
            </p>

            <KpiCards
              current={data.current}
              previous={data.previous}
              comparisonLabel={comparisonLabel}
            />

            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    className="pm-display text-base"
                    style={{ color: 'var(--app-text)' }}
                  >
                    {t.analytics.salesPerformance}
                  </h2>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {t.analytics.revenueByGranularity(granularity)}
                  </p>
                </div>
                {allowedGranularities(data.range).length > 1 && (
                  <div
                    className="pa-seg"
                    role="group"
                    aria-label={t.analytics.chartAggregation}
                  >
                    {allowedGranularities(data.range).map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={granularity === g}
                        onClick={() => setSearch({ g })}
                      >
                        {t.analytics.granularity[g]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <PartnerAnalyticsChart
                buckets={series}
                granularity={granularity}
                showPrevious={data.previous.netSales > 0}
                comparisonLabel={comparisonLabel}
              />
            </Panel>

            <EventPerformance rows={data.events} />

            <div className="grid grid-cols-1 items-start gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
              <TopProducts
                products={data.products}
                totalRevenue={data.current.netSales}
              />
              <BusinessInsights insights={insights} />
            </div>

            <MetricDefinitions />
          </div>
        ) : null}
      </div>
    </main>
  )
}

function Filters({
  search,
  events,
  onChange,
}: {
  search: AnalyticsSearch
  events: Array<{ id: string; name: string }>
  onChange: (patch: Partial<AnalyticsSearch>) => void
}) {
  const preset = search.range ?? DEFAULT_PRESET
  const { t } = usePartnerI18n()
  const today = todayIsoDateInAppTimeZone()
  const [from, setFrom] = useState(search.from ?? '')
  const [to, setTo] = useState(search.to ?? '')
  useEffect(() => {
    setFrom(search.from ?? '')
    setTo(search.to ?? '')
  }, [search.from, search.to])

  const customValid = from !== '' && to !== '' && from <= to
  const customDirty = from !== (search.from ?? '') || to !== (search.to ?? '')

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-0 flex-col gap-1 sm:w-48">
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {t.analytics.period}
        </span>
        <select
          className="pa-select"
          value={preset}
          onChange={(e) => {
            const next = e.target.value as AnalyticsPreset
            if (next === 'custom') {
              // Mulai dari 30 hari terakhir supaya tanggalnya langsung terisi.
              const start = new Date(`${today}T00:00:00Z`)
              start.setUTCDate(start.getUTCDate() - 29)
              onChange({
                range: next,
                from: search.from ?? start.toISOString().slice(0, 10),
                to: search.to ?? today,
                g: undefined,
              })
            } else {
              onChange({
                range: next,
                from: undefined,
                to: undefined,
                g: undefined,
              })
            }
          }}
        >
          {ANALYTICS_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p === 'custom' ? t.analytics.customRange : t.analytics.presets[p]}
            </option>
          ))}
        </select>
      </label>

      {preset === 'custom' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (customValid) onChange({ from, to, g: undefined })
          }}
        >
          <label className="flex flex-col gap-1">
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {t.analytics.from}
            </span>
            <input
              type="date"
              className="pa-select"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {t.analytics.to}
            </span>
            <input
              type="date"
              className="pa-select"
              value={to}
              min={from || undefined}
              max={today}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={!customValid || !customDirty}
            className="pa-focus h-11 rounded-xl px-5 text-sm font-semibold text-[var(--app-on-solid)] disabled:opacity-40"
            style={{ background: 'var(--app-accent)' }}
          >
            {t.analytics.apply}
          </button>
        </form>
      )}

      <label className="flex min-w-0 flex-col gap-1 sm:w-64">
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {t.analytics.event}
        </span>
        <select
          className="pa-select"
          value={search.event ?? ''}
          onChange={(e) => onChange({ event: e.target.value || undefined })}
        >
          <option value="">{t.analytics.allEvents}</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
