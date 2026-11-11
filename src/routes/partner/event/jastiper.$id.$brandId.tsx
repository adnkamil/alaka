import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, PackageCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import PartnerReviewFooter from '../../../components/PartnerReviewFooter'
import { buildWhatsAppLink, formatPhoneNumber } from '../../../lib/format'
import { formatRupiah } from '../../../lib/partner-product-rules'
import PartnerTableToolbar from '../../../components/ui/PartnerTableToolbar'
import { useClientPager } from '../../../lib/use-client-pager'
import { usePartnerReview } from '../../../lib/use-partner-review'
import {
  getPartnerJastiperDetail,
  type JastiperDetailRow,
} from '../../../lib/partner-jastiper-detail'

export const Route = createFileRoute('/partner/event/jastiper/$id/$brandId')({
  component: PartnerJastiperDetailPage,
})

type GroupedRow = {
  key: string
  /** Varian produk; kunci pencocokan dengan hasil pengecekan. */
  variantId: string | null
  /** Diisi saat mode cek: jumlah diminta dan pcs pengganti yang menunggu verifikasi. */
  requested?: number
  pendingPcs?: number
  productName: string
  size: string | null
  variation: string | null
  ruleName: string | null
  qty: number
  unitPrice: number
}

/**
 * Gabungkan baris. Dengan "Pisahkan paket" nyala, tiap jenis paket dan
 * barang satuan jadi baris sendiri. Kalau mati, semua pcs untuk produk yang
 * sama digabung jadi satu baris tanpa kolom jenis paket.
 */
function groupRows(
  rows: Array<JastiperDetailRow>,
  split: boolean,
): Array<GroupedRow> {
  const map = new Map<string, GroupedRow>()
  for (const r of rows) {
    const key = [
      r.productName,
      r.size ?? '',
      r.variation ?? '',
      split ? (r.ruleId ?? 'satuan') : '',
    ].join('|')
    const existing = map.get(key)
    if (existing) {
      existing.qty += r.qty
    } else {
      map.set(key, {
        key,
        variantId: r.variantId,
        productName: r.productName,
        size: r.size,
        variation: r.variation,
        ruleName: split ? (r.ruleName ?? null) : null,
        qty: r.qty,
        unitPrice: r.unitPrice,
      })
    }
  }
  return [...map.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName),
  )
}

