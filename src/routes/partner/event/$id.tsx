import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, CalendarDays, MapPin, Pencil } from 'lucide-react'
import CalendarEventParticipants from '../../../components/CalendarEventParticipants'
import { EventDescription } from '../../../components/EventDescription'
import PartnerEventStatusBadge from '../../../components/PartnerEventStatusBadge'
import ConfirmModal from '../../../components/ui/ConfirmModal'
import Toast from '../../../components/ui/Toast'
import { formatDateRange } from '../../../lib/calendar'
import { getErrorMessage } from '../../../lib/error-message'
import { setOwnPartnerEventEnded } from '../../../lib/partner-event-functions'
import { partnerEventStatus } from '../../../lib/partner-event-rules'
import {
  partnerEventParticipantsQuery,
  partnerEventQuery,
} from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'

export const Route = createFileRoute('/partner/event/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(partnerEventQuery(params.id)),
      context.queryClient.ensureQueryData(
        partnerEventParticipantsQuery(params.id),
      ),
    ]),
  component: PartnerEventDetailPage,
})

type Tab = 'info' | 'jastiper'

function PartnerEventDetailPage() {
  const { id } = Route.useParams()
  const { data: event } = useSuspenseQuery(partnerEventQuery(id))
  const { data: participants } = useSuspenseQuery(
    partnerEventParticipantsQuery(id),
  )
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('info')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const status = partnerEventStatus(event, todayIsoDateInAppTimeZone())

  async function handleSetEnded(ended: boolean) {
    setBusy(true)
    try {
      await setOwnPartnerEventEnded({ data: { id, ended } })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partner-events'] }),
        queryClient.invalidateQueries({ queryKey: ['partner-event', id] }),
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
      ])
      setConfirmEnd(false)
    } catch (err) {
      setNotice(getErrorMessage(err, 'Gagal mengubah status event'))
      setConfirmEnd(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-4 pb-8 pt-4">
      <Link
        to="/partner/event"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold no-underline"
        style={{ color: 'var(--app-accent)' }}
      >
        <ArrowLeft size={14} />
        Event
      </Link>

      <div
        className="mb-4 flex w-full items-center justify-center overflow-hidden rounded-2xl"
        style={{
          aspectRatio: '16 / 9',
          background:
            'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
          color: 'white',
        }}
      >
        {event.bannerSrc ? (
          <img
            src={event.bannerSrc}
            alt={event.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <CalendarDays size={36} />
        )}
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <h1 className="text-xl font-bold">{event.name}</h1>
        <PartnerEventStatusBadge status={status} />
      </div>
      <div
        className="mb-4 flex flex-col gap-1 text-xs"
        style={{ color: 'var(--app-text-soft)' }}
      >
        <p className="flex items-center gap-1.5">
          <CalendarDays size={13} />
          {formatDateRange(event.eventDate, event.endDate)}
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin size={13} />
          {event.isOnline ? 'Online · ' : ''}
          {event.location}
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          to="/partner/event/ubah/$id"
          params={{ id }}
          className="app-btn-outline flex flex-1 items-center justify-center gap-1.5 no-underline"
        >
          <Pencil size={14} />
          Ubah event
        </Link>
        {event.isEnded ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSetEnded(false)}
            className="app-btn-outline flex-1 disabled:opacity-50"
          >
            Buka kembali
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmEnd(true)}
            className="app-btn-outline flex-1 disabled:opacity-50"
            style={{ color: 'var(--app-danger)' }}
          >
            Akhiri event
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Isi event">
        {(
          [
            { key: 'info', label: 'Info' },
            { key: 'jastiper', label: `Jastiper ${participants.length}` },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background:
                tab === item.key ? 'var(--app-accent)' : 'var(--app-card)',
              color: tab === item.key ? 'white' : 'var(--app-text-soft)',
              border: '1px solid var(--app-border)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <section className="app-card p-4">
          {event.description ? (
            <EventDescription text={event.description} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Belum ada deskripsi. Tambahkan lewat Ubah event.
            </p>
          )}
        </section>
      ) : (
        <CalendarEventParticipants participants={participants} />
      )}

      <ConfirmModal
        open={confirmEnd}
        title="Akhiri event ini?"
        content="Event langsung hilang dari kalender jastiper. Data jastiper yang sudah ikut tetap tersimpan, dan event bisa dibuka kembali kapan saja."
        okText="Akhiri event"
        loading={busy}
        onOk={() => handleSetEnded(true)}
        onCancel={() => setConfirmEnd(false)}
      />
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </main>
  )
}
