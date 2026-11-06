import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import PartnerProductForm, {
  type PartnerProductFormHandle,
  type PartnerProductFormValue,
} from '../../../components/PartnerProductForm'
import PartnerVariantEditor, {
  type PartnerVariantEditorHandle,
} from '../../../components/PartnerVariantEditor'
import PartnerProductRuleCard, {
  type PartnerProductRuleCardHandle,
} from '../../../components/PartnerProductRuleCard'
import { getErrorMessage } from '../../../lib/error-message'
import { updateOwnPartnerProduct } from '../../../lib/partner-product-functions'
import { partnerProductPhotoUrl } from '../../../lib/partner-product-rules'
import { partnerProductQuery } from '../../../lib/queries'

export const Route = createFileRoute('/partner/katalog/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(partnerProductQuery(params.id)),
  component: EditPartnerProductPage,
})

function EditPartnerProductPage() {
  const { id } = Route.useParams()
  const { data: product } = useSuspenseQuery(partnerProductQuery(id))
  const queryClient = useQueryClient()
  const productRef = useRef<PartnerProductFormHandle>(null)
  const variantRef = useRef<PartnerVariantEditorHandle>(null)
  const ruleRef = useRef<PartnerProductRuleCardHandle>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  )

  async function handleProductSubmit(value: PartnerProductFormValue) {
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
  }

  // Satu tombol untuk semua bagian: produk, varian, lalu paket.
  async function saveAll() {
    setSaving(true)
    setStatus(null)
    try {
      await productRef.current?.save()
      await variantRef.current?.save()
      await ruleRef.current?.save()
      setStatus({ ok: true, text: 'Perubahan tersimpan.' })
    } catch (err) {
      setStatus({
        ok: false,
        text: getErrorMessage(err, 'Gagal menyimpan perubahan'),
      })
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <div className="ml-auto flex gap-2 lg:gap-3">
      <Link
        to="/partner/katalog"
        className="app-btn-outline no-underline"
        style={{ minHeight: 44, fontSize: 14 }}
      >
        Batal
      </Link>
      <button
        type="button"
        onClick={saveAll}
        disabled={saving}
        className="app-btn-primary"
        style={{ minHeight: 44, fontSize: 14 }}
      >
        {saving ? 'Menyimpan...' : 'Simpan perubahan'}
      </button>
    </div>
  )

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4 pb-8">
      <header className="flex flex-wrap items-center gap-3 lg:hidden">
        <Link
          to="/partner/katalog"
          aria-label="Kembali"
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">Ubah Produk</h1>
        {actions}
      </header>

      {status && (
        <p
          role="status"
          className="text-sm"
          style={{ color: status.ok ? '#3f7d58' : 'var(--app-danger)' }}
        >
          {status.text}
        </p>
      )}

      <PartnerProductForm
        ref={productRef}
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
        onSubmit={handleProductSubmit}
        headerActions={actions}
      />
      <PartnerVariantEditor ref={variantRef} productId={id} />
      <PartnerProductRuleCard ref={ruleRef} productId={id} />
    </main>
  )
}
