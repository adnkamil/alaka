import { useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarDays,
  Image as ImageIcon,
  MapPin,
  Package,
  Pencil,
  Phone,
} from 'lucide-react'
import SubmitStatusBadge from '../../../components/SubmitStatusBadge'
import InvoiceDetailModal from '../../../components/InvoiceDetailModal'
import { createInvoice, previewInvoice } from '../../../lib/invoice-functions'
import { hasBankAccount } from '../../../lib/invoice-rules'
import type { PartnerSubmitRow } from '../../../lib/partner-submit-list'
import PartnerSlotSection from '../../../components/PartnerSlotSection'
import PartnerRevenueCard from '../../../components/PartnerRevenueCard'
import UnderlineTabs from '../../../components/ui/UnderlineTabs'
import Pagination from '../../../components/ui/Pagination'
import { formatWibDateTime } from '../../../lib/event-slot'
import type { PartnerStatusFilter } from '../../../lib/event-slot'
import { getPartnerSubmitList } from '../../../lib/partner-submit-list'
import { getPartnerSlotQueue } from '../../../lib/partner-slot-functions'
import PartnerEventStatusBadge from '../../../components/PartnerEventStatusBadge'
import ConfirmModal from '../../../components/ui/ConfirmModal'
import Toast from '../../../components/ui/Toast'
import { formatDateRange } from '../../../lib/calendar'
import {
  buildWhatsAppLink,
  formatDate,
  formatPhoneNumber,
} from '../../../lib/format'
import { getErrorMessage } from '../../../lib/error-message'
import { setOwnPartnerEventEnded } from '../../../lib/partner-event-functions'
import { getPartnerEventRevenue } from '../../../lib/partner-jastiper-detail'
import { partnerEventStatus } from '../../../lib/partner-event-rules'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../../../lib/partner-product-rules'
import {
  partnerEventParticipantsQuery,
  partnerEventProductsQuery,
  currentPartnerQuery,
  partnerEventQuery,
} from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import PartnerTableToolbar from '../../../components/ui/PartnerTableToolbar'
import PartnerSubmitReview from '../../../components/PartnerSubmitReview'
import { useClientPager } from '../../../lib/use-client-pager'
import SortHeader, { ariaSortOf } from '../../../components/ui/SortHeader'
import { sortRows } from '../../../lib/table-sort'
import { useTableSort } from '../../../lib/use-table-sort'

export const Route = createFileRoute('/partner/event/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(partnerEventQuery(params.id)),
      context.queryClient.ensureQueryData(
        partnerEventParticipantsQuery(params.id),
      ),
      context.queryClient.ensureQueryData(partnerEventProductsQuery(params.id)),
    ]),
  // Tautan dari menu Tagihan: ?tab=jastiper&filter=siap membuka tab "Siap ditagih".
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: Tab; filter?: SubmitFilter } => ({
    tab: TABS.find((t) => t === search.tab),
    filter: SUBMIT_FILTERS.find((f) => f.key === search.filter)?.key,
  }),
  component: PartnerEventDetailPage,
})

type SubmitSortKey =
  | 'brandName'
  | 'submittedAt'
  | 'queueRank'
  | 'submitNo'
  | 'pcsTotal'
  | 'pcsRejected'
type ParticipantSortKey = 'brandName' | 'joinedAt' | 'waNumber' | 'orderCount'

const TABS = ['info', 'produk', 'jastiper'] as const
type Tab = (typeof TABS)[number]

const PARTICIPANT_COLUMNS = 'min-w-[860px] grid-cols-[minmax(0,1fr)_150px_170px_90px_130px]'
/** Dengan kolom Urutan, Submit ke, Ditolak, dan Status (event memakai slot). */
const PARTICIPANT_COLUMNS_SLOT =
  'min-w-[1040px] grid-cols-[minmax(0,1fr)_150px_80px_90px_70px_110px_190px]'
/** Sama, dengan kolom checkbox di depan (tab Siap ditagih). */
const PARTICIPANT_COLUMNS_SLOT_SELECT =
  'min-w-[1090px] grid-cols-[28px_minmax(0,1fr)_150px_80px_90px_70px_110px_190px]'

/** Inisial dari nama brand, mis. "Mici Shop" → "MS". */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

type SubmitFilter = 'semua' | 'menunggu' | 'siap' | 'ditagih' | 'review'

const SUBMIT_FILTERS: Array<{ key: SubmitFilter; label: string }> = [
  { key: 'semua', label: 'Semua' },
  { key: 'menunggu', label: 'Menunggu dicek' },
  { key: 'siap', label: 'Siap ditagih' },
  { key: 'ditagih', label: 'Sudah ditagih' },
  { key: 'review', label: 'Review pembayaran' },
]

/** Filter submit → filter status halaman Rekap Orderan. */
const SUBMIT_FILTER_REKAP: Record<SubmitFilter, PartnerStatusFilter> = {
  semua: 'semua',
  menunggu: 'pengajuan',
  siap: 'selesai',
  ditagih: 'selesai',
  review: 'selesai',
}

/** Bisa dipilih untuk ditagih: siap, atau menunggu keputusan (ditagih apa adanya). */
function isBillable(row: PartnerSubmitRow) {
  return (
    row.invoiceState === 'siap_ditagih' ||
    row.invoiceState === 'menunggu_keputusan'
  )
}

