import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Check, Minus, X } from 'lucide-react'
import { formatWibDateTime } from '../../lib/event-slot'
import { getSubmitDetail } from '../../lib/submit-detail-functions'

export const Route = createFileRoute('/_app/events/$eventId_/submit/$submitNo')({
  component: SubmitDetailPage,
})

function StatusMark({ status }: { status: 'disetujui' | 'disanggah' | 'pengajuan' | 'dibatalkan' | null }) {
  if (status === 'disetujui') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: 'var(--app-success-soft)', color: '#15803d' }} aria-label="Disetujui">
        <Check size={14} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'dibatalkan') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' }} aria-label="Dibatalkan partner">
        <X size={14} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'disanggah') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' }} aria-label="Ditolak">
        <X size={14} strokeWidth={3} />
      </span>
    )
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full" style={{ color: 'var(--app-text-mute)' }} aria-label="Menunggu">
      <Minus size={14} />
    </span>
  )
}

/** Barang satu submit, dikelompokkan per pemesan. Status: ✓ disetujui, ✗ ditolak, – menunggu. */
function SubmitDetailPage() {
  const { eventId, submitNo } = Route.useParams()
  const n = Number(submitNo)
  const detail = useQuery({
    queryKey: ['submit-detail', eventId, n],
    queryFn: () => getSubmitDetail({ data: { eventId, submitNo: n } }),
  })

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
      <header className="flex items-start gap-3">
        <Link
          to="/events/$eventId/status"
          params={{ eventId }}
          search={{ tab: 'riwayat' }}
          aria-label="Kembali"
          className="-ml-1 flex size-8 shrink-0 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Submit ke-{submitNo}</h1>
          {detail.data && (
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Dikirim {formatWibDateTime(new Date(detail.data.submittedAt))}
            </p>
          )}
        </div>
      </header>

      {detail.isLoading && <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Memuat…</p>}
      {detail.isError && <p className="text-sm text-red-600">Gagal memuat detail submit.</p>}
      {detail.data && detail.data.customers.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Tidak ada barang di submit ini.</p>
      )}

      {detail.data?.customers.map((c) => (
        <section key={c.customerName} className="app-card p-4">
          <p className="text-sm font-semibold">{c.customerName}</p>
          <ul className="mt-3 flex flex-col divide-y" style={{ borderColor: 'var(--app-border)' }}>
            {c.lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{line.name}</p>
                  <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{line.qty} pcs</p>
                </div>
                <div className="flex items-center gap-2">
                  {line.partial && (
                    <span className="text-xs" style={{ color: '#15803d' }}>Sebagian disetujui</span>
                  )}
                  {line.status === 'disanggah' && (
                    <span className="text-xs" style={{ color: '#b91c1c' }}>Kurang</span>
                  )}
                  {line.status === 'dibatalkan' && (
                    <span className="text-xs" style={{ color: '#b91c1c' }}>Dibatalkan partner</span>
                  )}
                  <StatusMark status={line.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
