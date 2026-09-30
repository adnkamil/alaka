import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import MessageTemplateForm from '../../../components/MessageTemplateForm'
import { currentUserQuery } from '../../../lib/queries'
import { DEFAULT_WA_MESSAGE_TEMPLATE } from '../../../lib/message-template'
import { updateMessageTemplate } from '../../../lib/message-template-functions'

export const Route = createFileRoute('/_app/profil/template-chat')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(currentUserQuery),
  component: TemplateChatPage,
})

function TemplateChatPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user } = useSuspenseQuery(currentUserQuery)

  async function handleSubmit(template: string) {
    await updateMessageTemplate({ data: { template } })
    // Baris "Template Chat WA" di halaman Profil nampilkan status
    // kustom/default dari data user ini.
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    await navigate({ to: '/profil' })
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/profil" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Template Chat WA</h1>
      </header>

      <MessageTemplateForm
        submitLabel="Simpan"
        initialValue={user?.waMessageTemplate ?? DEFAULT_WA_MESSAGE_TEMPLATE}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
