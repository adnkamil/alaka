import { PARTNER_STATUS_FILTERS } from '../lib/event-slot'
import type { PartnerStatusFilter } from '../lib/event-slot'

/** Chip filter status daftar jastiper: "Semua 4", "Draft 1", dst. */
export default function PartnerStatusChips({
  counts,
  active,
  onChange,
}: {
  counts: Record<PartnerStatusFilter, number>
  active: PartnerStatusFilter
  onChange: (next: PartnerStatusFilter) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
      {PARTNER_STATUS_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="tab"
          aria-selected={active === f.key}
          onClick={() => onChange(f.key)}
          className={`pm-chip ${active === f.key ? 'pm-chip--active' : ''}`}
        >
          {f.label} {counts[f.key]}
        </button>
      ))}
    </div>
  )
}
