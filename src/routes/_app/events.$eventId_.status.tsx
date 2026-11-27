import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronRight, Clock, Lock, Receipt, Send } from 'lucide-react'
import EventInvoicesSection, {
  useEventInvoices,
} from '../../components/EventInvoicesSection'
import { useNow } from '../../lib/use-now'
import { formatRemaining, formatWibDateTime } from '../../lib/event-slot'
import { getEventSlotSummary } from '../../lib/event-slot-functions'
import { formatInvoiceNumber } from '../../lib/invoice-rules'

export const Route = createFileRoute('/_app/events/$eventId_/status')({
  validateSearch: (search: Record<string, unknown>) => {
    const t = search.tab
    return { tab: t === 'riwayat' ? ('riwayat' as const) : undefined }
  },
  component: EventStatusPage,
})

type Tone = 'warning' | 'success' | 'danger'

const TONE: Record<Tone, { background: string; color: string }> = {
  warning: { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' },
  success: { background: 'var(--app-success-soft)', color: 'var(--app-success)' },
  danger: { background: 'var(--app-danger-soft)', color: 'var(--app-danger)' },
}

function EventStatusPage() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
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
  const { tab: initialTab } = Route.useSearch()
  const [tab, setTab] = useState<'status' | 'riwayat'>(initialTab === 'riwayat' ? 'riwayat' : 'status')

  const goBack = () => navigate({ to: '/events/$eventId', params: { eventId } })

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
    done: { background: 'var(--app-success)', borderColor: 'var(--app-success)' },
    missed: { background: 'var(--app-danger)', borderColor: 'var(--app-danger)' },
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
                ? { background: 'var(--app-accent)', color: 'var(--app-on-solid)' }
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
            <SubmitCard
              key={h.submissionId}
              eventId={eventId}
              submission={h}
              invoiceNumber={invoiceBySubmitNo.get(h.submitNo)}
            />
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
            <Link
              to="/events/$eventId/submit/cek"
              params={{ eventId }}
              className="app-btn-primary mt-3 flex w-full items-center justify-center gap-2 no-underline"
            >
              <Send size={15} />
              Cek pesanan
            </Link>
          </section>
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

    </main>
  )
}

interface SubmitCardData {
  submitNo: number
  submittedAt: Parameters<typeof formatWibDateTime>[0]
  checkedAt: Parameters<typeof formatWibDateTime>[0] | null
  pcs: number
  approved: number
  rejected: number
  pending: number
}

/** Satu riwayat submit: nomor, waktu, progres pengecekan partner, dan status tagihan. */
function SubmitCard({
  eventId,
  submission: h,
  invoiceNumber,
}: {
  eventId: string
  submission: SubmitCardData
  invoiceNumber: Parameters<typeof formatInvoiceNumber>[0] | undefined
}) {
  const waiting = h.pending > 0
  const total = Math.max(h.pcs, h.approved + h.rejected + h.pending, 1)
  const segments = [
    { key: 'approved', value: h.approved, color: 'var(--app-success)', label: 'disetujui' },
    { key: 'rejected', value: h.rejected, color: 'var(--app-danger)', label: 'ditolak' },
    { key: 'pending', value: h.pending, color: 'var(--app-warning)', label: 'menunggu' },
  ]

  return (
    <Link
      to="/events/$eventId/submit/$submitNo"
      params={{ eventId, submitNo: String(h.submitNo) }}
      className="app-card block p-4 no-underline transition-colors"
      style={{ color: 'var(--app-text)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl leading-none"
          style={
            waiting
              ? { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' }
              : { background: 'var(--app-success-soft)', color: 'var(--app-success)' }
          }
        >
          <span className="text-[9px] font-semibold uppercase tracking-wide">Ke</span>
          <span className="text-lg font-bold">{h.submitNo}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">Submit ke-{h.submitNo}</p>
            <span
              className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={
                waiting
                  ? { background: 'var(--app-warning-soft)', color: 'var(--app-warning)' }
                  : { background: 'var(--app-success-soft)', color: 'var(--app-success)' }
              }
            >
              {waiting ? <Clock size={10} /> : <Check size={10} />}
              {waiting ? 'Menunggu' : 'Sudah dicek'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            Dikirim {formatWibDateTime(h.submittedAt)}
          </p>
          {h.checkedAt && (
            <p className="truncate text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
              Dicek {formatWibDateTime(h.checkedAt)}
            </p>
          )}
        </div>
        <span className="flex-shrink-0 text-right leading-tight">
          <span className="block text-xl font-bold">{h.pcs}</span>
          <span className="block text-[10px]" style={{ color: 'var(--app-text-soft)' }}>pcs</span>
        </span>
      </div>

      <div
        className="mt-4 flex h-2 overflow-hidden rounded-full"
        style={{ background: 'var(--app-border)' }}
        role="img"
        aria-label={segments.map((s) => `${s.value} ${s.label}`).join(', ')}
      >
        {segments.map((s) =>
          s.value > 0 ? (
            <span
              key={s.key}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1" style={{ opacity: s.value > 0 ? 1 : 0.5 }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{s.value}</span>
            {s.label}
          </span>
        ))}
      </div>

      <div
        className="mt-3 flex items-center justify-between gap-2 border-t pt-3"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {waiting ? (
          <span className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
            Tagihan dibuat setelah semua dicek
          </span>
        ) : invoiceNumber !== undefined ? (
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
          >
            <Receipt size={12} />
            {formatInvoiceNumber(invoiceNumber)}
          </span>
        ) : (
          <span
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)' }}
          >
            Belum ditagih
          </span>
        )}
        <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: 'var(--app-accent)' }}>
          Detail
          <ChevronRight size={14} />
        </span>
      </div>
    </Link>
  )
}