/** Penanda submit yang dibuka lagi karena ada barang pengganti: didahulukan di antrean cek. */
function ReplacementTag({ row }: { row: PartnerSubmitRow }) {
  if (!row.reopened) return null
  return (
    <span
      className="app-badge"
      title="Jastiper mengganti barang yang ditolak. Hanya barang penggantinya yang perlu dicek, dan submit ini dicek lebih dulu dari antrean biasa."
      style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
    >
      Ada barang pengganti
    </span>
  )
}

/** Submit milik filter ini? "Semua" memuat semuanya, termasuk yang tanpa tagihan. */
function matchesFilter(row: PartnerSubmitRow, filter: SubmitFilter) {
  switch (filter) {
    case 'semua':
      return true
    case 'menunggu':
      return row.invoiceState === 'menunggu_dicek'
    case 'siap':
      // Berkas yang menunggu keputusan jastiper ikut tampil di sini supaya
      // partner bisa memilih "tagih apa adanya".
      return (
        row.invoiceState === 'siap_ditagih' ||
        row.invoiceState === 'menunggu_keputusan'
      )
    case 'ditagih':
      return row.invoiceState === 'sudah_ditagih'
    case 'review':
      return row.invoice?.status === 'menunggu_review'
  }
}

/**
 * Rincian tagihan dipisah jadi Paket (satu harga per paket, isinya hanya label)
 * dan Satuan (jumlah × harga, dengan alasan kenapa tidak jadi paket).
 */
