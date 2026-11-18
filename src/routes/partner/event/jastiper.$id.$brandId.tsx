import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerJastiperCheck from '../../../components/PartnerJastiperCheck'
import { getPartnerJastiperDetail } from '../../../lib/partner-jastiper-detail'

export const Route = createFileRoute('/partner/event/jastiper/$id/$brandId')({
  validateSearch: (search: Record<string, unknown>) => {
    const n = Number(search.submit)
    // Nomor submit untuk disorot. Selain angka bulat positif diabaikan.
    return { submit: Number.isInteger(n) && n > 0 ? n : undefined }
  },
  component: PartnerJastiperDetailPage,
})

/** Detail jastiper di event partner: cek pesanan per submit. Pemesan dan harga jual tidak ditampilkan. */
function PartnerJastiperDetailPage() {
  const { id, brandId } = Route.useParams()
  const { submit } = Route.useSearch()
  const detail = useQuery({
    queryKey: ['partner-jastiper-detail', id, brandId],
    queryFn: () => getPartnerJastiperDetail({ data: { calendarEventId: id, brandId } }),
  })
  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/partner/event/$id"
            params={{ id }}
            aria-label="Kembali"
            className="-ml-1 flex size-8 shrink-0 items-center justify-center lg:hidden"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">{detail.data?.brandName ?? 'Jastiper'}</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
              Cek pesanan jastiper di event ini
            </p>
          </div>
        </div>
        <Link
          to="/partner/event/$id"
          params={{ id }}
          className="app-btn-outline hidden lg:inline-flex"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          Kembali ke event
        </Link>
      </header>
      <PartnerJastiperCheck calendarEventId={id} brandId={brandId} submit={submit} />
    </main>
  )
}
