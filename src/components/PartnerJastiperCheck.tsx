import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Search } from 'lucide-react'
import Pagination from './ui/Pagination'
import PartnerRowChip from './PartnerRowChip'
import SubmitStatusBadge from './SubmitStatusBadge'
import { formatWibDateTime } from '../lib/event-slot'
import { getPartnerSubmitList } from '../lib/partner-submit-list'
import { buildWhatsAppLink, formatPhoneNumber } from '../lib/format'
import { getPartnerJastiperDetail } from '../lib/partner-jastiper-detail'
import { formatRupiah } from '../lib/partner-product-rules'
import { useClientPager } from '../lib/use-client-pager'
import SortHeader, { ariaSortOf } from './ui/SortHeader'
import { sortRows } from '../lib/table-sort'
import { useTableSort } from '../lib/use-table-sort'
import { mergeReviewedRows } from '../lib/partner-review-merge'
import { displayItemName } from '../lib/partner-item-label'
import {
  allocateApproved,
  overStockRowIds,
  buildDisplayEntries,
  splitApproved,
} from '../lib/partner-stock-review'
import {
  getPartnerSubmissions,
  reviewSubmissionBatch,
} from '../lib/submit-functions'
import type {
  PartnerSubmitList,
  PartnerSubmitRow,
} from '../lib/partner-submit-list'
import type {
  ReplacementPair,
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
    queryFn: () => getPartnerSubmitList({ data: { calendarEventId, brandId } }),
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
  const dapatOf = (r: ReviewRow) =>
    approved[r.id] ?? defaultDapat[r.id] ?? r.qty
  // Baris yang jumlah "Dapat"-nya (dijumlah per varian) melebihi stok.
  const { overRows, overSubs } = useMemo(() => {
    const overRows = new Set<string>()
    const overSubs = new Set<string>()
    for (const sub of submissions) {
      const pending = allRows(sub).filter((r) => r.status === 'pengajuan')
      const values = Object.fromEntries(
        pending.map((r) => [
          r.id,
          approved[r.id] ?? defaultDapat[r.id] ?? r.qty,
        ]),
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
  // Total tagihan dihitung per jastiper di server: submit yang sudah ditagih
  // memakai angka tagihannya, sisanya dipaketkan bersama.
  const totalAmount =
    submitList.data?.brandTotals[brandId] ?? summary.approvedAmount

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
      queryClient.invalidateQueries({
        queryKey: ['partner-submissions', calendarEventId],
      })
      queryClient.invalidateQueries({
        queryKey: ['partner-jastiper-detail', calendarEventId, brandId],
      })
      queryClient.invalidateQueries({
        queryKey: ['partner-submit-list', calendarEventId],
      })
      queryClient.invalidateQueries({
        queryKey: ['partner-event-revenue', calendarEventId],
      })
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Gagal menyimpan'),
  })

  const d = detail.data
  const hasRejected = summary.pcs.rejected > 0
  const waLink = d?.waNumber
    ? buildWhatsAppLink(
        d.waNumber,
        `Halo ${d.brandName}, ini dari tim partner untuk pesanan event ini.`,
      )
    : null

  if (subs.isLoading || detail.isLoading || submitList.isLoading)
    return <p className="text-sm">Memuat…</p>

  const contactCard = d && (
    <section className="app-card p-4 text-[13px]">
      <p
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--pm-gold)' }}
      >
        Kontak jastiper
      </p>
      <p className="mt-2">
        {d.brandName}
        {d.waNumber && (
          <span style={{ color: 'var(--app-text-soft)' }}>
            {' '}
            · {formatPhoneNumber(d.waNumber)}
          </span>
        )}
      </p>
      {waLink && (
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block rounded-lg border px-4 py-2 text-center text-[13px] font-semibold"
        >
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
          <div
            className="flex size-14 items-center justify-center rounded-full text-[18px]"
            style={{ background: 'var(--pm-tint)' }}
          >
            …
          </div>
          <h2 className="mt-4 text-[16px] font-semibold">
            Jastiper ini belum mengirim pesanan ke kamu.
          </h2>
          <p
            className="mt-2 max-w-md text-[13px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Pesanan muncul di sini setelah jastiper menekan Submit saat slot
            dibuka. Sampai saat itu, daftar barang dan total belum bisa dilihat.
          </p>
        </section>
        <div className="flex flex-col gap-3">
          <section className="app-card p-4">
            <PartnerRowChip label="Draft" tone="neutral" />
            <h3 className="mt-2 text-[16px] font-semibold">
              Menunggu jastiper
            </h3>
            <p
              className="mt-1 text-[13px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-[336px] sm:w-[336px]">
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
        </div>

        {submissions.length > 1 && (
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Pilih submit"
          >
            {[
              { key: 'semua' as const, label: 'Semua' },
              ...submissions.map((x) => ({
                key: x.submitNo,
                label: `Submit ${x.submitNo}`,
              })),
            ].map((t) => (
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
        )}

        {shownSubmissions.map((sub) => (
          <SubmitBlock
            key={sub.submissionId}
            sub={sub}
            info={rowsBySubmission.get(sub.submissionId)}
            itemPaket={submitList.data?.itemPaket ?? {}}
            searchKey={searchKey}
            dapatOf={dapatOf}
            overRows={overRows}
            onChangeDapat={(row, max, value) =>
              setApproved((prev) => ({
                ...prev,
                [row.id]: Math.min(max, Math.max(0, Math.floor(value) || 0)),
              }))
            }
            onSetDapat={(values) =>
              setApproved((prev) => ({ ...prev, ...values }))
            }
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <section className="app-card p-4">
          <PartnerRowChip
            label={pendingSubs.length > 0 ? 'Pengajuan' : 'Disetujui'}
            tone={pendingSubs.length > 0 ? 'info' : 'success'}
          />
          {pendingSubs.length > 0 ? (
            <>
              <h3 className="mt-2 text-[16px] font-semibold">
                Cek pesanan ini
              </h3>
              <p
                className="mt-1 text-[13px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Isi jumlah yang dapat di tabel, lalu tekan Selesai dicek untuk
                tiap submit.
              </p>
              {error && (
                <p className="mt-2 text-[12px] text-red-600">{error}</p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {pendingSubs.map((sub) => (
                  <button
                    key={sub.submissionId}
                    type="button"
                    onClick={() => mutation.mutate(sub)}
                    disabled={
                      mutation.isPending || overSubs.has(sub.submissionId)
                    }
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
              <p
                className="mt-1 text-[13px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Semua barang sudah dicek. Yang tidak dapat tidak masuk tagihan.
              </p>
              <p
                className="mt-2 text-[12px]"
                style={{ color: hasRejected ? '#b42318' : '#2f6b3f' }}
              >
                {hasRejected
                  ? 'Ada barang yang ditolak'
                  : '✓ Semua barang sudah cukup'}
              </p>
            </>
          )}
        </section>

        <SummaryCard summary={summary} totalAmount={totalAmount} />

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
function SummaryCard({
  summary,
  totalAmount,
}: {
  summary: Summary
  /** Total tagihan per jastiper, paket dihitung dari semua pcs-nya. */
  totalAmount: number
}) {
  const { pcs } = summary
  const segments = [
    {
      key: 'approved',
      label: 'Dapat',
      value: pcs.approved,
      color: 'var(--app-success)',
    },
    {
      key: 'rejected',
      label: 'Ditolak',
      value: pcs.rejected,
      color: 'var(--app-danger)',
    },
    {
      key: 'cancelled',
      label: 'Dibatalkan',
      value: pcs.cancelled,
      color: 'var(--app-text-mute)',
    },
    {
      key: 'pending',
      label: 'Menunggu dicek',
      value: pcs.pending,
      color: 'var(--app-warning)',
    },
  ]
  const totalPcs = segments.reduce((sum, s) => sum + s.value, 0)
  const checkedPcs = totalPcs - pcs.pending
  const anyPending = pcs.pending > 0

  return (
    <section className="app-card p-4 text-[13px]">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--pm-gold)' }}
        >
          Ringkasan
        </p>
        <span className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
          {summary.submitCount} submit ·{' '}
          <span className="pm-num">{totalPcs}</span> pcs
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div className="min-w-0">
          <p style={{ color: 'var(--app-text-soft)' }}>Total tagihan</p>
          <p className="pm-num text-[22px] font-bold leading-tight">
            {formatRupiah(totalAmount)}
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Paket dihitung dari semua pcs jastiper ini
          </p>
        </div>
        {anyPending && (
          <div
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
            style={{ background: 'var(--app-warning-soft)' }}
          >
            <p
              className="text-[12px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Belum dicek · <span className="pm-num">{pcs.pending}</span> pcs
            </p>
            <p className="pm-num text-[13px] font-semibold">
              +{formatRupiah(summary.pendingAmount)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          <span style={{ color: 'var(--app-text-soft)' }}>Progres cek</span>
          <span className="pm-num font-medium">
            {checkedPcs}/{totalPcs} pcs dicek
          </span>
        </div>
        <div
          className="flex h-2 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--app-border)' }}
          role="img"
          aria-label={segments
            .map((s) => `${s.label} ${s.value} pcs`)
            .join(', ')}
        >
          {totalPcs > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: `${(s.value / totalPcs) * 100}%`,
                    background: s.color,
                  }}
                />
              ))}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        {segments.map((s) => (
          <div
            key={s.key}
            className="rounded-lg border px-3 py-2"
            style={{
              borderColor: 'var(--app-border)',
              opacity: s.value === 0 ? 0.55 : 1,
            }}
          >
            <dt
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </dt>
            <dd className="pm-num mt-0.5 text-[15px] font-semibold">
              {s.value}{' '}
              <span
                className="text-[11px] font-normal"
                style={{ color: 'var(--app-text-soft)' }}
              >
                pcs
              </span>
            </dd>
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
  itemPaket,
  searchKey,
  dapatOf,
  overRows,
  onChangeDapat,
  onSetDapat,
}: {
  sub: ReviewSubmission
  info: PartnerSubmitRow | undefined
  itemPaket: PartnerSubmitList['itemPaket']
  searchKey: string
  dapatOf: (r: ReviewRow) => number
  overRows: Set<string>
  onChangeDapat: (row: ReviewRow, max: number, value: number) => void
  /** Isi banyak baris sekaligus (baris gabungan satu varian). */
  onSetDapat: (values: Record<string, number>) => void
}) {
  const rows = allRows(sub).filter((r) =>
    r.productName.toLowerCase().includes(searchKey),
  )
  // Setelah dicek, satuan dan komponen paket yang sama digabung jadi satu baris.
  const merged = hasPending(sub)
    ? null
    : mergeReviewedRows(rows, info && !info.invoice ? itemPaket : undefined)
  // Sebelum dicek, baris pengajuan dengan varian yang sama digabung jadi satu
  // baris (satu isian "Dapat", dibagi ke baris aslinya urut FIFO). Barang
  // pengganti tidak digabung supaya pasangannya dengan barang ditolak tetap jelas.
  const entries = merged
    ? []
    : buildDisplayEntries(rows, (r) =>
        r.status === 'pengajuan' && !r.replaces && r.partnerVariantId
          ? r.partnerVariantId
          : null,
      )
  const rowPager = useClientPager(entries)
  const mergedSort = useTableSort<MergedSortKey>()
  const mergedPager = useClientPager(
    sortRows(merged ?? [], mergedSort.sort, {
      productName: (m) => m.productName,
      variation: (m) => m.variation,
      size: (m) => m.size,
      total: (m) => m.total,
      priceType: (m) => m.priceType,
      stock: (m) => m.stock,
      requested: (m) => m.requested,
      approved: (m) => m.approved,
      status: (m) => MERGED_CHIP[m.status].label,
    }),
  )
  const pager = merged ? mergedPager : rowPager
  // Barang ditolak -> nama penggantinya, untuk keterangan di baris yang ditolak.
  const replacedBy = new Map(
    (sub.replacementPairs ?? [])
      .filter((p) => p.replacements.length > 0)
      .map((p) => [
        p.rejected.id,
        p.replacements.map((r) => displayItemName(r.label)).join(', '),
      ]),
  )
  const pagedRows = rowPager.paged
  const pagedMerged = mergedPager.paged
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <h2 className="text-[15px] font-bold">Submit ke-{sub.submitNo}</h2>
        {sub.reopened && (
          <PartnerRowChip label="Ada barang pengganti" tone="warn" />
        )}
        <span className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
          {formatWibDateTime(sub.submittedAt)}
        </span>
        {info?.invoice ? (
          <Link
            to="/partner/tagihan/$invoiceId"
            params={{ invoiceId: info.invoice.id }}
            className="no-underline"
            title="Buka tagihan"
          >
            <SubmitStatusBadge
              checked={sub.checked}
              state={info.invoiceState}
              invoiceNumber={info.invoice.number}
              invoiceStatus={info.invoice.status}
            />
          </Link>
        ) : (
          <SubmitStatusBadge
            checked={sub.checked}
            state={info?.invoiceState}
            invoiceNumber={info?.invoice?.number}
          />
        )}
        {info && (
          <span
            className="text-[12px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {sub.checked
              ? `${info.pcs.approved} dapat`
              : `${info.pcs.pending} pcs menunggu`}
            {info.pcs.rejected > 0 && ` · ${info.pcs.rejected} ditolak`}
            {info.pcs.cancelled > 0 && ` · ${info.pcs.cancelled} dibatalkan`}
          </span>
        )}
      </div>
      <ReplacementPairs pairs={sub.replacementPairs ?? []} />
      <div className="app-card overflow-x-auto p-0">
        <table className="w-full text-[13px]">
          <thead style={{ background: 'var(--pm-tint)' }}>
            <tr>
              {MERGED_COLUMNS.map(([h, key]) => (
                <th
                  key={h}
                  aria-sort={
                    merged ? ariaSortOf(mergedSort.sort, key) : undefined
                  }
                  className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide ${['Total harga', 'Stok', 'Diminta', 'Dapat'].includes(h) ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--pm-gold)' }}
                >
                  {/* Sebelum dicek, baris digabung/berpasangan dan bisa diisi, jadi urutannya dikunci. */}
                  <SortHeader
                    label={h}
                    sortKey={merged ? key : undefined}
                    sort={mergedSort.sort}
                    onSort={(k) => {
                      mergedSort.toggle(k)
                      mergedPager.resetPage()
                    }}
                    align={
                      ['Total harga', 'Stok', 'Diminta', 'Dapat'].includes(h)
                        ? 'right'
                        : 'left'
                    }
                    title={
                      h === 'Stok'
                        ? 'Stok varian saat ini di katalog'
                        : undefined
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedMerged.map((m) => {
              const chip = MERGED_CHIP[m.status]
              return (
                <tr
                  key={m.key}
                  className="border-t"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <td className="px-4 py-3 font-bold">{m.productName}</td>
                  <td className="px-4 py-3">{m.variation ?? '-'}</td>
                  <td className="px-4 py-3">{m.size ?? '-'}</td>
                  <td className="pm-num px-4 py-3 text-right font-semibold">
                    {m.total === null ? '-' : formatRupiah(m.total)}
                  </td>
                  <td className="px-4 py-3" title={m.ruleName ?? undefined}>
                    {m.priceType === 'paket' && m.price !== null
                      ? `Paket ${formatRupiah(m.price)} / ${m.bundlePcs} pcs`
                      : m.priceType === 'satuan' && m.price !== null
                        ? `Satuan ${formatRupiah(m.price)} / pcs`
                        : '-'}
                  </td>
                  <td className="pm-num px-4 py-3 text-right">
                    {m.stock ?? '-'}
                  </td>
                  <td className="pm-num px-4 py-3 text-right">{m.requested}</td>
                  <td className="pm-num px-4 py-3 text-right">{m.approved}</td>
                  <td className="px-4 py-3">
                    <PartnerRowChip label={chip.label} tone={chip.tone} />
                  </td>
                </tr>
              )
            })}
            {pagedRows.map((entry) => {
              if (entry.kind === 'group') {
                const first = entry.rows[0]
                const total = entry.rows.reduce((n, r) => n + r.qty, 0)
                const dapatTotal = entry.rows.reduce(
                  (n, r) => n + dapatOf(r),
                  0,
                )
                // Stok varian yang sama sudah dipakai baris lain di submit ini.
                const usedElsewhere = rows
                  .filter(
                    (r) =>
                      r.status === 'pengajuan' &&
                      r.partnerVariantId === first.partnerVariantId &&
                      !entry.rows.includes(r),
                  )
                  .reduce((n, r) => n + dapatOf(r), 0)
                const maxDapat =
                  first.stock === null
                    ? total
                    : Math.min(total, Math.max(0, first.stock - usedElsewhere))
                const over = entry.rows.some((r) => overRows.has(r.id))
                const short = total - dapatTotal
                const chip = over
                  ? { label: 'Melebihi stok', tone: 'danger' as const }
                  : short <= 0
                    ? { label: 'Cukup', tone: 'success' as const }
                    : { label: `Kurang ${short}`, tone: 'danger' as const }
                const stockShort = first.stock !== null && first.stock < total
                return (
                  <tr
                    key={entry.key}
                    className="border-t"
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    <td className="px-4 py-3 font-bold">{first.productName}</td>
                    <td className="px-4 py-3">{first.variation ?? '-'}</td>
                    <td className="px-4 py-3">{first.size ?? '-'}</td>
                    <td className="pm-num px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3">-</td>
                    <td
                      className="pm-num px-4 py-3 text-right"
                      style={
                        stockShort
                          ? { color: 'var(--app-danger)', fontWeight: 700 }
                          : undefined
                      }
                      title={
                        stockShort
                          ? 'Stok kurang dari jumlah yang diminta'
                          : undefined
                      }
                    >
                      {first.stock ?? '-'}
                    </td>
                    <td className="pm-num px-4 py-3 text-right">{total}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={maxDapat}
                        value={dapatTotal}
                        onChange={(e) => {
                          const value = Math.min(
                            maxDapat,
                            Math.max(
                              0,
                              Math.floor(Number(e.target.value)) || 0,
                            ),
                          )
                          onSetDapat(splitApproved(entry.rows, value))
                        }}
                        className="w-16 rounded border px-2 py-1 text-right"
                        aria-label={`Jumlah dapat untuk ${first.productName}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <PartnerRowChip label={chip.label} tone={chip.tone} />
                    </td>
                  </tr>
                )
              }
              const row = entry.row
              const isPendingRow = row.status === 'pengajuan'
              const dapat = dapatOf(row)
              const short = isPendingRow ? row.qty - dapat : 0
              const maxDapat =
                row.stock === null ? row.qty : Math.min(row.qty, row.stock)
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
                <tr
                  key={row.id}
                  className="border-t"
                  style={{
                    borderColor: 'var(--app-border)',
                    background: row.replaces
                      ? 'var(--app-accent-soft)'
                      : undefined,
                  }}
                >
                  <td className="px-4 py-3 font-bold">
                    {row.productName}
                    {row.replaces && (
                      <span
                        className="mt-0.5 block text-[11px] font-semibold"
                        style={{ color: '#9c463b' }}
                      >
                        ↳ Pengganti untuk {displayItemName(row.replaces)}
                      </span>
                    )}
                    {replacedBy.get(row.id) && (
                      <span
                        className="mt-0.5 block text-[11px] font-normal"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        Diganti dengan {replacedBy.get(row.id)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.variation ?? '-'}</td>
                  <td className="px-4 py-3">{row.size ?? '-'}</td>
                  <td className="pm-num px-4 py-3 text-right">-</td>
                  <td className="px-4 py-3">-</td>
                  <td
                    className="pm-num px-4 py-3 text-right"
                    style={
                      isPendingRow && row.stock !== null && row.stock < row.qty
                        ? { color: 'var(--app-danger)', fontWeight: 700 }
                        : undefined
                    }
                    title={
                      isPendingRow && row.stock !== null && row.stock < row.qty
                        ? 'Stok kurang dari jumlah yang diminta'
                        : undefined
                    }
                  >
                    {row.stock ?? '-'}
                  </td>
                  <td className="pm-num px-4 py-3 text-right">{row.qty}</td>
                  <td className="px-4 py-3 text-right">
                    {isPendingRow ? (
                      <input
                        type="number"
                        min={0}
                        max={maxDapat}
                        value={dapat}
                        onChange={(e) =>
                          onChangeDapat(row, maxDapat, Number(e.target.value))
                        }
                        className="w-16 rounded border px-2 py-1 text-right"
                        aria-label={`Jumlah dapat untuk ${row.productName}`}
                      />
                    ) : (
                      <span className="pm-num">
                        {row.status === 'disetujui' ? row.qty : 0}
                      </span>
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
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-[13px]"
                  style={{ color: 'var(--app-text-soft)' }}
                >
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

const PAIR_STATUS_CHIP = {
  pengajuan: { label: 'Menunggu dicek', tone: 'warn' },
  disetujui: { label: 'Disetujui', tone: 'success' },
  disanggah: { label: 'Ditolak lagi', tone: 'danger' },
  dibatalkan: { label: 'Dibatalkan', tone: 'neutral' },
} as const

/**
 * Barang ditolak dan penggantinya. Kalau pengganti ditolak lagi dan diganti
 * lagi, rantainya ditampilkan di bawah barang yang pertama ditolak, tiap
 * pengganti menjorok satu tingkat.
 */
function ReplacementPairs({ pairs }: { pairs: Array<ReplacementPair> }) {
  // Terbuka dari awal kalau ada pengganti yang menunggu dicek, karena itu yang
  // perlu partner lihat. Selain itu tertutup supaya tabel barang tidak terdorong.
  const waiting = pairs.reduce(
    (n, p) => n + p.replacements.filter((r) => r.status === 'pengajuan').length,
    0,
  )
  const [open, setOpen] = useState(waiting > 0)
  if (pairs.length === 0) return null
  const byRejected = new Map(pairs.map((p) => [p.rejected.id, p]))
  // Pasangan yang barang ditolaknya sendiri adalah pengganti ikut rantai induknya.
  const replacementIds = new Set(
    pairs.flatMap((p) => p.replacements.map((r) => r.id)),
  )
  const roots = pairs.filter((p) => !replacementIds.has(p.rejected.id))
  return (
    <div className="app-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="text-[11px] font-bold uppercase tracking-wide"
            style={{ color: 'var(--pm-gold)' }}
          >
            Barang ditolak dan penggantinya
          </span>
          <span
            className="pm-num text-[12px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            ({roots.length} barang)
          </span>
          {waiting > 0 && (
            <PartnerRowChip label={`${waiting} menunggu dicek`} tone="warn" />
          )}
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--app-text-soft)' }}
        />
      </button>
      {/* Isi tetap dirender supaya buka-tutupnya bisa beranimasi mulus (tinggi 0fr <-> 1fr). */}
      <div
        aria-hidden={!open}
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-3 pt-3">
            {roots.map((root) => (
              <div
                key={root.rejected.id}
                className="flex flex-col gap-1.5 border-t pt-3 text-[13px] first:border-t-0 first:pt-0"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <PartnerRowChip label="Ditolak" tone="danger" />
                  <span className="font-semibold line-through decoration-1">
                    {displayItemName(root.rejected.label)}
                  </span>
                  <span
                    className="pm-num"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {root.rejected.qty} pcs
                  </span>
                </div>
                <ReplacementChain
                  pair={root}
                  byRejected={byRejected}
                  depth={1}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pengganti dari satu barang ditolak, lalu rantai lanjutan kalau ditolak lagi. */
function ReplacementChain({
  pair,
  byRejected,
  depth,
}: {
  pair: ReplacementPair
  byRejected: Map<string, ReplacementPair>
  depth: number
}) {
  const indent = { marginLeft: depth * 16 }
  return (
    <>
      {pair.replacements.map((r) => {
        const chip = r.status ? PAIR_STATUS_CHIP[r.status] : null
        const next = byRejected.get(r.id)
        return (
          <div key={r.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2" style={indent}>
              <span aria-hidden="true">↳</span>
              <PartnerRowChip label="Pengganti" tone="info" />
              <span
                className={`font-semibold ${r.status === 'disanggah' ? 'line-through decoration-1' : ''}`}
              >
                {displayItemName(r.label)}
              </span>
              <span
                className="pm-num"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {r.qty} pcs
              </span>
              {chip && <PartnerRowChip label={chip.label} tone={chip.tone} />}
            </div>
            {next && (
              <ReplacementChain
                pair={next}
                byRejected={byRejected}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
      {pair.state === 'tidak_diganti' && (
        <p
          className="text-[12px]"
          style={{ ...indent, color: 'var(--app-text-soft)' }}
        >
          Jastiper memutuskan tidak diganti.
        </p>
      )}
      {pair.state === 'perlu_keputusan' && pair.openQty > 0 && (
        <p
          className="text-[12px]"
          style={{ ...indent, color: 'var(--app-text-soft)' }}
        >
          {pair.openQty} pcs belum diganti, jastiper belum memutuskan.
        </p>
      )}
    </>
  )
}

type MergedSortKey =
  | 'productName'
  | 'variation'
  | 'size'
  | 'total'
  | 'priceType'
  | 'stock'
  | 'requested'
  | 'approved'
  | 'status'

const MERGED_COLUMNS: ReadonlyArray<readonly [string, MergedSortKey]> = [
  ['Produk', 'productName'],
  ['Variasi', 'variation'],
  ['Ukuran', 'size'],
  ['Total harga', 'total'],
  ['Tipe harga', 'priceType'],
  ['Stok', 'stock'],
  ['Diminta', 'requested'],
  ['Dapat', 'approved'],
  ['Status', 'status'],
]

const MERGED_CHIP = {
  disetujui: { label: 'Disetujui', tone: 'success' },
  sebagian: { label: 'Disetujui sebagian', tone: 'warn' },
  ditolak: { label: 'Ditolak', tone: 'danger' },
  dibatalkan: { label: 'Dibatalkan', tone: 'neutral' },
} as const

function hasPending(sub: ReviewSubmission) {
  return allRows(sub).some((r) => r.status === 'pengajuan')
}

function allRows(sub: ReviewSubmission): Array<ReviewRow> {
  return [...sub.satuan, ...sub.paket.flatMap((b) => b.rows)]
}
