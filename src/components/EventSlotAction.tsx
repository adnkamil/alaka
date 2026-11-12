import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useNow } from './EventSlotPanel'
import { formatRemaining, formatWibDateTime } from '../lib/event-slot'
import { getEventSlotSummary } from '../lib/event-slot-functions'

/**
 * Tombol "Status" di baris judul event. Selalu tampil dan membuka halaman
 * status pesanan. Pengiriman (Submit) dilakukan dari halaman status.
 */
export default function EventSlotAction({ eventId }: { eventId: string }) {
  const navigate = useNavigate()
  const now = useNow()
  const { data: summary } = useQuery({
    queryKey: ['event-slot', eventId],
    queryFn: () => getEventSlotSummary({ data: { eventId } }),
    refetchInterval: 30_000,
  })

  if (!summary) return null

  const submitted = summary.submittedAt !== null
  const needsAttention =
    summary.status === 'sanggah' || summary.status === 'menunggu_verifikasi'
  const untilClose = formatRemaining(new Date(summary.closesAt), now)

  let caption: string | null = null
  if (summary.status === 'belum_dibuka') {
    caption = `Dibuka ${formatWibDateTime(summary.opensAt)}`
  } else if (summary.status === 'draft' && untilClose) {
    caption = `Ditutup dalam ${untilClose}`
  } else if (!submitted) {
    caption = 'Slot sudah ditutup'
  }

  return (
    <div className="flex flex-shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() =>
          navigate({ to: '/events/$eventId/status', params: { eventId } })
        }
        className="app-btn-primary relative"
        style={{ padding: '0.65rem 1.3rem', fontSize: 15 }}
      >
        Status
        {needsAttention && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 h-3 w-3 rounded-full"
            style={{ background: 'var(--app-warning)' }}
          />
        )}
      </button>
      {caption && (
        <span
          className="whitespace-nowrap text-[11px] tabular-nums"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {caption}
        </span>
      )}
    </div>
  )
}
