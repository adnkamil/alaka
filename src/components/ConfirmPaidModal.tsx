import { useBackToClose } from '../lib/back-to-close'
import { formatInvoiceNumber } from '../lib/invoice-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import { useOptionalPartnerI18n } from './PartnerI18n'

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
  const { t, intlLocale } = useOptionalPartnerI18n()
  const iv = t.invoice

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
        aria-label={iv.confirmPaidLabel}
        className="relative z-10 flex w-full max-w-[420px] flex-col gap-4 rounded-2xl border p-5 shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
        }}
      >
        <div>
          <h2 className="pm-display text-lg">{iv.confirmPaidTitle}</h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
            {iv.confirmPaidBody(formatInvoiceNumber(invoiceNumber))}
          </p>
        </div>

        <dl className="flex flex-col gap-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt style={{ color: 'var(--app-text-soft)' }}>{iv.confirmTotal}</dt>
            <dd className="pm-num font-semibold">{formatRupiah(totalAmount)}</dd>
          </div>
          <div
            className="flex items-center justify-between gap-3 border-t pt-2"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <dt style={{ color: 'var(--app-text-soft)' }}>
              {iv.confirmAdminFee}
              {fee
                ? ` (${fee.percent.toLocaleString(intlLocale, { maximumFractionDigits: 2 })}%)`
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
            ? iv.confirmFeeNote(formatRupiah(fee.amount))
            : iv.confirmNoFee}
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
            {iv.cancel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="app-btn-primary"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            {busy ? iv.saving : iv.confirmYes}
          </button>
        </div>
      </div>
    </div>
  )
}
