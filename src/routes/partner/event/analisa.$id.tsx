import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  Crown,
  Lightbulb,
  Package,
  PackageX,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { getPartnerEventAnalytics } from '../../../lib/partner-event-analytics-functions'
import type {
  EventAnalytics,
  ProductStat,
  StockOutStat,
} from '../../../lib/partner-event-analytics'
import { formatRupiah } from '../../../lib/partner-product-rules'
import { partnerEventQuery } from '../../../lib/queries'

export const Route = createFileRoute('/partner/event/analisa/$id')({
  component: PartnerEventAnalyticsPage,
})

// Warna status: hijau = terjual, kuning = menunggu, merah = ditolak, abu = draft.
const COLOR = {
  terjual: '#3f7d58',
  menunggu: '#c98a1e',
  ditolak: '#b42318',
  draft: '#cbbfae',
  bar: '#b6584b',
  barSoft: '#f3dfd9',
}
const soft = { color: 'var(--app-text-soft)' }
const fmt = (n: number) => n.toLocaleString('id-ID')

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function PartnerEventAnalyticsPage() {
  const { id } = Route.useParams()
  const { data: event } = useQuery(partnerEventQuery(id))
  const { data, error, isLoading } = useQuery({
    queryKey: ['partner-event-analytics', id],
    queryFn: () => getPartnerEventAnalytics({ data: { calendarEventId: id } }),
  })

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-10 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            to="/partner/event/$id"
            params={{ id }}
            aria-label="Kembali"
            className="-ml-1 flex size-8 shrink-0 items-center justify-center lg:hidden"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">Analisa Event</h1>
            <p className="mt-1 truncate text-[13px]" style={soft}>
              <Link to="/partner/event" className="no-underline" style={{ color: 'inherit' }}>
                Event
              </Link>{' '}
              /{' '}
              <Link to="/partner/event/$id" params={{ id }} className="no-underline" style={{ color: 'inherit' }}>
                {event?.name ?? '…'}
              </Link>{' '}
              / Analisa
            </p>
          </div>
        </div>
        <Link
          to="/partner/event/$id"
          params={{ id }}
          className="app-btn-outline hidden no-underline lg:inline-flex"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          Kembali ke event
        </Link>
      </header>

      {error && (
        <div className="app-card p-4 text-sm" style={{ color: COLOR.ditolak }}>
          Gagal memuat analisa event.
        </div>
      )}
      {isLoading && <AnalyticsSkeleton />}
      {data && <AnalyticsBody id={id} data={data} />}
    </main>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-busy="true" aria-label="Memuat analisa">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="app-card h-[104px] animate-pulse" style={{ background: 'var(--pm-tint)' }} />
      ))}
    </div>
  )
}

