import { useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronRight,
  Image as ImageIcon,
  Inbox,
  MapPin,
  Plus,
} from 'lucide-react'
import PartnerEventStatusBadge from '../../../components/PartnerEventStatusBadge'
import { formatDateRange } from '../../../lib/calendar'
import { partnerEventStatus } from '../../../lib/partner-event-rules'
import { partnerEventsQuery } from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import type { PartnerEventRow } from '../../../lib/partner-event-queries'
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
  const visible =
    tab === 'all' ? withStatus : withStatus.filter((e) => e.status === tab)

  const counts: Record<Tab, number> = {
    all: withStatus.length,
    berjalan: withStatus.filter((e) => e.status === 'berjalan').length,
    mendatang: withStatus.filter((e) => e.status === 'mendatang').length,
    selesai: withStatus.filter((e) => e.status === 'selesai').length,
  }

  return (
    <>
      <main className="flex flex-col gap-3.5 px-5 pb-[150px] pt-4 lg:hidden">
        <h1 className="pm-display text-[22px] leading-tight">Event</h1>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`pm-chip ${tab === t.key ? 'pm-chip--active' : ''}`}
            >
              {t.label}
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
          <div className="flex flex-col gap-3.5">
            {visible.map(({ event, status }) => (
              <Link
                key={event.id}
                to="/partner/event/$id"
                params={{ id: event.id }}
                className="app-card block overflow-hidden no-underline"
                style={{ color: 'inherit' }}
              >
                <div
                  className="flex h-[84px] w-full items-center justify-center overflow-hidden"
                  style={{
                    background: event.bannerSrc ? undefined : 'var(--pm-tint)',
                    color: 'var(--app-text-mute)',
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
                    <ImageIcon size={26} />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="pm-display text-base leading-snug">
                      {event.name}
                    </p>
                    <PartnerEventStatusBadge status={status} />
                  </div>
                  <p
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    <CalendarDays size={14} />
                    {formatDateRange(event.eventDate, event.endDate)}
                  </p>
                  <p
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    <MapPin size={14} />
                    <span className="truncate">
                      {event.isOnline ? 'Online · ' : ''}
                      {event.location}
                    </span>
                  </p>
                  <div className="flex items-center justify-between pt-0.5">
                    <span
                      className="app-badge"
                      style={{
                        background: 'var(--app-success-soft)',
                        color: 'var(--app-success)',
                      }}
                    >
                      {event.participantCount} jastiper ikut
                    </span>
                    <ChevronRight
                      size={18}
                      style={{ color: 'var(--app-text-mute)' }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="pm-footer">
          <Link
            to="/partner/event/baru"
            className="app-btn-primary w-full gap-2 no-underline"
          >
            <Plus size={18} />
            Buat event
          </Link>
        </div>
      </main>
      <EventsDesktop
        events={events}
        visible={visible}
        counts={counts}
        tab={tab}
        onTab={setTab}
      />
    </>
  )
}

const COLUMNS =
  'grid-cols-[minmax(0,1.5fr)_170px_minmax(0,1fr)_90px_110px_110px]'

type EventWithStatus = {
  event: PartnerEventRow
  status: PartnerEventStatus
}

/** Daftar event layout desktop (>= lg): tabel, gaya sama dengan katalog. */
function EventsDesktop({
  events,
  visible,
  counts,
  tab,
  onTab,
}: {
  events: Array<PartnerEventRow>
  visible: Array<EventWithStatus>
  counts: Record<Tab, number>
  tab: Tab
  onTab: (tab: Tab) => void
}) {
  return (
    <main className="pm-wide hidden flex-col gap-5 lg:flex">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pm-display text-[26px] leading-tight">Event</h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {counts.all} event · {counts.berjalan} berjalan
          </p>
        </div>
        <Link
          to="/partner/event/baru"
          className="app-btn-primary gap-2 no-underline"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          <Plus size={16} />
          Buat event
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTab(t.key)}
            className={`pm-chip ${tab === t.key ? 'pm-chip--active' : ''}`}
          >
            {t.label} {counts[t.key]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-2 p-10 text-center">
          <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {events.length === 0
              ? 'Belum ada event. Buat event pertama kamu.'
              : 'Belum ada event di kategori ini.'}
          </p>
        </div>
      ) : (
        <div className="app-card overflow-hidden">
          <div
            className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
            style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
          >
            <span>Event</span>
            <span>Tanggal</span>
            <span>Lokasi</span>
            <span>Tipe</span>
            <span>Jastiper</span>
            <span>Status</span>
          </div>
          {visible.map(({ event, status }) => (
            <div
              key={event.id}
              className={`grid ${COLUMNS} items-center gap-4 border-t px-5 py-3`}
              style={{ borderColor: 'var(--app-border)' }}
            >
              <Link
                to="/partner/event/$id"
                params={{ id: event.id }}
                className="flex min-w-0 items-center gap-3.5 no-underline"
                style={{ color: 'inherit' }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                  style={{
                    background: 'var(--pm-tint)',
                    color: 'var(--pm-gold)',
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
                    <ImageIcon size={20} />
                  )}
                </div>
                <p className="truncate text-sm font-bold">{event.name}</p>
              </Link>
              <span
                className="text-[13px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {formatDateRange(event.eventDate, event.endDate)}
              </span>
              <span
                className="truncate text-[13px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {event.location}
              </span>
              <div>
                <span
                  className="app-badge"
                  style={
                    event.isOnline
                      ? {
                          background: 'var(--pm-tint)',
                          color: 'var(--pm-gold)',
                        }
                      : {
                          background: 'var(--app-accent-soft)',
                          color: 'var(--app-accent)',
                        }
                  }
                >
                  {event.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <span
                className="pm-num text-sm font-bold"
                style={{ color: 'var(--app-success)' }}
              >
                {event.participantCount} jastiper
              </span>
              <div>
                <PartnerEventStatusBadge status={status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
