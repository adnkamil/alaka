import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useNow } from './EventSlotPanel'
import { formatRemaining } from '../lib/event-slot'
import { getEventSlotSummary } from '../lib/event-slot-functions'

type Tone = 'warning' | 'success'

const TONE: Record<Tone, { background: string; color: string }> = {
  warning: { background: 'var(--app-warning-soft)', color: '#b45309' },
  success: { background: 'var(--app-success-soft)', color: '#15803d' },
}

/**
 * Banner status slot di bawah judul event. Setelah submit banner bisa diketuk
 * untuk membuka sheet status.
 */
export default function EventSlotBanner({
  eventId,
  onOpenStatus,
}: {
  eventId: string
  onOpenStatus: () => void
}) {
  const now = useNow()
  const { data: summary } = useQuery({
    queryKey: ['event-slot', eventId],
    queryFn: () => getEventSlotSummary({ data: { eventId } }),
    refetchInterval: 30_000,
  })
  if (!summary) return null

  const sanggahCount = Object.values(summary.bundleStates).filter(
    (state) => state === 'sanggah',
  ).length
  const untilDeadline = summary.sanggahDeadline
    ? formatRemaining(new Date(summary.sanggahDeadline), now)
    : null

  let tone: Tone
  let text: string
  switch (summary.status) {
    case 'belum_dibuka':
      tone = 'warning'
      text =
        'Slot pemesanan belum dibuka. Pesanan bisa dikirim setelah partner membuka slot.'
      break
    case 'draft':
      tone = 'success'
      text = 'Slot dibuka. Kirim pesanan sebelum slot ditutup.'
      break
    case 'ditutup':
      tone = 'warning'
      text =
        'Slot sudah ditutup. Pesanan yang belum dikirim tidak akan dicek partner.'
      break
    case 'terkirim':
      tone = 'success'
      text = `Pesanan sudah dikirim ke partner. Urutan #${summary.rank} dari ${summary.total}. Menunggu partner mengecek barang.`
      break
    case 'sanggah':
      tone = 'warning'
      text = `${sanggahCount} paket perlu keputusanmu${
        untilDeadline ? ` (sisa ${untilDeadline})` : ''
      }. Ketuk untuk memilih ganti atau tidak.`
      break
    case 'menunggu_verifikasi':
      tone = 'warning'
      text = 'Barang pengganti sedang diverifikasi partner.'
      break
    default:
      tone = 'success'
      text =
        'Pesanan sudah disetujui. Barang yang tidak dapat tidak masuk tagihan.'
  }

  const interactive = summary.submittedAt !== null
  const Wrapper = interactive ? 'button' : 'div'
  return (
    <Wrapper
      {...(interactive
        ? { type: 'button' as const, onClick: onOpenStatus }
        : {})}
      className="mb-4 flex w-full items-start gap-2.5 rounded-xl px-3.5 py-3 text-left text-[13px] leading-snug"
      style={TONE[tone]}
    >
      <Info size={16} className="mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </Wrapper>
  )
}
