import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import Pagination from './ui/Pagination'
import PartnerTableToolbar from './ui/PartnerTableToolbar'
import PartnerRowChip from './PartnerRowChip'
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
import type {
  ReviewBrand,
  ReviewRow,
  ReviewSubmission,
} from '../lib/submit-review-queries'

type CheckRow = ReviewRow & { submitNo: number; submissionId: string }

/**
 * Cek pesanan satu jastiper di event partner. Semua submit ditampilkan dalam
 * satu tabel (kolom "Submit ke"). Isi "Dapat" untuk barang pengajuan, lalu
 * tekan Selesai dicek per submit. Pemesan dan harga jual tidak ditampilkan.
 */
export default function PartnerJastiperCheck({
  calendarEventId,
  brandId,
  view,
}: {
  calendarEventId: string
  brandId: string
  /** 'pengajuan' = hanya barang yang menunggu cek; 'disetujui' = hanya barang yang disetujui. */
  view?: 'pengajuan' | 'disetujui'
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const subs = useQuery({
    queryKey: ['partner-submissions', calendarEventId],
    queryFn: () => getPartnerSubmissions({ data: { calendarEventId } }),
  })
  const detail = useQuery({
    queryKey: ['partner-jastiper-detail', calendarEventId, brandId],
    queryFn: () =>
      getPartnerJastiperDetail({ data: { calendarEventId, brandId } }),
  })

  const brand: ReviewBrand | undefined = (subs.data ?? []).find(
    (b) => b.brandId === brandId,
  )
  const submissions = brand?.submissions ?? []
  const allCheckRows = useMemo<Array<CheckRow>>(
    () =>
      submissions.flatMap((sub) =>
        allRows(sub).map((r) => ({
          ...r,
          submitNo: sub.submitNo,
          submissionId: sub.submissionId,
        })),
      ),
    [submissions],
  )
  const rows = useMemo(
    () =>
      view === 'pengajuan'
        ? allCheckRows.filter((r) => r.status === 'pengajuan')
        : view === 'disetujui'
          ? allCheckRows.filter((r) => r.status === 'disetujui' || r.status === 'disanggah')
          : allCheckRows,
    [allCheckRows, view],
  )

  const [search, setSearch] = useState('')
  const filtered = rows.filter((r) =>
    r.productName.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const pager = useClientPager(filtered)

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
  // Tampilan Disetujui tidak menampilkan tombol cek.
  const showPendingCard = view !== 'disetujui' && pendingSubs.length > 0

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
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Gagal menyimpan'),
  })

  const d = detail.data
  const hasRejected = rows.some((r) => r.status === 'disanggah')
  const waLink = d?.waNumber
    ? buildWhatsAppLink(
        d.waNumber,
        `Halo ${d.brandName}, ini dari tim partner untuk pesanan event ini.`,
      )
    : null

  if (subs.isLoading || detail.isLoading) return <p className="text-sm">Memuat…</p>

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
                {['Submit ke', 'Produk', 'Ukuran', 'Variasi', 'Harga partner', 'Stok', 'Diminta', 'Dapat', 'Status'].map((h) => (
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
                        : { label: 'Belum disubmit', tone: 'neutral' as const }
                return (
                  <tr key={row.id} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                    <td className="pm-num px-4 py-3">{row.submitNo}</td>
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
                          onChange={(e) =>
                            setApproved((prev) => ({
                              ...prev,
                              [row.id]: Math.min(maxDapat, Math.max(0, Math.floor(Number(e.target.value)) || 0)),
                            }))
                          }
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
                  <td colSpan={9} className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
                    Belum ada barang yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pager.pager} className="justify-end" />

      </div>

      <div className="flex flex-col gap-3">
        <section className="app-card p-4">
          <PartnerRowChip
            label={showPendingCard ? 'Pengajuan' : 'Disetujui'}
            tone={showPendingCard ? 'info' : 'success'}
          />
          {showPendingCard ? (
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
              {pendingSubs.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/partner/event/jastiper/$id/$brandId',
                      params: { id: calendarEventId, brandId },
                      search: { view: 'pengajuan' },
                    })
                  }
                  className="mt-3 w-full rounded-lg border px-4 py-2 text-[13px] font-semibold"
                >
                  Masih ada barang dalam pengajuan
                </button>
              )}
            </>
          )}
        </section>

        {d && (
          <section className="app-card p-4 text-[13px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pm-gold)' }}>
              Ringkasan
            </p>
            <p className="mt-2" style={{ color: 'var(--app-text-soft)' }}>Total tagihan</p>
            <p className="text-[20px] font-bold">{formatRupiah(d.totalAmount)}</p>
            <div className="mt-3 grid gap-1.5">
              <Row label="Total pcs" value={`${d.totalPcs} pcs`} />
              <Row label="Paket terjual" value={`${d.paketCount} paket · ${d.paketPcs} pcs`} />
              <Row label="Barang satuan" value={`${d.satuanPcs} pcs`} />
            </div>
          </section>
        )}

        {contactCard}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: 'var(--app-text-soft)' }}>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function hasPending(sub: ReviewSubmission) {
  return allRows(sub).some((r) => r.status === 'pengajuan')
}

function allRows(sub: ReviewSubmission): Array<ReviewRow> {
  return [...sub.satuan, ...sub.paket.flatMap((b) => b.rows)]
}
