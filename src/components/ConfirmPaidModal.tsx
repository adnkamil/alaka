import { useBackToClose } from '../lib/back-to-close'
import { formatInvoiceNumber } from '../lib/invoice-rules'
import { formatRupiah } from '../lib/partner-product-rules'

interface ConfirmPaidModalProps {
  invoiceNumber: number
  totalAmount: number
  /** Biaya admin ALAKA yang akan dipotong. Null/0 = tidak ada potongan. */
  adminFee: { percent: number; amount: number } | null
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

/**
 * Persetujuan sebelum "Tandai lunas": merinci total invoice dan biaya admin
 * ALAKA, supaya partner tahu saldo kreditnya akan terpotong.
 */
export default function ConfirmPaidModal({
  invoiceNumber,
  totalAmount,
  adminFee,
  busy,
  error,
  onConfirm,
  onClose,
}: ConfirmPaidModalProps) {
  useBackToClose(true, onClose)
  const fee = adminFee && adminFee.amount > 0 ? adminFee : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => {
          if (!busy) onClose()
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Konfirmasi pembayaran"
        className="relative z-10 flex w-full max-w-[420px] flex-col gap-4 rounded-2xl border p-5 shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
        }}
      >
        <div>
          <h2 className="pm-display text-lg">Tandai lunas?</h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
            Pastikan bukti bayar {formatInvoiceNumber(invoiceNumber)} sudah kamu
            periksa. Tagihan lunas tidak bisa dibatalkan.
          </p>
        </div>

        <dl className="flex flex-col gap-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: 'var(--app-text-soft)' }}>Total invoice</dt>
            <dd className="pm-num font-semibold">{formatRupiah(totalAmount)}</dd>
          </div>
          <div
            className="flex items-center justify-between gap-3 border-t pt-2"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <dt style={{ color: 'var(--app-text-soft)' }}>
              Biaya admin ALAKA
              {fee
                ? ` (${fee.percent.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%)`
                : ''}
            </dt>
            <dd
              className="pm-num font-bold"
              style={{ color: fee ? 'var(--app-danger)' : undefined }}
            >
              {fee ? `−${formatRupiah(fee.amount)}` : 'Rp 0'}
            </dd>
          </div>
        </dl>

        <p
          className="rounded-xl px-3 py-2 text-xs"
          style={{ background: 'var(--pm-tint)', color: 'var(--app-text-soft)' }}
        >
          {fee
            ? `Biaya admin ${formatRupiah(fee.amount)} langsung dipotong dari saldo kreditmu. Saldo boleh minus dan tertutup lewat top up.`
            : 'Tidak ada biaya admin yang dipotong dari saldo kreditmu.'}
        </p>

        {error && (
          <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="app-btn-outline"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="app-btn-primary"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            {busy ? 'Menyimpan…' : 'Ya, tandai lunas'}
          </button>
        </div>
      </div>
    </div>
  )
}
