import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerEventForm from '../../../components/PartnerEventForm'
import { usePartnerT } from '../../../components/PartnerI18n'
import type { PartnerEventFormValue } from '../../../components/PartnerEventForm'
import { updateOwnPartnerEvent } from '../../../lib/partner-event-functions'
import { partnerEventQuery } from '../../../lib/queries'

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
  const t = usePartnerT()

  async function handleSubmit(value: PartnerEventFormValue) {
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
          aria-label={t.common.back}
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">
          {t.event.editTitle}
        </h1>
      </header>

      <PartnerEventForm
        title={t.event.editTitle}
        breadcrumb={t.event.editCrumb}
        cancelEventId={id}
        currentBannerSrc={event.bannerSrc}
        submitLabel={t.common.saveChanges}
        initialValue={{
          name: event.name,
          location: event.location,
          eventDate: event.eventDate,
          endDate: event.endDate,
          isOnline: event.isOnline,
          description: event.description ?? '',
          catalogUrl: event.catalogUrl ?? '',
        }}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
