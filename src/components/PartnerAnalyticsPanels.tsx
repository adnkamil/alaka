import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  ImageOff,
  Info,
  Lightbulb,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  EVENT_STATUS_LABELS,
  percentChange,
  sortEvents,
  sortProducts,
} from '../lib/partner-analytics-rules'
import type {
  AnalyticsProductRow,
  EventPerformanceRow,
  EventSort,
  Insight,
  ProductSort,
  SalesSummary,
} from '../lib/partner-analytics-rules'
import type { PartnerEventStatus } from '../lib/partner-event-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import {
  formatCount,
  formatPercent,
  formatRangeLabel,
} from './PartnerAnalyticsFormat'

const soft = { color: 'var(--app-text-soft)' }
const mute = { color: 'var(--app-text-mute)' }

// ---------------------------------------------------------------------------
// Kecil-kecil
// ---------------------------------------------------------------------------

/** Ikon (i) yang membuka definisi metrik: hover, fokus, atau ketuk. */
export function InfoTip({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Definisi ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="pa-focus -m-1.5 inline-flex rounded-full p-1.5"
        style={mute}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1.5 w-60 -translate-x-1/2 rounded-lg border bg-white p-3 text-xs font-normal leading-relaxed shadow-lg"
          style={{
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-soft)',
          }}
        >
          {children}
        </span>
      )}
    </span>
  )
}

/** Naik = hijau, turun = merah, tanpa pembanding = netral. */
export function ChangeBadge({
  value,
  size = 'sm',
}: {
  value: number | null
  size?: 'sm' | 'md'
}) {
  if (value === null) {
    return (
      <span className="text-xs" style={mute}>
        Belum ada pembanding
      </span>
    )
  }
  const flat = Math.abs(value) < 0.05
  const up = value > 0
  const color = flat
    ? 'var(--app-text-soft)'
    : up
      ? 'var(--app-success)'
      : 'var(--app-danger)'
  const bg = flat
    ? 'var(--pa-neutral-soft)'
    : up
      ? 'var(--app-success-soft)'
      : 'var(--app-danger-soft)'
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`pa-num inline-flex items-center gap-0.5 rounded-md font-semibold ${
        size === 'md' ? 'px-1.5 py-0.5 text-[13px]' : 'px-1 py-px text-xs'
      }`}
      style={{ color, background: bg }}
    >
      {!flat && <Icon size={size === 'md' ? 14 : 12} aria-hidden="true" />}
      <span className="sr-only">{flat ? 'Stabil' : up ? 'Naik' : 'Turun'}</span>
      {formatPercent(value)}
    </span>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="pa-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2
          className="pm-display text-base"
          style={{ color: 'var(--app-text)' }}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs" style={soft}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`app-card flex min-w-0 flex-col gap-4 p-4 sm:p-5 ${className}`}
    >
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

/**
 * Kartu KPI. Baris bawah: `change` (persen naik/turun) atau, kalau tidak
 * ada pembanding yang bermakna, `hint` berupa teks pendek.
 */
