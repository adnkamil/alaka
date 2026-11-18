import { invoiceStatusMeta } from '../lib/invoice-rules'
import type { InvoiceStatus } from '../lib/invoice-rules'

const STYLE = {
  info: { background: '#e0ecfb', color: '#2f5fb3' },
  success: { background: '#dcebe1', color: '#3f7a55' },
  warn: { background: '#fdecd0', color: '#b26a0a' },
  neutral: { background: '#efe5d8', color: '#7a6a58' },
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
