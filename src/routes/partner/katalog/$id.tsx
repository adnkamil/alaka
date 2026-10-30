import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import PartnerProductForm from '../../../components/PartnerProductForm'
import PartnerVariantEditor from '../../../components/PartnerVariantEditor'
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
        <h1 className="pm-display text-[22px] leading-tight">Ubah Produk</h1>
      </header>
      <PartnerProductForm
        initial={{
          name: product.name,
          code: product.code,
          price: product.price,
          description: product.description,
          isActive: product.isActive,
          photoUrl: partnerProductPhotoUrl(product.id, product.photoUpdatedAt),
        }}
        title="Ubah Produk"
        breadcrumb="Ubah produk"
        submitLabel="Simpan perubahan"
        onSubmit={handleSubmit}
      />
      <PartnerVariantEditor productId={id} />
    </main>
  )
}
