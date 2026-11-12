import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Ellipsis } from 'lucide-react'
import { useMemo, useState } from 'react'
import PartnerReviewFooter from '../../../components/PartnerReviewFooter'
import PartnerRowChip from '../../../components/PartnerRowChip'
import Pagination from '../../../components/ui/Pagination'
import PartnerTableToolbar from '../../../components/ui/PartnerTableToolbar'
import { partnerPageSubtitle } from '../../../lib/event-slot'
import { partnerItemName, variantLabel } from '../../../lib/partner-item-label'
import { buildWhatsAppLink, formatPhoneNumber } from '../../../lib/format'
import { getPartnerJastiperDetail } from '../../../lib/partner-jastiper-detail'
import { formatRupiah } from '../../../lib/partner-product-rules'
import { useClientPager } from '../../../lib/use-client-pager'
import { usePartnerReview } from '../../../lib/use-partner-review'
import type { PartnerBadgeTone } from '../../../lib/event-slot'
import type { JastiperDetailRow } from '../../../lib/partner-jastiper-detail'

export const Route = createFileRoute('/partner/event/jastiper/$id/$brandId')({
  component: PartnerJastiperDetailPage,
})

type TableRow = {
  key: string
  variantId: string | null
  productName: string
  size: string | null
  variation: string | null
  unitPrice: number
  /** Kolom "Diminta". */
  requested: number
  /** Kolom "Dapat" yang tersimpan; null = belum dicek. */
  approved: number | null
  /** Baris barang pengganti yang menunggu verifikasi. */
  replacement: boolean
  /** Pcs baris ini yang sudah digantikan barang pengganti. */
  replacedPcs: number
  /** Untuk baris pengganti: barang yang digantikannya. */
  replaces: Array<{ variantId: string | null; label: string }>
}

/** Draft: gabungkan semua pcs untuk produk yang sama jadi satu baris. */
function draftRows(rows: Array<JastiperDetailRow>): Array<TableRow> {
  const map = new Map<string, TableRow>()
  for (const r of rows) {
    const key = [r.productName, r.size ?? '', r.variation ?? ''].join('|')
    const existing = map.get(key)
    if (existing) {
      existing.requested += r.qty
    } else {
      map.set(key, {
        key,
        variantId: r.variantId,
        productName: r.productName,
        size: r.size,
        variation: r.variation,
        unitPrice: r.unitPrice,
        requested: r.qty,
        approved: null,
        replacement: false,
        replacedPcs: 0,
        replaces: [],
      })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName),
  )
}

