import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import PartnerProductForm from '../../../components/PartnerProductForm'
import { usePartnerT } from '../../../components/PartnerI18n'
import PartnerVariantEditor from '../../../components/PartnerVariantEditor'
import PartnerProductRuleCard from '../../../components/PartnerProductRuleCard'
import {
  createPartnerProduct,
  updateOwnPartnerProduct,
} from '../../../lib/partner-product-functions'
import type { PartnerProductFormValue } from '../../../components/PartnerProductForm'
import type { PartnerVariantEditorHandle } from '../../../components/PartnerVariantEditor'
import type { PartnerProductRuleCardHandle } from '../../../components/PartnerProductRuleCard'

export const Route = createFileRoute('/partner/katalog/baru')({
  component: NewPartnerProductPage,
})

function NewPartnerProductPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const t = usePartnerT()
  const variantRef = useRef<PartnerVariantEditorHandle>(null)
  const ruleRef = useRef<PartnerProductRuleCardHandle>(null)
  const [sizes, setSizes] = useState<Array<string>>([])
  // Id produk yang sudah terbuat. Kalau simpan varian gagal,
  // simpan ulang memperbarui produk ini, bukan membuat duplikat.
  const createdId = useRef<string | null>(null)

  async function handleSubmit(value: PartnerProductFormValue) {
    const variants = variantRef.current
    const invalid = variants?.validate() ?? ruleRef.current?.validate()
    if (invalid) throw new Error(invalid)
    // Harga diisi di kartu Informasi penjualan; produk bervarian boleh kosong.
    const price = variants?.price() ?? 0

    if (createdId.current === null) {
      const created = await createPartnerProduct({
        data: {
          name: value.name,
          code: value.code,
          price,
          description: value.description,
          isActive: value.isActive,
          photoDataUrl:
            value.photo.action === 'replace' ? value.photo.dataUrl : undefined,
        },
      })
      createdId.current = created.id
    } else {
      await updateOwnPartnerProduct({
        data: {
          id: createdId.current,
          name: value.name,
          code: value.code,
          description: value.description,
          isActive: value.isActive,
          photo: value.photo,
        },
      })
    }
    await queryClient.invalidateQueries({ queryKey: ['partner-products'] })
    await variants?.save(createdId.current)
    await ruleRef.current?.save(createdId.current)
    await navigate({ to: '/partner/katalog' })
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4">
      <header className="flex items-center gap-3 lg:hidden">
        <Link
          to="/partner/katalog"
          aria-label={t.common.back}
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">
          {t.catalog.createTitle}
        </h1>
      </header>
      <PartnerProductForm
        title={t.catalog.createTitle}
        breadcrumb={t.catalog.createCrumb}
        submitLabel={t.catalog.createSubmit}
        onSubmit={handleSubmit}
        hidePrice
        afterForm={
          <>
            <PartnerVariantEditor ref={variantRef} onSizesChange={setSizes} />
            <PartnerProductRuleCard ref={ruleRef} sizes={sizes} />
          </>
        }
      />
    </main>
  )
}
