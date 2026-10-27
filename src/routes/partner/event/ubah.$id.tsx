import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import CalendarEventForm from '../../../components/CalendarEventForm'
import { updateOwnPartnerEvent } from '../../../lib/partner-event-functions'
import { partnerEventQuery } from '../../../lib/queries'
import type { CalendarEventFormValue } from '../../../components/CalendarEventForm'

export const Route = createFileRoute('/partner/event/ubah/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(partnerEventQuery(params.id)),
  component: EditPartnerEventPage,
})

function EditPartnerEventPage() {
  const { id } = Route.useParams()
  const { data: event } = useSuspenseQuery(partnerEventQuery(id))
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()

  async function handleSubmit(value: CalendarEventFormValue) {
    const { exhibitors: _exhibitors, ...fields } = value
    await updateOwnPartnerEvent({ data: { id, ...fields } })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['partner-events'] }),
      queryClient.invalidateQueries({ queryKey: ['partner-event', id] }),
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
    ])
    await navigate({ to: '/partner/event/$id', params: { id } })
  }

  return (
    <main className="px-4 pb-8 pt-4">
      <Link
        to="/partner/event/$id"
        params={{ id }}
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold no-underline"
        style={{ color: 'var(--app-accent)' }}
      >
        <ArrowLeft size={14} />
        Detail event
      </Link>
      <h1 className="mb-4 text-xl font-bold">Ubah Event</h1>

      <CalendarEventForm
        showExhibitors={false}
        initialValue={{
          name: event.name,
          location: event.location,
          eventDate: event.eventDate,
          endDate: event.endDate,
          isOnline: event.isOnline,
          description: event.description ?? '',
          exhibitors: [],
        }}
        currentBannerSrc={event.bannerSrc}
        onCancel={() =>
          void navigate({ to: '/partner/event/$id', params: { id } })
        }
        onSubmit={handleSubmit}
      />
    </main>
  )
}
