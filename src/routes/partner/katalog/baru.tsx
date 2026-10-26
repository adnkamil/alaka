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
    <main className="px-4 pb-6 pt-4">
      <Link
        to="/partner/katalog"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold no-underline"
        style={{ color: 'var(--app-accent)' }}
      >
        <ArrowLeft size={14} />
        Katalog
      </Link>
      <h1 className="mb-4 text-xl font-bold">Tambah Produk</h1>
      <PartnerProductForm submitLabel="Simpan produk" onSubmit={handleSubmit} />
    </main>
  )
}
