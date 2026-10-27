import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import CalendarEventForm from '../../../components/CalendarEventForm'
import { createPartnerEvent } from '../../../lib/partner-event-functions'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import type { CalendarEventFormValue } from '../../../components/CalendarEventForm'

export const Route = createFileRoute('/partner/event/baru')({
  component: NewPartnerEventPage,
})

function NewPartnerEventPage() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()

  async function handleSubmit(value: CalendarEventFormValue) {
    // `exhibitors` tidak dikirim: diisi server dengan nama partner.
    const { exhibitors: _exhibitors, banner, ...fields } = value
    const { id } = await createPartnerEvent({
      data: {
        ...fields,
        // Event baru belum punya banner, jadi hanya "upload" yang relevan.
        banner: banner?.type === 'upload' ? banner : undefined,
      },
    })
    // Cache jastiper ikut dibuang supaya event baru langsung terlihat di sana.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['partner-events'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
    ])
    await navigate({ to: '/partner/event/$id', params: { id } })
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
      <h1 className="mb-4 text-xl font-bold">Buat Event</h1>

      <CalendarEventForm
        showExhibitors={false}
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
        onCancel={() => void navigate({ to: '/partner/event' })}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
