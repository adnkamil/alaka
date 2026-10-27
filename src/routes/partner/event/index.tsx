import { useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, Inbox, MapPin, Plus, Users } from 'lucide-react'
import PartnerEventStatusBadge from '../../../components/PartnerEventStatusBadge'
import { formatDateRange } from '../../../lib/calendar'
import { partnerEventStatus } from '../../../lib/partner-event-rules'
import { partnerEventsQuery } from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import type { PartnerEventStatus } from '../../../lib/partner-event-rules'

export const Route = createFileRoute('/partner/event/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(partnerEventsQuery),
  component: PartnerEventListPage,
})

type Tab = 'all' | PartnerEventStatus

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'berjalan', label: 'Berjalan' },
  { key: 'mendatang', label: 'Mendatang' },
  { key: 'selesai', label: 'Selesai' },
]

function PartnerEventListPage() {
  const { data: events } = useSuspenseQuery(partnerEventsQuery)
  const [tab, setTab] = useState<Tab>('all')
  const today = todayIsoDateInAppTimeZone()

  const withStatus = events.map((event) => ({
    event,
    status: partnerEventStatus(event, today),
  }))
  const counts: Record<Tab, number> = {
    all: withStatus.length,
    berjalan: withStatus.filter((e) => e.status === 'berjalan').length,
    mendatang: withStatus.filter((e) => e.status === 'mendatang').length,
    selesai: withStatus.filter((e) => e.status === 'selesai').length,
  }
  const visible =
    tab === 'all' ? withStatus : withStatus.filter((e) => e.status === tab)

  return (
    <main className="px-4 pb-6 pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Event</h1>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Event kamu tampil di kalender semua jastiper.
          </p>
        </div>
        <Link
          to="/partner/event/baru"
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-white no-underline shadow-sm"
          style={{ background: 'var(--app-accent)' }}
        >
          <Plus size={14} />
          Buat event
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              tab === t.key
                ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-sm'
                : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-accent)]'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.key
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {events.length === 0
              ? 'Belum ada event. Buat event pertama kamu.'
              : 'Belum ada event di kategori ini.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(({ event, status }) => (
            <Link
              key={event.id}
              to="/partner/event/$id"
              params={{ id: event.id }}
              className="app-card block overflow-hidden no-underline"
              style={{ color: 'inherit' }}
            >
              <div
                className="flex w-full items-center justify-center overflow-hidden"
                style={{
                  aspectRatio: '16 / 7',
                  background:
                    'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
                  color: 'white',
                }}
              >
                {event.bannerSrc ? (
                  <img
                    src={event.bannerSrc}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CalendarDays size={28} />
                )}
              </div>
              <div className="flex flex-col gap-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{event.name}</p>
                  <PartnerEventStatusBadge status={status} />
                </div>
                <p
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <CalendarDays size={13} />
                  {formatDateRange(event.eventDate, event.endDate)}
                </p>
                <p
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <MapPin size={13} />
                  <span className="truncate">
                    {event.isOnline ? 'Online · ' : ''}
                    {event.location}
                  </span>
                </p>
                <p
                  className="flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  <Users size={13} />
                  {event.participantCount} jastiper ikut
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
