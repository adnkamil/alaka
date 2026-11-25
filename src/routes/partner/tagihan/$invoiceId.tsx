import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, MessageCircle, Printer } from 'lucide-react'
import ConfirmPaidModal from '../../../components/ConfirmPaidModal'
import { usePartnerI18n } from '../../../components/PartnerI18n'
import { BankInfo } from '../../../components/InvoiceDetailModal'
import UnderlineTabs from '../../../components/ui/UnderlineTabs'
import InvoiceDocument from '../../../components/InvoiceDocument'
import InvoicePackingList from '../../../components/InvoicePackingList'
import InvoiceLinesBySubmit from '../../../components/InvoiceLinesBySubmit'
import InvoiceStatusBadge from '../../../components/InvoiceStatusBadge'
import PaymentProofViewer from '../../../components/PaymentProofViewer'
import { getErrorMessage } from '../../../lib/error-message'
import { formatWibDateTime } from '../../../lib/event-slot'
import {
  cancelInvoice,
  confirmInvoicePaid,
  getPartnerInvoice,
  rejectInvoicePayment,
} from '../../../lib/invoice-functions'
import { formatInvoiceNumber } from '../../../lib/invoice-rules'
import { buildWhatsAppLink } from '../../../lib/format'
import { formatRupiah } from '../../../lib/partner-product-rules'

export const Route = createFileRoute('/partner/tagihan/$invoiceId')({
  component: PartnerInvoiceDetailPage,
})

type Step = 'cancel' | 'reject' | null
type View = 'tagihan' | 'packing'

/**
 * Halaman satu tagihan untuk partner: rincian per submit, rekening yang dilihat
 * jastiper, bukti bayar, lalu aksi (batalkan, tolak bukti, tandai lunas).
 */
