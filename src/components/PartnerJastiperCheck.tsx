import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import Pagination from './ui/Pagination'
import PartnerRowChip from './PartnerRowChip'
import SubmitStatusBadge from './SubmitStatusBadge'
import { formatWibDateTime } from '../lib/event-slot'
import { getPartnerSubmitList } from '../lib/partner-submit-list'
import { buildWhatsAppLink, formatPhoneNumber } from '../lib/format'
import { partnerItemName, variantLabel } from '../lib/partner-item-label'
import { getPartnerJastiperDetail } from '../lib/partner-jastiper-detail'
import { formatRupiah } from '../lib/partner-product-rules'
import { useClientPager } from '../lib/use-client-pager'
import { allocateApproved, overStockRowIds } from '../lib/partner-stock-review'
import {
  getPartnerSubmissions,
  reviewSubmissionBatch,
} from '../lib/submit-functions'
import type { PartnerSubmitRow } from '../lib/partner-submit-list'
import type {
  ReviewBrand,
  ReviewRow,
  ReviewSubmission,
} from '../lib/submit-review-queries'

/**
 * Cek pesanan satu jastiper di event partner: ringkasan gabungan di atas, lalu
 * satu blok per submit. Isi "Dapat" untuk barang pengajuan, lalu tekan Selesai
 * dicek per submit. Pemesan dan harga jual tidak ditampilkan.
 */
