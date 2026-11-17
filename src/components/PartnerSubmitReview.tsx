import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelSubmittedRowBatch,
  getPartnerSubmissions,
  reviewSubmissionBatch,
} from '../lib/submit-functions'
import {
  getAutoStockCheckStatus,
  runAutoStockCheckStep,
  startAutoStockCheck,
  stopAutoStockCheck,
} from '../lib/stock-check-functions'
import type {
  ReviewBrand,
  ReviewRow,
  ReviewSubmission,
} from '../lib/submit-review-queries'
import { pendingSubmitNotice } from '../lib/submit-status'
import { allocateApproved, overStockRowIds } from '../lib/partner-stock-review'

/**
 * Cek partner per submit. Ada dua cara: cek stok otomatis untuk semua submit
 * yang menunggu, atau cek manual satu per satu. Pemesan dan harga jual jastiper
 * tidak pernah ditampilkan.
 */
export default function PartnerSubmitReview({
  calendarEventId,
  brandId,
  barOnly = false,
}: {
  calendarEventId: string
  /** Kalau diisi, hanya tampilkan submit dari jastiper ini. */
  brandId?: string
  /** Hanya tampilkan tombol cek otomatis dan statusnya (daftar submit ada di tempat lain). */
  barOnly?: boolean
}) {
  const queryClient = useQueryClient()
  const submissionsKey = ['partner-submissions', calendarEventId]
  const stockKey = ['auto-stock-check', calendarEventId]

  const query = useQuery({
    queryKey: submissionsKey,
    queryFn: () => getPartnerSubmissions({ data: { calendarEventId } }),
  })
  const stockQuery = useQuery({
    queryKey: stockKey,
    queryFn: () => getAutoStockCheckStatus({ data: { calendarEventId } }),
    refetchInterval: (q) =>
      q.state.data?.run?.status === 'running' ? 2_000 : false,
  })

  const [looping, setLooping] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const stock = stockQuery.data
  const busy = looping || stock?.run?.status === 'running'
  const processingId = stock?.run?.status === 'running'
    ? stock.run.currentSubmissionId
    : null

  const refreshSubmissions = () =>
    queryClient.invalidateQueries({ queryKey: submissionsKey })

  async function runAutoCheck() {
    setLooping(true)
    setStockError(null)
    try {
      queryClient.setQueryData(
        stockKey,
        await startAutoStockCheck({ data: { calendarEventId } }),
      )
      // Setiap putaran berhenti sendiri sebelum batas waktu. Ulangi sampai
      // selesai, dihentikan partner, atau gagal.
      for (;;) {
        const next = await runAutoStockCheckStep({ data: { calendarEventId } })
        queryClient.setQueryData(stockKey, next)
        refreshSubmissions()
        if (next.run?.status !== 'running') break
      }
    } catch (err) {
      setStockError(
        err instanceof Error ? err.message : 'Pengecekan berhenti karena gangguan.',
      )
    } finally {
      setLooping(false)
      queryClient.invalidateQueries({ queryKey: stockKey })
      refreshSubmissions()
    }
  }

  async function stopAutoCheck() {
    try {
      queryClient.setQueryData(
        stockKey,
        await stopAutoStockCheck({ data: { calendarEventId } }),
      )
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Gagal menghentikan')
    }
  }

  if (!barOnly && query.isLoading) return <p>Memuat pengajuan…</p>
  if (!barOnly && query.isError) return <p>Gagal memuat pengajuan.</p>
  const brands = (query.data ?? []).filter(
    (b) => brandId === undefined || b.brandId === brandId,
  )

  const paused = stock?.run?.status === 'paused'
  const pending = stock?.pendingCount ?? 0
  const progress = stock?.run
    ? `${stock.run.processed} dari ${stock.run.total} pengajuan`
    : ''

  if (barOnly) {
    const processed = stock?.run?.processed ?? 0
    const total = stock?.run?.total ?? 0
    const percent = busy
      ? total > 0
        ? Math.round((processed / total) * 100)
        : 0
      : stock?.run?.status === 'done' && pending === 0
        ? 100
        : 0
    const label = busy
      ? `Sedang mengecek ${processed} dari ${total} pengajuan`
      : pending > 0
        ? `${pending} pengajuan belum dicek`
        : 'Semua pengajuan sudah dicek'
    return (
      <div
        className="flex flex-wrap items-center gap-5 rounded-2xl border p-5"
        style={{ background: 'var(--app-card)', borderColor: 'var(--app-border)' }}
      >
        <div className="min-w-[220px] flex-1 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold">{label}</p>
            {busy && total > 0 && (
              <p className="text-xs tabular-nums" style={{ color: 'var(--app-text-soft)' }}>
                {percent}%
              </p>
            )}
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--app-border)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${percent}%`, background: 'var(--app-accent)' }}
            />
          </div>
          {paused && !busy && (
            <p className="text-xs" style={{ color: '#b45309' }}>
              Berhenti di tengah. Lanjutkan untuk mengecek sisanya.
            </p>
          )}
          {!busy && stock?.run?.status === 'done' && pending > 0 && (
            <p className="text-xs" style={{ color: '#b45309' }}>
              Ada {pending} pengajuan baru setelah pengecekan terakhir.
            </p>
          )}
          {stockError && (
            <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
              {stockError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <button
              type="button"
              className="app-btn-outline"
              style={{ minHeight: 44 }}
              onClick={stopAutoCheck}
            >
              Hentikan
            </button>
          )}
          <button
            type="button"
            disabled={busy || pending === 0}
            onClick={runAutoCheck}
            className="rounded-xl px-6 font-semibold text-white disabled:opacity-50"
            style={{ minHeight: 44, background: 'var(--app-accent)' }}
          >
            {paused ? 'Lanjutkan cek otomatis' : 'Cek stok otomatis'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4 space-y-2">
        <p className="text-sm">
          {busy
            ? `Sedang mengecek ${progress}…`
            : pending > 0
              ? `${pending} pengajuan belum dicek`
              : 'Semua pengajuan sudah dicek'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-stone-800 px-4 py-2 text-white disabled:opacity-50"
            disabled={busy || pending === 0}
            onClick={runAutoCheck}
          >
            {paused ? 'Lanjutkan cek otomatis' : 'Cek stok otomatis'}
          </button>
          {busy && (
            <button
              type="button"
              className="rounded-lg border px-4 py-2"
              onClick={stopAutoCheck}
            >
              Hentikan
            </button>
          )}
        </div>
        {paused && !busy && (
          <p className="text-sm text-amber-700">
            Pengecekan berhenti di tengah. Lanjutkan untuk mengecek sisanya.
          </p>
        )}
        {!busy && stock?.run?.status === 'done' && pending > 0 && (
          <p className="text-sm text-amber-700">
            Ada {pending} pengajuan baru yang masuk setelah pengecekan terakhir.
            Tekan cek stok otomatis untuk mengecek.
          </p>
        )}
        {stockError && <p className="text-sm text-red-600">{stockError}</p>}
      </div>

      {!barOnly &&
        (brands.length === 0 ? (
          <p>Belum ada pengajuan dari jastiper.</p>
        ) : (
          brands.map((brand) => (
            <BrandBlock
              key={brand.eventId}
              brand={brand}
              calendarEventId={calendarEventId}
              processingId={processingId}
              onDone={() => {
                refreshSubmissions()
                queryClient.invalidateQueries({ queryKey: stockKey })
              }}
            />
          ))
        ))}
    </div>
  )
}

function BrandBlock({
  brand,
  calendarEventId,
  processingId,
  onDone,
}: {
  brand: ReviewBrand
  calendarEventId: string
  processingId: string | null
  onDone: () => void
}) {
  return (
    <section className="space-y-4">
      {brand.submissions.map((sub) => (
        <SubmissionBlock
          key={sub.submissionId}
          submission={sub}
          calendarEventId={calendarEventId}
          processing={processingId === sub.submissionId}
          otherPendingNos={brand.submissions
            .filter((s) => s.submissionId !== sub.submissionId && hasPending(s))
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

function allRows(sub: ReviewSubmission): Array<ReviewRow> {
  return [...sub.satuan, ...sub.paket.flatMap((b) => b.rows)]
}

function pendingRows(sub: ReviewSubmission): Array<ReviewRow> {
  return allRows(sub).filter((r) => r.status === 'pengajuan')
}

/** Kunci produk, untuk mengenali baris yang disetujui sebagian. */
function productKey(row: ReviewRow) {
  return row.partnerVariantId ?? row.label
}

function SubmissionBlock({
  submission,
  calendarEventId,
  processing,
  otherPendingNos,
  onDone,
}: {
  submission: ReviewSubmission
  calendarEventId: string
  processing: boolean
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

  const cancelMutation = useMutation({
    mutationFn: (row: ReviewRow) =>
      cancelSubmittedRowBatch({
        data: { kind: row.kind, id: row.id, calendarEventId },
      }),
    onSuccess: () => {
      setError(null)
      onDone()
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Gagal membatalkan'),
  })

  const notice = pendingSubmitNotice(otherPendingNos)

  // Baris yang sebagian disetujui: ada baris disetujui dan baris kurang untuk produk yang sama.
  const rejectedKeys = new Set(
    allRows(submission)
      .filter((r) => r.status === 'disanggah')
      .map(productKey),
  )
  const isPartial = (row: ReviewRow) =>
    row.status === 'disetujui' && rejectedKeys.has(productKey(row))

  const mainRows = allRows(submission).filter((r) => r.status !== 'dibatalkan')
  const cancelledRows = allRows(submission).filter(
    (r) => r.status === 'dibatalkan',
  )

  const state = processing ? 'processing' : submission.checked ? 'checked' : 'waiting'

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Submit ke-{submission.submitNo}</h3>
        <CheckIcon state={state} />
      </div>
      {notice && <p className="text-sm text-amber-700">{notice}</p>}

      {mainRows.map((row) => (
        <RowLine
          key={row.id}
          row={row}
          label={
            row.status === 'disetujui' && isPartial(row)
              ? 'Sebagian disetujui'
              : undefined
          }
          value={approved[row.id]}
          overStock={overRows.has(row.id)}
          editable={row.status === 'pengajuan'}
          cancellable={row.status === 'disetujui' && submission.checked}
          cancelling={cancelMutation.isPending}
          onCancel={() => {
            if (window.confirm('Batalkan item ini? Stok akan kembali ke katalog.')) {
              cancelMutation.mutate(row)
            }
          }}
          onChange={(v) => setApproved((prev) => ({ ...prev, [row.id]: v }))}
        />
      ))}

      {cancelledRows.length > 0 && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs font-semibold text-stone-500">Dibatalkan partner</p>
          {cancelledRows.map((row) => (
            <RowLine
              key={row.id}
              row={row}
              value={undefined}
              overStock={false}
              editable={false}
              cancellable={false}
              cancelling={false}
              onCancel={() => {}}
              onChange={() => {}}
            />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            className="rounded-lg bg-stone-800 px-4 py-2 text-white disabled:opacity-50"
            disabled={mutation.isPending || overRows.size > 0 || processing}
            onClick={() => mutation.mutate()}
          >
            Selesai dicek
          </button>
        </>
      )}
      {rows.length === 0 && error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

function CheckIcon({
  state,
}: {
  state: 'checked' | 'processing' | 'waiting'
}) {
  if (state === 'processing') {
    return (
      <span
        role="status"
        aria-label="Sedang dicek"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
      />
    )
  }
  if (state === 'checked') {
    return (
      <span aria-label="Sudah dicek" className="text-green-700">
        ✓
      </span>
    )
  }
  return null
}

function RowLine({
  row,
  label,
  value,
  overStock,
  editable,
  cancellable,
  cancelling,
  onCancel,
  onChange,
}: {
  row: ReviewRow
  label?: string
  value: number | undefined
  overStock: boolean
  editable: boolean
  cancellable: boolean
  cancelling: boolean
  onCancel: () => void
  onChange: (v: number) => void
}) {
  const statusLabel =
    label ??
    (row.status === 'pengajuan'
      ? 'Menunggu dicek'
      : row.status === 'disetujui'
        ? 'Disetujui'
        : row.status === 'disanggah'
          ? 'Kurang'
          : row.status === 'dibatalkan'
            ? 'Dibatalkan'
            : '')
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
              onChange(
                Math.min(cap, Math.max(0, Math.floor(Number(e.target.value)) || 0)),
              )
            }}
            className="w-20 rounded border px-2 py-1"
            aria-label={`Jumlah disetujui untuk ${row.label}`}
          />
        ) : (
          <span>{row.qty} pcs</span>
        )}
        {cancellable && (
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={cancelling}
            onClick={onCancel}
          >
            Batalkan
          </button>
        )}
      </span>
    </div>
  )
}