function PartnerJastiperDetailPage() {
  const { id, brandId } = Route.useParams()
  const { data, error, isLoading } = useQuery({
    queryKey: ['partner-jastiper-detail', id, brandId],
    queryFn: () =>
      getPartnerJastiperDetail({ data: { calendarEventId: id, brandId } }),
  })
  const review = usePartnerReview(id, brandId)
  const status = review.data?.status ?? null
  const reviewing = review.submitted && !!review.data?.groups.length
  const verifying = status === 'menunggu_verifikasi'
  const isDraft = !!review.data && !review.submitted

  const rows = useMemo<Array<TableRow>>(() => {
    if (!data) return []
    if (!reviewing || !review.data) return draftRows(data.rows)
    const priceByVariant = new Map<string, number>()
    for (const r of data.rows) {
      if (r.variantId) priceByVariant.set(r.variantId, r.unitPrice)
    }
    const out: Array<TableRow> = []
    for (const g of review.data.groups) {
      const base = {
        variantId: g.variantId,
        productName: g.productName,
        size: g.size,
        variation: g.variation,
        unitPrice: priceByVariant.get(g.variantId) ?? 0,
      }
      const requested = g.requestedPcs + g.replacedPcs
      if (requested > 0 || g.pendingPcs === 0) {
        out.push({
          ...base,
          key: g.variantId,
          requested,
          approved: g.approvedPcs,
          replacement: false,
          replacedPcs: g.replacedPcs,
          replaces: [],
        })
      }
      if (g.pendingPcs > 0) {
        out.push({
          ...base,
          key: `${g.variantId}:pengganti`,
          requested: g.pendingPcs,
          approved: null,
          replacement: true,
          replacedPcs: 0,
          replaces: g.replaces,
        })
      }
    }
    return out
  }, [data, reviewing, review.data])

  const [search, setSearch] = useState('')
  const filtered = rows.filter((row) =>
    row.productName.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const pager = useClientPager(filtered)

  const nameOf = (r: TableRow) =>
    partnerItemName(
      r.productName,
      variantLabel({ size: r.size, variation: r.variation }),
    )
  /** Barang pengganti untuk satu barang yang sudah diganti. */
  const replacementsFor = (variantId: string | null) =>
    rows
      .filter(
        (r) =>
          r.replacement && r.replaces.some((x) => x.variantId === variantId),
      )
      .map(nameOf)
  const allSufficient =
    rows.length > 0 &&
    rows.every((r) => r.replacement || (r.approved ?? r.requested) >= r.requested)

  /** Status baris: Cukup / Kurang N / Menunggu / Sudah diganti / Pengganti. */
  function chipFor(row: TableRow): { label: string; tone: PartnerBadgeTone | 'danger' } {
    if (isDraft || status === null) {
      return { label: 'Belum disubmit', tone: 'neutral' }
    }
    if (row.replacement) return { label: 'Pengganti', tone: 'info' }
    if (verifying && row.replacedPcs > 0) {
      return { label: 'Sudah diganti', tone: 'danger' }
    }
    const live =
      status === 'terkirim' && row.variantId
        ? Number(review.approved[row.variantId] ?? row.requested)
        : (row.approved ?? row.requested)
    const short = row.requested - live
    if (short <= 0) return { label: 'Cukup', tone: 'success' }
    if (verifying) return { label: 'Sudah diganti', tone: 'danger' }
    if (status === 'sanggah') return { label: 'Menunggu', tone: 'danger' }
    return { label: `Kurang ${short}`, tone: 'danger' }
  }

  const columns = [
    ...(verifying ? ['No'] : []),
    'Produk',
    'Ukuran',
    'Variasi',
    'Harga partner',
    'Diminta',
    ...(isDraft ? [] : ['Dapat']),
    'Status',
    ...(verifying ? ['Keterangan'] : []),
  ]
  const rightAligned = new Set(['Harga partner', 'Diminta', 'Dapat'])

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/partner/event/$id"
            params={{ id }}
            aria-label="Kembali"
            className="-ml-1 flex size-8 shrink-0 items-center justify-center lg:hidden"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
              {data?.brandName ?? 'Jastiper'}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
              {partnerPageSubtitle(status)}
            </p>
          </div>
        </div>
        <Link
          to="/partner/event/$id"
          params={{ id }}
          className="app-btn-outline hidden lg:inline-flex"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          Kembali ke event
        </Link>
      </header>

      {error && (
        <div className="app-card p-4 text-sm" style={{ color: '#b42318' }}>
          Gagal memuat detail jastiper.
        </div>
      )}
      {isLoading && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Memuat…
        </p>
      )}

      {data && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-6">
            <PartnerReviewFooter
              review={review}
              hasItems={data.rows.length > 0}
              allSufficient={allSufficient}
              contact={{
                waNumber: data.waNumber,
                brandName: data.brandName,
                totalAmount: data.totalAmount,
              }}
            />

            {!isDraft && (
              <section className="app-card flex flex-col gap-3 p-5">
                <p
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: 'var(--pm-gold)' }}
                >
                  Ringkasan
                </p>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                    Total tagihan
                  </p>
                  <p className="pm-num text-[26px] font-bold leading-tight">
                    {formatRupiah(data.totalAmount)}
                  </p>
                  {verifying && (
                    <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                      Termasuk pengganti (harga sementara)
                    </p>
                  )}
                </div>
                <dl
                  className="flex flex-col border-t pt-1 text-[13px]"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  {[
                    { label: 'Total pcs', value: `${data.totalPcs} pcs` },
                    {
                      label: 'Paket terjual',
                      value: `${data.paketCount} paket · ${data.paketPcs} pcs`,
                    },
                    { label: 'Barang satuan', value: `${data.satuanPcs} pcs` },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                      <dt style={{ color: 'var(--app-text-soft)' }}>{r.label}</dt>
                      <dd className="pm-num font-bold">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section className="app-card flex flex-col gap-2 p-5">
              <p
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: 'var(--pm-gold)' }}
              >
                Kontak jastiper
              </p>
              <p className="text-[13px] font-semibold">
                {data.brandName}
                {data.waNumber ? ` · ${formatPhoneNumber(data.waNumber)}` : ''}
              </p>
              {data.waNumber ? (
                <a
                  href={buildWhatsAppLink(data.waNumber, '')}
                  target="_blank"
                  rel="noreferrer"
                  className="app-btn-outline w-full no-underline"
                  style={{ minHeight: 40, fontSize: 13 }}
                >
                  Hubungi via WhatsApp
                </a>
              ) : (
                <p className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                  Nomor WhatsApp belum diisi.
                </p>
              )}
            </section>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            {rows.length === 0 ? (
              <div className="app-card flex flex-col items-center gap-3 px-8 py-14 text-center">
                <span
                  className="flex size-14 items-center justify-center rounded-full"
                  style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
                >
                  <Ellipsis size={22} />
                </span>
                <p className="text-[15px] font-bold">
                  Jastiper ini belum memasukkan pesanan.
                </p>
                <p className="max-w-md text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                  Barang muncul di sini begitu jastiper menambahkannya, bahkan
                  sebelum submit.
                </p>
              </div>
            ) : (
              <>
                <PartnerTableToolbar
                  search={search}
                  onSearchChange={(value) => {
                    setSearch(value)
                    pager.resetPage()
                  }}
                  placeholder="Cari nama produk"
                  label="Cari nama produk"
                  pager={pager.pager}
                />
                <div className="app-card overflow-x-auto p-0">
                  <table className="w-full text-[13px]">
                    <thead style={{ background: 'var(--pm-tint)' }}>
                      <tr>
                        {columns.map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide ${rightAligned.has(h) ? 'text-right' : 'text-left'}`}
                            style={{ color: 'var(--pm-gold)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pager.paged.map((row, i) => {
                        const chip = chipFor(row)
                        const number = pager.pager.pageSize * (pager.pager.page - 1) + i + 1
                        const editableInput =
                          row.variantId !== null &&
                          ((status === 'terkirim' && !row.replacement) ||
                            (verifying && row.replacement))
                        const inputValue: string | undefined = row.variantId
                          ? (row.replacement ? review.pending : review.approved)[
                              row.variantId
                            ]
                          : undefined
                        const short =
                          Number(inputValue ?? row.requested) < row.requested
                        return (
                          <tr
                            key={row.key}
                            className="border-t"
                            style={{ borderColor: 'var(--app-border)' }}
                          >
                            {verifying && (
                              <td className="pm-num px-4 py-3" style={{ color: 'var(--app-text-soft)' }}>
                                #{number}
                              </td>
                            )}
                            <td className="px-4 py-3 font-bold">{row.productName}</td>
                            <td className="px-4 py-3">{row.size ?? '-'}</td>
                            <td className="px-4 py-3">{row.variation ?? '-'}</td>
                            <td className="pm-num px-4 py-3 text-right">
                              {formatRupiah(row.unitPrice)}
                            </td>
                            <td className="pm-num px-4 py-3 text-right font-bold">
                              {row.requested}
                            </td>
                            {!isDraft && (
                              <td className="px-4 py-3 text-right">
                                {editableInput && row.variantId ? (
                                  <input
                                    type="number"
                                    min={0}
                                    max={row.requested}
                                    inputMode="numeric"
                                    aria-label={`Dapat: ${row.productName} ${row.size ?? ''} ${row.variation ?? ''}`}
                                    value={inputValue ?? ''}
                                    onChange={(e) =>
                                      row.replacement
                                        ? review.setPendingFor(row.variantId as string, e.target.value)
                                        : review.setApprovedFor(row.variantId as string, e.target.value)
                                    }
                                    className="pm-num w-16 rounded-xl border px-2 py-1.5 text-right text-sm font-bold"
                                    style={{
                                      borderColor: short ? '#b42318' : 'var(--app-border)',
                                    }}
                                  />
                                ) : (
                                  <span className="pm-num font-bold">
                                    {row.approved ?? '-'}
                                  </span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <PartnerRowChip label={chip.label} tone={chip.tone} />
                            </td>
                            {verifying && (
                              <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
                                {row.replacement
                                  ? row.replaces.length > 0
                                    ? `pengganti ${row.replaces.map((x) => x.label).join(', ')}`
                                    : 'pengganti barang yang kurang'
                                  : row.replacedPcs > 0
                                    ? `diganti ${replacementsFor(row.variantId).join(', ') || 'barang lain'}`
                                    : '—'}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {isDraft && (
                  <p className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
                    Belum disubmit. Barang belum masuk pengecekan dan tagihan.
                  </p>
                )}
                <Pagination {...pager.pager} className="justify-end" />
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
