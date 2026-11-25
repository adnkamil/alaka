import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type {
  ComparedBucket,
  Granularity,
} from '../lib/partner-analytics-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import {
  formatCompactRupiah,
  formatIsoDate,
  formatBucketRange,
} from './PartnerAnalyticsFormat'
import { usePartnerI18n } from './PartnerI18n'

const PAD = { top: 12, right: 12, bottom: 28, left: 60 }

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Batas atas sumbu Y yang "bulat" (1, 2, 2.5, 5 × 10^n) agar label mudah dibaca. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(value))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (value <= m * exp) return m * exp
  }
  return 10 * exp
}

function axisLabel(
  bucket: ComparedBucket,
  granularity: Granularity,
  locale: string,
): string {
  if (granularity === 'month') {
    return formatIsoDate(bucket.from, { month: 'short', year: '2-digit' }, locale)
  }
  return formatIsoDate(bucket.from, { day: 'numeric', month: 'short' }, locale)
}

/**
 * Grafik tren revenue: garis biru = periode ini, garis putus-putus abu =
 * periode pembanding. Crosshair mengikuti pointer (dan tombol panah saat
 * fokus) lalu menampilkan kedua nilai di satu tooltip.
 */
export default function PartnerAnalyticsChart({
  buckets,
  granularity,
  showPrevious,
  comparisonLabel,
}: {
  buckets: Array<ComparedBucket>
  granularity: Granularity
  showPrevious: boolean
  comparisonLabel: string
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const { t, intlLocale } = usePartnerI18n()
  const [active, setActive] = useState<number | null>(null)
  const height = width > 0 && width < 520 ? 220 : 280

  const geometry = useMemo(() => {
    if (width <= 0 || buckets.length === 0) return null
    const innerW = Math.max(10, width - PAD.left - PAD.right)
    const innerH = height - PAD.top - PAD.bottom
    const peak = Math.max(
      ...buckets.map((b) =>
        Math.max(b.amount, showPrevious ? (b.previous ?? 0) : 0),
      ),
    )
    const yMax = niceMax(peak)
    const n = buckets.length
    const x = (i: number) =>
      PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH
    const line = (values: Array<number | null>) =>
      values
        .map((v, i) =>
          v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`,
        )
        .filter(Boolean)
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`)
        .join(' ')
    const current = line(buckets.map((b) => b.amount))
    const area =
      n > 1
        ? `${current} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
        : ''
    const previous = showPrevious ? line(buckets.map((b) => b.previous)) : ''
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)
    // Label sumbu X secukupnya: kira-kira satu tiap 84px.
    const maxLabels = Math.max(2, Math.floor(innerW / 84))
    const step = Math.max(1, Math.ceil(n / maxLabels))
    const xLabels = buckets
      .map((b, i) => ({ i, text: axisLabel(b, granularity, intlLocale) }))
      .filter(({ i }) => i % step === 0)
    return { innerW, innerH, x, y, current, area, previous, ticks, xLabels }
  }, [width, height, buckets, showPrevious, granularity, intlLocale])

  const allZero = buckets.every((b) => b.amount === 0)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!geometry) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const n = buckets.length
    const ratio = (px - PAD.left) / geometry.innerW
    setActive(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))))
  }

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const last = buckets.length - 1
    setActive((cur) => {
      if (cur === null) return e.key === 'ArrowLeft' ? last : 0
      return Math.min(last, Math.max(0, cur + (e.key === 'ArrowLeft' ? -1 : 1)))
    })
  }

  const activeBucket = active !== null ? buckets[active] : null

  return (
    <div className="flex flex-col gap-3">
      {showPrevious && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          style={{ color: 'var(--app-text-soft)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="16"
                y2="2"
                stroke="var(--app-accent)"
                strokeWidth="2"
              />
            </svg>
            {t.analytics.chartThisPeriod}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="4" aria-hidden="true">
              <line
                x1="0"
                y1="2"
                x2="16"
                y2="2"
                stroke="var(--pa-compare)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            {comparisonLabel.charAt(0).toUpperCase() + comparisonLabel.slice(1)}
          </span>
        </div>
      )}
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        {geometry && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={t.analytics.chartAria}
            tabIndex={0}
            className="pa-focus block touch-pan-y select-none rounded-md"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            {geometry.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + geometry.innerW}
                  y1={geometry.y(tick)}
                  y2={geometry.y(tick)}
                  stroke="var(--pa-grid)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={geometry.y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--app-text-mute)"
                  className="pa-num"
                >
                  {formatCompactRupiah(tick, intlLocale)}
                </text>
              </g>
            ))}
            {geometry.xLabels.map(({ i, text }) => (
              <text
                key={i}
                x={geometry.x(i)}
                y={height - 8}
                textAnchor={i === 0 && buckets.length > 1 ? 'start' : 'middle'}
                fontSize={11}
                fill="var(--app-text-mute)"
              >
                {text}
              </text>
            ))}
            {geometry.area && (
              <path
                d={geometry.area}
                fill="var(--app-accent-soft)"
                fillOpacity={0.45}
              />
            )}
            {geometry.previous && (
              <path
                d={geometry.previous}
                fill="none"
                stroke="var(--pa-compare)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinejoin="round"
              />
            )}
            <path
              d={geometry.current}
              fill="none"
              stroke="var(--app-accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {buckets.length === 1 && (
              <circle
                cx={geometry.x(0)}
                cy={geometry.y(buckets[0].amount)}
                r={4}
                fill="var(--app-accent)"
              />
            )}
            {active !== null && activeBucket && (
              <g pointerEvents="none">
                <line
                  x1={geometry.x(active)}
                  x2={geometry.x(active)}
                  y1={PAD.top}
                  y2={PAD.top + geometry.innerH}
                  stroke="var(--app-text-mute)"
                  strokeWidth={1}
                />
                {showPrevious && activeBucket.previous !== null && (
                  <circle
                    cx={geometry.x(active)}
                    cy={geometry.y(activeBucket.previous)}
                    r={4}
                    fill="#ffffff"
                    stroke="var(--pa-compare)"
                    strokeWidth={2}
                  />
                )}
                <circle
                  cx={geometry.x(active)}
                  cy={geometry.y(activeBucket.amount)}
                  r={4.5}
                  fill="var(--app-accent)"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}
        {geometry && allZero && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: 'var(--app-text-soft)', paddingLeft: PAD.left }}
          >
            {t.analytics.chartNoSales}
          </div>
        )}
        {geometry && active !== null && activeBucket && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max max-w-[220px] rounded-lg border bg-white px-3 py-2 text-xs shadow-md"
            style={{
              borderColor: 'var(--app-border)',
              left: Math.min(
                Math.max(geometry.x(active) - 90, 0),
                Math.max(0, width - 200),
              ),
            }}
            aria-live="polite"
          >
            <p
              className="mb-1.5 font-medium"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {formatBucketRange(
                activeBucket.from,
                activeBucket.to,
                granularity,
                intlLocale,
              )}
            </p>
            <p className="flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: 'var(--app-accent)' }}
              />
              <span
                className="pa-num text-sm font-semibold"
                style={{ color: 'var(--app-text)' }}
              >
                {formatRupiah(activeBucket.amount)}
              </span>
            </p>
            {showPrevious &&
              activeBucket.previous !== null &&
              activeBucket.previousFrom && (
                <p
                  className="mt-1 flex items-center gap-2"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <span
                    className="inline-block h-0.5 w-3"
                    style={{ background: 'var(--pa-compare)' }}
                  />
                  <span className="pa-num font-medium">
                    {formatRupiah(activeBucket.previous)}
                  </span>
                  <span>
                    ·{' '}
                    {formatBucketRange(
                      activeBucket.previousFrom,
                      activeBucket.previousTo ?? activeBucket.previousFrom,
                      granularity,
                      intlLocale,
                    )}
                  </span>
                </p>
              )}
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>{t.analytics.chartCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.analytics.chartPeriod}</th>
            <th scope="col">{t.analytics.chartRevenue}</th>
            {showPrevious && <th scope="col">{t.analytics.chartComparison}</th>}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.from}>
              <th scope="row">
                {formatBucketRange(b.from, b.to, granularity, intlLocale)}
              </th>
              <td>{formatRupiah(b.amount)}</td>
              {showPrevious && (
                <td>{b.previous === null ? '-' : formatRupiah(b.previous)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
