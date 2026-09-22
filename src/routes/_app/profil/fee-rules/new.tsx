import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import FeeRuleForm from '../../../../components/FeeRuleForm'
import type { FeeRuleFormValue } from '../../../../components/FeeRuleForm'
import { createFeeRule } from '../../../../lib/fee-rules-functions'
import { getFeeSuggestions } from '../../../../lib/fee-suggestions-functions'

export const Route = createFileRoute('/_app/profil/fee-rules/new')({
  component: NewFeeRulePage,
})

// Saran tier (fitur PRO `fee_suggestions`). Sengaja pakai `useQuery` biasa, bukan
// loader: formnya tetap bisa dipakai walau saran gagal dimuat.
const feeSuggestionsQuery = queryOptions({
  queryKey: ['fee-suggestions'],
  queryFn: () => getFeeSuggestions(),
})

function NewFeeRulePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: feeSuggestions } = useQuery(feeSuggestionsQuery)

  // `unlocked` dari server; selama masih dimuat belum ada info, jadi dianggap
  // belum terkunci (biar nggak nge-flash pesan terkunci).
  const suggestionsLocked = feeSuggestions ? !feeSuggestions.unlocked : false

  async function handleSubmit(value: FeeRuleFormValue) {
    await createFeeRule({ data: value })
    await queryClient.invalidateQueries({ queryKey: ['fee-rules'] })
    await navigate({ to: '/profil/fee-rules' })
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/profil/fee-rules" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Tambah aturan fee</h1>
      </header>

      <FeeRuleForm
        submitLabel="Simpan"
        suggestions={feeSuggestions?.suggestions ?? []}
        suggestionsLocked={suggestionsLocked}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
