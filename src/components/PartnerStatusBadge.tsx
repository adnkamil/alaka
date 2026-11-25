import { partnerStatusBadge } from '../lib/event-slot'
import type { PartnerBadgeTone, SlotStatus } from '../lib/event-slot'

const TONE_STYLE: Record<PartnerBadgeTone, { background: string; color: string }> = {
  neutral: { background: 'var(--pm-muted)', color: 'var(--app-text-soft)' },
  info: { background: 'var(--app-info-soft)', color: 'var(--app-info)' },
  warn: { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' },
  success: { background: 'var(--app-success-soft)', color: 'var(--app-success)' },
}

/** Badge status pesanan jastiper (Draft / Pengajuan / Pesanan dikembalikan / Disetujui). */
export default function PartnerStatusBadge({
  status,
}: {
  status: SlotStatus | null
}) {
  const { label, tone } = partnerStatusBadge(status)
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-semibold"
      style={TONE_STYLE[tone]}
    >
      {label}
    </span>
  )
}