function InvoicePreviewTable({
  preview,
}: {
  preview: Extract<Awaited<ReturnType<typeof previewInvoice>>, { ok: true }>
}) {
  const paket = preview.lines.filter((l) => l.kind === 'paket')
  const satuan = preview.lines.filter((l) => l.kind === 'satuan')
  const sectionHead = (title: string) => (
    <tr>
      <th
        colSpan={4}
        className="pt-3 pb-1 text-left text-[11px] font-bold uppercase tracking-wide"
        style={{ color: 'var(--app-text-soft)' }}
      >
        {title}
      </th>
    </tr>
  )
  return (
    <table className="mt-2 w-full">
      <thead style={{ color: 'var(--app-text-soft)' }}>
        <tr>
          <th className="py-1 text-left font-semibold">Barang</th>
          <th className="py-1 text-right font-semibold">Jumlah</th>
          <th className="py-1 text-right font-semibold">Harga</th>
          <th className="py-1 text-right font-semibold">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {paket.length > 0 && sectionHead('Paket')}
        {paket.map((l) => (
          <tr
            key={`paket-${l.label}-${l.unitPrice}`}
            className="border-t"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <td className="py-1.5">{l.label}</td>
            <td className="pm-num py-1.5 text-right">{l.qty}</td>
            <td className="pm-num py-1.5 text-right">{formatRupiah(l.unitPrice)}</td>
            <td className="pm-num py-1.5 text-right font-semibold">{formatRupiah(l.amount)}</td>
          </tr>
        ))}
        {satuan.length > 0 && sectionHead('Satuan')}
        {satuan.map((l) => (
          <tr
            key={`satuan-${l.label}-${l.unitPrice}-${l.note ?? ''}`}
            className="border-t align-top"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <td className="py-1.5">
              {l.label}
              {l.note && (
                <span className="block" style={{ color: 'var(--app-text-soft)' }}>
                  {l.note}
                </span>
              )}
            </td>
            <td className="pm-num py-1.5 text-right">{l.qty}</td>
            <td className="pm-num py-1.5 text-right">{formatRupiah(l.unitPrice)}</td>
            <td className="pm-num py-1.5 text-right font-semibold">{formatRupiah(l.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {preview.saving > 0 && (
          <tr className="border-t" style={{ borderColor: 'var(--app-border)' }}>
            <td colSpan={3} className="py-1.5 text-right" style={{ color: 'var(--app-text-soft)' }}>
              Hemat paket
            </td>
            <td className="pm-num py-1.5 text-right">{formatRupiah(preview.saving)}</td>
          </tr>
        )}
        <tr className="border-t" style={{ borderColor: 'var(--app-border)' }}>
          <td colSpan={3} className="py-1.5 text-right font-semibold">Total</td>
          <td className="pm-num py-1.5 text-right font-bold">{formatRupiah(preview.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** Badge status; kalau sudah ditagih, bisa diklik untuk membuka rincian tagihan. */
function RowStatus({
  row,
  onOpenInvoice,
}: {
  row: PartnerSubmitRow
  onOpenInvoice: (invoiceId: string) => void
}) {
  const badge = (
    <SubmitStatusBadge
      checked={row.checked}
      state={row.invoiceState}
      invoiceNumber={row.invoice?.number}
      invoiceStatus={row.invoice?.status}
    />
  )
  const invoice = row.invoice
  if (!invoice) return badge
  return (
    <button
      type="button"
      title="Lihat tagihan"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpenInvoice(invoice.id)
      }}
    >
      {badge}
    </button>
  )
}

function SubmitFilterChips({
  counts,
  active,
  onChange,
}: {
  counts: Record<SubmitFilter, number>
  active: SubmitFilter
  onChange: (next: SubmitFilter) => void
}) {
  return (
    <UnderlineTabs
      ariaLabel="Filter submit"
      items={SUBMIT_FILTERS.map((f) => ({
        ...f,
        count: counts[f.key],
        // Yang menunggu dicek butuh tindakan partner, jadi badge-nya ditonjolkan.
        highlight: f.key === 'menunggu',
      }))}
      value={active}
      onChange={onChange}
    />
  )
}

/** "N jastiper belum submit", bisa dibuka untuk melihat namanya. */
function NotSubmittedNote({
  list,
}: {
  list: Array<{ brandId: string; brandName: string }>
}) {
  const [open, setOpen] = useState(false)
  if (list.length === 0) return null
  return (
    <div className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-semibold underline"
      >
        {list.length} jastiper belum submit
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {list.map((b) => (
            <li key={b.brandId}>{b.brandName}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PartnerEventDetailPage() {
  const { id } = Route.useParams()
  const { data: event } = useSuspenseQuery(partnerEventQuery(id))
  const { data: participants } = useSuspenseQuery(
    partnerEventParticipantsQuery(id),
  )
  const { data: products } = useSuspenseQuery(partnerEventProductsQuery(id))
  const queryClient = useQueryClient()
  const { data: revenue } = useQuery({
    queryKey: ['partner-event-revenue', id, participants.length],
    queryFn: () => getPartnerEventRevenue({ data: { calendarEventId: id } }),
    // Hampir realtime: server serverless tidak mendukung koneksi persisten.
    refetchInterval: 15_000,
  })
  const search = Route.useSearch()
  const [tab, setTab] = useState<Tab>(search.tab ?? 'jastiper')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [participantSearch, setParticipantSearch] = useState('')
  const [submitFilter, setSubmitFilter] = useState<SubmitFilter>(search.filter ?? 'semua')
  const { data: queue = [] } = useQuery({
    queryKey: ['partner-slot-queue', id],
    queryFn: () => getPartnerSlotQueue({ data: { calendarEventId: id } }),
    refetchInterval: 15_000,
  })
  // Status dan urutan hanya ada untuk event yang memakai slot.
  const slotEnabled = queue.some((q) => q.status !== null)
  const { data: submitList } = useQuery({
    queryKey: ['partner-submit-list', id],
    queryFn: () => getPartnerSubmitList({ data: { calendarEventId: id } }),
    refetchInterval: 15_000,
  })
  const submitRows = submitList?.rows ?? []
  const notSubmitted = submitList?.notSubmitted ?? []
  const submitCounts: Record<SubmitFilter, number> = {
    semua: submitRows.length,
    menunggu: submitRows.filter((r) => matchesFilter(r, 'menunggu')).length,
    siap: submitRows.filter((r) => matchesFilter(r, 'siap')).length,
    ditagih: submitRows.filter((r) => matchesFilter(r, 'ditagih')).length,
    review: submitRows.filter((r) => matchesFilter(r, 'review')).length,
  }
  const searchKey = participantSearch.trim().toLowerCase()
  const filteredSubmits = submitRows.filter(
    (r) =>
      r.brandName.toLowerCase().includes(searchKey) &&
      matchesFilter(r, submitFilter),
  )
  const submitSort = useTableSort<SubmitSortKey>()
  const submitPager = useClientPager(
    sortRows(filteredSubmits, submitSort.sort, {
      brandName: (r) => r.brandName,
      submittedAt: (r) => r.submittedAt,
      queueRank: (r) => r.queueRank,
      submitNo: (r) => r.submitNo,
      pcsTotal: (r) => r.pcs.total,
      // Tampilan "–" untuk berkas belum dicek, jadi dianggap kosong.
      pcsRejected: (r) => (r.checked ? r.pcs.rejected : null),
    }),
  )
  // Event tanpa slot tetap satu baris per jastiper.
  const filteredParticipants = participants.filter((p) =>
    (p.brandName || 'Tanpa nama').toLowerCase().includes(searchKey),
  )
  const participantSort = useTableSort<ParticipantSortKey>()
  const participantPager = useClientPager(
    sortRows(filteredParticipants, participantSort.sort, {
      brandName: (p) => p.brandName || 'Tanpa nama',
      joinedAt: (p) => p.joinedAt,
      waNumber: (p) => p.waNumber,
      orderCount: (p) => p.orderCount,
    }),
  )
  // Pilihan submit untuk satu tagihan (tab Siap ditagih). Satu tagihan = satu jastiper.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)
  const { data: me } = useQuery(currentPartnerQuery)
  // Tanpa rekening, jastiper tidak tahu ke mana harus bayar: tagihan belum bisa dikirim.
  const bankMissing = me ? !hasBankAccount(me) : false
  const selectMode = slotEnabled && submitFilter === 'siap'
  const selectedRows = submitRows.filter(
    (r) => selected.has(r.submissionId) && isBillable(r),
  )
  // Berkas yang masih menunggu keputusan jastiper ikut ditagih apa adanya:
  // barang yang ditolak dianggap tidak diganti.
  const awaitingRows = selectedRows.filter(
    (r) => r.invoiceState === 'menunggu_keputusan',
  )
  const waiveBlocking = awaitingRows.length > 0
  const selectedBrandId = selectedRows.at(0)?.brandId ?? null
  const selectedTotals = {
    pcs: selectedRows.reduce((n, r) => n + r.pcs.approved, 0),
    amount: selectedRows.reduce((n, r) => n + r.approvedAmount, 0),
  }
  // Total final dihitung server: barang satuan dari pesanan berbeda bisa digabung jadi paket.
  const selectedIds = selectedRows.map((r) => r.submissionId).sort()
  const { data: preview } = useQuery({
    queryKey: ['invoice-preview', id, selectedIds, waiveBlocking],
    queryFn: () =>
      previewInvoice({
        data: { calendarEventId: id, submissionIds: selectedIds, waiveBlocking },
      }),
    enabled: selectedIds.length > 0,
    placeholderData: keepPreviousData,
  })
  const previewOk = preview?.ok ? preview : null
  const previewError = preview && !preview.ok ? preview.error : null
  const finalAmount = previewOk?.totalAmount ?? selectedTotals.amount
  const toggleSelected = (submissionId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(submissionId)) next.delete(submissionId)
      else next.add(submissionId)
      return next
    })
  const selectAllOfBrand = (brandId: string) =>
    setSelected(
      new Set(
        submitRows
          .filter((r) => r.brandId === brandId && isBillable(r))
          .map((r) => r.submissionId),
      ),
    )
  async function handleSendInvoice() {
    setSending(true)
    try {
      await createInvoice({
        data: {
          calendarEventId: id,
          submissionIds: selectedRows.map((r) => r.submissionId),
          waiveBlocking,
        },
      })
      await refreshInvoiceData()
      setSelected(new Set())
      setNotice('Tagihan terkirim ke jastiper')
    } catch (err) {
      setNotice(getErrorMessage(err, 'Gagal mengirim tagihan'))
    } finally {
      setSending(false)
      setConfirmSend(false)
    }
  }
  function refreshInvoiceData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['partner-submit-list', id] }),
      queryClient.invalidateQueries({ queryKey: ['invoice-preview', id] }),
      queryClient.invalidateQueries({ queryKey: ['partner-event-revenue', id] }),
      queryClient.invalidateQueries({ queryKey: ['partner-jastiper-detail', id] }),
      queryClient.invalidateQueries({ queryKey: ['partner-invoices'] }),
    ])
  }
  const rekapStatus: PartnerStatusFilter = slotEnabled
    ? SUBMIT_FILTER_REKAP[submitFilter]
    : 'semua'
  const [productSearch, setProductSearch] = useState('')
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  )
  const productPager = useClientPager(filteredProducts)

  const status = partnerEventStatus(event, todayIsoDateInAppTimeZone())
  const totalOrders = participants.reduce((sum, p) => sum + p.orderCount, 0)

  async function handleSetEnded(ended: boolean) {
    setBusy(true)
    try {
      await setOwnPartnerEventEnded({ data: { id, ended } })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partner-events'] }),
        queryClient.invalidateQueries({ queryKey: ['partner-event', id] }),
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
      ])
      setConfirmEnd(false)
    } catch (err) {
      setNotice(getErrorMessage(err, 'Gagal mengubah status event'))
      setConfirmEnd(false)
    } finally {
      setBusy(false)
    }
  }

  // Bar aksi tempel di bawah saat ada submit yang dipilih untuk ditagih.
  const invoiceBar = selectMode && selectedRows.length > 0 && (
    <div
      className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-lg"
      style={{ background: 'var(--app-card)', borderColor: 'var(--app-border)' }}
    >
      <p className="text-sm">
        <span className="font-bold">{selectedRows[0].brandName}</span>
        <span className="pm-num" style={{ color: 'var(--app-text-soft)' }}>
          {' · '}
          {selectedRows.length} submit · {selectedTotals.pcs} pcs ·{' '}
        </span>
        {previewOk && previewOk.saving > 0 && (
          <span
            className="pm-num"
            style={{ color: 'var(--app-text-soft)' }}
            title="Total kalau semua pcs ditagih harga satuan"
          >
            <span className="line-through">{formatRupiah(previewOk.rawAmount)}</span>{' '}
            <span className="text-[11px]">harga satuan</span>{' '}
          </span>
        )}
        <span className="pm-num font-bold">{formatRupiah(finalAmount)}</span>
      </p>
      {previewOk && previewOk.bundleCount > 0 && (
        <p className="w-full text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {previewOk.bundleCount} paket menurut aturan paket, dihitung dari semua pcs
          jastiper di tagihan ini
          {previewOk.saving > 0 && <>, hemat {formatRupiah(previewOk.saving)}</>}.
        </p>
      )}
      {previewOk && previewOk.lines.length > 0 && (
        <details className="w-full text-xs">
          <summary className="cursor-pointer font-semibold">
            Rincian tagihan ({previewOk.lines.length} baris)
          </summary>
          <InvoicePreviewTable preview={previewOk} />
        </details>
      )}
      {previewError && (
        <p className="w-full text-xs" style={{ color: 'var(--app-danger)' }}>
          {previewError}
        </p>
      )}
      {waiveBlocking && (
        <p
          className="w-full rounded-lg p-2 text-xs"
          style={{ background: '#fdecd0', color: '#8a5208' }}
        >
          Submit ke-{awaitingRows.map((r) => r.submitNo).join(', ')} masih menunggu
          keputusan jastiper untuk isi paket yang ditolak. Kalau tagihan dikirim,
          barang itu dianggap tidak diganti (tagih apa adanya).
        </p>
      )}
      {bankMissing && (
        <p className="w-full text-xs" style={{ color: 'var(--app-danger)' }}>
          Isi rekening pembayaran di{' '}
          <Link to="/partner/profil" className="font-semibold underline">
            halaman Profil
          </Link>{' '}
          dulu sebelum menagih jastiper.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {selectedBrandId && (
          <button
            type="button"
            onClick={() => selectAllOfBrand(selectedBrandId)}
            className="app-btn-outline"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            Pilih semua submit jastiper ini
          </button>
        )}
        <button
          type="button"
          disabled={bankMissing || previewError !== null}
          onClick={() => setConfirmSend(true)}
          className="app-btn-primary disabled:opacity-50"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          Kirim tagihan
        </button>
      </div>
    </div>
  )

  return (
    <>
      <main className="flex flex-col gap-4 px-5 pt-4 lg:hidden">
        <header className="flex items-center gap-3">
          <Link
            to="/partner/event"
            aria-label="Kembali"
            className="-ml-1 flex size-8 items-center justify-center"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </Link>
          <h1 className="pm-display flex-1 text-[22px] leading-tight">
            Detail Event
          </h1>
          <PartnerEventStatusBadge status={status} />
        </header>

        <Link
          to="/partner/event/rekap/$id"
          params={{ id }}
          search={{ status: rekapStatus }}
          className="app-btn-outline self-start no-underline"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          Rekap Orderan
        </Link>

        <div
          className="flex h-[112px] w-full items-center justify-center overflow-hidden rounded-2xl"
          style={{
            background: event.bannerSrc ? undefined : 'var(--pm-tint)',
            color: 'var(--pm-gold)',
          }}
        >
          {event.bannerSrc ? (
            <img
              src={event.bannerSrc}
              alt={event.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon size={26} />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="pm-display text-xl leading-snug">{event.name}</h2>
          <div
            className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
            >
              {event.isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={14} />
              {formatDateRange(event.eventDate, event.endDate)}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={14} />
              <span className="truncate">{event.location}</span>
            </span>
          </div>
        </div>


        <UnderlineTabs
          ariaLabel="Isi event"
          items={[
            { key: 'info', label: 'Info' },
            { key: 'produk', label: 'Produk', count: products.length },
            { key: 'jastiper', label: 'Jastiper', count: participants.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'info' && (
          <section className="flex flex-col gap-3">
            <PartnerSlotSection
              calendarEventId={id}
              eventEndDate={event.endDate ?? event.eventDate}
            />
            <div className="flex gap-2.5">
              <Link
                to="/partner/event/ubah/$id"
                params={{ id }}
                className="app-btn-outline flex-1 gap-1.5 no-underline"
              >
                <Pencil size={14} />
                Ubah event
              </Link>
              {event.isEnded ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSetEnded(false)}
                  className="app-btn-outline flex-1 disabled:opacity-50"
                >
                  Buka kembali
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmEnd(true)}
                  className="app-btn-outline flex-1 disabled:opacity-50"
                  style={{ color: 'var(--app-danger)' }}
                >
                  Akhiri event
                </button>
              )}
            </div>
          </section>
        )}

        {tab === 'produk' && (
          <section className="flex flex-col gap-2.5">
            <Link
              to="/partner/event/produk/$id"
              params={{ id }}
              className="app-btn-outline gap-1.5 no-underline"
            >
              <Package size={14} />
              Kelola produk
            </Link>
            <PartnerTableToolbar
              search={productSearch}
              onSearchChange={(value) => {
                setProductSearch(value)
                productPager.resetPage()
              }}
              placeholder="Cari nama produk"
              label="Cari nama produk"
              pager={productPager.pager}
            />
            {products.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada produk yang dipilih untuk event ini.
              </p>
            ) : (
              productPager.paged.map((product) => {
                const photoUrl = partnerProductPhotoUrl(
                  product.id,
                  product.photoUpdatedAt,
                )
                return (
                  <div
                    key={product.id}
                    className="app-card flex items-center gap-3 p-3"
                  >
                    <div
                      className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                      style={{
                        background: 'var(--pm-tint)',
                        color: 'var(--app-text-mute)',
                      }}
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package size={20} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {product.name}
                      </p>
                      <p
                        className="pm-num text-sm"
                        style={{ color: 'var(--app-accent)' }}
                      >
                        {formatRupiah(product.price)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </section>
        )}

        {tab === 'jastiper' && (
          <section className="flex flex-col gap-2.5">
            <PartnerSubmitReview calendarEventId={id} barOnly />
            {participants.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada jastiper yang ikut event ini.
              </p>
            ) : (
              <>
                {slotEnabled && (
                  <SubmitFilterChips
                    counts={submitCounts}
                    active={submitFilter}
                    onChange={(next) => {
                      setSubmitFilter(next)
                      setSelected(new Set())
                      submitPager.resetPage()
                    }}
                  />
                )}
                <PartnerTableToolbar
                  search={participantSearch}
                  onSearchChange={(value) => {
                    setParticipantSearch(value)
                    participantPager.resetPage()
                    submitPager.resetPage()
                  }}
                  placeholder="Cari nama jastiper"
                  label="Cari nama jastiper"
                  pager={slotEnabled ? submitPager.pager : participantPager.pager}
                />
                {(slotEnabled ? submitPager : participantPager).paged.length === 0 && (
                  <p className="py-4 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
                    {slotEnabled && submitRows.length === 0 && searchKey === ''
                      ? 'Belum ada jastiper yang submit.'
                      : 'Tidak ada jastiper yang cocok.'}
                  </p>
                )}
                {slotEnabled
                  ? submitPager.paged.map((row) => (
                      <div
                        key={row.submissionId}
                        className="app-card flex items-center gap-3 p-3"
                      >
                        {selectMode && (
                          <input
                            type="checkbox"
                            className="size-5 shrink-0"
                            checked={selected.has(row.submissionId)}
                            disabled={selectedBrandId !== null && row.brandId !== selectedBrandId}
                            title={selectedBrandId !== null && row.brandId !== selectedBrandId ? 'Satu tagihan untuk satu jastiper' : undefined}
                            onChange={() => toggleSelected(row.submissionId)}
                            aria-label={`Pilih Submit ke-${row.submitNo} ${row.brandName}`}
                          />
                        )}
                        <Link
                          to="/partner/event/jastiper/$id/$brandId"
                          params={{ id, brandId: row.brandId }}
                          search={{ submit: row.submitNo }}
                          className="flex min-w-0 flex-1 items-center gap-3 no-underline"
                          style={{ color: 'inherit' }}
                        >
                          <span
                            className="pm-display flex size-10 shrink-0 items-center justify-center rounded-full text-sm"
                            style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
                          >
                            {initialsOf(row.brandName)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{row.brandName}</p>
                            <p className="truncate text-xs" style={{ color: 'var(--app-text-soft)' }}>
                              Submit {formatWibDateTime(row.submittedAt)}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <ReplacementTag row={row} />
                              <RowStatus row={row} onOpenInvoice={setOpenInvoiceId} />
                              {row.checked && row.pcs.rejected > 0 && (
                                <span
                                  className="app-badge"
                                  title="Barang ditolak partner (stok kurang atau habis)."
                                  style={{ background: 'var(--app-danger-soft, #fdecea)', color: 'var(--app-danger)' }}
                                >
                                  {row.pcs.rejected} pcs ditolak
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs" style={{ color: 'var(--app-text-soft)' }}>
                              Urutan #{row.queueRank} · Submit ke-{row.submitNo} · {row.pcs.total} pcs
                            </p>
                          </div>
                        </Link>
                      </div>
                    ))
                  : participantPager.paged.map((row) => {
                      const name = row.brandName || 'Tanpa nama'
                      return (
                        <div key={row.brandId} className="app-card flex items-center gap-3 p-3">
                          <Link
                            to="/partner/event/jastiper/$id/$brandId"
                            params={{ id, brandId: row.brandId }}
                            search={{ submit: undefined }}
                            className="flex min-w-0 flex-1 items-center gap-3 no-underline"
                            style={{ color: 'inherit' }}
                          >
                            <span
                              className="pm-display flex size-10 shrink-0 items-center justify-center rounded-full text-sm"
                              style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
                            >
                              {initialsOf(row.brandName ?? '')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{name}</p>
                              <p className="truncate text-xs" style={{ color: 'var(--app-text-soft)' }}>
                                Ikut {formatDate(row.joinedAt)}
                                {row.waNumber ? ` · ${formatPhoneNumber(row.waNumber)}` : ''}
                              </p>
                            </div>
                          </Link>
                          {row.waNumber ? (
                            <a
                              href={`tel:${row.waNumber}`}
                              aria-label={`Telepon ${name}`}
                              className="flex size-9 shrink-0 items-center justify-center rounded-full no-underline"
                              style={{ background: 'var(--app-success-soft)', color: 'var(--app-success)' }}
                            >
                              <Phone size={16} />
                            </a>
                          ) : null}
                        </div>
                      )
                    })}
                {slotEnabled && <NotSubmittedNote list={notSubmitted} />}
                {invoiceBar}
              </>
            )}
          </section>
        )}
      </main>

      <main className="pm-wide hidden flex-col gap-5 lg:flex">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="pm-display truncate text-[26px] leading-tight">
              {event.name}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
              <Link to="/partner/event" className="no-underline" style={{ color: 'inherit' }}>
                Event
              </Link>{' '}
              / {event.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <PartnerEventStatusBadge status={status} />
            <Link
              to="/partner/event/ubah/$id"
              params={{ id }}
              className="app-btn-outline no-underline"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              Edit event
            </Link>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <aside className="flex flex-col gap-5 lg:order-last lg:sticky lg:top-6">
            <Link
              to="/partner/event/rekap/$id"
              params={{ id }}
              search={{ status: rekapStatus }}
              className="app-btn-outline w-full no-underline"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              Rekap Orderan
            </Link>

            <PartnerRevenueCard
              slotEnabled={revenue?.slotEnabled ?? false}
              totalAmount={revenue?.totalAmount ?? 0}
              approvedAmount={revenue?.approvedAmount ?? 0}
              waitingAmount={revenue?.waitingAmount ?? 0}
            />

            <section className="app-card flex flex-col gap-4 p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--pm-gold)' }}>Info event</p>
              {event.bannerSrc && (
                <img
                  src={event.bannerSrc}
                  alt={event.name}
                  className="h-[112px] w-full rounded-2xl object-cover"
                />
              )}
              <dl className="flex flex-col text-[13px]">
                {[
                  { label: 'Tipe', value: event.isOnline ? 'Online' : 'Offline' },
                  { label: 'Tanggal', value: formatDateRange(event.eventDate, event.endDate) },
                  { label: 'Lokasi', value: event.location },
                  { label: 'Jastiper', value: `${participants.length} bergabung` },
                  {
                    label: 'Pesanan',
                    value: slotEnabled
                      ? `${revenue?.approvedPcs ?? 0} pcs masuk`
                      : `${totalOrders} masuk`,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3 border-t py-2.5" style={{ borderColor: 'var(--app-border)' }}>
                    <dt style={{ color: 'var(--app-text-soft)' }}>{item.label}</dt>
                    <dd className="pm-num text-right font-bold">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[13px]" style={{ borderColor: 'var(--app-border)' }}>
                <Link
                  to="/partner/event/produk/$id"
                  params={{ id }}
                  className="inline-flex items-center gap-1.5 font-semibold no-underline"
                  style={{ color: 'var(--app-accent)' }}
                >
                  <Package size={14} />
                  Kelola produk ({products.length})
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (event.isEnded ? void handleSetEnded(false) : setConfirmEnd(true))}
                  className="font-semibold disabled:opacity-50"
                  style={{ color: event.isEnded ? 'var(--app-accent)' : 'var(--app-danger)' }}
                >
                  {event.isEnded ? 'Buka kembali' : 'Akhiri event'}
                </button>
              </div>
            </section>

            <PartnerSlotSection
              calendarEventId={id}
              eventEndDate={event.endDate ?? event.eventDate}
            />
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <PartnerSubmitReview calendarEventId={id} barOnly />
            {participants.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada jastiper yang ikut event ini.
              </p>
            ) : (
              <>
                {slotEnabled && (
                  <SubmitFilterChips
                    counts={submitCounts}
                    active={submitFilter}
                    onChange={(next) => {
                      setSubmitFilter(next)
                      setSelected(new Set())
                      submitPager.resetPage()
                    }}
                  />
                )}
                <PartnerTableToolbar
                  search={participantSearch}
                  onSearchChange={(value) => {
                    setParticipantSearch(value)
                    participantPager.resetPage()
                    submitPager.resetPage()
                  }}
                  placeholder="Cari nama jastiper"
                  label="Cari nama jastiper"
                  pager={slotEnabled ? submitPager.pager : participantPager.pager}
                />
                <div className="app-card overflow-x-auto">
                  <div
                    className={`grid ${slotEnabled ? (selectMode ? PARTICIPANT_COLUMNS_SLOT_SELECT : PARTICIPANT_COLUMNS_SLOT) : PARTICIPANT_COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
                    style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
                  >
                    {selectMode && <span aria-hidden="true" />}
                    {slotEnabled ? (
                      <>
                        {(
                          [
                            ['Jastiper', 'brandName'],
                            ['Waktu submit', 'submittedAt'],
                            ['Urutan', 'queueRank'],
                            ['Submit ke', 'submitNo'],
                            ['Pcs', 'pcsTotal'],
                            ['Pcs ditolak', 'pcsRejected'],
                          ] as const
                        ).map(([label, key]) => (
                          <div key={key} role="columnheader" aria-sort={ariaSortOf(submitSort.sort, key)}>
                            <SortHeader
                              label={label}
                              sortKey={key}
                              sort={submitSort.sort}
                              onSort={(k) => {
                                submitSort.toggle(k)
                                submitPager.resetPage()
                              }}
                            />
                          </div>
                        ))}
                        <span>Status</span>
                      </>
                    ) : (
                      <>
                        {(
                          [
                            ['Jastiper', 'brandName'],
                            ['Tanggal ikut', 'joinedAt'],
                            ['No. WhatsApp', 'waNumber'],
                            ['Pesanan', 'orderCount'],
                          ] as const
                        ).map(([label, key]) => (
                          <div key={key} role="columnheader" aria-sort={ariaSortOf(participantSort.sort, key)}>
                            <SortHeader
                              label={label}
                              sortKey={key}
                              sort={participantSort.sort}
                              onSort={(k) => {
                                participantSort.toggle(k)
                                participantPager.resetPage()
                              }}
                            />
                          </div>
                        ))}
                        <span>Aksi</span>
                      </>
                    )}
                  </div>
                  {(slotEnabled ? submitPager : participantPager).paged.length === 0 && (
                    <p className="border-t px-5 py-6 text-center text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)' }}>
                      {slotEnabled && submitRows.length === 0 && searchKey === ''
                        ? 'Belum ada jastiper yang submit.'
                        : 'Tidak ada jastiper yang cocok.'}
                    </p>
                  )}
                  {slotEnabled
                    ? submitPager.paged.map((row) => (
                        <div
                          key={row.submissionId}
                          className={`grid ${selectMode ? PARTICIPANT_COLUMNS_SLOT_SELECT : PARTICIPANT_COLUMNS_SLOT} items-center gap-4 border-t px-5 py-3`}
                          style={{ borderColor: 'var(--app-border)' }}
                        >
                          {selectMode && (
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={selected.has(row.submissionId)}
                              disabled={selectedBrandId !== null && row.brandId !== selectedBrandId}
                              title={selectedBrandId !== null && row.brandId !== selectedBrandId ? 'Satu tagihan untuk satu jastiper' : undefined}
                              onChange={() => toggleSelected(row.submissionId)}
                              aria-label={`Pilih Submit ke-${row.submitNo} ${row.brandName}`}
                            />
                          )}
                          <Link
                            to="/partner/event/jastiper/$id/$brandId"
                            params={{ id, brandId: row.brandId }}
                            search={{ submit: row.submitNo }}
                            className="flex min-w-0 items-center gap-3.5 no-underline"
                            style={{ color: 'inherit' }}
                          >
                            <span
                              className="pm-display flex size-11 shrink-0 items-center justify-center rounded-full text-sm"
                              style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
                            >
                              {initialsOf(row.brandName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{row.brandName}</p>
                              <ReplacementTag row={row} />
                            </div>
                          </Link>
                          <span className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                            {formatWibDateTime(row.submittedAt)}
                          </span>
                          <span className="pm-num text-sm font-bold">#{row.queueRank}</span>
                          <span className="pm-num text-sm font-bold">#{row.submitNo}</span>
                          <span className="pm-num text-sm font-bold">{row.pcs.total}</span>
                          <div>
                            {row.checked && row.pcs.rejected > 0 ? (
                              <span
                                className="app-badge"
                                title="Barang ditolak partner (stok kurang atau habis)."
                                style={{ background: 'var(--app-danger-soft, #fdecea)', color: 'var(--app-danger)' }}
                              >
                                {row.pcs.rejected} pcs
                              </span>
                            ) : (
                              <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>–</span>
                            )}
                          </div>
                          <div>
                            <RowStatus row={row} onOpenInvoice={setOpenInvoiceId} />
                          </div>
                        </div>
                      ))
                    : participantPager.paged.map((row) => {
                        const name = row.brandName || 'Tanpa nama'
                        return (
                          <div
                            key={row.brandId}
                            className={`grid ${PARTICIPANT_COLUMNS} items-center gap-4 border-t px-5 py-3`}
                            style={{ borderColor: 'var(--app-border)' }}
                          >
                            <Link
                              to="/partner/event/jastiper/$id/$brandId"
                              params={{ id, brandId: row.brandId }}
                              search={{ submit: undefined }}
                              className="flex min-w-0 items-center gap-3.5 no-underline"
                              style={{ color: 'inherit' }}
                            >
                              <span
                                className="pm-display flex size-11 shrink-0 items-center justify-center rounded-full text-sm"
                                style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
                              >
                                {initialsOf(row.brandName ?? '')}
                              </span>
                              <p className="truncate text-sm font-bold">{name}</p>
                            </Link>
                            <span className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                              {formatDate(row.joinedAt)}
                            </span>
                            <span className="pm-num text-[13px] font-medium">
                              {row.waNumber ? formatPhoneNumber(row.waNumber) : '-'}
                            </span>
                            <span className="text-sm font-bold">{row.orderCount}</span>
                            <div>
                              {row.waNumber ? (
                                <a
                                  href={buildWhatsAppLink(row.waNumber, '')}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="app-btn-outline gap-2 no-underline"
                                  style={{ minHeight: 38, fontSize: 13 }}
                                >
                                  <Phone size={15} />
                                  Hubungi
                                </a>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                </div>
                <Pagination
                  {...(slotEnabled ? submitPager.pager : participantPager.pager)}
                  className="justify-end"
                />
                {slotEnabled && <NotSubmittedNote list={notSubmitted} />}
                {invoiceBar}
              </>
            )}
          </div>
        </div>
      </main>

      <ConfirmModal
        open={confirmEnd}
        title="Akhiri event ini?"
        content="Event langsung hilang dari kalender jastiper. Data jastiper yang sudah ikut tetap tersimpan, dan event bisa dibuka kembali kapan saja."
        okText="Akhiri event"
        loading={busy}
        onOk={() => handleSetEnded(true)}
        onCancel={() => setConfirmEnd(false)}
      />
      <ConfirmModal
        open={confirmSend}
        danger={false}
        title={`Kirim tagihan ke ${selectedRows.at(0)?.brandName ?? 'jastiper'}?`}
        content={`${selectedRows.length} submit · ${selectedTotals.pcs} pcs · ${formatRupiah(finalAmount)}${previewOk && previewOk.bundleCount > 0 ? ` (termasuk ${previewOk.bundleCount} paket${previewOk.saving > 0 ? `, hemat ${formatRupiah(previewOk.saving)}` : ''})` : ''}. Jastiper akan menerima notifikasi. Barang di submit ini tidak bisa dibatalkan selama tagihan aktif.${waiveBlocking ? ` Submit ke-${awaitingRows.map((r) => r.submitNo).join(', ')} masih menunggu keputusan jastiper untuk isi paket yang ditolak. Dengan mengirim tagihan ini, barang itu dianggap tidak diganti dan jastiper tidak bisa mengirim penggantinya lagi.` : ''}`}
        okText="Kirim tagihan"
        loadingText="Mengirim..."
        loading={sending}
        onOk={handleSendInvoice}
        onCancel={() => setConfirmSend(false)}
      />
      {openInvoiceId && (
        <InvoiceDetailModal
          invoiceId={openInvoiceId}
          mode="partner"
          onClose={() => setOpenInvoiceId(null)}
          onChanged={() => void refreshInvoiceData()}
        />
      )}
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </>
  )
}
