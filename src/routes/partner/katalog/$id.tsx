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
import { usePartnerT } from '../../../components/PartnerI18n'
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
  const t = usePartnerT()
  const productRef = useRef<PartnerProductFormHandle>(null)
  const variantRef = useRef<PartnerVariantEditorHandle>(null)
  const ruleRef = useRef<PartnerProductRuleCardHandle>(null)
  const [sizes, setSizes] = useState<Array<string>>([])
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
        // Harga disimpan lewat kartu Informasi penjualan (PartnerVariantEditor).
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
      const invalid = ruleRef.current?.validate()
      if (invalid) throw new Error(invalid)
      await productRef.current?.save()
      await variantRef.current?.save()
      await ruleRef.current?.save()
      setStatus({ ok: true, text: t.catalog.changesSaved })
    } catch (err) {
      setStatus({
        ok: false,
        text: getErrorMessage(err, t.catalog.changesFailed),
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
        {t.common.cancel}
      </Link>
      <button
        type="button"
        onClick={saveAll}
        disabled={saving}
        className="app-btn-primary"
        style={{ minHeight: 44, fontSize: 14 }}
      >
        {saving ? t.common.saving : t.common.saveChanges}
      </button>
    </div>
  )

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4 pb-8">
      <header className="flex flex-wrap items-center gap-3 lg:hidden">
        <Link
          to="/partner/katalog"
          aria-label={t.common.back}
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">
          {t.catalog.editTitle}
        </h1>
        {actions}
      </header>

      {status && (
        <p
          role="status"
          className="text-sm"
          style={{ color: status.ok ? 'var(--app-success)' : 'var(--app-danger)' }}
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
        title={t.catalog.editTitle}
        breadcrumb={t.catalog.editCrumb}
        submitLabel={t.common.saveChanges}
        onSubmit={handleProductSubmit}
        headerActions={actions}
        hidePrice
      />
      <PartnerVariantEditor
        ref={variantRef}
        productId={id}
        onSizesChange={setSizes}
      />
      <PartnerProductRuleCard ref={ruleRef} productId={id} sizes={sizes} />
    </main>
  )
}
