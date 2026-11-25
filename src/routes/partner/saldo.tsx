import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Plus, Wallet } from 'lucide-react'
import PartnerTopupModal from '../../components/PartnerTopupModal'
import { usePartnerI18n } from '../../components/PartnerI18n'
import type { PartnerDict } from '../../lib/i18n/partner'
import Toast from '../../components/ui/Toast'
import UnderlineTabs from '../../components/ui/UnderlineTabs'
import { formatWibDateTime } from '../../lib/event-slot'
import { formatInvoiceNumber } from '../../lib/invoice-rules'
import {
  fetchPartnerCreditOverview,
  submitPartnerTopup,
} from '../../lib/partner-credit-functions'
import type {
  PartnerCreditEntry,
  PartnerTopupRow,
} from '../../lib/partner-credit-functions'
import { formatRupiah } from '../../lib/partner-product-rules'

export const Route = createFileRoute('/partner/saldo')({
  component: PartnerCreditPage,
})

const CREDIT_KEY = ['partner-credit']

type View = 'mutasi' | 'topup'

const TOPUP_STATUS_COLOR: Record<PartnerTopupRow['status'], string> = {
  pending: 'var(--app-warning)',
  approved: 'var(--app-success)',
  rejected: 'var(--app-danger)',
}

/**
 * Saldo kredit partner: dipakai membayar biaya admin ALAKA yang dipotong saat
 * tagihan lunas. Diisi lewat top up QRIS (diverifikasi admin). Tidak bisa ditarik.
 */
function PartnerCreditPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('mutasi')
  const [topupOpen, setTopupOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const { t, intlLocale } = usePartnerI18n()
  const cr = t.credit
  const { data, isLoading, error } = useQuery({
    queryKey: CREDIT_KEY,
    queryFn: () => fetchPartnerCreditOverview(),
  })

  async function handleTopup(value: { amount: number; paymentProofImage: string }) {
    await submitPartnerTopup({ data: value })
    await queryClient.invalidateQueries({ queryKey: CREDIT_KEY })
    setTopupOpen(false)
    setToast(cr.topupSent)
  }

  const balance = data ? Number(data.balance) : null

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:max-w-[760px]! lg:gap-5">
      <header>
        <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">{cr.title}</h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
          {cr.intro}
        </p>
      </header>

      {isLoading && <p className="text-sm">{t.common.loading}</p>}
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {cr.loadFailed}
        </p>
      )}

      {data && balance !== null && (
        <>
          <section className="app-card flex flex-col gap-3 p-4 lg:p-5">
            <div className="flex items-center gap-3">
              <span className="app-icon-tile h-11 w-11 shrink-0">
                <Wallet size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  {cr.balance}
                </p>
                <p
                  className="pm-num text-[26px] font-bold"
                  style={{ color: balance < 0 ? 'var(--app-danger)' : 'var(--app-text)' }}
                >
                  {formatRupiah(balance)}
                </p>
              </div>
              <button
                type="button"
                className="app-btn-primary shrink-0"
                style={{ minHeight: 40, fontSize: 13 }}
                disabled={data.pendingTopup !== null}
                onClick={() => setTopupOpen(true)}
              >
                <Plus size={16} />
                {cr.topup}
              </button>
            </div>
            {balance < 0 && (
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {cr.negativeNote}
              </p>
            )}
            {data.pendingTopup && (
              <p
                className="rounded-xl px-3 py-2 text-xs"
                style={{ background: 'var(--app-warning-soft)', color: 'var(--app-warning)' }}
              >
                {cr.pendingTopup(
                  formatRupiah(data.pendingTopup.amount),
                  formatWibDateTime(data.pendingTopup.createdAt, intlLocale),
                )}
              </p>
            )}
          </section>

          <UnderlineTabs
            ariaLabel={cr.historyLabel}
            items={[
              { key: 'mutasi' as const, label: cr.viewEntries },
              { key: 'topup' as const, label: cr.viewTopups },
            ]}
            value={view}
            onChange={setView}
          />

          {view === 'mutasi' ? (
            <EntryList entries={data.entries} />
          ) : (
            <TopupList topups={data.topups} />
          )}
        </>
      )}

      {topupOpen && (
        <PartnerTopupModal onClose={() => setTopupOpen(false)} onSubmit={handleTopup} />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  )
}

function entryLabel(e: PartnerCreditEntry, cr: PartnerDict['credit']): string {
  switch (e.type) {
    case 'topup':
      return cr.entryTopup
    case 'admin_fee':
      return cr.entryAdminFee
    case 'adjustment':
      return cr.entryAdjustment
  }
}

function EntryList({ entries }: { entries: Array<PartnerCreditEntry> }) {
  const { t, intlLocale } = usePartnerI18n()
  const cr = t.credit
  if (entries.length === 0) {
    return (
      <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
        {cr.noEntries}
      </div>
    )
  }
  return (
    <ul className="app-card divide-y" style={{ borderColor: 'var(--app-border)' }}>
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex items-start justify-between gap-3 px-4 py-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {entryLabel(e, cr)}
              {e.invoice && (
                <>
                  {' · '}
                  <Link
                    to="/partner/tagihan/$invoiceId"
                    params={{ invoiceId: e.invoice.id }}
                    className="no-underline"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    {formatInvoiceNumber(e.invoice.number)}
                  </Link>
                </>
              )}
            </p>
            {e.note && (
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {e.note}
              </p>
            )}
            <p className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
              {formatWibDateTime(e.createdAt, intlLocale)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className="pm-num text-sm font-bold"
              style={{ color: e.amount < 0 ? 'var(--app-danger)' : 'var(--app-success)' }}
            >
              {e.amount < 0 ? '−' : '+'}
              {formatRupiah(Math.abs(e.amount))}
            </p>
            <p className="pm-num text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
              {cr.balanceAfter} {e.balanceAfter < 0 ? '−' : ''}
              {formatRupiah(Math.abs(e.balanceAfter))}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TopupList({ topups }: { topups: Array<PartnerTopupRow> }) {
  const { t, intlLocale } = usePartnerI18n()
  const cr = t.credit
  const statusLabel: Record<PartnerTopupRow['status'], string> = {
    pending: cr.statusPending,
    approved: cr.statusApproved,
    rejected: cr.statusRejected,
  }
  if (topups.length === 0) {
    return (
      <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
        {cr.noTopups}
      </div>
    )
  }
  return (
    <ul className="app-card divide-y" style={{ borderColor: 'var(--app-border)' }}>
      {topups.map((topup) => {
        return (
          <li
            key={topup.id}
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div className="min-w-0">
              <p className="pm-num text-sm font-semibold">{formatRupiah(topup.amount)}</p>
              <p className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
                {formatWibDateTime(topup.createdAt, intlLocale)}
              </p>
              {topup.status === 'rejected' && topup.reviewNote && (
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  {cr.reason(topup.reviewNote)}
                </p>
              )}
            </div>
            <span
              className="shrink-0 text-xs font-semibold"
              style={{ color: TOPUP_STATUS_COLOR[topup.status] }}
            >
              {statusLabel[topup.status]}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
