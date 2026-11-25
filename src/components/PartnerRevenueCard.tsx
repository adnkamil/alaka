import { formatRupiah } from '../lib/partner-product-rules'

type InvoiceBucket = { amount: number; pcs: number; count: number }

export type PartnerInvoicedSummary = {
  lunas: InvoiceBucket
  menunggu_review: InvoiceBucket
  ditagih: InvoiceBucket
}

/**
 * Kartu pendapatan di halaman event partner.
 *
 * Event dengan alur slot hanya menampilkan nominal yang sudah terkunci di
 * tagihan (snapshot harga), supaya angkanya tidak ikut berubah kalau partner
 * mengubah harga katalog. Barang yang belum ditagih dan yang masih menunggu
 * persetujuan ditampilkan dalam pcs saja. Event tanpa slot menampilkan total
 * pendapatan seperti biasa.
 */
export default function PartnerRevenueCard({
  slotEnabled,
  totalAmount,
  invoiced,
  waitingPcs,
  waitingSubmitCount,
}: {
  slotEnabled: boolean
  totalAmount: number
  invoiced: PartnerInvoicedSummary | undefined
  /** Pcs yang belum dicek di submit tab "Menunggu". */
  waitingPcs: number
  waitingSubmitCount: number
}) {
  const soft = { color: 'var(--app-text-soft)' }
  const eyebrow = (
    <p
      className="text-[11px] font-bold uppercase tracking-wide"
      style={{ color: 'var(--pm-gold)' }}
    >
      {slotEnabled ? 'Total ditagih' : 'Total pendapatan'}
    </p>
  )

  if (!slotEnabled) {
    return (
      <section className="app-card flex flex-col gap-3 p-5">
        {eyebrow}
        <p
          className="pm-num text-[30px] font-bold leading-tight"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          {formatRupiah(totalAmount)}
        </p>
      </section>
    )
  }

  const lunas = invoiced?.lunas ?? { amount: 0, pcs: 0, count: 0 }
  const review = invoiced?.menunggu_review ?? { amount: 0, pcs: 0, count: 0 }
  const ditagih = invoiced?.ditagih ?? { amount: 0, pcs: 0, count: 0 }
  const total = lunas.amount + review.amount + ditagih.amount
  const totalPcs = lunas.pcs + review.pcs + ditagih.pcs
  const totalCount = lunas.count + review.count + ditagih.count
  const paidShare = total > 0 ? Math.round((lunas.amount / total) * 100) : 0

  const statusRows = [
    {
      key: 'lunas',
      label: 'Lunas',
      dot: 'var(--app-success)',
      bucket: lunas,
    },
    {
      key: 'review',
      label: 'Cek bukti bayar',
      dot: 'var(--app-info)',
      bucket: review,
    },
    {
      key: 'ditagih',
      label: 'Belum dibayar',
      dot: 'var(--app-warning)',
      bucket: ditagih,
    },
  ].filter((r) => r.bucket.count > 0)

  return (
    <section className="app-card flex flex-col gap-3 p-5">
      {eyebrow}
      <div>
        <p
          className="pm-num text-[30px] font-bold leading-tight"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          {formatRupiah(total)}
        </p>
        <p className="mt-1 text-xs" style={soft}>
          {totalCount > 0
            ? `${totalPcs} pcs · ${totalCount} tagihan`
            : 'Belum ada tagihan terkirim'}
        </p>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-1.5">
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--app-border)' }}
            role="progressbar"
            aria-valuenow={paidShare}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Porsi tagihan lunas"
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${paidShare}%`, background: 'var(--app-success)' }}
            />
          </div>
          <p className="text-[11px]" style={soft}>
            {paidShare}% sudah lunas
          </p>
        </div>
      )}

      {statusRows.length > 0 && (
        <div
          className="flex flex-col gap-2 border-t pt-3 text-[13px]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {statusRows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2" style={soft}>
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: r.dot }}
                />
                {r.label}
                <span className="text-[11px]">({r.bucket.count})</span>
              </span>
              <span className="pm-num font-semibold">
                {formatRupiah(r.bucket.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {waitingSubmitCount > 0 && (
        <div
          className="flex flex-col gap-2 border-t pt-3 text-[13px]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <span style={soft}>Menunggu persetujuan</span>
            <span className="pm-num font-semibold" style={{ color: 'var(--app-info)' }}>
              {waitingPcs} pcs · {waitingSubmitCount} submit
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
