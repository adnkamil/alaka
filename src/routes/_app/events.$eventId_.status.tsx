import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Clock, Lock, Send } from 'lucide-react'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EventInvoicesSection, {
  useEventInvoices,
} from '../../components/EventInvoicesSection'
import { useNow } from '../../lib/use-now'
import { formatRemaining, formatWibDateTime } from '../../lib/event-slot'
import { getEventSlotSummary } from '../../lib/event-slot-functions'
import { formatInvoiceNumber } from '../../lib/invoice-rules'
import { submitOrdersBatch } from '../../lib/submit-functions'

export const Route = createFileRoute('/_app/events/$eventId_/status')({
  validateSearch: (search: Record<string, unknown>) => {
    const t = search.tab
    return { tab: t === 'riwayat' ? ('riwayat' as const) : undefined }
  },
  component: EventStatusPage,
})

type Tone = 'warning' | 'success' | 'danger'

const TONE: Record<Tone, { background: string; color: string }> = {
  warning: { background: 'var(--app-warning-soft)', color: '#b45309' },
  success: { background: 'var(--app-success-soft)', color: '#15803d' },
  danger: { background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' },
}

function EventStatusPage() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = useNow()
  const { data: summary, isLoading } = useQuery({
    queryKey: ['event-slot', eventId],
    queryFn: () => getEventSlotSummary({ data: { eventId } }),
    refetchInterval: (q) =>
      (q.state.data?.pendingCount ?? 0) > 0 ? 10_000 : 30_000,
  })
  const { data: invoices = [] } = useEventInvoices(eventId)
  // Submit -> tagihan aktif (bukan yang dibatalkan), untuk chip di tiap kartu.
  const invoiceBySubmitNo = new Map<number, number>()
  for (const inv of invoices) {
    if (inv.status === 'dibatalkan') continue
    for (const no of inv.submitNos) invoiceBySubmitNo.set(no, inv.number)
  }
  const [confirm, setConfirm] = useState(false)
  const { tab: initialTab } = Route.useSearch()
  const [tab, setTab] = useState<'status' | 'riwayat'>(initialTab === 'riwayat' ? 'riwayat' : 'status')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goBack = () => navigate({ to: '/events/$eventId', params: { eventId } })

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await submitOrdersBatch({ data: { eventId } })
      await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
      setConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim')
      setConfirm(false)
      // Submit yang timeout bisa saja sudah tersimpan di server. Muat ulang
      // status supaya halaman menampilkan keadaan sebenarnya.
      await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !summary) {
    return (
      <main className="app-shell relative mx-auto max-w-lg px-4 pb-24 pt-6">
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Memuat status...
        </p>
      </main>
    )
  }

  const submitted = summary.submittedAt !== null
  const status = summary.status
  const sanggahCount = summary.disanggahCount
  const partnerName = summary.partnerContact?.name ?? 'Partner'

  // Banner ringkas: menjelaskan kondisi saat ini dan apa yang harus dilakukan.
  let banner: { tone: Tone; title: string; text: string }
  switch (status) {
    case 'belum_dibuka':
      banner = {
        tone: 'warning',
        title: 'Slot belum dibuka',
        text: `Pesanan bisa dikirim setelah ${partnerName} membuka slot pada ${formatWibDateTime(summary.opensAt)}.`,
      }
      break
    case 'draft':
      banner = {
        tone: 'success',
        title: 'Slot dibuka',
        text: 'Kirim pesanan sebelum slot ditutup. Pesanan yang belum dikirim tidak akan dicek partner.',
      }
      break
    case 'ditutup':
      banner = submitted
        ? {
            tone: 'warning',
            title: 'Slot sudah ditutup',
            text: 'Pesanan sudah terkirim dan sedang menunggu pengecekan partner.',
          }
        : {
            tone: 'danger',
            title: 'Slot sudah ditutup',
            text: 'Pesanan belum dikirim, jadi tidak akan dicek partner. Hubungi partner jika masih perlu dikirim.',
          }
      break
    case 'terkirim':
      banner = {
        tone: 'success',
        title: 'Pesanan sudah dikirim',
        text: `Urutan #${summary.rank ?? '-'} dari ${summary.total ?? '-'}. Menunggu ${partnerName} mengecek barang.`,
      }
      break
    case 'sanggah':
      banner = {
        tone: 'warning',
        title: `${sanggahCount} barang ditolak`,
        text: 'Partner tidak bisa memenuhi sebagian barang. Kirim pengganti lewat Submit ulang.',
      }
      break
    default:
      banner = {
        tone: 'success',
        title: 'Pesanan disetujui',
        text: 'Barang yang tidak dapat tidak masuk tagihan.',
      }
  }

  // Kartu waktu: hanya tampil kalau ada yang perlu dipantau.
  let timeCard: { label: string; value: string | null; sub: string } | null =
    null
  if (status === 'belum_dibuka') {
    timeCard = {
      label: 'Slot dibuka dalam',
      value: formatRemaining(new Date(summary.opensAt), now),
      sub: `Dibuka ${formatWibDateTime(summary.opensAt)}`,
    }
  } else if (status === 'draft') {
    timeCard = {
      label: 'Sisa waktu kirim',
      value: formatRemaining(new Date(summary.closesAt), now),
      sub: `Sampai ${formatWibDateTime(summary.closesAt)}`,
    }
  } else if (status === 'ditutup') {
    timeCard = {
      label: 'Slot ditutup pada',
      value: formatWibDateTime(summary.closesAt),
      sub: 'Tidak bisa mengirim atau mengubah pesanan lagi',
    }
  }

  const approved = status === 'disetujui'
  const missedSubmit = status === 'ditutup' && !submitted
  const history = summary.submissions
  const lastChecked = history
    .map((h) => h.checkedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  type Step = { title: string; sub: string; state: 'done' | 'todo' | 'missed'; at?: Date }
  const steps: Array<Step> = submitted
    ? [
        ...history.flatMap<Step>((h) => {
          const list: Array<Step> = [
            {
              title: `Submit ke-${h.submitNo} dikirim ke partner`,
              sub: `${formatWibDateTime(h.submittedAt)} · ${h.pcs} pcs`,
              state: 'done',
              at: new Date(h.submittedAt),
            },
          ]
          list.push(
            h.pending > 0
              ? {
                  title: `Submit ke-${h.submitNo} menunggu pengecekan`,
                  sub: `${partnerName} belum mengecek · ${h.pending} pcs`,
                  state: 'todo',
                }
              : {
                  title: `Partner selesai mengecek submit ke-${h.submitNo}`,
                  sub: `${h.checkedAt ? formatWibDateTime(h.checkedAt) : ''} · disetujui ${h.approved} pcs, ditolak ${h.rejected} pcs`,
                  state: 'done',
                  at: h.checkedAt ? new Date(h.checkedAt) : undefined,
                },
          )
          return list
        }),
        ...(summary.draftCount > 0
          ? [
              {
                title: 'Barang baru belum dikirim',
                sub: `${summary.draftCount} barang menunggu dikirim`,
                state: 'todo' as const,
              },
            ]
          : []),
        ...(approved && lastChecked
          ? [
              {
                title: 'Pesanan disetujui',
                sub: formatWibDateTime(lastChecked),
                state: 'done' as const,
                at: new Date(lastChecked),
              },
            ]
          : []),
        ...(sanggahCount > 0
          ? [
              {
                title: 'Pengganti barang ditolak',
                sub: `${sanggahCount} barang perlu pengganti`,
                state: 'todo' as const,
              },
            ]
          : []),
      ]
    : [
        {
          title: 'Dikirim ke partner',
          sub: missedSubmit ? 'Tidak dikirim sebelum slot ditutup' : 'Belum dikirim',
          state: missedSubmit ? 'missed' : 'todo',
        },
        {
          title: 'Menunggu pengecekan partner',
          sub: 'Menunggu pesanan dikirim',
          state: 'todo',
        },
      ]
  // Urutan: yang sedang berjalan di atas, lalu kejadian terbaru ke yang paling lama.
  const sortedSteps = submitted
    ? [
        ...steps.filter((x) => !x.at),
        ...steps.filter((x) => x.at).sort((a, b) => (b.at!.getTime() - a.at!.getTime())),
      ]
    : steps

  const DOT: Record<'done' | 'missed' | 'todo', React.CSSProperties> = {
    done: { background: '#15803d', borderColor: '#15803d' },
    missed: { background: '#b91c1c', borderColor: '#b91c1c' },
    todo: { background: 'transparent', borderColor: 'var(--app-border)' },
  }

  return (
    <main className="app-shell relative mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-4 flex items-start gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Kembali"
          className="rounded-full p-1.5"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1
            className="text-lg font-bold"
            style={{ color: 'var(--app-text)' }}
          >
            Status pesanan
          </h1>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {partnerName}
          </p>
        </div>
      </header>

      <div
        className="mb-3 flex gap-1 rounded-xl border p-1"
        style={{ borderColor: 'var(--app-border)', background: 'var(--app-card)' }}
      >
        {(['status', 'riwayat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
            style={
              tab === t
                ? { background: 'var(--app-accent)', color: 'white' }
                : { color: 'var(--app-text-soft)' }
            }
          >
            {t === 'status' ? 'Status' : 'Submit & tagihan'}
          </button>
        ))}
      </div>

      {tab === 'riwayat' && (
        <div className="flex flex-col gap-3">
          <EventInvoicesSection eventId={eventId} />
          {summary.submissions.length === 0 && (
            <section className="app-card p-4 text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Belum ada submit.
            </section>
          )}
          {summary.submissions.map((h) => (
            <Link
              key={h.submissionId}
              to="/events/$eventId/submit/$submitNo"
              params={{ eventId, submitNo: String(h.submitNo) }}
              className="app-card block p-4 no-underline transition-colors"
              style={{ color: 'var(--app-text)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold">Submit ke-{h.submitNo}</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--app-text-soft)' }}>
                    Dikirim {formatWibDateTime(h.submittedAt)}
                  </p>
                  {h.checkedAt && (
                    <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                      Dicek {formatWibDateTime(h.checkedAt)}
                    </p>
                  )}
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={
                    h.pending > 0
                      ? { background: 'var(--app-warning-soft)', color: '#b45309' }
                      : { background: 'var(--app-success-soft)', color: '#15803d' }
                  }
                >
                  {h.pending > 0 ? 'Menunggu' : 'Sudah dicek'}
                </span>
              </div>
              {h.pending === 0 && (
                <p className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>
                  {invoiceBySubmitNo.has(h.submitNo)
                    ? `Ditagih ${formatInvoiceNumber(invoiceBySubmitNo.get(h.submitNo)!)}`
                    : 'Belum ditagih'}
                </p>
              )}
              <div
                className="mt-4 grid grid-cols-4 overflow-hidden rounded-xl border text-center"
                style={{ borderColor: 'var(--app-border)' }}
              >
                {[
                  { label: 'Pcs', value: h.pcs, color: undefined },
                  { label: 'Disetujui', value: h.approved, color: '#15803d' },
                  { label: 'Ditolak', value: h.rejected, color: h.rejected > 0 ? '#b91c1c' : undefined },
                  { label: 'Menunggu', value: h.pending, color: undefined },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className="py-2.5"
                    style={{ borderLeft: i === 0 ? undefined : '1px solid var(--app-border)' }}
                  >
                    <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>{stat.label}</p>
                    <p className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-right text-xs font-semibold" style={{ color: 'var(--app-accent)' }}>
                Lihat detail →
              </p>
            </Link>
          ))}
        </div>
      )}

      {tab === 'status' && (
      <div className="flex flex-col gap-4">
        {!submitted && (
        <section
          className="flex items-start gap-3 rounded-2xl p-4"
          style={TONE[banner.tone]}
        >
          <span className="mt-0.5 flex-shrink-0">
            {banner.tone === 'success' ? (
              <Check size={18} />
            ) : banner.tone === 'danger' ? (
              <Lock size={18} />
            ) : (
              <Clock size={18} />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed">{banner.text}</p>
          </div>
        </section>
        )}

        {timeCard && (
          <section className="app-card p-4">
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              {timeCard.label}
            </p>
            {timeCard.value && (
              <p
                className="mt-1 text-2xl font-bold tabular-nums"
                style={{ color: 'var(--app-text)' }}
              >
                {timeCard.value}
              </p>
            )}
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {timeCard.sub}
            </p>
          </section>
        )}


        {(status === 'draft' || summary.canSubmit) && (
          <section className="app-card p-4">
            <p className="text-sm" style={{ color: 'var(--app-text)' }}>
              {submitted
                ? `Ada ${summary.draftCount} barang baru yang belum dikirim. Kirim sebagai pengajuan berikutnya.`
                : 'Setelah dikirim, pesanan terkunci sampai partner selesai mengecek.'}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(true)}
              className="app-btn-primary mt-3 flex w-full items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send size={15} />
              Submit sekarang
            </button>
          </section>
        )}

        {error && (
          <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <section className="app-card p-4">
          <ol className="flex flex-col">
            {sortedSteps.map((step, idx) => (
              <li key={`${step.title}-${idx}`} className="relative flex gap-3 pb-4 last:pb-0">
                {idx < sortedSteps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[5px] top-4 bottom-0 w-px"
                    style={{ background: 'var(--app-border)' }}
                  />
                )}
                <span
                  className="relative mt-1 h-3 w-3 flex-shrink-0 rounded-full border-2"
                  style={DOT[step.state]}
                />
                <div>
                  <p
                    className="text-sm"
                    style={{
                      color:
                        step.state === 'todo'
                          ? 'var(--app-text-soft)'
                          : 'var(--app-text)',
                    }}
                  >
                    {step.title}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {step.sub}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      )}

      <ConfirmModal
        open={confirm}
        title="Kirim pesanan ke partner?"
        content="Setelah dikirim, semua pesanan di event ini terkunci dan tidak bisa diubah sampai partner selesai mengecek. Urutan kirim menentukan antrean pengecekan."
        okText="Submit sekarang"
        danger={false}
        loading={busy}
        onOk={submit}
        onCancel={() => setConfirm(false)}
      />
    </main>
  )
}
