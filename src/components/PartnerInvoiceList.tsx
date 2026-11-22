import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import Pagination from './ui/Pagination'
import FilterSelect from './ui/FilterSelect'
import PartnerTableToolbar from './ui/PartnerTableToolbar'
import SortHeader, { ariaSortOf } from './ui/SortHeader'
import { submitNosLabel } from './EventInvoicesSection'
import { formatWibDateTime } from '../lib/event-slot'
import { listPartnerInvoices } from '../lib/invoice-functions'
import { formatInvoiceNumber } from '../lib/invoice-rules'
import type { InvoiceStatus } from '../lib/invoice-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import { sortRows } from '../lib/table-sort'
import { useClientPager } from '../lib/use-client-pager'
import { useTableSort } from '../lib/use-table-sort'

type InvoiceSortKey =
  | 'number'
  | 'brandName'
  | 'eventName'
  | 'submitNos'
  | 'totalPcs'
  | 'sentAt'
  | 'totalAmount'
  | 'status'

type StatusFilter = 'semua' | InvoiceStatus

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'ditagih', label: 'Ditagih' },
  { key: 'menunggu_review', label: 'Menunggu review' },
  { key: 'lunas', label: 'Lunas' },
  { key: 'dibatalkan', label: 'Dibatalkan' },
]

/**
 * Daftar tagihan partner. Dipakai di menu Tagihan (semua tagihan; cari no.
 * invoice, jastiper, atau event) dan di detail jastiper (sudah dibatasi event +
 * jastiper lewat props, jadi kolom itu disembunyikan). Membuat tagihan tetap lewat tab
 * "Siap ditagih" di halaman event.
 */
export default function PartnerInvoiceList({
  calendarEventId,
  brandId,
  hideWhenEmpty = false,
  hideStatusFilter = false,
}: {
  calendarEventId?: string
  brandId?: string
  /** Tidak menampilkan apa pun kalau belum ada tagihan (untuk detail jastiper). */
  hideWhenEmpty?: boolean
  /** Sembunyikan filter status (tagihan per jastiper biasanya sedikit). */
  hideStatusFilter?: boolean
}) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['partner-invoices', calendarEventId ?? null, brandId ?? null],
    queryFn: () => listPartnerInvoices({ data: { calendarEventId, brandId } }),
    refetchInterval: 30_000,
  })
  const [status, setStatus] = useState<StatusFilter>('semua')
  const [search, setSearch] = useState('')

  // Jumlah per chip status tidak terpengaruh kata kunci pencarian.
  const countOf = (key: StatusFilter) =>
    key === 'semua'
      ? invoices.length
      : invoices.filter((i) => i.status === key).length
  const keyword = search.trim().toLowerCase()
  const rows = invoices.filter(
    (i) =>
      (status === 'semua' || i.status === status) &&
      (!keyword ||
        [
          formatInvoiceNumber(i.number),
          brandId ? '' : i.brandName,
          calendarEventId ? '' : i.eventName,
        ].some((text) => text.toLowerCase().includes(keyword))),
  )
  const searchLabel = [
    'Cari no. invoice',
    brandId ? null : 'jastiper',
    calendarEventId ? null : 'event',
  ]
    .filter(Boolean)
    .join(', ')
  const { sort, toggle } = useTableSort<InvoiceSortKey>()
  const navigate = useNavigate()
  const { paged, pager, resetPage } = useClientPager(
    sortRows(rows, sort, {
      number: (i) => i.number,
      brandName: (i) => i.brandName,
      eventName: (i) => i.eventName,
      submitNos: (i) => (i.submitNos.length ? Math.min(...i.submitNos) : null),
      totalPcs: (i) => i.totalPcs,
      sentAt: (i) => i.sentAt,
      totalAmount: (i) => i.totalAmount,
      status: (i) => i.status,
    }),
  )
  type ColumnDef = [string, InvoiceSortKey, 'left' | 'right']
  const columns: Array<ColumnDef> = [
    ['No. invoice', 'number', 'left'],
    ...(brandId
      ? []
      : ([['Jastiper', 'brandName', 'left']] satisfies Array<ColumnDef>)),
    ...(calendarEventId
      ? []
      : ([['Event', 'eventName', 'left']] satisfies Array<ColumnDef>)),
    ['Submit', 'submitNos', 'left'],
    ['Pcs', 'totalPcs', 'right'],
    ['Tanggal kirim', 'sentAt', 'left'],
    ['Total', 'totalAmount', 'right'],
    ['Status', 'status', 'left'],
  ]

  if (hideWhenEmpty && !isLoading && invoices.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      {invoices.length > 0 && (
        <PartnerTableToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value)
            resetPage()
          }}
          placeholder={searchLabel}
          label={searchLabel}
          pager={pager}
          filter={
            hideStatusFilter ? undefined : (
              <FilterSelect
                label="Status"
                value={status}
                options={STATUS_FILTERS.map((f) => {
                  const count = countOf(f.key)
                  return {
                    value: f.key,
                    label: `${f.label} (${count})`,
                    // Status tanpa tagihan tidak bisa dipilih, kecuali yang sedang aktif.
                    disabled: count === 0 && f.key !== status,
                  }
                })}
                onChange={(value) => {
                  setStatus(value)
                  resetPage()
                }}
              />
            )
          }
        />
      )}

      {isLoading ? (
        <p
          className="py-6 text-center text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Memuat tagihan…
        </p>
      ) : rows.length === 0 ? (
        <p
          className="app-card px-4 py-6 text-center text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {invoices.length === 0
            ? 'Belum ada tagihan.'
            : 'Tidak ada tagihan yang cocok.'}
        </p>
      ) : (
        <div className="app-card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead style={{ background: 'var(--pm-tint)' }}>
              <tr>
                {columns.map(([label, key, align]) => (
                  <th
                    key={key}
                    aria-sort={ariaSortOf(sort, key)}
                    className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}
                    style={{ color: 'var(--pm-gold)' }}
                  >
                    <SortHeader
                      label={label}
                      sortKey={key}
                      sort={sort}
                      align={align}
                      onSort={(k) => {
                        toggle(k)
                        resetPage()
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((inv) => (
                <tr
                  key={inv.id}
                  className="cursor-pointer border-t"
                  style={{ borderColor: 'var(--app-border)' }}
                  onClick={() =>
                    navigate({
                      to: '/partner/tagihan/$invoiceId',
                      params: { invoiceId: inv.id },
                    })
                  }
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/partner/tagihan/$invoiceId"
                      params={{ invoiceId: inv.id }}
                      className="pm-num font-bold no-underline"
                      style={{ color: 'inherit' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatInvoiceNumber(inv.number)}
                    </Link>
                  </td>
                  {!brandId && (
                    <td className="px-4 py-3 font-semibold">{inv.brandName}</td>
                  )}
                  {!calendarEventId && (
                    <td className="px-4 py-3">{inv.eventName}</td>
                  )}
                  <td className="px-4 py-3">{submitNosLabel(inv.submitNos)}</td>
                  <td className="pm-num px-4 py-3 text-right">
                    {inv.totalPcs}
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {formatWibDateTime(inv.sentAt)}
                  </td>
                  <td className="pm-num px-4 py-3 text-right font-bold">
                    {formatRupiah(inv.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pager} />
    </section>
  )
}
