import { partnerStatusBadge } from '../lib/event-slot'
import type { PartnerBadgeTone, SlotStatus } from '../lib/event-slot'

const TONE_STYLE: Record<PartnerBadgeTone, { background: string; color: string }> = {
  neutral: { background: '#efe5d8', color: '#7a6a58' },
  info: { background: '#e0ecfb', color: '#2f5fb3' },
  warn: { background: '#fdecd0', color: '#b26a0a' },
  success: { background: '#dcebe1', color: '#3f7a55' },
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
