import type { DateRange, Granularity } from '../lib/partner-analytics-rules'

const compact = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** "Rp 1,2 jt", "Rp 500 rb", "Rp 0" untuk label sumbu. */
export function formatCompactRupiah(value: number): string {
  return `Rp ${compact.format(value)}`
}

/**
 * Format tanggal `YYYY-MM-DD` tanpa pergeseran zona: tanggal ini sudah
 * tanggal WIB, jadi dibaca sebagai UTC tengah malam dan diformat di UTC.
 */
export function formatIsoDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('id-ID', { ...options, timeZone: 'UTC' })
    .replace(/\./g, '')
}

/** "19–25 Nov 2026", "28 Okt – 3 Nov 2026", "1 Nov 2026". */
export function formatRangeLabel(range: DateRange): string {
  const { from, to } = range
  if (from === to) return formatIsoDate(from)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7)
  if (sameMonth) return `${Number(from.slice(8))}–${formatIsoDate(to)}`
  if (sameYear) {
    return `${formatIsoDate(from, { day: 'numeric', month: 'short' })} – ${formatIsoDate(to)}`
  }
  return `${formatIsoDate(from)} – ${formatIsoDate(to)}`
}

export function formatBucketRange(
  from: string,
  to: string,
  granularity: Granularity,
): string {
  if (granularity === 'day') {
    return formatIsoDate(from, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  return formatRangeLabel({ from, to })
}

export function formatPercent(value: number): string {
  const abs = Math.abs(value)
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10
  return `${rounded.toLocaleString('id-ID')}%`
}

export function formatCount(value: number): string {
  return value.toLocaleString('id-ID')
}