function AnalyticsBody({ id, data }: { id: string; data: EventAnalytics }) {
  const empty = data.jastiper.joined === 0
  const paidShare = data.billed.total > 0 ? Math.round((data.billed.lunas / data.billed.total) * 100) : 0

  if (empty) {
    return (
      <div className="app-card flex flex-col items-center gap-2 p-10 text-center">
        <Users size={28} style={soft} />
        <p className="text-sm font-bold">Belum ada jastiper yang ikut</p>
        <p className="text-[13px]" style={soft}>
          Analisa akan muncul setelah jastiper bergabung dan mulai mengirim pesanan.
        </p>
      </div>
    )
  }

  return (
    <>
      <Insights data={data} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Ringkasan">
        <StatTile
          icon={<Users size={18} />}
          label="Jastiper ikut"
          value={fmt(data.jastiper.joined)}
          hint={
            data.slotEnabled
              ? `${data.jastiper.submitted} sudah submit`
              : `${data.jastiper.active} ada pesanan`
          }
        />
        <StatTile
          icon={<Package size={18} />}
          label="Pcs terjual"
          value={fmt(data.pcs.terjual)}
          hint={`${data.products.filter((p) => p.terjual > 0).length} produk laku`}
          emphasis
        />
        <StatTile
          icon={<Wallet size={18} />}
          label="Total ditagih"
          value={formatRupiah(data.billed.total)}
          hint={data.billed.count ? `${paidShare}% sudah lunas` : 'Belum ada tagihan'}
        />
        <StatTile
          icon={<PackageX size={18} />}
          label="Varian stok habis"
          value={fmt(data.stockOut.length)}
          hint={`${data.lowStock.length} hampir habis`}
          tone={data.stockOut.length ? 'danger' : undefined}
        />
        <StatTile
          icon={<Ban size={18} />}
          label="Pcs ditolak"
          value={fmt(data.pcs.ditolak)}
          hint="Tidak tersedia saat dicek"
          tone={data.pcs.ditolak ? 'warn' : undefined}
        />
      </section>

      <PcsBreakdown data={data} />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <TopProducts products={data.products} />
        <TopJastiper id={id} data={data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-5">
        <StockCard stockOut={data.stockOut} lowStock={data.lowStock} />
        <UnmetDemand list={data.unmetDemand} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-5">
        <Timeline timeline={data.timeline} />
        <SizeCard sizes={data.sizes} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="app-card flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--pm-gold)' }}>
            {title}
          </p>
          {subtitle && (
            <p className="mt-1 text-[12px]" style={soft}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl px-4 py-6 text-center text-[13px]" style={{ ...soft, background: 'var(--pm-tint)' }}>
      {children}
    </p>
  )
}

function StatTile({
  icon,
  label,
  value,
  hint,
  emphasis,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  emphasis?: boolean
  tone?: 'danger' | 'warn'
}) {
  const iconColor = tone === 'danger' ? COLOR.ditolak : tone === 'warn' ? COLOR.menunggu : 'var(--pm-gold)'
  const iconBg = tone === 'danger' ? '#fbe4e1' : tone === 'warn' ? '#fbefd9' : 'var(--pm-tint)'
  return (
    <div
      className="app-card flex min-w-0 flex-col gap-2 p-4"
      style={emphasis ? { background: '#9c463b', color: '#fff', borderColor: '#9c463b' } : undefined}
    >
      <span
        className="flex size-8 items-center justify-center rounded-lg"
        style={
          emphasis
            ? { background: 'rgba(255,255,255,0.16)', color: '#fff' }
            : { background: iconBg, color: iconColor }
        }
      >
        {icon}
      </span>
      <p className="text-[12px] font-medium" style={emphasis ? { color: 'rgba(255,255,255,0.8)' } : soft}>
        {label}
      </p>
      <p className="pm-num truncate text-[22px] font-bold leading-none lg:text-[24px]" title={value}>
        {value}
      </p>
      <p className="truncate text-[11px]" style={emphasis ? { color: 'rgba(255,255,255,0.75)' } : soft}>
        {hint}
      </p>
    </div>
  )
}

function Insights({ data }: { data: EventAnalytics }) {
  const top = data.products.at(0)
  const topJ = data.jastiperRanking.at(0)
  const topSize = data.sizes.at(0)
  const tips: Array<ReactNode> = []
  if (top && top.terjual > 0) {
    tips.push(
      <>
        <b>{top.productName}</b> paling laku: {fmt(top.terjual)} pcs lewat {fmt(top.jastiper)} jastiper.
      </>,
    )
  }
  if (topJ && topJ.terjual > 0) {
    tips.push(
      <>
        <b>{topJ.brandName}</b> menjual pcs terbanyak ({fmt(topJ.terjual)} pcs).
      </>,
    )
  }
  if (data.stockOut.length > 0) {
    const hot = data.stockOut.filter((s) => s.terjual + s.ditolak > 0).length
    tips.push(
      <>
        {fmt(data.stockOut.length)} varian habis
        {hot > 0 ? <>, {fmt(hot)} di antaranya sempat dipesan — pertimbangkan tambah stok untuk event berikutnya.</> : '.'}
      </>,
    )
  } else if (data.pcs.ditolak > 0) {
    tips.push(<>{fmt(data.pcs.ditolak)} pcs ditolak karena tidak tersedia saat dicek.</>)
  }
  if (topSize && tips.length < 3) {
    tips.push(
      <>
        Ukuran <b>{topSize.size}</b> paling dicari ({fmt(topSize.terjual)} pcs).
      </>,
    )
  }
  if (tips.length === 0) return null

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl p-5 lg:flex-row lg:items-start lg:gap-5"
      style={{ background: 'linear-gradient(135deg, #f3dfd9 0%, #f3ead9 100%)', border: '1px solid #eadfcc' }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: '#fff', color: '#9c463b' }}
      >
        <Lightbulb size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="pm-display text-[15px]">Sorotan event</p>
        <ul className="flex flex-col gap-1 text-[13px] leading-relaxed">
          {tips.slice(0, 3).map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden style={{ color: '#9c463b' }}>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function PcsBreakdown({ data }: { data: EventAnalytics }) {
  const parts = [
    { key: 'terjual', label: 'Terjual', value: data.pcs.terjual, color: COLOR.terjual },
    { key: 'menunggu', label: 'Menunggu dicek', value: data.pcs.menunggu, color: COLOR.menunggu },
    { key: 'ditolak', label: 'Ditolak', value: data.pcs.ditolak, color: COLOR.ditolak },
    { key: 'draft', label: 'Belum disubmit', value: data.pcs.draft, color: COLOR.draft },
  ].filter((p) => p.value > 0)
  const total = parts.reduce((s, p) => s + p.value, 0)
  const kindTotal = data.kindSplit.satuan + data.kindSplit.paket
  const paketShare = kindTotal ? Math.round((data.kindSplit.paket / kindTotal) * 100) : 0

  return (
    <Card
      title="Alur pcs"
      subtitle={`${fmt(total)} pcs dipesan lewat jastiper di event ini`}
    >
      {total === 0 ? (
        <EmptyNote>Belum ada pesanan produk.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.value} pcs`).join(', ')}>
              {parts.map((p) => (
                <div
                  key={p.key}
                  title={`${p.label}: ${fmt(p.value)} pcs`}
                  style={{ width: `${(p.value / total) * 100}%`, background: p.color, minWidth: 4 }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} />
                  <span style={soft}>{p.label}</span>
                  <span className="pm-num font-bold">{fmt(p.value)}</span>
                  <span style={soft}>({Math.round((p.value / total) * 100)}%)</span>
                </li>
              ))}
            </ul>
          </div>
          {kindTotal > 0 && (
            <div
              className="flex shrink-0 gap-6 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <div>
                <p className="text-[11px]" style={soft}>Satuan</p>
                <p className="pm-num text-lg font-bold">{fmt(data.kindSplit.satuan)} <span className="text-[12px] font-normal" style={soft}>pcs</span></p>
              </div>
              <div>
                <p className="text-[11px]" style={soft}>Lewat paket</p>
                <p className="pm-num text-lg font-bold">
                  {fmt(data.kindSplit.paket)} <span className="text-[12px] font-normal" style={soft}>pcs · {paketShare}%</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const medal = ['#c9a227', '#9aa3ad', '#b07a4a'][rank - 1]
  return (
    <span
      className="pm-num flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
      style={
        medal
          ? { background: medal, color: '#fff' }
          : { background: 'var(--pm-tint)', color: 'var(--app-text-soft)' }
      }
    >
      {rank}
    </span>
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
      className="self-center text-[13px] font-semibold"
      style={{ color: 'var(--app-accent)' }}
    >
      {expanded ? 'Tampilkan lebih sedikit' : `Lihat semua (${total})`}
    </button>
  )
}

const LIST_LIMIT = 8

function TopProducts({ products }: { products: Array<ProductStat> }) {
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(1, ...products.map((p) => p.terjual + p.ditolak))
  const list = expanded ? products : products.slice(0, LIST_LIMIT)

  return (
    <Card title="Produk terlaris" subtitle="Urut pcs terjual · ketuk untuk lihat per varian">
      {products.length === 0 ? (
        <EmptyNote>Belum ada produk yang terjual.</EmptyNote>
      ) : (
        <>
          <ol className="flex flex-col gap-1">
            {list.map((p, i) => {
              const isOpen = open === p.productName
              return (
                <li key={p.productName} className="rounded-xl" style={isOpen ? { background: 'var(--pm-tint)' } : undefined}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.productName)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left"
                  >
                    <RankBadge rank={i + 1} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[13px] font-bold">{p.productName}</p>
                        <p className="pm-num shrink-0 text-[13px] font-bold">
                          {fmt(p.terjual)} <span className="font-normal" style={soft}>pcs</span>
                        </p>
                      </div>
                      <Bar max={max} value={p.terjual} rejected={p.ditolak} />
                      <p className="text-[11px]" style={soft}>
                        {fmt(p.jastiper)} jastiper
                        {p.ditolak > 0 && <span style={{ color: COLOR.ditolak }}> · {fmt(p.ditolak)} ditolak</span>}
                      </p>
                    </div>
                    <ChevronDown
                      size={16}
                      className="shrink-0 transition-transform"
                      style={{ ...soft, transform: isOpen ? 'rotate(180deg)' : undefined }}
                    />
                  </button>
                  {isOpen && (
                    <ul className="flex flex-col gap-1 px-3 pb-3 pl-12 text-[12px]">
                      {p.variants.map((v) => (
                        <li key={v.label} className="flex items-center justify-between gap-3 border-t pt-1.5" style={{ borderColor: 'var(--app-border)' }}>
                          <span className="truncate">{v.label}</span>
                          <span className="pm-num shrink-0">
                            <b>{fmt(v.terjual)}</b> pcs
                            {v.ditolak > 0 && <span style={{ color: COLOR.ditolak }}> · {fmt(v.ditolak)} ditolak</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
          <ShowMore shown={LIST_LIMIT} total={products.length} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        </>
      )}
    </Card>
  )
}

/** Batang horizontal: terjual (warna utama) + ditolak (merah muda) di ujungnya. */
function Bar({ max, value, rejected = 0 }: { max: number; value: number; rejected?: number }) {
  return (
    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full" style={{ background: 'var(--pm-muted)' }}>
      {value > 0 && (
        <div className="rounded-full" style={{ width: `${(value / max) * 100}%`, background: COLOR.bar }} />
      )}
      {rejected > 0 && (
        <div
          className="rounded-full"
          title={`${rejected} pcs ditolak`}
          style={{ width: `${(rejected / max) * 100}%`, background: '#e7a79d' }}
        />
      )}
    </div>
  )
}

function TopJastiper({ id, data }: { id: string; data: EventAnalytics }) {
  const [expanded, setExpanded] = useState(false)
  const ranking = data.jastiperRanking
  const max = Math.max(1, ...ranking.map((j) => j.terjual + j.ditolak))
  const list = expanded ? ranking : ranking.slice(0, LIST_LIMIT)
  const top = ranking.at(0)

  return (
    <Card title="Jastiper teratas" subtitle="Urut pcs terjual">
      {top && top.terjual > 0 && (
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'linear-gradient(135deg, #fbf3e6, #f3dfd9)' }}>
          <span className="relative">
            <span
              className="pm-display flex size-12 items-center justify-center rounded-full text-sm"
              style={{ background: '#9c463b', color: '#fff' }}
            >
              {initialsOf(top.brandName)}
            </span>
            <Crown size={16} className="absolute -right-1 -top-2" style={{ color: '#c9a227', fill: '#c9a227' }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold" style={{ color: '#9c463b' }}>Jastiper terbaik</p>
            <p className="truncate text-sm font-bold">{top.brandName}</p>
          </div>
          <div className="text-right">
            <p className="pm-num text-lg font-bold leading-none">{fmt(top.terjual)}</p>
            <p className="text-[11px]" style={soft}>pcs</p>
          </div>
        </div>
      )}
      <ol className="flex flex-col">
        <li className="grid grid-cols-[28px_minmax(0,1fr)_56px] gap-3 px-2 pb-2 text-[11px] font-semibold sm:grid-cols-[28px_minmax(0,1fr)_56px_110px]" style={soft}>
          <span />
          <span>Jastiper</span>
          <span className="text-right">Pcs</span>
          <span className="hidden text-right sm:block">Ditagih</span>
        </li>
        {list.map((j, i) => (
          <li key={j.brandId} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
            <Link
              to="/partner/event/jastiper/$id/$brandId"
              params={{ id, brandId: j.brandId }}
              className="grid grid-cols-[28px_minmax(0,1fr)_56px] items-center gap-3 rounded-lg px-2 py-2.5 no-underline sm:grid-cols-[28px_minmax(0,1fr)_56px_110px]"
              style={{ color: 'inherit' }}
            >
              <RankBadge rank={i + 1} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="truncate text-[13px] font-bold">{j.brandName}</p>
                <Bar max={max} value={j.terjual} rejected={j.ditolak} />
              </div>
              <span className="pm-num text-right text-[13px] font-bold">
                {fmt(j.terjual)}
                {j.ditolak > 0 && (
                  <span className="block text-[10px]" style={{ color: COLOR.ditolak }}>
                    −{fmt(j.ditolak)}
                  </span>
                )}
              </span>
              <span className="pm-num hidden text-right text-[12px] sm:block">
                {j.billedAmount > 0 ? formatRupiah(j.billedAmount) : '–'}
                {j.billedAmount > 0 && (
                  <span className="block text-[10px]" style={{ color: j.paidAmount >= j.billedAmount ? COLOR.terjual : 'var(--app-text-soft)' }}>
                    {j.paidAmount >= j.billedAmount ? 'Lunas' : `${Math.round((j.paidAmount / j.billedAmount) * 100)}% lunas`}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <ShowMore shown={LIST_LIMIT} total={ranking.length} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
    </Card>
  )
}

function StockCard({ stockOut, lowStock }: { stockOut: Array<StockOutStat>; lowStock: Array<StockOutStat> }) {
  const [tab, setTab] = useState<'habis' | 'hampir'>('habis')
  const [expanded, setExpanded] = useState(false)
  const rows = tab === 'habis' ? stockOut : lowStock
  const list = expanded ? rows : rows.slice(0, LIST_LIMIT)

  return (
    <Card
      title="Stok produk"
      subtitle="Stok saat ini dari produk yang dibawa ke event"
      action={
        <div className="flex gap-1.5" role="tablist">
          {(
            [
              ['habis', `Habis · ${stockOut.length}`],
              ['hampir', `Hampir habis · ${lowStock.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key)
                setExpanded(false)
              }}
              className={`pm-chip ${tab === key ? 'pm-chip--active' : ''}`}
              style={{ padding: '5px 10px', fontSize: 11 }}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyNote>{tab === 'habis' ? 'Tidak ada varian yang habis. 🎉' : 'Tidak ada varian yang hampir habis.'}</EmptyNote>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <li
                key={s.variantId}
                className="flex items-start gap-3 rounded-xl border p-3"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                  style={
                    s.stockQty <= 0
                      ? { background: '#fbe4e1', color: COLOR.ditolak }
                      : { background: '#fbefd9', color: COLOR.menunggu }
                  }
                >
                  {s.stockQty <= 0 ? <PackageX size={16} /> : <TriangleAlert size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{s.productName}</p>
                  <p className="truncate text-[12px]" style={soft}>{s.label}</p>
                  <p className="mt-1 text-[11px]" style={soft}>
                    {s.terjual + s.ditolak > 0 ? (
                      <>
                        Terjual <b className="pm-num" style={{ color: 'var(--app-text)' }}>{fmt(s.terjual)}</b>
                        {s.ditolak > 0 && <span style={{ color: COLOR.ditolak }}> · ditolak {fmt(s.ditolak)}</span>}
                      </>
                    ) : (
                      'Tidak dipesan di event ini'
                    )}
                  </p>
                </div>
                <span
                  className="app-badge shrink-0"
                  style={
                    s.stockQty <= 0
                      ? { background: '#fbe4e1', color: COLOR.ditolak }
                      : { background: '#fbefd9', color: '#8a5a0c' }
                  }
                >
                  {s.stockQty <= 0 ? 'Habis' : `Sisa ${s.stockQty}`}
                </span>
              </li>
            ))}
          </ul>
          <ShowMore shown={LIST_LIMIT} total={rows.length} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        </>
      )}
    </Card>
  )
}

