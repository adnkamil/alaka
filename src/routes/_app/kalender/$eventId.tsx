import { useState } from 'react'
import {
  queryOptions,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, CalendarDays, MapPin, Store } from 'lucide-react'
import {
  getCalendarEvent,
  joinCalendarEvent,
} from '../../../lib/calendar-events-functions'
import { listFeeRules } from '../../../lib/fee-rules-functions'
import { formatDateRange, isCalendarEventFinished } from '../../../lib/calendar'
import { isCalendarEventJoinable } from '../../../lib/calendar-join'
import { currentUserQuery } from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import { EventDescription } from '../../../components/EventDescription'
import JoinEventSheet from '../../../components/JoinEventSheet'
import PartnerShowcase from '../../../components/PartnerShowcase'

const calendarEventQuery = (id: string) =>
  queryOptions({
    queryKey: ['calendar-event', id],
    queryFn: () => getCalendarEvent({ data: { id } }),
  })

const feeRulesQuery = queryOptions({
  queryKey: ['fee-rules'],
  queryFn: () => listFeeRules(),
})

export const Route = createFileRoute('/_app/kalender/$eventId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(calendarEventQuery(params.eventId)),
  component: CalendarEventDetailPage,
})

function CalendarEventDetailPage() {
  const { eventId } = Route.useParams()
  const { data: event } = useSuspenseQuery(calendarEventQuery(eventId))
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const [showJoinSheet, setShowJoinSheet] = useState(false)
  // Aturan fee baru dimuat saat sheet dibuka: kebanyakan pengunjung halaman
  // ini tidak menekan "Ikut Event".
  const { data: feeRules = [] } = useQuery({
    ...feeRulesQuery,
    enabled: showJoinSheet,
  })

  const today = todayIsoDateInAppTimeZone()
  const myJoinedEventId = event.myEventId
  const alreadyJoined = myJoinedEventId !== null
  const canJoin = isCalendarEventJoinable(event, today)
  // Tombol hanya muncul kalau sudah ikut (jadi "Lihat Event Saya") atau
  // eventnya masih bisa diikuti.
  const showActionBar = alreadyJoined || canJoin

  async function handleJoin(feeRuleId: string | null) {
    const { eventId: myEventId } = await joinCalendarEvent({
      data: { calendarEventId: eventId, feeRuleId },
    })
    // Daftar event belanja (beranda) dan status tombol ikut berubah.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['events'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-event', eventId] }),
    ])
    await navigate({ to: '/events/$eventId', params: { eventId: myEventId } })
  }

  return (
    <main
      className="mx-auto max-w-lg"
      style={{ paddingBottom: showActionBar ? '7rem' : '2.5rem' }}
    >
      {/* Banner. Tombol kembali menumpang di atasnya supaya tetap terlihat
          walau gambar terang atau belum ada. */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '16 / 9',
          background:
            'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
        }}
      >
        {event.bannerSrc ? (
          <img
            src={event.bannerSrc}
            alt={`Banner ${event.name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center opacity-40">
            <CalendarDays size={48} color="white" />
          </span>
        )}
        <Link
          to="/kalender"
          search={{ tanggal: event.eventDate }}
          aria-label="Kembali ke kalender"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            background: 'rgba(0, 0, 0, 0.45)',
            color: 'white',
            top: 'max(0.75rem, env(safe-area-inset-top))',
          }}
        >
          <ArrowLeft size={20} />
        </Link>
      </div>

      <div className="px-4 pt-5">
        <h1 className="text-xl font-bold">{event.name}</h1>

        {isCalendarEventFinished(event, todayIsoDateInAppTimeZone()) && (
          <p
            className="mt-3 rounded-xl px-3 py-2 text-sm font-medium"
            style={{
              background: 'var(--app-accent-soft)',
              color: 'var(--app-accent)',
            }}
          >
            Event ini sudah berakhir.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <p
            className="flex items-start gap-2 text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <CalendarDays size={16} className="mt-0.5 flex-shrink-0" />
            <span>{formatDateRange(event.eventDate, event.endDate)}</span>
          </p>
          <p
            className="flex items-start gap-2 text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <MapPin size={16} className="mt-0.5 flex-shrink-0" />
            <span>{event.location}</span>
          </p>
        </div>

        {event.description && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Tentang event</h2>
            <EventDescription text={event.description} />
          </section>
        )}

        {event.showcase && <PartnerShowcase showcase={event.showcase} />}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Brand yang dipamerkan</h2>
          {event.exhibitors.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Daftar brand belum tersedia.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {event.exhibitors.map((brand) => (
                <li
                  key={brand}
                  className="app-card flex items-center gap-1.5 px-3 py-1.5 text-sm"
                >
                  <Store
                    size={14}
                    style={{ color: 'var(--app-accent)' }}
                    className="flex-shrink-0"
                  />
                  {brand}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {showActionBar && (
        <div
          className="fixed bottom-0 left-1/2 z-30 w-full -translate-x-1/2 border-t px-4 pt-4"
          style={{
            maxWidth: 480,
            borderColor: 'var(--app-border)',
            background: 'var(--app-card)',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
        >
          {myJoinedEventId ? (
            <Link
              to="/events/$eventId"
              params={{ eventId: myJoinedEventId }}
              className="app-btn-primary h-12 w-full"
            >
              Lihat Event Saya
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowJoinSheet(true)}
              className="app-btn-primary h-12 w-full"
            >
              Ikut Event
            </button>
          )}
        </div>
      )}

      {showJoinSheet && !alreadyJoined && (
        <JoinEventSheet
          feeRules={feeRules}
          eventName={event.name}
          dateLabel={formatDateRange(event.eventDate, event.endDate)}
          hasWaNumber={Boolean(user?.waNumber)}
          canEditWaNumber={user?.brandRole === 'owner'}
          onConfirm={handleJoin}
          onClose={() => setShowJoinSheet(false)}
        />
      )}
    </main>
  )
}
