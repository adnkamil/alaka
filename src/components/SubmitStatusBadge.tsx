import { formatInvoiceNumber, invoiceStatusMeta } from '../lib/invoice-rules'
import { usePartnerT } from './PartnerI18n'
import type { InvoiceStatus, SubmitInvoiceState } from '../lib/invoice-rules'

const STYLE = {
  info: { background: 'var(--app-info-soft)', color: 'var(--app-info)' },
  success: { background: 'var(--app-success-soft)', color: 'var(--app-success)' },
  warn: { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' },
  neutral: {
    background: 'var(--pm-muted, var(--app-card-hover))',
    color: 'var(--app-text-soft)',
  },
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
  // Dipakai di Partner Portal saja, jadi teksnya ikut bahasa partner.
  const t = usePartnerT().invoice
  const { label, tone } = (() => {
    switch (state) {
      case 'menunggu_dicek':
        return { label: t.submitWaiting, tone: 'info' as const }
      case 'menunggu_keputusan':
        return { label: t.submitAwaitingDecision, tone: 'warn' as const }
      case 'siap_ditagih':
        return { label: t.submitReady, tone: 'success' as const }
      case 'sudah_ditagih': {
        const status = invoiceStatus ?? 'ditagih'
        const meta = invoiceStatusMeta(status)
        return {
          label:
            invoiceNumber !== undefined
              ? `${t.status[status]} · ${formatInvoiceNumber(invoiceNumber)}`
              : t.status[status],
          tone: meta.tone,
        }
      }
      case 'tanpa_tagihan':
        return { label: t.submitNoInvoice, tone: 'neutral' as const }
      default:
        return checked
          ? { label: t.submitChecked, tone: 'success' as const }
          : { label: t.submitWaiting, tone: 'info' as const }
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
