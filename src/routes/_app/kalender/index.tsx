import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
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

// Tanggal terpilih disimpan di URL supaya tombol kembali dari halaman detail
// membuka kalender di bulan & tanggal yang sama.
const searchSchema = z.object({
  tanggal: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/_app/kalender/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ tanggal: search.tanggal }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      calendarEventsQuery(
        monthKeyOfDate(deps.tanggal ?? todayIsoDateInAppTimeZone()),
      ),
    ),
  component: EventCalendarPage,
})

function EventCalendarPage() {
  // Tanggal "hari ini" dihitung dalam WIB (sama dengan sisi server/seluruh app).
  const today = todayIsoDateInAppTimeZone()
  const navigate = Route.useNavigate()
  const { tanggal } = Route.useSearch()
  const selected = tanggal ?? today
  const month = monthKeyOfDate(selected)

  const { data: events = [], isFetching } = useQuery({
    ...calendarEventsQuery(month),
    placeholderData: keepPreviousData,
  })

  const byDate = groupByDate(events)
  const selectedEvents = byDate.get(selected) ?? []
  const { year, month: monthNumber } = parseMonthKey(month)
  const isCurrentMonth = month === monthKeyOfDate(today)

  function selectDate(date: string) {
    void navigate({ search: { tanggal: date }, replace: true })
  }

  function goToMonth(next: string) {
    // Pilih "hari ini" kalau bulannya sama, kalau tidak tanggal 1 bulan itu.
    selectDate(next === monthKeyOfDate(today) ? today : `${next}-01`)
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
            const hasEvents = byDate.has(date)

            // Dua penanda yang bisa menumpuk di satu tanggal:
            // - ada event  -> lingkaran penuh warna aksen (paling mencolok)
            // - dipilih    -> cincin tipis (cincin dalam putih kalau sudah
            //                 berlingkaran penuh)
            let background = 'transparent'
            let color = 'var(--app-text)'
            let fontWeight = 400
            if (hasEvents) {
              background = 'var(--app-accent)'
              color = 'white'
              fontWeight = 700
            } else if (isSelected) {
              // background = 'var(--app-accent-soft)'
              color = 'var(--app-accent)'
              fontWeight = 700
            } 

            let boxShadow: string | undefined
            if (isSelected) {
              boxShadow =
                '0 0 0 2px var(--app-card), 0 0 0 4px var(--app-accent)'
            } 

            return (
              <button
                key={date}
                type="button"
                onClick={() => selectDate(date)}
                aria-pressed={isSelected}
                aria-label={`${formatLongDate(date)}${hasEvents ? ', ada event' : ''}`}
                className="mx-auto my-0.5 flex h-10 w-10 items-center justify-center rounded-full text-sm"
                style={{ background, color, fontWeight, boxShadow }}
              >
                {Number(date.slice(8, 10))}
              </button>
            )
          })}
        </div>

        <div
          className="mt-3 flex items-center justify-center gap-4 text-xs"
          style={{ color: 'var(--app-text-soft)' }}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: 'var(--app-accent)' }}
            />
            Ada event
          </span>
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
            <Link
              key={event.id}
              to="/kalender/$eventId"
              params={{ eventId: event.id }}
              className="app-card flex items-center gap-3 p-4 no-underline"
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
              <ChevronRight
                size={18}
                className="flex-shrink-0"
                style={{ color: 'var(--app-text-mute)' }}
              />
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
