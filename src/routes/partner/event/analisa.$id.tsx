import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  BusinessInsights,
  KpiCard,
  Panel,
  SectionHeader,
  Segmented,
} from '../../../components/PartnerAnalyticsPanels'
import { usePartnerI18n } from '../../../components/PartnerI18n'
import type { PartnerDict } from '../../../lib/i18n/partner'
import { APP_TIME_ZONE } from '../../../lib/timezone'
import { getPartnerEventAnalytics } from '../../../lib/partner-event-analytics-functions'
import type {
  EventAnalytics,
  ProductStat,
  StockOutStat,
} from '../../../lib/partner-event-analytics'
import type { Insight } from '../../../lib/partner-analytics-rules'
import { formatRupiah } from '../../../lib/partner-product-rules'
import { partnerEventQuery } from '../../../lib/queries'

export const Route = createFileRoute('/partner/event/analisa/$id')({
  component: PartnerEventAnalyticsPage,
})

// Warna punya satu makna, sama dengan Dashboard: aksen = nilai utama,
// hijau = terjual, amber = menunggu, merah = ditolak, abu = belum disubmit.
const COLOR = {
  terjual: 'var(--app-success)',
  menunggu: 'var(--app-warning-mark)',
  ditolak: 'var(--app-danger)',
  ditolakBar: 'var(--app-danger-mark)',
  draft: 'var(--pm-switch-off)',
  bar: 'var(--app-accent)',
  barSoft: 'var(--app-accent-soft)',
}
const soft = { color: 'var(--app-text-soft)' }
const mute = { color: 'var(--app-text-mute)' }
const border = { borderColor: 'var(--app-border)' }
const LIST_LIMIT = 8

/** Kamus + pemformat angka bahasa aktif untuk halaman ini. */
function useAnalysisI18n() {
  const { t, intlLocale } = usePartnerI18n()
  const fmt = (n: number) => n.toLocaleString(intlLocale)
  /** Server menamai varian tanpa opsi "Standar"; tampilkan sesuai bahasa. */
  const variant = (label: string) =>
    label === 'Standar' ? t.analytics.standardVariant : label
  return { t, a: t.analytics, fmt, variant, intlLocale }
}

/**
 * Label bucket timeline dari `key` (awal bucket, epoch ms) dalam WIB, sesuai
 * bahasa aktif: "12 Aug, 14:00" / "12 Agu, 14.00".
 */
function timelineLabel(key: string, granularity: 'jam' | 'hari', locale: string) {
  const d = new Date(Number(key))
  const day = d
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: APP_TIME_ZONE,
    })
    .replace(/\./g, '')
  if (granularity === 'hari') return day
  const time = d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: APP_TIME_ZONE,
  })
  return `${day}, ${time}`
}

function PartnerEventAnalyticsPage() {
  const { id } = Route.useParams()
  const { t, a } = useAnalysisI18n()
  const { data: event } = useQuery(partnerEventQuery(id))
  const { data, error, isLoading } = useQuery({
    queryKey: ['partner-event-analytics', id],
    queryFn: () => getPartnerEventAnalytics({ data: { calendarEventId: id } }),
  })

  return (
    <main className="pa pm-wide flex flex-col px-5 pb-10 pt-4">
      <div className="flex w-full flex-col gap-5 lg:gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              to="/partner/event/$id"
              params={{ id }}
              aria-label={t.common.back}
              className="pa-focus -ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg lg:hidden"
              style={{ color: 'var(--app-text)' }}
            >
              <ArrowLeft size={22} />
            </Link>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
                {a.eventAnalysis}
              </h1>
              <p className="truncate text-sm" style={soft}>
                <Link
                  to="/partner/event"
                  className="no-underline"
                  style={{ color: 'inherit' }}
                >
                  {t.shell.nav.event}
                </Link>{' '}
                /{' '}
                <Link
                  to="/partner/event/$id"
                  params={{ id }}
                  className="no-underline"
                  style={{ color: 'inherit' }}
                >
                  {event?.name ?? '…'}
                </Link>{' '}
                / {a.analysisCrumb}
              </p>
            </div>
          </div>
          <Link
            to="/partner/event/$id"
            params={{ id }}
            className="app-btn-outline hidden shrink-0 no-underline lg:inline-flex"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            {a.backToEvent}
          </Link>
        </header>

        {error && (
          <Panel>
            <p className="text-sm" style={{ color: COLOR.ditolak }}>
              {a.analysisLoadFailed}
            </p>
          </Panel>
        )}
        {isLoading && <AnalyticsSkeleton />}
        {data && <AnalyticsBody id={id} data={data} />}
      </div>
    </main>
  )
}

