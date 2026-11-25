import type { PartnerEventStatus } from '../lib/partner-event-rules'
import { usePartnerT } from './PartnerI18n'

const STYLE: Record<
  PartnerEventStatus,
  { bg: string; fg: string }
> = {
  berjalan: {
    bg: 'var(--app-success-soft)',
    fg: 'var(--app-success)',
  },
  mendatang: {
    bg: 'var(--app-accent-soft)',
    fg: 'var(--app-accent)',
  },
  selesai: {
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
  const t = usePartnerT()
  return (
    <span
      className="app-badge shrink-0"
      style={{ background: style.bg, color: style.fg }}
    >
      {t.event.status[status]}
    </span>
  )
}
