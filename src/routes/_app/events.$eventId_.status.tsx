import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Clock, Lock, Send } from 'lucide-react'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { useNow } from '../../components/EventSlotPanel'
import { formatRemaining, formatWibDateTime } from '../../lib/event-slot'
import {
  getEventSlotSummary,
  submitEventToPartner,
} from '../../lib/event-slot-functions'

export const Route = createFileRoute('/_app/events/$eventId_/status')({
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
    refetchInterval: 30_000,
  })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goBack = () => navigate({ to: '/events/$eventId', params: { eventId } })

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await submitEventToPartner({ data: { eventId } })
      await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
      setConfirm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim')
      setConfirm(false)
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
  const sanggahCount = Object.values(summary.bundleStates).filter(
    (state) => state === 'sanggah',
  ).length
  const partnerName = summary.partnerContact?.name ?? 'Partner'
  const deadline = summary.sanggahDeadline
    ? formatWibDateTime(summary.sanggahDeadline)
    : null

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
        title: `${sanggahCount} paket perlu keputusanmu`,
        text: deadline
          ? `Pilih ganti atau tidak sebelum ${deadline}.`
          : 'Pilih ganti atau tidak untuk paket yang kurang.',
      }
      break
    case 'menunggu_verifikasi':
      banner = {
        tone: 'warning',
        title: 'Menunggu verifikasi',
        text: `Barang pengganti sedang diverifikasi ${partnerName}.`,
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
  } else if (status === 'sanggah' && summary.sanggahDeadline) {
    timeCard = {
      label: 'Sisa waktu sanggah',
      value: formatRemaining(new Date(summary.sanggahDeadline), now),
      sub: `Sampai ${deadline}`,
    }
  }

  const approved = status === 'disetujui' || status === 'menyetujui'
  const checkDone = submitted && summary.reviewedAt !== null
  const missedSubmit = status === 'ditutup' && !submitted
  const steps = [
    {
      title: 'Dikirim ke partner',
      sub: submitted
        ? formatWibDateTime(summary.submittedAt!)
        : missedSubmit
          ? 'Tidak dikirim sebelum slot ditutup'
          : 'Belum dikirim',
      state: submitted ? 'done' : missedSubmit ? 'missed' : 'todo',
    },
    {
      title: 'Menunggu pengecekan partner',
      sub: checkDone
        ? 'Partner sudah mengecek'
        : submitted
          ? `${partnerName} belum mengecek`
          : 'Menunggu pesanan dikirim',
      state: checkDone ? 'done' : 'todo',
    },
    {
      title: 'Batas sanggah',
      sub: deadline ?? 'Belum ada batas sanggah',
      state: approved ? 'done' : 'todo',
    },
  ] as const

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

      <div className="flex flex-col gap-4">
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

        {sanggahCount > 0 && (
          <section className="app-card p-4">
            <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
              Barang yang kurang
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--app-text)' }}>
              {sanggahCount} paket perlu keputusanmu
            </p>
            <button
              type="button"
              onClick={goBack}
              className="app-btn-outline mt-3 w-full"
            >
              Ganti barang
            </button>
          </section>
        )}

        {status === 'draft' && (
          <section className="app-card p-4">
            <p className="text-sm" style={{ color: 'var(--app-text)' }}>
              Setelah dikirim, pesanan terkunci sampai partner selesai mengecek.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(true)}
              className="app-btn-primary mt-3 flex w-full items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send size={15} />
              Kirim sekarang
            </button>
          </section>
        )}

        {error && (
          <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <section className="app-card p-4">
          <ol className="flex flex-col gap-4">
            {steps.map((step) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className="mt-1 h-3 w-3 flex-shrink-0 rounded-full border-2"
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

      <ConfirmModal
        open={confirm}
        title="Kirim pesanan ke partner?"
        content="Setelah dikirim, semua pesanan di event ini terkunci dan tidak bisa diubah sampai partner selesai mengecek. Urutan kirim menentukan antrean pengecekan."
        okText="Kirim sekarang"
        danger={false}
        loading={busy}
        onOk={submit}
        onCancel={() => setConfirm(false)}
      />
    </main>
  )
}
