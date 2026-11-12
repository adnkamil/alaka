import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { formatRupiah } from '../lib/partner-product-rules'

/**
 * Kartu "Total disetujui" di halaman event partner. Event dengan alur slot
 * menampilkan total yang sudah disetujui plus rincian menunggu persetujuan dan
 * draft; event tanpa slot hanya menampilkan total pendapatan.
 */
export default function PartnerRevenueCard({
  slotEnabled,
  totalAmount,
  approvedAmount,
  waitingAmount,
}: {
  slotEnabled: boolean
  totalAmount: number
  approvedAmount: number
  waitingAmount: number
}) {
  const [open, setOpen] = useState(true)
  const label = {
    color: 'var(--app-text-soft)',
  }
  return (
    <section className="app-card flex flex-col gap-3 p-5">
      <p
        className="text-[11px] font-bold uppercase tracking-wide"
        style={{ color: 'var(--pm-gold)' }}
      >
        {slotEnabled ? 'Total disetujui' : 'Total pendapatan'}
      </p>
      <p
        className="pm-num text-[30px] font-bold leading-tight"
        style={{ color: '#9c463b' }}
      >
        {formatRupiah(slotEnabled ? approvedAmount : totalAmount)}
      </p>
      {slotEnabled && open && (
        <div
          className="flex flex-col gap-2 border-t pt-3 text-[13px]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <span style={label}>Menunggu persetujuan</span>
            <span className="pm-num font-semibold" style={{ color: '#2f5fb3' }}>
              {formatRupiah(waitingAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span style={label}>Draft (belum dikirim)</span>
            <span className="pm-num font-semibold">-</span>
          </div>
          <p className="text-[11px]" style={label}>
            Draft tidak dihitung karena belum dikirim.
          </p>
        </div>
      )}
      {slotEnabled && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center justify-between gap-3 border-t pt-3 text-left text-[13px]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <span>{open ? 'Tutup rincian' : 'Lihat rincian'}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
    </section>
  )
}
