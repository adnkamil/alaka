import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import CalendarEventForm from '../../../components/CalendarEventForm'
import { createCalendarEvent } from '../../../lib/calendar-events-admin-functions'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import type { CalendarEventFormValue } from '../../../components/CalendarEventForm'

export const Route = createFileRoute('/admin/event/new')({
  component: AdminEventNewPage,
})

function AdminEventNewPage() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()

  async function handleSubmit(value: CalendarEventFormValue) {
    // Event baru belum punya banner, jadi hanya "upload" yang relevan.
    await createCalendarEvent({
      data: {
        ...value,
        banner: value.banner?.type === 'upload' ? value.banner : undefined,
      },
    })
    // Cache sisi user ikut dibuang supaya event baru langsung terlihat.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-calendar-events'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
    ])
    await navigate({ to: '/admin/event' })
  }

  return (
    <main className="pm-wide mx-auto max-w-lg px-4 pb-8 pt-6 lg:max-w-[760px]! lg:mx-0!">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/admin/event"
          aria-label="Kembali ke daftar event"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
          Tambah Event
        </h1>
      </header>

      <CalendarEventForm
        initialValue={{
          name: '',
          location: '',
          eventDate: todayIsoDateInAppTimeZone(),
          endDate: null,
          isOnline: false,
          description: '',
          exhibitors: [],
        }}
        currentBannerSrc={null}
        onCancel={() => void navigate({ to: '/admin/event' })}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
