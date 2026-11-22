import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerInvoiceList from '../../../components/PartnerInvoiceList'
import UnderlineTabs from '../../../components/ui/UnderlineTabs'
import PartnerJastiperCheck from '../../../components/PartnerJastiperCheck'
import { getPartnerJastiperDetail } from '../../../lib/partner-jastiper-detail'
import { listPartnerInvoices } from '../../../lib/invoice-functions'

export const Route = createFileRoute('/partner/event/jastiper/$id/$brandId')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { submit?: number; tab?: 'tagihan' } => {
    const n = Number(search.submit)
    return {
      // Nomor submit untuk disorot. Selain angka bulat positif diabaikan.
      submit: Number.isInteger(n) && n > 0 ? n : undefined,
      // Tab yang dibuka; kosong = Pesanan.
      tab: search.tab === 'tagihan' ? 'tagihan' : undefined,
    }
  },
  component: PartnerJastiperDetailPage,
})

/** Detail jastiper di event partner: cek pesanan per submit. Pemesan dan harga jual tidak ditampilkan. */
function PartnerJastiperDetailPage() {
  const { id, brandId } = Route.useParams()
  const { submit, tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const detail = useQuery({
    queryKey: ['partner-jastiper-detail', id, brandId],
    queryFn: () =>
      getPartnerJastiperDetail({ data: { calendarEventId: id, brandId } }),
  })
  // Kunci sama dengan `PartnerInvoiceList`, jadi datanya ditarik sekali.
  const { data: invoices = [] } = useQuery({
    queryKey: ['partner-invoices', id, brandId],
    queryFn: () =>
      listPartnerInvoices({ data: { calendarEventId: id, brandId } }),
    refetchInterval: 30_000,
  })
  const needsReview = invoices.some((i) => i.status === 'menunggu_review')
  const activeTab = tab ?? 'pesanan'
  const tabs = [
    { key: 'pesanan' as const, label: 'Pesanan' },
    {
      key: 'tagihan' as const,
      label: 'Tagihan',
      count: invoices.length || undefined,
      dot: needsReview ? 'Ada bukti bayar yang menunggu review' : undefined,
    },
  ]
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
            <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
              {detail.data?.brandName ?? 'Jastiper'}
            </h1>
            <p
              className="mt-1 text-[13px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
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
      <UnderlineTabs
        className="-mt-1"
        ariaLabel="Isi detail jastiper"
        items={tabs}
        value={activeTab}
        onChange={(key) =>
          navigate({
            search: (prev) => ({
              ...prev,
              tab: key === 'tagihan' ? 'tagihan' : undefined,
            }),
            replace: true,
          })
        }
      />
      {/* Tab Pesanan tetap terpasang supaya isian "Dapat" yang belum disimpan tidak hilang. */}
      <div className={activeTab === 'pesanan' ? 'contents' : 'hidden'}>
        <PartnerJastiperCheck
          calendarEventId={id}
          brandId={brandId}
          submit={submit}
        />
      </div>
      {activeTab === 'tagihan' && (
        <PartnerInvoiceList
          calendarEventId={id}
          brandId={brandId}
          hideStatusFilter
        />
      )}
    </main>
  )
}
