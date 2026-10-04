import { useState } from 'react'
import {
  useQueryClient,
  queryOptions,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Tag } from 'lucide-react'
import { createEvent } from '../../lib/events-functions'
import { listFeeRules } from '../../lib/fee-rules-functions'
import { todayIsoDateInAppTimeZone } from '../../lib/timezone'

const feeRulesQuery = queryOptions({
  queryKey: ['fee-rules'],
  queryFn: () => listFeeRules(),
})

export const Route = createFileRoute('/_app/events/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(feeRulesQuery),
  component: NewEventPage,
})

function NewEventPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: feeRules } = useSuspenseQuery(feeRulesQuery)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState(todayIsoDateInAppTimeZone())
  const [feeRuleId, setFeeRuleId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const event = await createEvent({
        data: {
          name,
          description: description || undefined,
          eventDate: new Date(eventDate).toISOString(),
          feeRuleId: feeRuleId || null,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      await navigate({ to: '/events/$eventId', params: { eventId: event.id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan event')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Tambah Event</h1>
      </header>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nama event
          <input
            required
            placeholder="cth. Open PO Korea Trip"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="app-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Tanggal event
          <input
            type="date"
            required
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="app-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Deskripsi (opsional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="app-input"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Aturan fee jastip (opsional)
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
              style={{ color: 'var(--app-accent)' }}
            >
              <Tag size={16} />
            </span>
            <select
              value={feeRuleId}
              onChange={(e) => setFeeRuleId(e.target.value)}
              className="app-input appearance-none pl-9"
            >
              <option value="">Belum dipilih</option>
              {feeRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        {error && (
          <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="app-btn-primary"
        >
          {isSubmitting ? 'Menyimpan...' : 'Simpan event'}
        </button>
      </form>
    </main>
  )
}
