import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import PartnerRuleForm, { type RuleFormValue } from '../../../components/PartnerRuleForm'
import { fetchPartnerProducts } from '../../../lib/partner-product-functions'
import { listPartnerRules, savePartnerRule } from '../../../lib/partner-rule-functions'
import { selectableProducts } from '../../../lib/partner-rule-availability'

export const Route = createFileRoute('/partner/paket/$id')({
  component: EditPartnerRulePage,
})

const RULES_KEY = ['partner-rules']

function EditPartnerRulePage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: rules = [], isLoading } = useQuery({ queryKey: RULES_KEY, queryFn: () => listPartnerRules() })
  const { data: products = [] } = useQuery({
    queryKey: ['partner-products'],
    queryFn: () => fetchPartnerProducts(),
  })

  const rule = rules.find((r) => r.id === id)

  async function handleSubmit(value: RuleFormValue) {
    setSaving(true)
    setError(null)
    try {
      await savePartnerRule({
        data: {
          id,
          name: value.name,
          minQty: Number(value.minQty),
          bundlePrice: Number(value.bundlePrice),
          isActive: value.isActive,
          productIds: value.productIds,
        },
      })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
      await navigate({ to: '/partner/paket' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aturan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-center gap-3">
        <Link to="/partner/paket" aria-label="Kembali" className="-ml-1 flex size-8 items-center justify-center" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">Ubah Aturan Paket</h1>
      </header>

      {isLoading && <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Memuat…</p>}
      {!isLoading && !rule && (
        <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Aturan tidak ditemukan.
        </div>
      )}
      {rule && (
        <PartnerRuleForm
          title="Detail aturan"
          initial={{
            name: rule.name,
            minQty: String(rule.minQty),
            bundlePrice: String(rule.bundlePrice),
            isActive: rule.isActive,
            productIds: rule.productIds,
          }}
          products={selectableProducts(products, rules, rule.id)}
          saving={saving}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => navigate({ to: '/partner/paket' })}
        />
      )}
    </main>
  )
}
