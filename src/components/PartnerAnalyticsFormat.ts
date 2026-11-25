import type { DateRange, Granularity } from '../lib/partner-analytics-rules'

/**
 * Format angka & tanggal analitik. `locale` = tag `Intl` bahasa aktif Partner
 * Portal (`usePartnerI18n().intlLocale`); default Indonesia.
 */

/** "Rp 1,2 jt" (id) / "Rp 1.2M" (en), "Rp 0" untuk label sumbu. */
export function formatCompactRupiah(value: number, locale = 'id-ID'): string {
  const compact = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
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
  locale = 'id-ID',
): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
    .replace(/\./g, '')
}

/** "19–25 Nov 2026", "28 Okt – 3 Nov 2026", "1 Nov 2026". */
export function formatRangeLabel(range: DateRange, locale = 'id-ID'): string {
  const { from, to } = range
  if (from === to) return formatIsoDate(from, undefined, locale)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7)
  if (sameMonth) {
    return `${Number(from.slice(8))}–${formatIsoDate(to, undefined, locale)}`
  }
  if (sameYear) {
    return `${formatIsoDate(from, { day: 'numeric', month: 'short' }, locale)} – ${formatIsoDate(to, undefined, locale)}`
  }
  return `${formatIsoDate(from, undefined, locale)} – ${formatIsoDate(to, undefined, locale)}`
}

export function formatBucketRange(
  from: string,
  to: string,
  granularity: Granularity,
  locale = 'id-ID',
): string {
  if (granularity === 'day') {
    return formatIsoDate(
      from,
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
      locale,
    )
  }
  return formatRangeLabel({ from, to }, locale)
}

export function formatPercent(value: number, locale = 'id-ID'): string {
  const abs = Math.abs(value)
  const rounded = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10
  return `${rounded.toLocaleString(locale)}%`
}

export function formatCount(value: number, locale = 'id-ID'): string {
  return value.toLocaleString(locale)
}
