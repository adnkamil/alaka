import { useMemo, useState } from 'react'
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Search, SlidersHorizontal } from 'lucide-react'
import EventFilterSheet, {
  FilterChip,
  lokasiLabel,
  waktuLabel,
  type Lokasi,
} from '../../../components/EventFilterSheet'
import EventListCard from '../../../components/EventListCard'
import { listUpcomingCalendarEvents } from '../../../lib/calendar-events-functions'
import {
  MONTH_NAMES,
  daysBetweenIso,
  formatDateRange,
  isCalendarEventWithinDays,
} from '../../../lib/calendar'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'

const upcomingEventsQuery = (from: string) =>
  queryOptions({
    queryKey: ['calendar-events', 'upcoming', from],
    queryFn: () => listUpcomingCalendarEvents({ data: { from } }),
  })

type CalendarRow = Awaited<ReturnType<typeof listUpcomingCalendarEvents>>[number]

/** Angka tanggal, singkatan bulan, dan singkatan hari untuk badge kartu. */
function dateBadge(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return {
    day: d,
    month: MONTH_NAMES[m - 1].slice(0, 3).toUpperCase(),
    weekday: new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone: 'UTC' })
      .format(date)
      .replace('.', ''),
  }
}

type Filters = {
  search: string
  waktu: number | null
  lokasi: Lokasi | null
}

function filterEvents(events: CalendarRow[], today: string, filters: Filters) {
  const q = filters.search.trim().toLowerCase()
  return events.filter((event) => {
    if (
      q &&
      !event.name.toLowerCase().includes(q) &&
      !event.location.toLowerCase().includes(q)
    ) {
      return false
    }
    // "N hari" = event yang akan dan sedang berlangsung dalam N hari ke depan;
    // yang sudah mulai tapi belum selesai tetap dihitung.
    if (
      filters.waktu !== null &&
      !isCalendarEventWithinDays(event, today, filters.waktu)
    ) {
      return false
    }
    if (
      filters.lokasi !== null &&
      event.isOnline !== (filters.lokasi === 'online')
    ) {
      return false
    }
    return true
  })
}

export const Route = createFileRoute('/_app/kalender/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      upcomingEventsQuery(todayIsoDateInAppTimeZone()),
    ),
  component: EventPage,
})

function EventPage() {
  const today = todayIsoDateInAppTimeZone()
  const { data: events } = useSuspenseQuery(upcomingEventsQuery(today))

  const [search, setSearch] = useState('')
  const [waktu, setWaktu] = useState<number | null>(null)
  const [lokasi, setLokasi] = useState<Lokasi | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const filtered = useMemo(
    () => filterEvents(events, today, { search, waktu, lokasi }),
    [events, today, search, waktu, lokasi],
  )

  const activeCount = (waktu !== null ? 1 : 0) + (lokasi !== null ? 1 : 0)
  const hasFilter = activeCount > 0 || search.trim() !== ''

  function clearAll() {
    setSearch('')
    setWaktu(null)
    setLokasi(null)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold">Event</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Bazar &amp; event jastip yang akan datang
        </p>
      </header>

      <div className="mb-3 flex items-center gap-2.5">
        <label className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--app-text-mute)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari event…"
            aria-label="Cari event"
            className="h-[46px] w-full rounded-xl border pl-11 pr-4 text-sm"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--app-card)',
              color: 'var(--app-text)',
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Buka filter"
          className="relative flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-xl border"
          style={{
            borderColor: 'var(--app-border)',
            background: 'var(--app-card)',
            color: 'var(--app-text)',
          }}
        >
          <SlidersHorizontal size={20} />
          {activeCount > 0 && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
              style={{ background: 'var(--app-accent)' }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[7, 30].map((days) => {
          const active = waktu === days
          return (
            <FilterChip
              key={days}
              active={active}
              disabled={waktu !== null && !active}
              onClick={() => setWaktu(active ? null : days)}
            >
              {waktuLabel(days)}
            </FilterChip>
          )
        })}
        {(['online', 'offline'] as const).map((item) => {
          const active = lokasi === item
          return (
            <FilterChip
              key={item}
              active={active}
              disabled={lokasi !== null && !active}
              onClick={() => setLokasi(active ? null : item)}
            >
              {lokasiLabel(item)}
            </FilterChip>
          )
        })}
      </div>

      {hasFilter && events.length > 0 && (
        <div className="mb-3 flex items-center justify-between text-sm">
          <span style={{ color: 'var(--app-text-soft)' }}>
            {filtered.length} event ditemukan
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="font-semibold"
            style={{ color: 'var(--app-accent)' }}
          >
            Hapus semua
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Belum ada event yang akan datang.
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center px-4 pt-10 text-center">
          <span
            className="mb-5 flex h-[92px] w-[92px] items-center justify-center rounded-full"
            style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
          >
            <Search size={38} />
          </span>
          <p className="font-bold">Tidak ada event yang cocok</p>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Coba ubah rentang waktu atau lokasi, atau hapus filter supaya event
            lain muncul lagi.
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-6 h-12 rounded-xl border px-6 text-sm font-semibold"
            style={{ borderColor: 'var(--app-accent)', color: 'var(--app-accent)' }}
          >
            Hapus semua filter
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((event) => {
            const diff = daysBetweenIso(today, event.eventDate)
            return (
              <EventListCard
                key={event.id}
                eventId={event.id}
                name={event.name}
                {...dateBadge(event.eventDate)}
                tag={diff <= 0 ? 'Sedang Berlangsung' : `${diff} hari lagi`}
                rows={[
                  { icon: 'pin', text: event.location },
                  {
                    icon: 'calendar',
                    text: formatDateRange(event.eventDate, event.endDate),
                  },
                ]}
              />
            )
          })}
        </div>
      )}

      {sheetOpen && (
        <EventFilterSheet
          initialWaktu={waktu}
          initialLokasi={lokasi}
          count={(w, l) =>
            filterEvents(events, today, { search, waktu: w, lokasi: l }).length
          }
          onApply={(w, l) => {
            setWaktu(w)
            setLokasi(l)
            setSheetOpen(false)
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </main>
  )
}
