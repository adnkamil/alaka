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
const fmt = (n: number) => n.toLocaleString('id-ID')
const LIST_LIMIT = 8

function PartnerEventAnalyticsPage() {
  const { id } = Route.useParams()
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
              aria-label="Kembali"
              className="pa-focus -ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg lg:hidden"
              style={{ color: 'var(--app-text)' }}
            >
              <ArrowLeft size={22} />
            </Link>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
                Analisa Event
              </h1>
              <p className="truncate text-sm" style={soft}>
                <Link
                  to="/partner/event"
                  className="no-underline"
                  style={{ color: 'inherit' }}
                >
                  Event
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
                / Analisa
              </p>
            </div>
          </div>
          <Link
            to="/partner/event/$id"
            params={{ id }}
            className="app-btn-outline hidden shrink-0 no-underline lg:inline-flex"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            Kembali ke event
          </Link>
        </header>

        {error && (
          <Panel>
            <p className="text-sm" style={{ color: COLOR.ditolak }}>
              Gagal memuat analisa event.
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
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      aria-busy="true"
      aria-label="Memuat analisa"
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
  if (total <= shown && !expanded) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pa-focus self-start rounded text-xs font-semibold"
      style={{ color: 'var(--app-accent)' }}
    >
      {expanded ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${total})`}
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
          title={`${rejected} pcs ditolak`}
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
  if (data.jastiper.joined === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-sm font-semibold">Belum ada jastiper yang ikut</p>
          <p className="text-sm" style={soft}>
            Analisa akan muncul setelah jastiper bergabung dan mulai mengirim
            pesanan.
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
      ? `${fmt(soldProducts)} produk laku`
      : notBilled > 0
        ? `${fmt(data.billed.pcs)} sudah ditagih · ${fmt(notBilled)} belum`
        : `Semua sudah ditagih`

  return (
    <>
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))] lg:gap-4"
        aria-label="Ringkasan"
      >
        <KpiCard
          primary
          label="Total ditagih"
          value={formatRupiah(data.billed.total)}
          hint={
            data.billed.count
              ? `${fmt(data.billed.count)} tagihan · ${paidShare}% sudah lunas`
              : 'Belum ada tagihan'
          }
          definition="Total nilai tagihan aktif ke jastiper di event ini, tidak termasuk tagihan yang dibatalkan. Sama dengan Total Revenue event ini di Dashboard. Bukan profit dan bukan dana yang sudah diterima."
        />
        <KpiCard
          label="Pcs terjual"
          value={fmt(data.pcs.terjual)}
          hint={soldHint}
          definition={
            data.slotEnabled
              ? 'Pcs yang disetujui saat dicek, sudah ditagih maupun belum. Dashboard hanya menghitung pcs yang sudah ditagih. Isi paket dihitung per pcs.'
              : 'Semua pcs yang dipesan lewat jastiper. Isi paket dihitung per pcs.'
          }
        />
        <KpiCard
          label="Jastiper ikut"
          value={fmt(data.jastiper.joined)}
          hint={
            data.slotEnabled
              ? `${fmt(data.jastiper.submitted)} sudah submit`
              : `${fmt(data.jastiper.active)} ada pesanan`
          }
          definition="Jastiper yang menekan Ikut Event di event ini."
        />
        <KpiCard
          label="Pcs ditolak"
          value={fmt(data.pcs.ditolak)}
          hint={
            data.pcs.ditolak > 0
              ? 'Tidak tersedia saat dicek'
              : 'Semua pesanan tersedia'
          }
          definition="Pcs yang tidak bisa dipenuhi saat dicek (stok tidak tersedia). Tidak ditagih."
        />
      </section>

      <PcsBreakdown data={data} />

      <Timeline timeline={data.timeline} />

      <div className="grid grid-cols-1 items-start gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <TopProducts products={data.products} />
        <BusinessInsights
          insights={eventInsights(data)}
          title="Sorotan event"
          description="Disusun otomatis dari data event ini."
          emptyText="Belum cukup data untuk menarik kesimpulan dari event ini."
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
function eventInsights(data: EventAnalytics): Array<Insight> {
  const out: Array<Insight> = []
  const top = data.products.at(0)
  if (top && top.terjual > 0) {
    out.push({
      key: 'top-product',
      tone: 'neutral',
      text: `${top.productName} paling laku: ${fmt(top.terjual)} pcs lewat ${fmt(top.jastiper)} jastiper.`,
    })
  }
  const topJ = data.jastiperRanking.at(0)
  if (topJ && topJ.terjual > 0 && data.jastiperRanking.length > 1) {
    out.push({
      key: 'top-jastiper',
      tone: 'neutral',
      text: `${topJ.brandName} menjual pcs terbanyak (${fmt(topJ.terjual)} pcs).`,
    })
  }
  if (data.stockOut.length > 0) {
    const hot = data.stockOut.filter((s) => s.terjual + s.ditolak > 0).length
    out.push({
      key: 'stock-out',
      tone: 'down',
      text:
        hot > 0
          ? `${fmt(data.stockOut.length)} varian habis, ${fmt(hot)} di antaranya sempat dipesan. Pertimbangkan tambah stok untuk event berikutnya.`
          : `${fmt(data.stockOut.length)} varian habis.`,
    })
  } else if (data.pcs.ditolak > 0) {
    out.push({
      key: 'rejected',
      tone: 'down',
      text: `${fmt(data.pcs.ditolak)} pcs ditolak karena tidak tersedia saat dicek.`,
    })
  }
  const topSize = data.sizes.at(0)
  if (topSize && out.length < 4) {
    out.push({
      key: 'top-size',
      tone: 'neutral',
      text: `Ukuran ${topSize.size} paling dicari (${fmt(topSize.terjual)} pcs).`,
    })
  }
  return out
}

// ---------------------------------------------------------------------------

function PcsBreakdown({ data }: { data: EventAnalytics }) {
  const parts = [
    {
      key: 'terjual',
      label: 'Terjual',
      value: data.pcs.terjual,
      color: COLOR.terjual,
    },
    {
      key: 'menunggu',
      label: 'Menunggu dicek',
      value: data.pcs.menunggu,
      color: COLOR.menunggu,
    },
    {
      key: 'ditolak',
      label: 'Ditolak',
      value: data.pcs.ditolak,
      color: COLOR.ditolak,
    },
    {
      key: 'draft',
      label: 'Belum disubmit',
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
        title="Alur pcs"
        description={`${fmt(total)} pcs dipesan lewat jastiper di event ini.`}
      />
      {total === 0 ? (
        <EmptyNote>Belum ada pesanan produk.</EmptyNote>
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
                  Satuan
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
                  Lewat paket
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
  const buckets = timeline.buckets
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
        title="Aktivitas submit"
        description={`Pcs yang dikirim jastiper per ${timeline.granularity} (WIB).`}
      />
      {buckets.length === 0 ? (
        <EmptyNote>Belum ada submit pesanan.</EmptyNote>
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
                pcs dari {fmt(active.submits)} submit
              </>
            ) : peak && peak.pcs > 0 ? (
              <>
                Paling ramai:{' '}
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
                aria-label={`${b.label}: ${b.pcs} pcs dari ${b.submits} submit`}
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
  const max = Math.max(1, ...products.map((p) => p.terjual + p.ditolak))
  const list = expanded ? products : products.slice(0, LIST_LIMIT)

  return (
    <Panel>
      <SectionHeader
        title="Produk terlaris"
        description="Urut pcs terjual. Klik produk untuk melihat per varian."
      />
      {products.length === 0 ? (
        <EmptyNote>Belum ada produk yang terjual.</EmptyNote>
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
                        {fmt(p.jastiper)} jastiper
                        {p.ditolak > 0 && (
                          <span style={{ color: COLOR.ditolak }}>
                            {' '}
                            · {fmt(p.ditolak)} ditolak
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
                            {v.label}
                          </span>
                          <span className="pa-num shrink-0">
                            <b>{fmt(v.terjual)}</b> pcs
                            {v.ditolak > 0 && (
                              <span style={{ color: COLOR.ditolak }}>
                                {' '}
                                · {fmt(v.ditolak)} ditolak
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
  const ranking = data.jastiperRanking
  const max = Math.max(1, ...ranking.map((j) => j.terjual + j.ditolak))
  const list = expanded ? ranking : ranking.slice(0, LIST_LIMIT)
  const cols =
    'grid-cols-[24px_minmax(0,1fr)_56px_16px] sm:grid-cols-[24px_minmax(0,1fr)_56px_112px_16px]'

  return (
    <Panel>
      <SectionHeader
        title="Jastiper teratas"
        description="Urut pcs terjual. Klik untuk melihat detail jastiper."
      />
      <ol className="flex flex-col">
        <li
          className={`grid ${cols} gap-3 pb-2 text-xs`}
          style={mute}
          aria-hidden="true"
        >
          <span>#</span>
          <span>Jastiper</span>
          <span className="text-right">Pcs</span>
          <span className="hidden text-right sm:block">Ditagih</span>
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
                      ? 'Lunas'
                      : `${Math.round((j.paidAmount / j.billedAmount) * 100)}% lunas`}
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
  const rows = tab === 'habis' ? stockOut : lowStock
  const list = expanded ? rows : rows.slice(0, LIST_LIMIT)

  return (
    <Panel>
      <SectionHeader
        title="Stok produk"
        description="Stok saat ini dari produk yang dibawa ke event."
        action={
          <Segmented
            label="Filter stok"
            value={tab}
            onChange={(next) => {
              setTab(next)
              setExpanded(false)
            }}
            options={[
              { value: 'habis', label: `Habis · ${stockOut.length}` },
              { value: 'hampir', label: `Hampir habis · ${lowStock.length}` },
            ]}
          />
        }
      />
      {rows.length === 0 ? (
        <EmptyNote>
          {tab === 'habis'
            ? 'Tidak ada varian yang habis.'
            : 'Tidak ada varian yang hampir habis.'}
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
                      {s.label}
                      {' · '}
                      {s.terjual + s.ditolak > 0 ? (
                        <>
                          terjual{' '}
                          <span
                            className="pa-num"
                            style={{ color: 'var(--app-text)' }}
                          >
                            {fmt(s.terjual)}
                          </span>
                          {s.ditolak > 0 && (
                            <span style={{ color: COLOR.ditolak }}>
                              {' '}
                              · ditolak {fmt(s.ditolak)}
                            </span>
                          )}
                        </>
                      ) : (
                        'tidak dipesan di event ini'
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
                    {out ? 'Habis' : `Sisa ${s.stockQty}`}
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
  return (
    <Panel>
      <SectionHeader
        title="Permintaan tak terpenuhi"
        description="Pcs ditolak terbanyak, sinyal untuk menambah stok."
      />
      {list.length === 0 ? (
        <EmptyNote>
          Semua pesanan tersedia. Tidak ada pcs yang ditolak.
        </EmptyNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((u) => (
            <li key={u.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{u.label}</span>
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
  return (
    <Panel>
      <SectionHeader
        title="Ukuran terlaris"
        description="Pcs terjual per ukuran."
      />
      {sizes.length === 0 ? (
        <EmptyNote>Produk di event ini belum memakai ukuran.</EmptyNote>
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
