import { formatInvoiceNumber, invoiceStatusMeta } from '../lib/invoice-rules'
import type { InvoiceStatus, SubmitInvoiceState } from '../lib/invoice-rules'

const STYLE = {
  info: { background: '#e0ecfb', color: '#2f5fb3' },
  success: { background: '#dcebe1', color: '#3f7a55' },
  warn: { background: '#fdecd0', color: '#b26a0a' },
  neutral: { background: '#efe5d8', color: '#7a6a58' },
}

/**
 * Badge status satu submit. Tanpa `state`: Menunggu dicek / Sudah dicek.
 * Dengan `state`: ikut alur tagihan (Siap ditagih, Sudah ditagih + nomor, dst).
 */
export default function SubmitStatusBadge({
  checked,
  state,
  invoiceNumber,
  invoiceStatus,
}: {
  checked: boolean
  state?: SubmitInvoiceState
  invoiceNumber?: number
  invoiceStatus?: InvoiceStatus
}) {
  const { label, tone } = (() => {
    switch (state) {
      case 'menunggu_dicek':
        return { label: 'Menunggu dicek', tone: 'info' as const }
      case 'siap_ditagih':
        return { label: 'Siap ditagih', tone: 'success' as const }
      case 'sudah_ditagih': {
        const meta = invoiceStatusMeta(invoiceStatus ?? 'ditagih')
        return {
          label:
            invoiceNumber !== undefined
              ? `${meta.label} · ${formatInvoiceNumber(invoiceNumber)}`
              : meta.label,
          tone: meta.tone,
        }
      }
      case 'tanpa_tagihan':
        return { label: 'Sudah dicek · tanpa tagihan', tone: 'neutral' as const }
      default:
        return checked
          ? { label: 'Sudah dicek', tone: 'success' as const }
          : { label: 'Menunggu dicek', tone: 'info' as const }
    }
  })()
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-semibold"
      style={STYLE[tone]}
    >
      {label}
    </span>
  )
}
