import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerProductForm from '../../../components/PartnerProductForm'
import { updateOwnPartnerProduct } from '../../../lib/partner-product-functions'
import { partnerProductPhotoUrl } from '../../../lib/partner-product-rules'
import { partnerProductQuery } from '../../../lib/queries'
import type { PartnerProductFormValue } from '../../../components/PartnerProductForm'

export const Route = createFileRoute('/partner/katalog/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(partnerProductQuery(params.id)),
  component: EditPartnerProductPage,
})

function EditPartnerProductPage() {
  const { id } = Route.useParams()
  const { data: product } = useSuspenseQuery(partnerProductQuery(id))
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function handleSubmit(value: PartnerProductFormValue) {
    await updateOwnPartnerProduct({
      data: {
        id,
        name: value.name,
        code: value.code,
        price: value.price,
        description: value.description,
        isActive: value.isActive,
        photo: value.photo,
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['partner-products'] })
    await queryClient.invalidateQueries({ queryKey: ['partner-product', id] })
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
      <h1 className="mb-4 text-xl font-bold">Ubah Produk</h1>
      <PartnerProductForm
        initial={{
          name: product.name,
          code: product.code,
          price: product.price,
          description: product.description,
          isActive: product.isActive,
          photoUrl: partnerProductPhotoUrl(product.id, product.photoUpdatedAt),
        }}
        submitLabel="Simpan perubahan"
        onSubmit={handleSubmit}
      />
    </main>
  )
}
