import type { PartnerBadgeTone } from '../lib/event-slot'

const TONE_STYLE: Record<
  PartnerBadgeTone | 'danger',
  { background: string; color: string }
> = {
  neutral: { background: '#efe5d8', color: '#7a6a58' },
  info: { background: '#e0ecfb', color: '#2f5fb3' },
  warn: { background: '#fdecd0', color: '#b26a0a' },
  success: { background: '#dcebe1', color: '#3f7a55' },
  danger: { background: '#f3dcd6', color: '#9c463b' },
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