export default function PartnerJastiperCheck({
  calendarEventId,
  brandId,
  submit,
}: {
  calendarEventId: string
  brandId: string
  /** Nomor submit yang dibuka di tab saat halaman dibuka. Kosong = tab Semua. */
  submit?: number
}) {
  const queryClient = useQueryClient()
  const subs = useQuery({
    // brandId ikut ke server supaya hanya data jastiper ini yang dibaca.
    queryKey: ['partner-submissions', calendarEventId, brandId],
    queryFn: () =>
      getPartnerSubmissions({ data: { calendarEventId, brandId } }),
  })
  const detail = useQuery({
    queryKey: ['partner-jastiper-detail', calendarEventId, brandId],
    queryFn: () =>
      getPartnerJastiperDetail({ data: { calendarEventId, brandId } }),
  })

  const submitList = useQuery({
    queryKey: ['partner-submit-list', calendarEventId, brandId],
    queryFn: () =>
      getPartnerSubmitList({ data: { calendarEventId, brandId } }),
  })

  const brand: ReviewBrand | undefined = (subs.data ?? []).find(
    (b) => b.brandId === brandId,
  )
  const submissions = useMemo(
    () =>
      [...(brand?.submissions ?? [])].sort((a, b) => a.submitNo - b.submitNo),
    [brand],
  )
  const [search, setSearch] = useState('')
  const searchKey = search.trim().toLowerCase()

  const [approved, setApproved] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const pendingSubs = submissions.filter(hasPending)

  // Isian awal "Dapat" dibatasi stok varian; baris varian yang sama berbagi stok.
  const defaultDapat = useMemo(() => {
    const result: Record<string, number> = {}
    for (const sub of submissions) {
      Object.assign(
        result,
        allocateApproved(allRows(sub).filter((r) => r.status === 'pengajuan')),
      )
    }
    return result
  }, [submissions])
  const dapatOf = (r: ReviewRow) => approved[r.id] ?? defaultDapat[r.id] ?? r.qty
  // Baris yang jumlah "Dapat"-nya (dijumlah per varian) melebihi stok.
  const { overRows, overSubs } = useMemo(() => {
    const overRows = new Set<string>()
    const overSubs = new Set<string>()
    for (const sub of submissions) {
      const pending = allRows(sub).filter((r) => r.status === 'pengajuan')
      const values = Object.fromEntries(
        pending.map((r) => [r.id, approved[r.id] ?? defaultDapat[r.id] ?? r.qty]),
      )
      for (const id of overStockRowIds(pending, values)) {
        overRows.add(id)
        overSubs.add(sub.submissionId)
      }
    }
    return { overRows, overSubs }
  }, [submissions, approved, defaultDapat])
  const rowsBySubmission = new Map(
    (submitList.data?.rows ?? []).map((r) => [r.submissionId, r]),
  )
  const summary = summarize(submitList.data?.rows ?? [])

  // Tab submit: "Semua" atau satu submit. Awalnya mengikuti parameter `submit`.
  const [tab, setTab] = useState<number | 'semua'>(submit ?? 'semua')
  useEffect(() => {
    setTab(submit ?? 'semua')
  }, [submit])
  const activeTab =
    tab !== 'semua' && submissions.some((x) => x.submitNo === tab)
      ? tab
      : 'semua'
  const shownSubmissions =
    activeTab === 'semua'
      ? submissions
      : submissions.filter((x) => x.submitNo === activeTab)

  const mutation = useMutation({
    mutationFn: (sub: ReviewSubmission) => {
      const dapat = dapatOf
      return reviewSubmissionBatch({
        data: {
          submissionId: sub.submissionId,
          itemDecisions: sub.satuan
            .filter((r) => r.status === 'pengajuan')
            .map((r) => ({ id: r.id, approvedQty: dapat(r) })),
          componentDecisions: sub.paket.flatMap((b) =>
            b.rows
              .filter((r) => r.status === 'pengajuan')
              .map((r) => ({ id: r.id, approvedQty: dapat(r) })),
          ),
        },
      })
    },
    onSuccess: () => {
      setError(null)
      setApproved({})
      queryClient.invalidateQueries({ queryKey: ['partner-submissions', calendarEventId] })
      queryClient.invalidateQueries({ queryKey: ['partner-jastiper-detail', calendarEventId, brandId] })
      queryClient.invalidateQueries({ queryKey: ['partner-submit-list', calendarEventId] })
      queryClient.invalidateQueries({ queryKey: ['partner-event-revenue', calendarEventId] })
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Gagal menyimpan'),
  })

  const d = detail.data
  const hasRejected = summary.pcs.rejected > 0
  const waLink = d?.waNumber
    ? buildWhatsAppLink(
        d.waNumber,
        `Halo ${d.brandName}, ini dari tim partner untuk pesanan event ini.`,
      )
    : null

  if (subs.isLoading || detail.isLoading || submitList.isLoading) return <p className="text-sm">Memuat…</p>

  const contactCard = d && (
    <section className="app-card p-4 text-[13px]">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pm-gold)' }}>
        Kontak jastiper
      </p>
      <p className="mt-2">
        {d.brandName}
        {d.waNumber && <span style={{ color: 'var(--app-text-soft)' }}> · {formatPhoneNumber(d.waNumber)}</span>}
      </p>
      {waLink && (
        <a href={waLink} target="_blank" rel="noreferrer" className="mt-3 block rounded-lg border px-4 py-2 text-center text-[13px] font-semibold">
          Hubungi via WhatsApp
        </a>
      )}
    </section>
  )

  // Belum ada pengiriman dari jastiper: tampilkan kondisi kosong.
  if (submissions.length === 0) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="app-card flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full text-[18px]" style={{ background: 'var(--pm-tint)' }}>
            …
          </div>
          <h2 className="mt-4 text-[16px] font-semibold">Jastiper ini belum mengirim pesanan ke kamu.</h2>
          <p className="mt-2 max-w-md text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
            Pesanan muncul di sini setelah jastiper menekan Submit saat slot dibuka. Sampai saat itu, daftar barang dan total belum bisa dilihat.
          </p>
        </section>
        <div className="flex flex-col gap-3">
          <section className="app-card p-4">
            <PartnerRowChip label="Draft" tone="neutral" />
            <h3 className="mt-2 text-[16px] font-semibold">Menunggu jastiper</h3>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
              Pesanan muncul setelah jastiper menekan Submit saat slot dibuka.
            </p>
          </section>
          {contactCard}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <SummaryCard summary={summary} />

        <div className="relative w-full max-w-[336px]">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--app-text-soft)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk"
            aria-label="Cari nama produk"
            className="app-input pl-10"
            style={{ height: 42, borderRadius: 12 }}
          />
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pilih submit">
          {([{ key: 'semua' as const, label: 'Semua' }, ...submissions.map((x) => ({ key: x.submitNo, label: `Submit ${x.submitNo}` }))]).map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setTab(t.key)}
              className={`pm-chip ${activeTab === t.key ? 'pm-chip--active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {shownSubmissions.map((sub) => (
          <SubmitBlock
            key={sub.submissionId}
            sub={sub}
            info={rowsBySubmission.get(sub.submissionId)}
            searchKey={searchKey}
            dapatOf={dapatOf}
            overRows={overRows}
            onChangeDapat={(row, max, value) =>
              setApproved((prev) => ({
                ...prev,
                [row.id]: Math.min(max, Math.max(0, Math.floor(value) || 0)),
              }))
            }
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <section className="app-card p-4">
          <PartnerRowChip
            label={pendingSubs.length > 0 ? 'Pengajuan' : 'Disetujui'}
            tone={pendingSubs.length > 0 ? 'info' : 'success'}
          />
          {pendingSubs.length > 0 ? (
            <>
              <h3 className="mt-2 text-[16px] font-semibold">Cek pesanan ini</h3>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                Isi jumlah yang dapat di tabel, lalu tekan Selesai dicek untuk tiap submit.
              </p>
              {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
              <div className="mt-3 flex flex-col gap-2">
                {pendingSubs.map((sub) => (
                  <button
                    key={sub.submissionId}
                    type="button"
                    onClick={() => mutation.mutate(sub)}
                    disabled={mutation.isPending || overSubs.has(sub.submissionId)}
                    className="w-full rounded-lg px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--app-accent)' }}
                  >
                    Selesai dicek Submit ke-{sub.submitNo}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-[16px] font-semibold">Hasil final</h3>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                Semua barang sudah dicek. Yang tidak dapat tidak masuk tagihan.
              </p>
              <p className="mt-2 text-[12px]" style={{ color: hasRejected ? '#b42318' : '#2f6b3f' }}>
                {hasRejected ? 'Ada barang yang ditolak' : '✓ Semua barang sudah cukup'}
              </p>
            </>
          )}
        </section>

        {contactCard}
      </div>
    </div>
  )
}

type Summary = {
  submitCount: number
  pcs: PartnerSubmitRow['pcs']
  approvedAmount: number
  pendingAmount: number
}

function summarize(rows: Array<PartnerSubmitRow>): Summary {
  const pcs = { total: 0, approved: 0, rejected: 0, cancelled: 0, pending: 0 }
  let approvedAmount = 0
  let pendingAmount = 0
  for (const r of rows) {
    pcs.total += r.pcs.total
    pcs.approved += r.pcs.approved
    pcs.rejected += r.pcs.rejected
    pcs.cancelled += r.pcs.cancelled
    pcs.pending += r.pcs.pending
    approvedAmount += r.approvedAmount
    pendingAmount += r.pendingAmount
  }
  return { submitCount: rows.length, pcs, approvedAmount, pendingAmount }
}

/** Ringkasan gabungan seluruh submit jastiper ini. */
function SummaryCard({ summary }: { summary: Summary }) {
  const stats = [
    { label: 'Submit', value: String(summary.submitCount) },
    { label: 'Dapat', value: `${summary.pcs.approved} pcs` },
    { label: 'Ditolak', value: `${summary.pcs.rejected} pcs` },
    { label: 'Dibatalkan', value: `${summary.pcs.cancelled} pcs` },
    { label: 'Menunggu dicek', value: `${summary.pcs.pending} pcs` },
  ]
  return (
    <section className="app-card p-4 text-[13px]">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pm-gold)' }}>
        Ringkasan
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p style={{ color: 'var(--app-text-soft)' }}>Total tagihan</p>
          <p className="pm-num text-[20px] font-bold">{formatRupiah(summary.approvedAmount)}</p>
        </div>
        <div>
          <p style={{ color: 'var(--app-text-soft)' }}>Menunggu cek</p>
          <p className="pm-num text-[20px] font-bold">{formatRupiah(summary.pendingAmount)}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-5">
        {stats.map((st) => (
          <div key={st.label}>
            <dt className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>{st.label}</dt>
            <dd className="pm-num font-semibold">{st.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Satu submit: judul (nomor, waktu, status, hasil) dan tabel barangnya. */
function SubmitBlock({
  sub,
  info,
  searchKey,
  dapatOf,
  overRows,
  onChangeDapat,
}: {
  sub: ReviewSubmission
  info: PartnerSubmitRow | undefined
  searchKey: string
  dapatOf: (r: ReviewRow) => number
  overRows: Set<string>
  onChangeDapat: (row: ReviewRow, max: number, value: number) => void
}) {
  const rows = allRows(sub).filter((r) =>
    r.productName.toLowerCase().includes(searchKey),
  )
  const pager = useClientPager(rows)
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <h2 className="text-[15px] font-bold">Submit ke-{sub.submitNo}</h2>
        <span className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
          {formatWibDateTime(sub.submittedAt)}
        </span>
        <SubmitStatusBadge
          checked={sub.checked}
          state={info?.invoiceState}
          invoiceNumber={info?.invoice?.number}
        />
        {info && (
          <span className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
            {sub.checked
              ? `${info.pcs.approved} dapat`
              : `${info.pcs.pending} pcs menunggu`}
            {info.pcs.rejected > 0 && ` · ${info.pcs.rejected} ditolak`}
            {info.pcs.cancelled > 0 && ` · ${info.pcs.cancelled} dibatalkan`}
          </span>
        )}
      </div>
      <div className="app-card overflow-x-auto p-0">
        <table className="w-full text-[13px]">
          <thead style={{ background: 'var(--pm-tint)' }}>
            <tr>
              {['Produk', 'Ukuran', 'Variasi', 'Harga partner', 'Stok', 'Diminta', 'Dapat', 'Status'].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide ${['Harga partner', 'Stok', 'Diminta', 'Dapat'].includes(h) ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--pm-gold)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pager.paged.map((row) => {
              const isPendingRow = row.status === 'pengajuan'
              const dapat = dapatOf(row)
              const short = isPendingRow ? row.qty - dapat : 0
              const maxDapat = row.stock === null ? row.qty : Math.min(row.qty, row.stock)
              const chip =
                row.status === 'pengajuan'
                  ? overRows.has(row.id)
                    ? { label: 'Melebihi stok', tone: 'danger' as const }
                    : short <= 0
                    ? { label: 'Cukup', tone: 'success' as const }
                    : { label: `Kurang ${short}`, tone: 'danger' as const }
                  : row.status === 'disetujui'
                    ? { label: 'Disetujui', tone: 'success' as const }
                    : row.status === 'disanggah'
                      ? { label: 'Ditolak', tone: 'danger' as const }
                      : row.status === 'dibatalkan'
                        ? { label: 'Dibatalkan', tone: 'neutral' as const }
                        : { label: 'Belum disubmit', tone: 'neutral' as const }
              return (
                <tr key={row.id} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                  <td className="px-4 py-3 font-bold">
                    {partnerItemName(row.productName, variantLabel({ size: row.size, variation: row.variation }))}
                    {row.kind === 'komponen' && (
                      <span className="ml-1 text-[11px] font-normal" style={{ color: 'var(--app-text-soft)' }}>(paket)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.size ?? '-'}</td>
                  <td className="px-4 py-3">{row.variation ?? '-'}</td>
                  <td className="pm-num px-4 py-3 text-right">{formatRupiah(row.unitPrice)}</td>
                  <td className="pm-num px-4 py-3 text-right">
                    {isPendingRow && row.stock !== null ? row.stock : '-'}
                  </td>
                  <td className="pm-num px-4 py-3 text-right">{row.qty}</td>
                  <td className="px-4 py-3 text-right">
                    {isPendingRow ? (
                      <input
                        type="number"
                        min={0}
                        max={maxDapat}
                        value={dapat}
                        onChange={(e) => onChangeDapat(row, maxDapat, Number(e.target.value))}
                        className="w-16 rounded border px-2 py-1 text-right"
                        aria-label={`Jumlah dapat untuk ${row.productName}`}
                      />
                    ) : (
                      <span className="pm-num">{row.status === 'disetujui' ? row.qty : 0}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PartnerRowChip label={chip.label} tone={chip.tone} />
                  </td>
                </tr>
              )
            })}
            {pager.paged.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                  Belum ada barang yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination {...pager.pager} className="justify-end" />
    </section>
  )
}

function hasPending(sub: ReviewSubmission) {
  return allRows(sub).some((r) => r.status === 'pengajuan')
}

function allRows(sub: ReviewSubmission): Array<ReviewRow> {
  return [...sub.satuan, ...sub.paket.flatMap((b) => b.rows)]
}
