import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import InvoiceDetailModal from './InvoiceDetailModal'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { formatWibDateTime } from '../lib/event-slot'
import { listEventInvoices } from '../lib/invoice-functions'
import { formatInvoiceNumber } from '../lib/invoice-rules'
import { formatRupiah } from '../lib/partner-product-rules'

/**
 * Tagihan dari partner untuk event belanja ini (hanya baca). Tidak tampil
 * kalau belum ada tagihan.
 */
export default function EventInvoicesSection({ eventId }: { eventId: string }) {
  const { data: invoices = [] } = useQuery({
    queryKey: ['event-invoices', eventId],
    queryFn: () => listEventInvoices({ data: { eventId } }),
    refetchInterval: 30_000,
  })
  const [openId, setOpenId] = useState<string | null>(null)
  if (invoices.length === 0) return null
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-sm font-bold">Tagihan dari partner</h2>
      <div className="app-card divide-y overflow-hidden" style={{ borderColor: 'var(--app-border)' }}>
        {invoices.map((inv) => (
          <button
            key={inv.id}
            type="button"
            onClick={() => setOpenId(inv.id)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div className="min-w-0">
              <p className="pm-num text-sm font-semibold">{formatInvoiceNumber(inv.number)}</p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {formatWibDateTime(inv.sentAt)} · {inv.totalPcs} pcs
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="pm-num text-sm font-bold">{formatRupiah(inv.totalAmount)}</span>
              <InvoiceStatusBadge status={inv.status} />
            </div>
          </button>
        ))}
      </div>
      {openId && (
        <InvoiceDetailModal
          invoiceId={openId}
          mode="jastiper"
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  )
}
