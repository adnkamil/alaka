import { useState } from 'react'
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { listCalendarEvents } from '../../../lib/calendar-events-functions'
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatLongDate,
  groupByDate,
  monthKeyOfDate,
  parseMonthKey,
  shiftMonth,
} from '../../../lib/calendar'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'

const calendarEventsQuery = (month: string) =>
  queryOptions({
    queryKey: ['calendar-events', month],
    queryFn: () => listCalendarEvents({ data: { month } }),
  })

export const Route = createFileRoute('/_app/kalender/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      calendarEventsQuery(monthKeyOfDate(todayIsoDateInAppTimeZone())),
    ),
  component: EventCalendarPage,
})

function EventCalendarPage() {
  // Tanggal "hari ini" dihitung dalam WIB (sama dengan sisi server/seluruh app).
  const today = todayIsoDateInAppTimeZone()
  const [month, setMonth] = useState(monthKeyOfDate(today))
  const [selected, setSelected] = useState(today)

  const { data: events = [], isFetching } = useQuery({
    ...calendarEventsQuery(month),
    placeholderData: keepPreviousData,
  })

  const byDate = groupByDate(events)
  const selectedEvents = byDate.get(selected) ?? []
  const { year, month: monthNumber } = parseMonthKey(month)
  const isCurrentMonth = month === monthKeyOfDate(today)

  function goToMonth(next: string) {
    setMonth(next)
    // Pilih "hari ini" kalau bulannya sama, kalau tidak tanggal 1 bulan itu.
    setSelected(next === monthKeyOfDate(today) ? today : `${next}-01`)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <h1 className="mb-1 text-xl font-bold">Event</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--app-text-soft)' }}>
        Jadwal event jastip. Ketuk tanggal untuk melihat daftar event.
      </p>

      <section className="app-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goToMonth(shiftMonth(month, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ color: 'var(--app-text-soft)' }}
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <p className="font-semibold">
              {MONTH_NAMES[monthNumber - 1]} {year}
            </p>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => goToMonth(monthKeyOfDate(today))}
                className="app-badge"
              >
                Hari ini
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => goToMonth(shiftMonth(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ color: 'var(--app-text-soft)' }}
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center">
          {WEEKDAY_LABELS.map((label) => (
            <span
              key={label}
              className="py-1 text-xs font-medium"
              style={{ color: 'var(--app-text-mute)' }}
            >
              {label}
            </span>
          ))}
          {buildMonthGrid(month).map((date, index) => {
            if (!date) return <span key={`blank-${index}`} />
            const isSelected = date === selected
            const isToday = date === today
            const hasEvents = byDate.has(date)
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={isSelected}
                aria-label={`${formatLongDate(date)}${hasEvents ? ', ada event' : ''}`}
                className="mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-full text-sm"
                style={{
                  background: isSelected ? 'var(--app-accent)' : 'transparent',
                  color: isSelected ? 'white' : 'var(--app-text)',
                  fontWeight: isToday || isSelected ? 700 : 400,
                  boxShadow:
                    isToday && !isSelected
                      ? 'inset 0 0 0 1.5px var(--app-accent)'
                      : undefined,
                }}
              >
                {Number(date.slice(8, 10))}
                <span
                  className="mt-0.5 h-1 w-1 rounded-full"
                  style={{
                    background: hasEvents
                      ? isSelected
                        ? 'white'
                        : 'var(--app-accent)'
                      : 'transparent',
                  }}
                />
              </button>
            )
          })}
        </div>
      </section>

      <h2 className="mb-3 mt-6 text-sm font-semibold">
        {formatLongDate(selected)}
      </h2>

      {selectedEvents.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {isFetching ? 'Memuat…' : 'Tidak ada event di tanggal ini.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {selectedEvents.map((event) => (
            <article
              key={event.id}
              className="app-card flex items-start gap-3 p-4"
            >
              <span className="app-icon-tile h-10 w-10 flex-shrink-0">
                <CalendarDays size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{event.name}</p>
                <p
                  className="mt-1 flex items-center gap-1 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <MapPin size={13} className="flex-shrink-0" />
                  <span>{event.location}</span>
                </p>
                <p
                  className="mt-0.5 flex items-center gap-1 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <CalendarDays size={13} className="flex-shrink-0" />
                  <span>{formatLongDate(event.eventDate)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
