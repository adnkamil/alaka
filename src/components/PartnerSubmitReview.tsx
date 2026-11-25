import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageSearch,
  RotateCw,
  X,
} from 'lucide-react'
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
import { allocateApproved, overStockRowIds } from '../lib/partner-stock-review'
import { displayItemName } from '../lib/partner-item-label'
import { usePartnerT } from './PartnerI18n'

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
  const rv = usePartnerT().review
  const submissionsKey = ['partner-submissions', calendarEventId, brandId]
  const stockKey = ['auto-stock-check', calendarEventId]

  const query = useQuery({
    queryKey: submissionsKey,
    queryFn: () =>
      getPartnerSubmissions({ data: { calendarEventId, brandId } }),
    // Mode bar tidak menampilkan daftar submit, jadi tidak perlu memuat semua
    // baris submit (bisa belasan ribu baris untuk event ramai).
    enabled: !barOnly,
  })
  const stockQuery = useQuery({
    queryKey: stockKey,
    queryFn: () => getAutoStockCheckStatus({ data: { calendarEventId } }),
    refetchInterval: (q) =>
      q.state.data?.run?.status === 'running' ? 2_000 : false,
  })

  const [looping, setLooping] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  /** Jumlah pengajuan yang baru selesai dicek di sesi ini, untuk pesan sukses. */
  const [finishedCount, setFinishedCount] = useState<number | null>(null)
  const stock = stockQuery.data
  // Run yang macet (heartbeat basi) tidak dihitung sedang jalan.
  const busy = looping || (stock?.run?.status === 'running' && !stock.isStale)
  const processingId =
    stock?.run?.status === 'running' ? stock.run.currentSubmissionId : null

  // Selain daftar submit di komponen ini, segarkan juga daftar & jumlah per tab
  // di halaman event supaya baris langsung pindah tab tanpa menunggu polling.
  const refreshSubmissions = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: submissionsKey }),
      queryClient.invalidateQueries({
        queryKey: ['partner-submit-list', calendarEventId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['partner-event-revenue', calendarEventId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['partner-jastiper-detail', calendarEventId],
      }),
    ])

  async function runAutoCheck() {
    setLooping(true)
    setStockError(null)
    setFinishedCount(null)
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
        if (next.run?.status !== 'running') {
          if (next.run?.status === 'done') setFinishedCount(next.run.total)
          break
        }
      }
    } catch (err) {
      setStockError(
        err instanceof Error ? err.message : rv.stoppedByError,
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
      setStockError(err instanceof Error ? err.message : rv.stopFailed)
    }
  }

  if (!barOnly && query.isLoading) return <p>{rv.loading}</p>
  if (!barOnly && query.isError) return <p>{rv.loadFailed}</p>
  const brands = (query.data ?? []).filter(
    (b) => brandId === undefined || b.brandId === brandId,
  )

  const paused = stock?.run?.status === 'paused'
  const pending = stock?.pendingCount ?? 0
  const progress = stock?.run
    ? rv.progress(stock.run.processed, stock.run.total)
    : ''

  if (barOnly) {
    return (
      <AutoCheckBar
        status={stock?.run?.status ?? null}
        stale={stock?.isStale ?? false}
        busy={busy}
        processed={stock?.run?.processed ?? 0}
        total={stock?.run?.total ?? 0}
        pending={pending}
        error={stockError}
        finishedCount={finishedCount}
        onStart={runAutoCheck}
        onStop={stopAutoCheck}
        onDismiss={() => {
          setFinishedCount(null)
          setStockError(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4 space-y-2">
        <p className="text-sm">
          {busy
            ? rv.checkingProgress(progress)
            : pending > 0
              ? rv.pendingCount(pending)
              : rv.allChecked}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-stone-800 px-4 py-2 text-white disabled:opacity-50"
            disabled={busy || pending === 0}
            onClick={runAutoCheck}
          >
            {paused ? rv.resumeAuto : rv.startAuto}
          </button>
          {busy && (
            <button
              type="button"
              className="rounded-lg border px-4 py-2"
              onClick={stopAutoCheck}
            >
              {rv.stop}
            </button>
          )}
        </div>
        {paused && !busy && (
          <p className="text-sm text-[var(--app-warning)]">
            {rv.pausedNote}
          </p>
        )}
        {!busy && stock?.run?.status === 'done' && pending > 0 && (
          <p className="text-sm text-[var(--app-warning)]">
            {rv.newAfterDone(pending)}
          </p>
        )}
        {stockError && <p className="text-sm text-[var(--app-danger)]">{stockError}</p>}
      </div>

      {brands.length === 0 ? (
        <p>{rv.noSubmissions}</p>
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
      )}
    </div>
  )
}

type BarTone = 'accent' | 'warning' | 'danger' | 'success'

const toneStyle: Record<BarTone, { bg: string; fg: string }> = {
  accent: { bg: 'var(--app-accent-soft)', fg: 'var(--app-accent)' },
  warning: { bg: 'var(--app-warning-soft)', fg: 'var(--app-warning)' },
  danger: { bg: 'var(--app-danger-soft)', fg: 'var(--app-danger)' },
  success: { bg: 'var(--app-success-soft)', fg: 'var(--app-success)' },
}

/**
 * Bar cek stok otomatis. Hanya muncul kalau ada yang perlu dilakukan: ada
 * pengajuan menunggu, sedang mengecek, berhenti di tengah, gagal, atau baru
 * selesai (pesan sukses hilang sendiri). Kalau semua sudah dicek, bar disembunyikan.
 */
function AutoCheckBar({
  status,
  stale,
  busy,
  processed,
  total,
  pending,
  error,
  finishedCount,
  onStart,
  onStop,
  onDismiss,
}: {
  status: string | null
  stale: boolean
  busy: boolean
  processed: number
  total: number
  pending: number
  error: string | null
  finishedCount: number | null
  onStart: () => void
  onStop: () => void
  onDismiss: () => void
}) {
  const [stopping, setStopping] = useState(false)
  const t = usePartnerT()
  const rv = t.review
  useEffect(() => {
    if (!busy) setStopping(false)
  }, [busy])
  // Pesan sukses hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (finishedCount === null || pending > 0 || error) return
    const timer = setTimeout(onDismiss, 6_000)
    return () => clearTimeout(timer)
  }, [finishedCount, pending, error])

  const interrupted = !busy && (status === 'paused' || stale)
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  let tone: BarTone
  let Icon = PackageSearch
  let title: string
  let hint: string
  if (busy) {
    tone = 'accent'
    Icon = Loader2
    title = stopping ? rv.stopping : rv.checking(processed, total)
    hint = rv.busyHint
  } else if (error) {
    tone = 'danger'
    Icon = AlertTriangle
    title = rv.errorTitle
    hint = error
  } else if (interrupted && pending > 0) {
    tone = 'warning'
    Icon = AlertTriangle
    title = rv.interruptedTitle(processed, total)
    hint = rv.interruptedHint(pending)
  } else if (pending > 0) {
    tone = 'accent'
    title = rv.pendingTitle(pending)
    hint = status === 'done' ? rv.pendingHintNew : rv.pendingHint
  } else if (finishedCount !== null) {
    tone = 'success'
    Icon = CheckCircle2
    title = rv.allChecked
    hint = rv.doneHint(finishedCount)
  } else {
    return null
  }

  const { bg, fg } = toneStyle[tone]
  const showProgress = busy || (interrupted && pending > 0)

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border p-4 sm:p-5"
      style={{
        background: 'var(--app-card)',
        borderColor: 'var(--app-border)',
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: bg, color: fg }}
          aria-hidden
        >
          <Icon size={20} className={busy ? 'animate-spin' : undefined} />
        </span>
        <div className="min-w-[200px] flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p
            className="text-xs"
            style={{ color: tone === 'danger' ? fg : 'var(--app-text-soft)' }}
          >
            {hint}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy ? (
            <button
              type="button"
              className="app-btn-outline"
              style={{ minHeight: 40 }}
              disabled={stopping}
              onClick={() => {
                setStopping(true)
                onStop()
              }}
            >
              {rv.stop}
            </button>
          ) : tone === 'success' ? (
            <button
              type="button"
              aria-label={t.common.close}
              className="grid h-9 w-9 place-items-center rounded-lg"
              style={{ color: 'var(--app-text-soft)' }}
              onClick={onDismiss}
            >
              <X size={18} />
            </button>
          ) : (
            pending > 0 && (
              <button
                type="button"
                className="app-btn-primary"
                style={{ minHeight: 40 }}
                onClick={onStart}
              >
                {error || interrupted ? (
                  <>
                    <RotateCw size={16} />
                    {error ? rv.retry : rv.resume}
                  </>
                ) : (
                  rv.startAuto
                )}
              </button>
            )
          )}
        </div>
      </div>
      {showProgress && (
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--app-border)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${percent}%`,
                background: busy ? 'var(--app-accent)' : fg,
              }}
            />
          </div>
          <span
            className="w-10 text-right text-xs tabular-nums"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {percent}%
          </span>
        </div>
      )}
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
  const rv = usePartnerT().review

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
      setError(err instanceof Error ? err.message : rv.saveFailed),
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
      setError(err instanceof Error ? err.message : rv.cancelFailed),
  })

  const notice =
    otherPendingNos.length > 0
      ? rv.otherPending(
          [...new Set(otherPendingNos)].sort((a, b) => a - b).join(', '),
        )
      : null

  // Baris yang sebagian disetujui: ada baris disetujui dan baris kurang untuk produk yang sama.
  const rejectedKeys = new Set(
    allRows(submission)
      .filter((row) => row.status === 'disanggah')
      .map(productKey),
  )
  const isPartial = (row: ReviewRow) =>
    row.status === 'disetujui' && rejectedKeys.has(productKey(row))

  const mainRows = allRows(submission).filter(
    (row) => row.status !== 'dibatalkan',
  )
  const cancelledRows = allRows(submission).filter(
    (row) => row.status === 'dibatalkan',
  )

  const state = processing
    ? 'processing'
    : submission.checked
      ? 'checked'
      : 'waiting'

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{rv.submitNo(submission.submitNo)}</h3>
        <CheckIcon state={state} />
      </div>
      {notice && <p className="text-sm text-[var(--app-warning)]">{notice}</p>}

      {mainRows.map((row) => (
        <RowLine
          key={row.id}
          row={row}
          label={
            row.status === 'disetujui' && isPartial(row)
              ? rv.partiallyApproved
              : undefined
          }
          value={approved[row.id]}
          overStock={overRows.has(row.id)}
          editable={row.status === 'pengajuan'}
          cancellable={row.status === 'disetujui' && submission.checked}
          cancelling={cancelMutation.isPending}
          onCancel={() => {
            if (
              window.confirm(rv.cancelConfirm)
            ) {
              cancelMutation.mutate(row)
            }
          }}
          onChange={(v) => setApproved((prev) => ({ ...prev, [row.id]: v }))}
        />
      ))}

      {cancelledRows.length > 0 && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs font-semibold text-stone-500">
            {rv.cancelledByPartner}
          </p>
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
          {error && <p className="text-sm text-[var(--app-danger)]">{error}</p>}
          <button
            type="button"
            className="rounded-lg bg-stone-800 px-4 py-2 text-white disabled:opacity-50"
            disabled={mutation.isPending || overRows.size > 0 || processing}
            onClick={() => mutation.mutate()}
          >
            {rv.doneChecking}
          </button>
        </>
      )}
      {rows.length === 0 && error && (
        <p className="text-sm text-[var(--app-danger)]">{error}</p>
      )}
    </div>
  )
}

function CheckIcon({ state }: { state: 'checked' | 'processing' | 'waiting' }) {
  const rv = usePartnerT().review
  if (state === 'processing') {
    return (
      <span
        role="status"
        aria-label={rv.beingChecked}
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
      />
    )
  }
  if (state === 'checked') {
    return (
      <span aria-label={rv.checked} className="text-[var(--app-success)]">
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
  const rv = usePartnerT().review
  const statusLabel =
    label ??
    (row.status === 'pengajuan'
      ? rv.rowWaiting
      : row.status === 'disetujui'
        ? rv.rowApproved
        : row.status === 'disanggah'
          ? rv.rowShort
          : row.status === 'dibatalkan'
            ? rv.rowCancelled
            : '')
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>
        {displayItemName(row.label)}
        {row.kind === 'komponen' ? rv.bundleSuffix : ''}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-stone-500">{statusLabel}</span>
        {editable && row.stock !== null && (
          <span className={overStock ? 'text-[var(--app-danger)]' : 'text-stone-500'}>
            {rv.stockLabel(row.stock)}
          </span>
        )}
        {editable ? (
          <input
            type="number"
            min={0}
            max={row.stock === null ? row.qty : Math.min(row.qty, row.stock)}
            value={value ?? 0}
            onChange={(e) => {
              const cap =
                row.stock === null ? row.qty : Math.min(row.qty, row.stock)
              onChange(
                Math.min(
                  cap,
                  Math.max(0, Math.floor(Number(e.target.value)) || 0),
                ),
              )
            }}
            className="w-20 rounded border px-2 py-1"
            aria-label={rv.approvedQtyFor(displayItemName(row.label))}
          />
        ) : (
          <span>{`${row.qty} pcs`}</span>
        )}
        {cancellable && (
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={cancelling}
            onClick={onCancel}
          >
            {rv.cancelItem}
          </button>
        )}
      </span>
    </div>
  )
}
