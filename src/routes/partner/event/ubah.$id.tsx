import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerEventForm from '../../../components/PartnerEventForm'
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
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4">
      <header className="flex items-center gap-3 lg:hidden">
        <Link
          to="/partner/event/$id"
          params={{ id }}
          aria-label="Kembali"
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">Ubah Event</h1>
      </header>

      <PartnerEventForm
        title="Ubah Event"
        breadcrumb="Ubah event"
        cancelEventId={id}
        currentBannerSrc={event.bannerSrc}
        submitLabel="Simpan perubahan"
        initialValue={{
          name: event.name,
          location: event.location,
          eventDate: event.eventDate,
          endDate: event.endDate,
          isOnline: event.isOnline,
          description: event.description ?? '',
        }}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