export function KpiCard({
  label,
  definition,
  value,
  change,
  hint,
  primary = false,
}: {
  label: string
  definition: ReactNode
  value: string
  change?: number | null
  hint?: string
  primary?: boolean
}) {
  return (
    <div
      className={`app-card flex min-w-0 flex-col gap-2 p-4 sm:p-5 ${primary ? 'col-span-2 lg:col-span-1' : ''}`}
      style={
        primary
          ? {
              borderColor: 'var(--app-accent-soft)',
              background: 'var(--pa-revenue-bg)',
            }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[13px] font-medium" style={soft}>
          {label}
        </p>
        <InfoTip label={label}>{definition}</InfoTip>
      </div>
      <p
        className={`pm-num pa-num truncate leading-tight ${
          primary ? 'text-[26px] sm:text-[30px]' : 'text-[22px]'
        }`}
        style={{
          color: primary ? 'var(--app-accent-strong)' : 'var(--app-text)',
        }}
        title={value}
      >
        {value}
      </p>
      {change !== undefined ? (
        <ChangeBadge value={change} size={primary ? 'md' : 'sm'} />
      ) : (
        hint && (
          <p className="truncate text-xs" style={soft}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export function KpiCards({
  current,
  previous,
  comparisonLabel,
}: {
  current: SalesSummary
  previous: SalesSummary
  comparisonLabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))] lg:gap-4">
        <KpiCard
          primary
          label="Total Revenue"
          value={formatRupiah(current.netSales)}
          change={percentChange(current.netSales, previous.netSales)}
          definition={
            <>
              Net sales: total nilai tagihan ke jastiper pada periode ini, tidak
              termasuk tagihan yang dibatalkan. Harga paket sudah
              diperhitungkan. Bukan profit, bukan dana yang sudah diterima,
              tanpa ongkir dan biaya admin ALAKA.
            </>
          }
        />
        <KpiCard
          label="Total Tagihan"
          value={formatCount(current.orders)}
          change={percentChange(current.orders, previous.orders)}
          definition="Jumlah tagihan yang terbit ke jastiper pada periode ini, tidak termasuk yang dibatalkan. Bukan jumlah pembeli: satu tagihan bisa berisi beberapa submit."
        />
        <KpiCard
          label="Pcs Ditagih"
          value={formatCount(current.units)}
          change={percentChange(current.units, previous.units)}
          definition="Total pcs produk di dalam tagihan aktif. Isi paket dihitung per pcs. Pcs yang sudah disetujui tapi belum ditagih belum masuk di sini."
        />
        <KpiCard
          label="Rata-rata per Tagihan"
          value={current.aov === null ? '–' : formatRupiah(current.aov)}
          change={
            current.aov !== null && previous.aov !== null
              ? percentChange(current.aov, previous.aov)
              : null
          }
          definition="Rata-rata nilai satu tagihan: Total Revenue dibagi Total Tagihan."
        />
      </div>
      <p className="text-xs" style={mute}>
        Perubahan dibandingkan {comparisonLabel}.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event Performance
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<
  PartnerEventStatus,
  { color: string; background: string }
> = {
  berjalan: {
    color: 'var(--app-accent)',
    background: 'var(--pa-revenue-bg)',
  },
  mendatang: { color: 'var(--pa-gold-text)', background: 'var(--pm-tint)' },
  selesai: { color: 'var(--app-text-soft)', background: 'var(--pm-muted)' },
}

function StatusBadge({ status }: { status: PartnerEventStatus }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ ...STATUS_STYLE[status], borderColor: 'var(--app-border)' }}
    >
      {EVENT_STATUS_LABELS[status]}
    </span>
  )
}

function eventPeriod(row: EventPerformanceRow) {
  return formatRangeLabel({
    from: row.eventDate,
    to: row.endDate ?? row.eventDate,
  })
}

const EVENT_PAGE = 8

export function EventPerformance({
  rows,
}: {
  rows: Array<EventPerformanceRow>
}) {
  const [sort, setSort] = useState<EventSort>('revenue')
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const sorted = sortEvents(rows, sort)
  const visible = expanded ? sorted : sorted.slice(0, EVENT_PAGE)
  const open = (id: string) =>
    navigate({ to: '/partner/event/analisa/$id', params: { id } })

  return (
    <Panel>
      <SectionHeader
        title="Event Performance"
        description="Event yang berjalan atau punya penjualan pada periode ini. Klik event untuk analisa lengkap."
        action={
          rows.length > 1 ? (
            <Segmented
              label="Urutkan event"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'revenue', label: 'Revenue tertinggi' },
                { value: 'units', label: 'Pcs terbanyak' },
              ]}
            />
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm" style={soft}>
          Tidak ada event pada periode ini.
        </p>
      ) : (
        <>
          {/* Desktop & tablet: tabel */}
          <div className="-mx-4 hidden overflow-x-auto sm:-mx-5 md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs" style={mute}>
                  <th scope="col" className="px-5 pb-2 font-medium">
                    Event
                  </th>
                  <th scope="col" className="px-3 pb-2 font-medium">
                    Periode
                  </th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">
                    Total Revenue
                  </th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">
                    Tagihan
                  </th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">
                    Pcs ditagih
                  </th>
                  <th scope="col" className="px-3 pb-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="w-10 pb-2 pr-5">
                    <span className="sr-only">Detail</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.eventId}
                    className="cursor-pointer border-t transition-colors hover:bg-[var(--app-card-hover)]"
                    style={{ borderColor: 'var(--app-border)' }}
                    onClick={() => open(row.eventId)}
                  >
                    <td className="max-w-[280px] px-5 py-3">
                      <Link
                        to="/partner/event/analisa/$id"
                        params={{ id: row.eventId }}
                        className="pa-focus block truncate rounded font-medium no-underline"
                        style={{ color: 'var(--app-text)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3" style={soft}>
                      {eventPeriod(row)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className="pa-num font-semibold">
                        {formatRupiah(row.revenue)}
                      </div>
                      {row.growth !== null && (
                        <div className="mt-0.5">
                          <ChangeBadge value={row.growth} />
                        </div>
                      )}
                    </td>
                    <td className="pa-num px-3 py-3 text-right">
                      {formatCount(row.orders)}
                    </td>
                    <td className="pa-num px-3 py-3 text-right">
                      {formatCount(row.units)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-3 pr-5" style={mute}>
                      <ChevronRight size={16} aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: daftar ringkas */}
          <ul className="-mx-1 flex flex-col md:hidden">
            {visible.map((row) => (
              <li
                key={row.eventId}
                className="border-t first:border-t-0"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <Link
                  to="/partner/event/analisa/$id"
                  params={{ id: row.eventId }}
                  className="pa-focus flex items-center gap-3 rounded-lg px-1 py-3 no-underline"
                  style={{ color: 'inherit' }}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="text-xs" style={soft}>
                      {eventPeriod(row)} · {formatCount(row.orders)} tagihan ·{' '}
                      {formatCount(row.units)} pcs
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="pa-num text-sm font-semibold">
                      {formatRupiah(row.revenue)}
                    </p>
                    {row.growth !== null && <ChangeBadge value={row.growth} />}
                  </div>
                  <ChevronRight size={16} style={mute} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          {sorted.length > EVENT_PAGE && (
            <button
              type="button"
              className="pa-focus self-start rounded text-xs font-semibold"
              style={{ color: 'var(--app-accent)' }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? 'Tampilkan lebih sedikit'
                : `Tampilkan semua (${sorted.length})`}
            </button>
          )}
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Top Selling Products
// ---------------------------------------------------------------------------

const TOP_PRODUCTS = 10

function ProductThumb({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--app-border)', background: 'var(--pm-tint)' }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff size={16} style={mute} aria-hidden="true" />
      )}
    </div>
  )
}

export function TopProducts({
  products,
  totalRevenue,
}: {
  products: Array<AnalyticsProductRow>
  totalRevenue: number
}) {
  const [sort, setSort] = useState<ProductSort>('units')
  const rows = sortProducts(products, sort).slice(0, TOP_PRODUCTS)

  return (
    <Panel>
      <SectionHeader
        title="Top Selling Products"
        description={`${Math.min(products.length, TOP_PRODUCTS)} produk teratas pada periode ini.`}
        action={
          products.length > 1 ? (
            <Segmented
              label="Urutkan produk"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'units', label: 'Pcs terbanyak' },
                { value: 'revenue', label: 'Highest Revenue' },
              ]}
            />
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm" style={soft}>
          Belum ada produk terjual pada periode ini.
        </p>
      ) : (
        <ol className="flex flex-col">
          <li
            className="hidden grid-cols-[24px_minmax(0,1fr)_80px_120px_120px] items-center gap-3 pb-2 text-xs sm:grid"
            style={mute}
            aria-hidden="true"
          >
            <span>#</span>
            <span>Produk</span>
            <span className="text-right">Pcs ditagih</span>
            <span className="text-right">Revenue</span>
            <span className="inline-flex items-center justify-end gap-1">
              Kontribusi
              <InfoTip label="Kontribusi">
                Porsi revenue produk dari Total Revenue. Nilai tagihan dibagi ke
                produk di dalamnya sebanding qty × harga katalog, jadi diskon
                paket ikut terbagi.
              </InfoTip>
            </span>
          </li>
          {rows.map((p, i) => {
            const share =
              totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0
            return (
              <li
                key={p.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t py-2.5 sm:grid-cols-[24px_minmax(0,1fr)_80px_120px_120px]"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span className="pa-num hidden text-xs sm:block" style={mute}>
                  {i + 1}
                </span>
                <div className="flex min-w-0 items-center gap-3">
                  <ProductThumb url={p.photoUrl} name={p.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    {p.sku && (
                      <p
                        className="hidden truncate text-xs sm:block"
                        style={mute}
                      >
                        SKU {p.sku}
                      </p>
                    )}
                    <p className="truncate text-xs sm:hidden" style={mute}>
                      {p.sku ? `SKU ${p.sku} · ` : ''}
                      {formatCount(p.units)} pcs
                    </p>
                  </div>
                </div>
                <span className="pa-num hidden text-right text-sm sm:block">
                  {formatCount(p.units)}
                </span>
                <div className="text-right">
                  <p className="pa-num text-sm font-semibold">
                    {formatRupiah(p.revenue)}
                  </p>
                  <p className="pa-num text-xs sm:hidden" style={soft}>
                    {formatPercent(share)} dari revenue
                  </p>
                </div>
                <div className="hidden items-center justify-end gap-2 sm:flex">
                  <div
                    className="h-1.5 w-12 overflow-hidden rounded-full"
                    style={{ background: 'var(--pa-grid)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, share)}%`,
                        background: 'var(--app-accent)',
                      }}
                    />
                  </div>
                  <span className="pa-num w-12 text-right text-xs" style={soft}>
                    {formatPercent(share)}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Business Insights
// ---------------------------------------------------------------------------

export function BusinessInsights({
  insights,
  title = 'Business Insights',
  description = 'Disusun otomatis dari data penjualan periode ini.',
  emptyText = 'Belum cukup data untuk menarik kesimpulan pada periode ini.',
}: {
  insights: Array<Insight>
  title?: string
  description?: string
  emptyText?: string
}) {
  return (
    <Panel>
      <SectionHeader title={title} description={description} />
      {insights.length === 0 ? (
        <p className="text-sm" style={soft}>
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((ins) => {
            const Icon =
              ins.tone === 'up'
                ? TrendingUp
                : ins.tone === 'down'
                  ? TrendingDown
                  : Lightbulb
            const color =
              ins.tone === 'up'
                ? 'var(--app-success)'
                : ins.tone === 'down'
                  ? 'var(--app-danger)'
                  : 'var(--app-accent)'
            const bg =
              ins.tone === 'up'
                ? 'var(--app-success-soft)'
                : ins.tone === 'down'
                  ? 'var(--app-danger-soft)'
                  : 'var(--app-accent-soft)'
            return (
              <li key={ins.key} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ color, background: bg }}
                  aria-hidden="true"
                >
                  <Icon size={15} />
                </span>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--app-text)' }}
                >
                  {ins.text}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Definisi angka
// ---------------------------------------------------------------------------

export function MetricDefinitions() {
  return (
    <details className="app-card group p-4 text-sm sm:p-5">
      <summary
        className="pa-focus cursor-pointer rounded font-medium"
        style={{ color: 'var(--app-text)' }}
      >
        Cara angka dihitung
      </summary>
      <ul
        className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed"
        style={soft}
      >
        <li>
          <b>Revenue (Net Sales)</b> = total nilai tagihan ke jastiper. Nilai
          tagihan dikunci saat tagihan terbit, jadi tidak berubah walau harga
          katalog diubah.
        </li>
        <li>
          <b>Diskon</b>: harga paket sudah termasuk di Net Sales. Diskon belum
          tercatat terpisah, jadi Gross Sales dan Discounts belum ditampilkan
          sebagai angka sendiri.
        </li>
        <li>
          <b>Tagihan & Pcs ditagih</b> hanya dari tagihan yang sudah terbit. Pcs
          yang sudah disetujui saat dicek tapi belum ditagih belum masuk di
          sini; angka itu ada di Analisa Event sebagai &ldquo;Pcs
          terjual&rdquo;.
        </li>
        <li>
          <b>Pembatalan</b>: tagihan yang dibatalkan tidak dihitung sama sekali.
          Belum ada fitur retur/refund.
        </li>
        <li>
          <b>Tidak termasuk</b>: ongkir, biaya admin ALAKA, dan status
          pembayaran. Revenue bukan profit dan bukan dana yang sudah diterima.
          Profit belum dihitung karena biaya produk dan operasional belum
          tersedia.
        </li>
        <li>
          <b>Tanggal</b> transaksi = tanggal tagihan terbit, dikelompokkan dalam
          WIB (GMT+7).
        </li>
      </ul>
    </details>
  )
}
