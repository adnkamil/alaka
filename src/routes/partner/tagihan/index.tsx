import { createFileRoute } from '@tanstack/react-router'
import PartnerInvoiceList from '../../../components/PartnerInvoiceList'
import { usePartnerT } from '../../../components/PartnerI18n'

export const Route = createFileRoute('/partner/tagihan/')({
  component: PartnerInvoicesPage,
})

/**
 * Menu Tagihan: semua tagihan lintas event dan jastiper. Membuat tagihan
 * tetap lewat tab "Siap ditagih" di halaman event.
 */
function PartnerInvoicesPage() {
  const t = usePartnerT()
  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header>
        <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
          {t.invoice.title}
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {t.invoice.subtitle}
        </p>
      </header>
      <PartnerInvoiceList />
    </main>
  )
}
