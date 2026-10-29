import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerEventForm from '../../../components/PartnerEventForm'
import { createPartnerEvent } from '../../../lib/partner-event-functions'
import { setPartnerEventProducts } from '../../../lib/partner-event-product-functions'
import { partnerProductsQuery } from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'
import type { CalendarEventFormValue } from '../../../components/CalendarEventForm'

export const Route = createFileRoute('/partner/event/baru')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(partnerProductsQuery),
  component: NewPartnerEventPage,
})

function NewPartnerEventPage() {
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()
  const { data: products } = useSuspenseQuery(partnerProductsQuery)

  async function handleSubmit(
    value: CalendarEventFormValue,
    productIds: Array<string>,
  ) {
    // `exhibitors` tidak dikirim: diisi server dengan nama partner.
    const { exhibitors: _exhibitors, banner, ...fields } = value
    const { id } = await createPartnerEvent({
      data: {
        ...fields,
        // Event baru belum punya banner, jadi hanya "upload" yang relevan.
        banner: banner?.type === 'upload' ? banner : undefined,
      },
    })
    // Produk unggulan dipilih di form, jadi disimpan setelah event terbuat.
    if (productIds.length > 0) {
      await setPartnerEventProducts({ data: { id, productIds } })
    }
    // Cache jastiper ikut dibuang supaya event baru langsung terlihat di sana.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['partner-events'] }),
      queryClient.invalidateQueries({
        queryKey: ['partner-event-products', id],
      }),
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
    ])
    await navigate({ to: '/partner/event/$id', params: { id } })
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4">
      <header className="flex items-center gap-3 lg:hidden">
        <Link
          to="/partner/event"
          aria-label="Kembali"
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">Buat Event</h1>
      </header>

      <PartnerEventForm
        title="Buat Event"
        breadcrumb="Buat event"
        submitLabel="Simpan event"
        products={products}
        initialValue={{
          name: '',
          location: '',
          eventDate: todayIsoDateInAppTimeZone(),
          endDate: null,
          isOnline: false,
          description: '',
        }}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
