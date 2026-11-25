import type { PartnerBadgeTone } from '../lib/event-slot'

const TONE_STYLE: Record<
  PartnerBadgeTone | 'danger',
  { background: string; color: string }
> = {
  neutral: { background: 'var(--pm-muted)', color: 'var(--app-text-soft)' },
  info: { background: 'var(--app-info-soft)', color: 'var(--app-info)' },
  warn: { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' },
  success: { background: 'var(--app-success-soft)', color: 'var(--app-success)' },
  danger: { background: 'var(--app-danger-soft)', color: 'var(--app-danger)' },
}

/** Chip kecil status baris tabel: Cukup / Kurang 2 / Menunggu / Pengganti. */
export default function PartnerRowChip({
  label,
  tone,
}: {
  label: string
  tone: PartnerBadgeTone | 'danger'
}) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold"
      style={TONE_STYLE[tone]}
    >
      {label}
    </span>
  )
}
