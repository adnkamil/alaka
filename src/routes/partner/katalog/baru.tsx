import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerProductForm from '../../../components/PartnerProductForm'
import { createPartnerProduct } from '../../../lib/partner-product-functions'
import type { PartnerProductFormValue } from '../../../components/PartnerProductForm'

export const Route = createFileRoute('/partner/katalog/baru')({
  component: NewPartnerProductPage,
})

function NewPartnerProductPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function handleSubmit(value: PartnerProductFormValue) {
    await createPartnerProduct({
      data: {
        name: value.name,
        code: value.code,
        price: value.price,
        description: value.description,
        isActive: value.isActive,
        photoDataUrl:
          value.photo.action === 'replace' ? value.photo.dataUrl : undefined,
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['partner-products'] })
    await navigate({ to: '/partner/katalog' })
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4">
      <header className="flex items-center gap-3 lg:hidden">
        <Link
          to="/partner/katalog"
          aria-label="Kembali"
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">Tambah Produk</h1>
      </header>
      <PartnerProductForm
        title="Tambah Produk"
        breadcrumb="Tambah produk"
        submitLabel="Simpan produk"
        onSubmit={handleSubmit}
      />
    </main>
  )
}