function PartnerInvoiceDetailPage() {
  const { invoiceId } = Route.useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [proofKey, setProofKey] = useState(0)
  const [view, setView] = useState<View>('tagihan')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { t, intlLocale } = usePartnerI18n()
  const iv = t.invoice
  const when = (date: Date | string) => formatWibDateTime(date, intlLocale)

  const detail = useQuery({
    queryKey: ['invoice-detail', 'partner', invoiceId],
    queryFn: () => getPartnerInvoice({ data: { invoiceId } }),
  })

  async function afterChange() {
    await Promise.all(
      [
        'invoice-detail',
        'event-invoices',
        'partner-invoices',
        'partner-submit-list',
        'partner-event-revenue',
        'partner-jastiper-detail',
        // Lunas memotong biaya admin dari saldo kredit.
        'partner-credit',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )
    setProofKey((k) => k + 1)
    setStep(null)
    setConfirmOpen(false)
    setReason('')
    setError(null)
  }
  const fail = (fallback: string) => (err: unknown) =>
    setError(getErrorMessage(err, fallback))

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelInvoice({ data: { invoiceId, reason: reason.trim() || undefined } }),
    onSuccess: afterChange,
    onError: fail(iv.cancelFailed),
  })
  const confirmMutation = useMutation({
    mutationFn: () => confirmInvoicePaid({ data: { invoiceId } }),
    onSuccess: afterChange,
    onError: fail(iv.markPaidFailed),
  })
  const rejectMutation = useMutation({
    mutationFn: () =>
      rejectInvoicePayment({
        data: { invoiceId, reason: reason.trim() || undefined },
      }),
    onSuccess: afterChange,
    onError: fail(iv.rejectFailed),
  })
  const busy =
    cancelMutation.isPending ||
    confirmMutation.isPending ||
    rejectMutation.isPending

  const d = detail.data

  function goBack() {
    if (window.history.length > 1) router.history.back()
    else void router.navigate({ to: '/partner/tagihan' })
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label={t.common.back}
            className="-ml-1 flex size-8 shrink-0 items-center justify-center lg:hidden"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="pm-display pm-num text-[22px] leading-tight lg:text-[26px]">
                {d ? formatInvoiceNumber(d.number) : iv.fallbackTitle}
              </h1>
              {d && <InvoiceStatusBadge status={d.status} />}
            </div>
            {d && (
              <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                {iv.sentAt(when(d.sentAt))}
              </p>
            )}
          </div>
        </div>
        <Link
          to="/partner/tagihan"
          className="app-btn-outline hidden lg:inline-flex"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          {iv.backToInvoices}
        </Link>
      </header>

      {!d ? (
        <p className="py-10 text-center text-sm">
          {detail.isError
            ? getErrorMessage(detail.error, iv.loadFailed)
            : t.common.loading}
        </p>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
          <div className="flex flex-col gap-4">
            <UnderlineTabs
              className="print:hidden"
              ariaLabel={iv.viewLabel}
              items={[
                { key: 'tagihan', label: iv.viewInvoice },
                { key: 'packing', label: iv.viewPacking },
              ]}
              value={view}
              onChange={setView}
            />
            {view === 'packing' ? (
              <InvoicePackingList invoice={d} />
            ) : (
              <>
                <div className="flex flex-wrap justify-end gap-2 print:hidden">
                  {d.brandWa && d.status !== 'dibatalkan' && (
                    <a
                      href={buildWhatsAppLink(
                        d.brandWa,
                        iv.waMessage({
                          brand: d.brandName,
                          number: formatInvoiceNumber(d.number),
                          partner: d.partnerName,
                          amount: formatRupiah(d.totalAmount),
                          url: `${window.location.origin}/tagihan-partner/${d.id}`,
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="app-btn-outline gap-1.5 no-underline"
                      style={{ minHeight: 36, fontSize: 12 }}
                    >
                      <MessageCircle size={14} />
                      {iv.sendWa}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => printInvoice(d.number)}
                    className="app-btn-primary gap-1.5"
                    style={{ minHeight: 36, fontSize: 12 }}
                  >
                    <Printer size={14} />
                    {iv.print}
                  </button>
                </div>
                {/* Lembar invoice: hanya muncul saat dicetak. */}
                <div className="hidden print:block">
                  <InvoiceDocument invoice={d} />
                </div>
                <div className="flex flex-col gap-4 print:hidden">
            <section className="app-card overflow-hidden">
              <InvoiceLinesBySubmit lines={d.lines} />
              <div
                className="flex items-center justify-between border-t px-4 py-3"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                  {iv.totalPcs(d.totalPcs)}
                </span>
                <span className="pm-num text-base font-bold">{formatRupiah(d.totalAmount)}</span>
              </div>
            </section>
                </div>
              </>
            )}
          </div>

          <aside className="flex flex-col gap-3 print:hidden">
            <section className="app-card flex flex-col p-4 text-[13px]">
              <dl className="flex flex-col gap-2.5">
                <Row label={iv.rowJastiper}>
                  <Link
                    to="/partner/event/jastiper/$id/$brandId"
                    params={{ id: d.calendarEventId, brandId: d.brandId }}
                    search={{ submit: undefined }}
                    className="font-semibold no-underline"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    {d.brandName}
                  </Link>
                </Row>
                <Row label={iv.rowEvent}>
                  <Link
                    to="/partner/event/$id"
                    params={{ id: d.calendarEventId }}
                    className="font-semibold no-underline"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    {d.eventName}
                  </Link>
                </Row>
                <Row label={iv.rowSubmit}>
                  <span className="flex flex-wrap justify-end gap-x-2">
                    {d.submitNos.map((n) => (
                      <Link
                        key={n}
                        to="/partner/event/jastiper/$id/$brandId"
                        params={{ id: d.calendarEventId, brandId: d.brandId }}
                        search={{ submit: n }}
                        className="pm-num font-semibold no-underline"
                        style={{ color: 'var(--app-accent)' }}
                      >
                        #{n}
                      </Link>
                    ))}
                  </span>
                </Row>
                <Row label={iv.rowItems}>
                  <span className="pm-num font-semibold">{d.totalPcs} pcs</span>
                </Row>
              </dl>
              <dl
                className="mt-3 flex flex-col gap-2.5 border-t pt-3"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <Row label={iv.rowTotal}>
                  <span className="pm-num text-base font-bold">
                    {formatRupiah(d.totalAmount)}
                  </span>
                </Row>
                {d.adminFee && d.adminFee.amount > 0 && (
                  <Row
                    label={iv.adminFee(
                      d.adminFee.percent.toLocaleString(intlLocale, {
                        maximumFractionDigits: 2,
                      }),
                    )}
                  >
                    <Link
                      to="/partner/saldo"
                      className="pm-num font-semibold no-underline"
                      style={{ color: 'var(--app-accent)' }}
                    >
                      −{formatRupiah(d.adminFee.amount)}
                    </Link>
                  </Row>
                )}
              </dl>
            </section>
            {d.status === 'ditagih' && (
              <BankInfo bank={d.partnerBank} forPartner totalAmount={d.totalAmount} />
            )}
            {(d.status === 'dibatalkan' ||
              d.hasProof ||
              (d.status === 'menunggu_review' && d.paidClaimedAt) ||
              (d.status === 'lunas' && d.paidConfirmedAt) ||
              (d.status === 'ditagih' && d.paymentRejectReason)) && (
              <section className="app-card flex flex-col gap-3 p-4 text-[13px]">
                {d.status === 'dibatalkan' && (
                  <p style={{ color: 'var(--app-text-soft)' }}>
                    {iv.cancelledAt(d.cancelledAt ? when(d.cancelledAt) : '')}
                    {d.cancelReason ? ` · ${d.cancelReason}` : ''}
                  </p>
                )}
                {d.status === 'menunggu_review' && d.paidClaimedAt && (
                  <p style={{ color: 'var(--app-text-soft)' }}>
                    {iv.claimedAt(when(d.paidClaimedAt))}
                  </p>
                )}
                {d.status === 'ditagih' && d.paymentRejectReason && (
                  <p style={{ color: 'var(--app-text-soft)' }}>
                    {iv.lastProofRejected(d.paymentRejectReason)}
                  </p>
                )}
                {(d.hasProof || d.status === 'lunas') && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    {d.hasProof && (
                      <PaymentProofViewer
                        src={`/api/invoice-proof/${invoiceId}?v=${proofKey}`}
                        label={iv.viewProof}
                        className="flex items-center gap-1.5 text-xs font-semibold"
                      />
                    )}
                    {d.status === 'lunas' && d.paidConfirmedAt && (
                      <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                        {iv.paidAt(when(d.paidConfirmedAt))}
                      </span>
                    )}
                  </div>
                )}
                {d.status === 'menunggu_review' && step === null && (
                  <div
                    className="flex flex-wrap justify-end gap-2 border-t pt-3"
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStep('reject')}
                      className="app-btn-outline"
                      style={{ color: 'var(--app-danger)', minHeight: 40, fontSize: 13 }}
                    >
                      {iv.rejectProof}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError(null)
                        setConfirmOpen(true)
                      }}
                      className="app-btn-primary"
                      style={{ minHeight: 40, fontSize: 13 }}
                    >
                      {iv.markPaid}
                    </button>
                  </div>
                )}
              </section>
            )}

            {d.status === 'ditagih' && step === null && (
              <button
                type="button"
                onClick={() => setStep('cancel')}
                className="app-btn-outline self-end"
                style={{ color: 'var(--app-danger)', minHeight: 40, fontSize: 13 }}
              >
                {iv.cancelInvoice}
              </button>
            )}
            {step === null && error && (
              <p className="text-xs" style={{ color: 'var(--app-danger)' }}>{error}</p>
            )}

            {step !== null && (
              <div className="app-card flex flex-col gap-2 p-4">
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  {step === 'cancel' ? iv.cancelExplain : iv.rejectExplain}
                </p>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder={iv.reasonPlaceholder}
                  aria-label={iv.reasonLabel}
                  className="app-input"
                  style={{ height: 42, borderRadius: 12 }}
                />
                {error && <p className="text-xs" style={{ color: 'var(--app-danger)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStep(null)
                      setError(null)
                    }}
                    className="app-btn-outline"
                    style={{ minHeight: 40, fontSize: 13 }}
                  >
                    {iv.back}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      step === 'cancel'
                        ? cancelMutation.mutate()
                        : rejectMutation.mutate()
                    }
                    className="rounded-xl px-4 py-2 text-[13px] font-semibold text-[var(--app-on-solid)] disabled:opacity-50"
                    style={{ background: 'var(--app-danger)' }}
                  >
                    {busy
                      ? iv.processing
                      : step === 'cancel'
                        ? iv.confirmCancel
                        : iv.confirmReject}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
      {d && confirmOpen && (
        <ConfirmPaidModal
          invoiceNumber={d.number}
          totalAmount={d.totalAmount}
          adminFee={d.pendingAdminFee}
          busy={confirmMutation.isPending}
          error={error}
          onConfirm={() => confirmMutation.mutate()}
          onClose={() => {
            setConfirmOpen(false)
            setError(null)
          }}
        />
      )}
    </main>
  )
}

/** Cetak dengan judul halaman = nomor invoice, jadi nama file PDF-nya rapi. */
function printInvoice(number: number) {
  const previousTitle = document.title
  document.title = formatInvoiceNumber(number)
  const restore = () => {
    document.title = previousTitle
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}

/** Satu baris ringkasan: label di kiri, nilai di kanan (rata kanan, boleh membungkus). */
function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0" style={{ color: 'var(--app-text-soft)' }}>
        {label}
      </dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}
