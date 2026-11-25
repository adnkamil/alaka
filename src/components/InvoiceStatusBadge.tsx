import { invoiceStatusMeta } from '../lib/invoice-rules'
import type { InvoiceStatus } from '../lib/invoice-rules'

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
  const { label, tone } = invoiceStatusMeta(status)
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
      style={STYLE[tone]}
    >
      {label}
    </span>
  )
}