function UnmetDemand({ list }: { list: EventAnalytics['unmetDemand'] }) {
  const max = Math.max(1, ...list.map((u) => u.ditolak))
  return (
    <Card title="Permintaan tak terpenuhi" subtitle="Pcs ditolak terbanyak, sinyal untuk tambah stok">
      {list.length === 0 ? (
        <EmptyNote>Semua pesanan tersedia. Tidak ada pcs yang ditolak.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((u) => (
            <li key={u.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{u.label}</span>
                <span className="pm-num shrink-0 font-bold" style={{ color: COLOR.ditolak }}>
                  {fmt(u.ditolak)} pcs
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--pm-muted)' }}>
                <div className="h-full rounded-full" style={{ width: `${(u.ditolak / max) * 100}%`, background: '#e7a79d' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Timeline({ timeline }: { timeline: EventAnalytics['timeline'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const buckets = timeline.buckets
  const max = Math.max(1, ...buckets.map((b) => b.pcs))
  const peak = buckets.reduce<(typeof buckets)[number] | null>((best, b) => (!best || b.pcs > best.pcs ? b : best), null)
  const active = hover !== null ? buckets[hover] : null
  // Label sumbu-x secukupnya supaya tidak bertumpuk.
  const every = Math.max(1, Math.ceil(buckets.length / 6))

  return (
    <Card
      title="Aktivitas submit"
      subtitle={`Pcs yang dikirim jastiper per ${timeline.granularity} (WIB)`}
    >
      {buckets.length === 0 ? (
        <EmptyNote>Belum ada submit pesanan.</EmptyNote>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex h-5 items-center justify-between text-[12px]">
            {active ? (
              <span>
                <b>{active.label}</b> · <span className="pm-num font-bold">{fmt(active.pcs)}</span> pcs dari {fmt(active.submits)} submit
              </span>
            ) : peak && peak.pcs > 0 ? (
              <span style={soft}>
                Paling ramai: <b style={{ color: 'var(--app-text)' }}>{peak.label}</b> ({fmt(peak.pcs)} pcs)
              </span>
            ) : (
              <span />
            )}
          </div>
          <div className="relative flex h-40 items-end gap-[2px] border-b" style={{ borderColor: 'var(--app-border)' }} onMouseLeave={() => setHover(null)}>
            {[0.5, 1].map((g) => (
              <div
                key={g}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t border-dashed"
                style={{ bottom: `${g * 100}%`, borderColor: 'var(--app-border)' }}
              />
            ))}
            {buckets.map((b, i) => (
              <button
                key={b.key}
                type="button"
                className="relative flex h-full min-w-0 flex-1 items-end"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${b.label}: ${b.pcs} pcs dari ${b.submits} submit`}
              >
                <span
                  className="w-full rounded-t-[4px] transition-colors"
                  style={{
                    height: b.pcs ? `${Math.max(3, (b.pcs / max) * 100)}%` : 0,
                    background: hover === null || hover === i ? COLOR.bar : COLOR.barSoft,
                  }}
                />
              </button>
            ))}
          </div>
          <div className="flex gap-[2px] text-[10px]" style={soft}>
            {buckets.map((b, i) => (
              <span key={b.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
                {i % every === 0 ? (timeline.granularity === 'jam' ? b.label.split(', ')[1] : b.label) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function SizeCard({ sizes }: { sizes: EventAnalytics['sizes'] }) {
  const total = sizes.reduce((s, x) => s + x.terjual, 0)
  const max = Math.max(1, ...sizes.map((s) => s.terjual))
  return (
    <Card title="Ukuran terlaris" subtitle="Pcs terjual per ukuran">
      {sizes.length === 0 ? (
        <EmptyNote>Produk di event ini belum memakai ukuran.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sizes.slice(0, 8).map((s) => (
            <li key={s.size} className="grid grid-cols-[52px_minmax(0,1fr)_64px] items-center gap-3 text-[13px]">
              <span className="pm-chip justify-center" style={{ padding: '3px 8px', fontSize: 11 }}>
                {s.size}
              </span>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--pm-muted)' }}>
                <div className="h-full rounded-full" style={{ width: `${(s.terjual / max) * 100}%`, background: COLOR.bar }} />
              </div>
              <span className="pm-num text-right">
                <b>{fmt(s.terjual)}</b>{' '}
                <span className="text-[11px]" style={soft}>
                  {Math.round((s.terjual / total) * 100)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