function AnalyticsSkeleton() {
  const { a } = useAnalysisI18n()
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      aria-busy="true"
      aria-label={a.loadingAnalysis}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="app-card h-[112px] animate-pulse"
          style={{ background: 'var(--pm-tint)' }}
        />
      ))}
    </div>
  )
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-sm" style={soft}>
      {children}
    </p>
  )
}

function ShowMore({
  shown,
  total,
  expanded,
  onToggle,
}: {
  shown: number
  total: number
  expanded: boolean
  onToggle: () => void
}) {
  const { a } = useAnalysisI18n()
  if (total <= shown && !expanded) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pa-focus self-start rounded text-xs font-semibold"
      style={{ color: 'var(--app-accent)' }}
    >
      {expanded ? a.showLess : a.showAll(total)}
    </button>
  )
}

/** Batang tipis: terjual (aksen) + ditolak (merah muda) di ujungnya. */
function Bar({
  max,
  value,
  rejected = 0,
}: {
  max: number
  value: number
  rejected?: number
}) {
  const { a } = useAnalysisI18n()
  return (
    <div
      className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full"
      style={{ background: 'var(--pa-grid)' }}
    >
      {value > 0 && (
        <div
          className="rounded-full"
          style={{ width: `${(value / max) * 100}%`, background: COLOR.bar }}
        />
      )}
      {rejected > 0 && (
        <div
          className="rounded-full"
          title={a.pcsRejectedTitle(rejected)}
          style={{
            width: `${(rejected / max) * 100}%`,
            background: COLOR.ditolakBar,
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function AnalyticsBody({ id, data }: { id: string; data: EventAnalytics }) {
  const { a, fmt } = useAnalysisI18n()
  if (data.jastiper.joined === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-sm font-semibold">{a.noJastiperTitle}</p>
          <p className="text-sm" style={soft}>
            {a.noJastiperBody}
          </p>
        </div>
      </Panel>
    )
  }

  const paidShare =
    data.billed.total > 0
      ? Math.round((data.billed.lunas / data.billed.total) * 100)
      : 0
  const soldProducts = data.products.filter((p) => p.terjual > 0).length
  // Pcs disetujui yang belum masuk tagihan (submit sudah dicek, belum ditagih).
  const notBilled = Math.max(0, data.pcs.terjual - data.billed.pcs)
  // Sama dengan angka "Tagihan" dan "Pcs ditagih" di Dashboard untuk event ini.
  const soldHint =
    data.billed.count === 0
      ? a.productsSold(fmt(soldProducts))
      : notBilled > 0
        ? a.billedSplit(fmt(data.billed.pcs), fmt(notBilled))
        : a.allBilled

  return (
    <>
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))] lg:gap-4"
        aria-label={a.summary}
      >
        <KpiCard
          primary
          label={a.kpiBilled}
          value={formatRupiah(data.billed.total)}
          hint={
            data.billed.count
              ? a.billedHint(fmt(data.billed.count), paidShare)
              : a.noInvoices
          }
          definition={a.kpiBilledDef}
        />
        <KpiCard
          label={a.kpiSold}
          value={fmt(data.pcs.terjual)}
          hint={soldHint}
          definition={data.slotEnabled ? a.kpiSoldDefSlot : a.kpiSoldDef}
        />
        <KpiCard
          label={a.kpiJoined}
          value={fmt(data.jastiper.joined)}
          hint={
            data.slotEnabled
              ? a.joinedSubmitted(fmt(data.jastiper.submitted))
              : a.joinedActive(fmt(data.jastiper.active))
          }
          definition={a.kpiJoinedDef}
        />
        <KpiCard
          label={a.kpiRejected}
          value={fmt(data.pcs.ditolak)}
          hint={data.pcs.ditolak > 0 ? a.rejectedHint : a.allAvailable}
          definition={a.kpiRejectedDef}
        />
      </section>

      <PcsBreakdown data={data} />

      <Timeline timeline={data.timeline} />

      <div className="grid grid-cols-1 items-start gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <TopProducts products={data.products} />
        <BusinessInsights
          insights={eventInsights(data, a, fmt)}
          title={a.highlights}
          description={a.highlightsDesc}
          emptyText={a.highlightsEmpty}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:gap-6">
        <TopJastiper id={id} data={data} />
        <StockCard stockOut={data.stockOut} lowStock={data.lowStock} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:gap-6">
        <UnmetDemand list={data.unmetDemand} />
        <SizeCard sizes={data.sizes} />
      </div>
    </>
  )
}

/** Kalimat sorotan dari data aktual; tiap kalimat hanya muncul kalau datanya ada. */
function eventInsights(
  data: EventAnalytics,
  a: PartnerDict['analytics'],
  fmt: (n: number) => string,
): Array<Insight> {
  const out: Array<Insight> = []
  const top = data.products.at(0)
  if (top && top.terjual > 0) {
    out.push({
      key: 'top-product',
      tone: 'neutral',
      text: a.insightTopProduct(
        top.productName,
        fmt(top.terjual),
        fmt(top.jastiper),
      ),
    })
  }
  const topJ = data.jastiperRanking.at(0)
  if (topJ && topJ.terjual > 0 && data.jastiperRanking.length > 1) {
    out.push({
      key: 'top-jastiper',
      tone: 'neutral',
      text: a.insightTopJastiper(topJ.brandName, fmt(topJ.terjual)),
    })
  }
  if (data.stockOut.length > 0) {
    const hot = data.stockOut.filter((s) => s.terjual + s.ditolak > 0).length
    out.push({
      key: 'stock-out',
      tone: 'down',
      text:
        hot > 0
          ? a.insightStockOutHot(fmt(data.stockOut.length), fmt(hot))
          : a.insightStockOut(fmt(data.stockOut.length)),
    })
  } else if (data.pcs.ditolak > 0) {
    out.push({
      key: 'rejected',
      tone: 'down',
      text: a.insightRejected(fmt(data.pcs.ditolak)),
    })
  }
  const topSize = data.sizes.at(0)
  if (topSize && out.length < 4) {
    out.push({
      key: 'top-size',
      tone: 'neutral',
      text: a.insightTopSize(topSize.size, fmt(topSize.terjual)),
    })
  }
  return out
}

// ---------------------------------------------------------------------------

function PcsBreakdown({ data }: { data: EventAnalytics }) {
  const { a, fmt } = useAnalysisI18n()
  const parts = [
    {
      key: 'terjual',
      label: a.flowSold,
      value: data.pcs.terjual,
      color: COLOR.terjual,
    },
    {
      key: 'menunggu',
      label: a.flowWaiting,
      value: data.pcs.menunggu,
      color: COLOR.menunggu,
    },
    {
      key: 'ditolak',
      label: a.flowRejected,
      value: data.pcs.ditolak,
      color: COLOR.ditolak,
    },
    {
      key: 'draft',
      label: a.flowDraft,
      value: data.pcs.draft,
      color: COLOR.draft,
    },
  ].filter((p) => p.value > 0)
  const total = parts.reduce((s, p) => s + p.value, 0)
  const kindTotal = data.kindSplit.satuan + data.kindSplit.paket
  const paketShare = kindTotal
    ? Math.round((data.kindSplit.paket / kindTotal) * 100)
    : 0

  return (
    <Panel>
      <SectionHeader
        title={a.flowTitle}
        description={a.flowDesc(fmt(total))}
      />
      {total === 0 ? (
        <EmptyNote>{a.flowEmpty}</EmptyNote>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div
              className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
              role="img"
              aria-label={parts
                .map((p) => `${p.label} ${p.value} pcs`)
                .join(', ')}
            >
              {parts.map((p) => (
                <div
                  key={p.key}
                  title={`${p.label}: ${fmt(p.value)} pcs`}
                  style={{
                    width: `${(p.value / total) * 100}%`,
                    background: p.color,
                    minWidth: 4,
                  }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span style={soft}>{p.label}</span>
                  <span className="pa-num font-semibold">{fmt(p.value)}</span>
                  <span className="pa-num" style={mute}>
                    ({Math.round((p.value / total) * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {kindTotal > 0 && (
            <dl
              className="flex shrink-0 gap-8 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
              style={border}
            >
              <div>
                <dt className="text-xs" style={soft}>
                  {a.flowSingle}
                </dt>
                <dd className="pa-num mt-0.5 text-base font-semibold">
                  {fmt(data.kindSplit.satuan)}{' '}
                  <span className="text-xs font-normal" style={soft}>
                    pcs
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs" style={soft}>
                  {a.flowBundle}
                </dt>
                <dd className="pa-num mt-0.5 text-base font-semibold">
                  {fmt(data.kindSplit.paket)}{' '}
                  <span className="text-xs font-normal" style={soft}>
                    pcs · {paketShare}%
                  </span>
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </Panel>
  )
}

function Timeline({ timeline }: { timeline: EventAnalytics['timeline'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const { a, fmt, intlLocale } = useAnalysisI18n()
  const buckets = timeline.buckets.map((b) => ({
    ...b,
    label: timelineLabel(b.key, timeline.granularity, intlLocale),
  }))
  const max = Math.max(1, ...buckets.map((b) => b.pcs))
  const peak = buckets.reduce<(typeof buckets)[number] | null>(
    (best, b) => (!best || b.pcs > best.pcs ? b : best),
    null,
  )
  const active = hover !== null ? buckets[hover] : null
  // Label sumbu-x secukupnya supaya tidak bertumpuk.
  const every = Math.max(1, Math.ceil(buckets.length / 6))

  return (
    <Panel>
      <SectionHeader
        title={a.activityTitle}
        description={a.activityDesc(timeline.granularity)}
      />
      {buckets.length === 0 ? (
        <EmptyNote>{a.activityEmpty}</EmptyNote>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="h-5 text-xs" style={soft} aria-live="polite">
            {active ? (
              <>
                <b style={{ color: 'var(--app-text)' }}>{active.label}</b> ·{' '}
                <span
                  className="pa-num font-semibold"
                  style={{ color: 'var(--app-text)' }}
                >
                  {fmt(active.pcs)}
                </span>{' '}
                {a.activityPcsFrom(fmt(active.submits))}
              </>
            ) : peak && peak.pcs > 0 ? (
              <>
                {a.activityPeak}{' '}
                <b style={{ color: 'var(--app-text)' }}>{peak.label}</b> (
                {fmt(peak.pcs)} pcs)
              </>
            ) : null}
          </p>
          <div
            className="relative flex h-44 items-end gap-[2px] border-b"
            style={{ borderColor: 'var(--pa-grid)' }}
            onMouseLeave={() => setHover(null)}
          >
            {[0.5, 1].map((g) => (
              <div
                key={g}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t"
                style={{ bottom: `${g * 100}%`, borderColor: 'var(--pa-grid)' }}
              />
            ))}
            {buckets.map((b, i) => (
              <button
                key={b.key}
                type="button"
                className="pa-focus relative flex h-full min-w-0 flex-1 items-end rounded-t"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={a.activityBarLabel(b.label, b.pcs, b.submits)}
              >
                <span
                  className="w-full rounded-t-[4px] transition-colors"
                  style={{
                    height: b.pcs ? `${Math.max(3, (b.pcs / max) * 100)}%` : 0,
                    background:
                      hover === null || hover === i ? COLOR.bar : COLOR.barSoft,
                  }}
                />
              </button>
            ))}
          </div>
          <div className="flex gap-[2px] text-[11px]" style={mute}>
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className="min-w-0 flex-1 overflow-visible whitespace-nowrap"
              >
                {i % every === 0
                  ? timeline.granularity === 'jam'
                    ? b.label.split(', ')[1]
                    : b.label
                  : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

function TopProducts({ products }: { products: Array<ProductStat> }) {
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const { a, fmt, variant } = useAnalysisI18n()
  const max = Math.max(1, ...products.map((p) => p.terjual + p.ditolak))
  const list = expanded ? products : products.slice(0, LIST_LIMIT)

  return (
    <Panel>
      <SectionHeader
        title={a.bestProducts}
        description={a.bestProductsDesc}
      />
      {products.length === 0 ? (
        <EmptyNote>{a.bestProductsEmpty}</EmptyNote>
      ) : (
        <>
          <ol className="flex flex-col">
            {list.map((p, i) => {
              const isOpen = open === p.productName
              return (
                <li
                  key={p.productName}
                  className="border-t first:border-t-0"
                  style={border}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.productName)}
                    aria-expanded={isOpen}
                    className="pa-focus grid w-full grid-cols-[24px_minmax(0,1fr)_auto_16px] items-center gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-[var(--app-card-hover)]"
                  >
                    <span className="pa-num text-xs" style={mute}>
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <p className="truncate text-sm font-medium">
                        {p.productName}
                      </p>
                      <Bar max={max} value={p.terjual} rejected={p.ditolak} />
                      <p className="text-xs" style={soft}>
                        {a.jastiperCount(fmt(p.jastiper))}
                        {p.ditolak > 0 && (
                          <span style={{ color: COLOR.ditolak }}>
                            {' '}
                            · {a.rejectedCount(fmt(p.ditolak))}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="pa-num text-right text-sm font-semibold">
                      {fmt(p.terjual)}{' '}
                      <span className="text-xs font-normal" style={soft}>
                        pcs
                      </span>
                    </p>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="transition-transform"
                      style={{
                        ...mute,
                        transform: isOpen ? 'rotate(180deg)' : undefined,
                      }}
                    />
                  </button>
                  {isOpen && (
                    <ul className="flex flex-col pb-3 pl-9 pr-7 text-xs">
                      {p.variants.map((v) => (
                        <li
                          key={v.label}
                          className="flex items-center justify-between gap-3 border-t py-1.5"
                          style={border}
                        >
                          <span className="truncate" style={soft}>
                            {variant(v.label)}
                          </span>
                          <span className="pa-num shrink-0">
                            <b>{fmt(v.terjual)}</b> pcs
                            {v.ditolak > 0 && (
                              <span style={{ color: COLOR.ditolak }}>
                                {' '}
                                · {a.rejectedCount(fmt(v.ditolak))}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
          <ShowMore
            shown={LIST_LIMIT}
            total={products.length}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />
        </>
      )}
    </Panel>
  )
}

function TopJastiper({ id, data }: { id: string; data: EventAnalytics }) {
  const [expanded, setExpanded] = useState(false)
  const { a, fmt } = useAnalysisI18n()
  const ranking = data.jastiperRanking
  const max = Math.max(1, ...ranking.map((j) => j.terjual + j.ditolak))
  const list = expanded ? ranking : ranking.slice(0, LIST_LIMIT)
  const cols =
    'grid-cols-[24px_minmax(0,1fr)_56px_16px] sm:grid-cols-[24px_minmax(0,1fr)_56px_112px_16px]'

  return (
    <Panel>
      <SectionHeader
        title={a.topJastiper}
        description={a.topJastiperDesc}
      />
      <ol className="flex flex-col">
        <li
          className={`grid ${cols} gap-3 pb-2 text-xs`}
          style={mute}
          aria-hidden="true"
        >
          <span>#</span>
          <span>{a.colJastiper}</span>
          <span className="text-right">{a.colPcs}</span>
          <span className="hidden text-right sm:block">{a.colBilled}</span>
          <span />
        </li>
        {list.map((j, i) => (
          <li key={j.brandId} className="border-t" style={border}>
            <Link
              to="/partner/event/jastiper/$id/$brandId"
              params={{ id, brandId: j.brandId }}
              className={`pa-focus grid ${cols} items-center gap-3 rounded-lg py-2.5 no-underline transition-colors hover:bg-[var(--app-card-hover)]`}
              style={{ color: 'inherit' }}
            >
              <span className="pa-num text-xs" style={mute}>
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="truncate text-sm font-medium">{j.brandName}</p>
                <Bar max={max} value={j.terjual} rejected={j.ditolak} />
              </div>
              <span className="pa-num text-right text-sm font-semibold">
                {fmt(j.terjual)}
                {j.ditolak > 0 && (
                  <span
                    className="block text-xs font-normal"
                    style={{ color: COLOR.ditolak }}
                  >
                    −{fmt(j.ditolak)}
                  </span>
                )}
              </span>
              <span className="pa-num hidden text-right text-sm sm:block">
                {j.billedAmount > 0 ? formatRupiah(j.billedAmount) : '–'}
                {j.billedAmount > 0 && (
                  <span
                    className="block text-xs"
                    style={{
                      color:
                        j.paidAmount >= j.billedAmount
                          ? COLOR.terjual
                          : 'var(--app-text-soft)',
                    }}
                  >
                    {j.paidAmount >= j.billedAmount
                      ? a.paid
                      : a.paidPct(
                          Math.round((j.paidAmount / j.billedAmount) * 100),
                        )}
                  </span>
                )}
              </span>
              <ChevronRight size={16} style={mute} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      <ShowMore
        shown={LIST_LIMIT}
        total={ranking.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    </Panel>
  )
}

function StockCard({
  stockOut,
  lowStock,
}: {
  stockOut: Array<StockOutStat>
  lowStock: Array<StockOutStat>
}) {
  const [tab, setTab] = useState<'habis' | 'hampir'>('habis')
  const [expanded, setExpanded] = useState(false)
  const { a, fmt, variant } = useAnalysisI18n()
  const rows = tab === 'habis' ? stockOut : lowStock
  const list = expanded ? rows : rows.slice(0, LIST_LIMIT)

  return (
    <Panel>
      <SectionHeader
        title={a.stockTitle}
        description={a.stockDesc}
        action={
          <Segmented
            label={a.stockFilter}
            value={tab}
            onChange={(next) => {
              setTab(next)
              setExpanded(false)
            }}
            options={[
              { value: 'habis', label: a.stockOutTab(stockOut.length) },
              { value: 'hampir', label: a.stockLowTab(lowStock.length) },
            ]}
          />
        }
      />
      {rows.length === 0 ? (
        <EmptyNote>
          {tab === 'habis'
            ? a.stockOutEmpty
            : a.stockLowEmpty}
        </EmptyNote>
      ) : (
        <>
          <ul className="flex flex-col">
            {list.map((s) => {
              const out = s.stockQty <= 0
              return (
                <li
                  key={s.variantId}
                  className="flex items-center gap-3 border-t py-2.5 first:border-t-0"
                  style={border}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.productName}
                    </p>
                    <p className="truncate text-xs" style={soft}>
                      {variant(s.label)}
                      {' · '}
                      {s.terjual + s.ditolak > 0 ? (
                        <>
                          {a.soldWord}{' '}
                          <span
                            className="pa-num"
                            style={{ color: 'var(--app-text)' }}
                          >
                            {fmt(s.terjual)}
                          </span>
                          {s.ditolak > 0 && (
                            <span style={{ color: COLOR.ditolak }}>
                              {' '}
                              · {a.rejectedWord} {fmt(s.ditolak)}
                            </span>
                          )}
                        </>
                      ) : (
                        a.notOrderedHere
                      )}
                    </p>
                  </div>
                  <span
                    className="pa-num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      out
                        ? {
                            background: 'var(--app-danger-soft)',
                            color: COLOR.ditolak,
                          }
                        : {
                            background: 'var(--app-warning-soft)',
                            color: 'var(--app-warning)',
                          }
                    }
                  >
                    {out ? a.soldOut : a.stockLeft(s.stockQty)}
                  </span>
                </li>
              )
            })}
          </ul>
          <ShowMore
            shown={LIST_LIMIT}
            total={rows.length}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
          />
        </>
      )}
    </Panel>
  )
}

function UnmetDemand({ list }: { list: EventAnalytics['unmetDemand'] }) {
  const max = Math.max(1, ...list.map((u) => u.ditolak))
  const { a, fmt, variant } = useAnalysisI18n()
  return (
    <Panel>
      <SectionHeader title={a.unmetTitle} description={a.unmetDesc} />
      {list.length === 0 ? (
        <EmptyNote>{a.unmetEmpty}</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((u) => (
            <li key={u.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{variant(u.label)}</span>
                <span
                  className="pa-num shrink-0 font-semibold"
                  style={{ color: COLOR.ditolak }}
                >
                  {fmt(u.ditolak)} pcs
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: 'var(--pa-grid)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(u.ditolak / max) * 100}%`,
                    background: COLOR.ditolakBar,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function SizeCard({ sizes }: { sizes: EventAnalytics['sizes'] }) {
  const total = sizes.reduce((s, x) => s + x.terjual, 0)
  const max = Math.max(1, ...sizes.map((s) => s.terjual))
  const { a, fmt } = useAnalysisI18n()
  return (
    <Panel>
      <SectionHeader title={a.sizesTitle} description={a.sizesDesc} />
      {sizes.length === 0 ? (
        <EmptyNote>{a.sizesEmpty}</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {sizes.slice(0, 8).map((s) => (
            <li
              key={s.size}
              className="grid grid-cols-[48px_minmax(0,1fr)_88px] items-center gap-3 text-sm"
            >
              <span className="truncate font-medium">{s.size}</span>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: 'var(--pa-grid)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(s.terjual / max) * 100}%`,
                    background: COLOR.bar,
                  }}
                />
              </div>
              <span className="pa-num text-right">
                <span className="font-semibold">{fmt(s.terjual)}</span>{' '}
                <span className="text-xs" style={mute}>
                  {total > 0 ? Math.round((s.terjual / total) * 100) : 0}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