function PartnerJastiperDetailPage() {
  const { id, brandId } = Route.useParams()
  const [split, setSplit] = useState(false)
  const { data, error, isLoading } = useQuery({
    queryKey: ['partner-jastiper-detail', id, brandId],
    queryFn: () =>
      getPartnerJastiperDetail({ data: { calendarEventId: id, brandId } }),
  })

  const review = usePartnerReview(id, brandId)
  // Cek barang dilakukan per varian, jadi hanya di tampilan gabungan.
  const reviewing = !split && review.submitted && !!review.data?.groups.length

  const grouped = useMemo(() => {
    if (!data) return []
    if (!reviewing || !review.data) return groupRows(data.rows, split)
    const priceByVariant = new Map<string, number>()
    for (const r of data.rows) {
      if (r.variantId) priceByVariant.set(r.variantId, r.unitPrice)
    }
    return review.data.groups.map(
      (g): GroupedRow => ({
        key: g.variantId,
        variantId: g.variantId,
        productName: g.productName,
        size: g.size,
        variation: g.variation,
        ruleName: null,
        qty: g.requestedPcs,
        requested: g.requestedPcs,
        pendingPcs: g.pendingPcs,
        unitPrice: priceByVariant.get(g.variantId) ?? 0,
      }),
    )
  }, [data, split, reviewing, review.data])
  const hasPending = reviewing && grouped.some((g) => (g.pendingPcs ?? 0) > 0)
  const [search, setSearch] = useState('')
  const filteredGrouped = grouped.filter((row) =>
    row.productName.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const groupedPager = useClientPager(filteredGrouped)

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
            <p
              className="mt-1 text-[13px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Detail pesanan jastiper di event ini
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
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <aside className="app-card flex flex-col gap-5 p-5 lg:order-last lg:sticky lg:top-6">
              <div className="flex flex-col gap-3">
                <p
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: 'var(--pm-gold)' }}
                >
                  Ringkasan pesanan
                </p>
                <dl
                  className="flex flex-col divide-y text-[13px]"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  {[
                    { label: 'Jumlah pesanan', value: `${data.orderCount}` },
                    { label: 'Total pcs', value: `${data.totalPcs} pcs` },
                    {
                      label: 'Paket terjual',
                      value: `${data.paketCount} paket · ${data.paketPcs} pcs`,
                    },
                    { label: 'Barang satuan', value: `${data.satuanPcs} pcs` },
                  ].map((r) => (
                    <div
                      key={r.label}
                      className="flex items-center justify-between gap-3 py-2.5"
                      style={{ borderColor: 'var(--app-border)' }}
                    >
                      <dt style={{ color: 'var(--app-text-soft)' }}>
                        {r.label}
                      </dt>
                      <dd className="pm-num font-bold">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div
                className="flex flex-col gap-1.5 rounded-2xl p-4"
                style={{ background: 'var(--app-accent-soft)' }}
              >
                <p
                  className="text-[12px] font-semibold"
                  style={{ color: '#9c463b' }}
                >
                  Total tagihan (harga partner)
                </p>
                <p
                  className="pm-num text-[28px] font-bold leading-tight"
                  style={{ color: '#9c463b' }}
                >
                  {formatRupiah(data.totalAmount)}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: '#9c463b', opacity: 0.8 }}
                >
                  Dihitung dari harga produk partner × pcs
                </p>
              </div>

              <div
                className="flex flex-col gap-2 border-t pt-5"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <p
                  className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: 'var(--pm-gold)' }}
                >
                  Kontak jastiper
                </p>
                <p className="text-sm font-bold">{data.brandName}</p>
                {data.waNumber ? (
                  <>
                    <p
                      className="pm-num text-[13px]"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {formatPhoneNumber(data.waNumber)}
                    </p>
                    <a
                      href={buildWhatsAppLink(data.waNumber, '')}
                      target="_blank"
                      rel="noreferrer"
                      className="app-btn-outline mt-1 gap-2 no-underline"
                      style={{ minHeight: 40, fontSize: 13 }}
                    >
                      Hubungi via WhatsApp
                    </a>
                  </>
                ) : (
                  <p
                    className="text-[13px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Nomor WhatsApp belum diisi.
                  </p>
                )}
              </div>
            </aside>

            <div className="flex min-w-0 flex-col gap-4">
              <PartnerReviewFooter review={review} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={split}
                  onClick={() => setSplit((v) => !v)}
                  className={`pm-chip ${split ? 'pm-chip--active' : ''}`}
                >
                  Pisahkan paket
                </button>
                {split && review.submitted && (
                  <span
                    className="text-[12px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Matikan &quot;Pisahkan paket&quot; untuk mengisi jumlah yang
                    dapat.
                  </span>
                )}
              </div>

              {data.rows.length === 0 ? (
                <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
                  <PackageCheck
                    size={28}
                    style={{ color: 'var(--app-text-soft)' }}
                  />
                  <p
                    className="text-sm"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Belum ada barang dari jastiper ini.
                  </p>
                </div>
              ) : (
                <>
                <PartnerTableToolbar
                  search={search}
                  onSearchChange={(value) => {
                    setSearch(value)
                    groupedPager.resetPage()
                  }}
                  placeholder="Cari nama produk"
                  label="Cari nama produk"
                  pager={groupedPager.pager}
                />
                <div className="app-card overflow-x-auto p-0">
                  <table className="w-full text-[13px]">
                    <thead style={{ background: 'var(--pm-tint)' }}>
                      <tr>
                        {[
                          'Produk',
                          'Ukuran',
                          'Variasi',
                          ...(split ? ['Jenis paket'] : []),
                          'Harga partner',
                          ...(reviewing
                            ? [
                                'Diminta (pcs)',
                                'Dapat (pcs)',
                                ...(hasPending ? ['Pengganti dapat'] : []),
                              ]
                            : ['Qty (pcs)']),
                        ].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-left text-[11px] font-semibold ${h.startsWith('Qty') || h === 'Harga partner' || (reviewing && h !== 'Produk' && h !== 'Ukuran' && h !== 'Variasi') ? 'text-right' : ''}`}
                            style={{ color: 'var(--app-text-soft)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupedPager.paged.map((row) => (
                        <tr
                          key={row.key}
                          className="border-t"
                          style={{ borderColor: 'var(--app-border)' }}
                        >
                          <td className="px-4 py-3 font-bold">
                            {row.productName}
                          </td>
                          <td className="px-4 py-3">{row.size ?? '-'}</td>
                          <td className="px-4 py-3">{row.variation ?? '-'}</td>
                          {split && (
                            <td className="px-4 py-3">
                              <span className="app-badge">
                                {row.ruleName
                                  ? `Paket: ${row.ruleName}`
                                  : 'Satuan'}
                              </span>
                            </td>
                          )}
                          <td className="pm-num px-4 py-3 text-right">
                            {formatRupiah(row.unitPrice)}
                          </td>
                          {reviewing && row.variantId ? (
                            <>
                              <td className="pm-num px-4 py-3 text-right text-sm font-bold">
                                {row.requested}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={row.requested}
                                  inputMode="numeric"
                                  aria-label={`Dapat: ${row.productName} ${row.size ?? ''} ${row.variation ?? ''}`}
                                  value={review.approved[row.variantId] ?? ''}
                                  onChange={(e) =>
                                    review.setApprovedFor(
                                      row.variantId as string,
                                      e.target.value,
                                    )
                                  }
                                  className="pm-num w-20 rounded-xl border px-2 py-1.5 text-right text-sm font-bold"
                                  style={{
                                    borderColor: 'var(--app-border)',
                                    color:
                                      Number(
                                        review.approved[row.variantId] ??
                                          row.requested,
                                      ) < (row.requested ?? 0)
                                        ? '#b42318'
                                        : 'var(--app-accent)',
                                  }}
                                />
                              </td>
                              {hasPending && (
                                <td className="px-4 py-3 text-right">
                                  {(row.pendingPcs ?? 0) > 0 ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0}
                                        max={row.pendingPcs}
                                        inputMode="numeric"
                                        aria-label={`Pengganti dapat: ${row.productName}`}
                                        value={
                                          review.pending[row.variantId] ?? ''
                                        }
                                        onChange={(e) =>
                                          review.setPendingFor(
                                            row.variantId as string,
                                            e.target.value,
                                          )
                                        }
                                        className="pm-num w-16 rounded-xl border px-2 py-1.5 text-right text-sm"
                                        style={{
                                          borderColor: 'var(--app-border)',
                                        }}
                                      />
                                      <span
                                        className="text-[12px]"
                                        style={{
                                          color: 'var(--app-text-soft)',
                                        }}
                                      >
                                        / {row.pendingPcs}
                                      </span>
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              )}
                            </>
                          ) : (
                            <td
                              className="pm-num px-4 py-3 text-right text-sm font-bold"
                              style={{ color: 'var(--app-accent)' }}
                            >
                              {row.qty}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
