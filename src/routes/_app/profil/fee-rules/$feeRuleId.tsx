import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import FeeRuleForm from '../../../../components/FeeRuleForm'
import type { FeeRuleFormValue } from '../../../../components/FeeRuleForm'
import {
  deleteFeeRule,
  getFeeRule,
  updateFeeRule,
} from '../../../../lib/fee-rules-functions'

export const Route = createFileRoute('/_app/profil/fee-rules/$feeRuleId')({
  loader: ({ context, params }) => {
    const query = queryOptions({
      queryKey: ['fee-rule', params.feeRuleId],
      queryFn: () => getFeeRule({ data: { id: params.feeRuleId } }),
    })
    return context.queryClient.ensureQueryData(query)
  },
  component: EditFeeRulePage,
})

function EditFeeRulePage() {
  const { feeRuleId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const query = queryOptions({
    queryKey: ['fee-rule', feeRuleId],
    queryFn: () => getFeeRule({ data: { id: feeRuleId } }),
  })
  const { data: rule } = useSuspenseQuery(query)

  async function handleSubmit(value: FeeRuleFormValue) {
    await updateFeeRule({ data: { id: feeRuleId, ...value } })
    await queryClient.invalidateQueries({ queryKey: ['fee-rules'] })
    await navigate({ to: '/profil/fee-rules' })
  }

  async function handleDelete() {
    await deleteFeeRule({ data: { id: feeRuleId } })
    await queryClient.invalidateQueries({ queryKey: ['fee-rules'] })
    await navigate({ to: '/profil/fee-rules' })
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/profil/fee-rules" style={{ color: 'var(--app-text)' }}>
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-xl font-bold">Edit aturan fee</h1>
        </div>
        <button
          onClick={handleDelete}
          className="text-sm font-semibold"
          style={{ color: 'var(--app-danger)' }}
        >
          Hapus
        </button>
      </header>

      <FeeRuleForm
        submitLabel="Simpan perubahan"
        initialValue={{
          name: rule.name,
          tiers: rule.tiers.map((tier) => ({
            minPrice: Number(tier.minPrice),
            maxPrice: Number(tier.maxPrice),
            feeAmount: Number(tier.feeAmount),
          })),
        }}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
