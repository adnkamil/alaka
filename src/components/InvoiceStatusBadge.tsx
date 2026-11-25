import { invoiceStatusMeta } from '../lib/invoice-rules'
import type { InvoiceStatus } from '../lib/invoice-rules'
import { useOptionalPartnerI18n } from './PartnerI18n'

const STYLE = {
  info: { background: 'var(--app-info-soft)', color: 'var(--app-info)' },
  success: { background: 'var(--app-success-soft)', color: 'var(--app-success)' },
  warn: { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' },
  neutral: {
    background: 'var(--pm-muted, var(--app-card-hover))',
    color: 'var(--app-text-soft)',
  },
}

/** Badge status tagihan: Ditagih / Menunggu review / Lunas / Dibatalkan. */
export default function InvoiceStatusBadge({
  status,
}: {
  status: InvoiceStatus
}) {
  const { tone } = invoiceStatusMeta(status)
  // Di Partner Portal ikut bahasa partner; di luar portal tetap Indonesia.
  const label = useOptionalPartnerI18n().t.invoice.status[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
      style={STYLE[tone]}
    >
      {label}
    </span>
  )
}
