import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import ConfirmModal from './ui/ConfirmModal'
import { useNow } from './EventSlotPanel'
import { formatRemaining, formatWibDateTime } from '../lib/event-slot'
import {
  getEventSlotSummary,
  submitEventToPartner,
} from '../lib/event-slot-functions'

/**
 * Tombol di baris judul event. Sebelum submit: "Submit" (nonaktif sampai slot
 * dibuka) dengan keterangan waktu di bawahnya. Sesudah submit: "Lihat status"
 * yang membuka sheet status pesanan.
 */
export default function EventSlotAction({
  eventId,
  onChanged,
  onOpenStatus,
}: {
  eventId: string
  onChanged: () => Promise<void>
  onOpenStatus: () => void
}) {
  const queryClient = useQueryClient()
  const now = useNow()
  const { data: summary } = useQuery({
    queryKey: ['event-slot', eventId],
    queryFn: () => getEventSlotSummary({ data: { eventId } }),
    refetchInterval: 30_000,
  })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!summary) return null

  const submitted = summary.submittedAt !== null
  const untilClose = formatRemaining(new Date(summary.closesAt), now)
  const canSubmit = summary.status === 'draft' && untilClose !== null
  const needsAttention =
    summary.status === 'sanggah' || summary.status === 'menunggu_verifikasi'

  let caption: string | null = null
  if (summary.status === 'belum_dibuka') {
    caption = `Dibuka ${formatWibDateTime(summary.opensAt)}`
  } else if (canSubmit && untilClose) {
    caption = `Ditutup dalam ${untilClose}`
  } else if (!submitted) {
    caption = 'Slot sudah ditutup'
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await submitEventToPartner({ data: { eventId } })
      await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
      await onChanged()
      setConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim')
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-shrink-0 flex-col items-end gap-1">
      {submitted ? (
        <button
          type="button"
          onClick={onOpenStatus}
          className="app-btn-outline relative"
          style={{ padding: '0.65rem 1.1rem', fontSize: 14 }}
        >
          Lihat status
          {needsAttention && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 h-3 w-3 rounded-full"
              style={{ background: 'var(--app-warning)' }}
            />
          )}
        </button>
      ) : (
        <button
          type="button"
          disabled={!canSubmit || busy}
          onClick={() => setConfirm(true)}
          className="app-btn-primary disabled:opacity-50"
          style={{ padding: '0.65rem 1.3rem', fontSize: 15, gap: '0.4rem' }}
        >
          <Send size={15} />
          Submit
        </button>
      )}
      {caption && (
        <span
          className="whitespace-nowrap text-[11px] tabular-nums"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {caption}
        </span>
      )}
      {error && (
        <span
          className="max-w-40 text-right text-[11px]"
          style={{ color: 'var(--app-danger)' }}
        >
          {error}
        </span>
      )}
      <ConfirmModal
        open={confirm}
        title="Kirim pesanan ke partner?"
        content="Setelah dikirim, semua pesanan di event ini terkunci dan tidak bisa diubah sampai partner selesai mengecek. Urutan kirim menentukan antrean pengecekan."
        okText="Kirim sekarang"
        danger={false}
        loading={busy}
        onOk={submit}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
