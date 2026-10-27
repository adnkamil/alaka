import type { PartnerEventStatus } from '../lib/partner-event-rules'

const STYLE: Record<
  PartnerEventStatus,
  { label: string; bg: string; fg: string }
> = {
  berjalan: {
    label: 'Berjalan',
    bg: 'var(--app-success-soft)',
    fg: 'var(--app-success)',
  },
  mendatang: {
    label: 'Mendatang',
    bg: 'var(--app-accent-soft)',
    fg: 'var(--app-accent)',
  },
  selesai: {
    label: 'Selesai',
    bg: 'var(--app-border)',
    fg: 'var(--app-text-soft)',
  },
}

/** Badge status event (Berjalan / Mendatang / Selesai) di Partner Portal. */
export default function PartnerEventStatusBadge({
  status,
}: {
  status: PartnerEventStatus
}) {
  const style = STYLE[status]
  return (
    <span
      className="app-badge shrink-0"
      style={{ background: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  )
}
