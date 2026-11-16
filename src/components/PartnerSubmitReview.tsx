import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPartnerSubmissions,
  reviewSubmissionBatch,
} from '../lib/submit-functions'
import type {
  ReviewBrand,
  ReviewRow,
  ReviewSubmission,
} from '../lib/submit-review-queries'
import { pendingSubmitNotice } from '../lib/submit-status'
import { allocateApproved, overStockRowIds } from '../lib/partner-stock-review'

/**
 * Cek partner per submit. Setiap baris pengajuan diisi jumlah yang disetujui.
 * Bagian yang tidak disetujui otomatis disanggah dan tinggal sebagai riwayat.
 * Pemesan dan harga jual jastiper tidak pernah ditampilkan.
 */
export default function PartnerSubmitReview({
  calendarEventId,
  brandId,
}: {
  calendarEventId: string
  /** Kalau diisi, hanya tampilkan submit dari jastiper ini. */
  brandId?: string
}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['partner-submissions', calendarEventId],
    queryFn: () => getPartnerSubmissions({ data: { calendarEventId } }),
  })

  if (query.isLoading) return <p>Memuat pengajuan…</p>
  if (query.isError) return <p>Gagal memuat pengajuan.</p>
  const brands = (query.data ?? []).filter(
    (b) => brandId === undefined || b.brandId === brandId,
  )
  if (brands.length === 0) return <p>Belum ada pengajuan dari jastiper.</p>

  return (
    <div className="space-y-6">
      {brands.map((brand) => (
        <BrandBlock
          key={brand.eventId}
          brand={brand}
          onDone={() =>
            queryClient.invalidateQueries({
              queryKey: ['partner-submissions', calendarEventId],
            })
          }
        />
      ))}
    </div>
  )
}

function BrandBlock({
  brand,
  onDone,
}: {
  brand: ReviewBrand
  onDone: () => void
}) {
  return (
    <section className="space-y-4">
      {brand.submissions.map((sub) => (
        <SubmissionBlock
          key={sub.submissionId}
          submission={sub}
          otherPendingNos={brand.submissions
            .filter(
              (s) =>
                s.submissionId !== sub.submissionId &&
                hasPending(s),
            )
            .map((s) => s.submitNo)}
          onDone={onDone}
        />
      ))}
    </section>
  )
}

function hasPending(sub: ReviewSubmission) {
  return (
    sub.satuan.some((r) => r.status === 'pengajuan') ||
    sub.paket.some((b) => b.rows.some((r) => r.status === 'pengajuan'))
  )
}

function pendingRows(sub: ReviewSubmission): Array<ReviewRow> {
  return [
    ...sub.satuan.filter((r) => r.status === 'pengajuan'),
    ...sub.paket.flatMap((b) => b.rows.filter((r) => r.status === 'pengajuan')),
  ]
}

function SubmissionBlock({
  submission,
  otherPendingNos,
  onDone,
}: {
  submission: ReviewSubmission
  otherPendingNos: Array<number>
  onDone: () => void
}) {
  const rows = pendingRows(submission)
  // Isian awal dibatasi stok varian; baris varian yang sama berbagi stok.
  const [approved, setApproved] = useState<Record<string, number>>(() =>
    allocateApproved(rows),
  )
  const overRows = overStockRowIds(rows, approved)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      reviewSubmissionBatch({
        data: {
          submissionId: submission.submissionId,
          itemDecisions: submission.satuan
            .filter((r) => r.status === 'pengajuan')
            .map((r) => ({ id: r.id, approvedQty: approved[r.id] ?? 0 })),
          componentDecisions: submission.paket.flatMap((b) =>
            b.rows
              .filter((r) => r.status === 'pengajuan')
              .map((r) => ({ id: r.id, approvedQty: approved[r.id] ?? 0 })),
          ),
        },
      }),
    onSuccess: () => {
      setError(null)
      onDone()
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Gagal menyimpan'),
  })

  const notice = pendingSubmitNotice(otherPendingNos)

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">Submit ke-{submission.submitNo}</h3>
      {notice && <p className="text-sm text-amber-700">{notice}</p>}

      {[...submission.satuan, ...submission.paket.flatMap((b) => b.rows)].map(
        (row) => (
          <RowLine
            key={row.id}
            row={row}
            value={approved[row.id]}
            overStock={overRows.has(row.id)}
            editable={row.status === 'pengajuan'}
            onChange={(v) => setApproved((prev) => ({ ...prev, [row.id]: v }))}
          />
        ),
      )}

      {rows.length > 0 && (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            className="rounded-lg bg-stone-800 px-4 py-2 text-white disabled:opacity-50"
            disabled={mutation.isPending || overRows.size > 0}
            onClick={() => mutation.mutate()}
          >
            Selesai dicek
          </button>
        </>
      )}
    </div>
  )
}

function RowLine({
  row,
  value,
  overStock,
  editable,
  onChange,
}: {
  row: ReviewRow
  value: number | undefined
  overStock: boolean
  editable: boolean
  onChange: (v: number) => void
}) {
  const statusLabel =
    row.status === 'pengajuan'
      ? 'Pengajuan'
      : row.status === 'disetujui'
        ? 'Disetujui'
        : row.status === 'disanggah'
          ? 'Ditolak'
          : ''
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>
        {row.label}
        {row.kind === 'komponen' ? ' (paket)' : ''}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-stone-500">{statusLabel}</span>
        {editable && row.stock !== null && (
          <span className={overStock ? 'text-red-600' : 'text-stone-500'}>
            Stok {row.stock}
          </span>
        )}
        {editable ? (
          <input
            type="number"
            min={0}
            max={row.stock === null ? row.qty : Math.min(row.qty, row.stock)}
            value={value ?? 0}
            onChange={(e) => {
              const cap = row.stock === null ? row.qty : Math.min(row.qty, row.stock)
              onChange(Math.min(cap, Math.max(0, Math.floor(Number(e.target.value)) || 0)))
            }}
            className="w-20 rounded border px-2 py-1"
            aria-label={`Jumlah disetujui untuk ${row.label}`}
          />
        ) : (
          <span>{row.qty} pcs</span>
        )}
      </span>
    </div>
  )
}
