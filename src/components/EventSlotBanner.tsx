import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, X } from 'lucide-react'
import { getEventSlotSummary } from '../lib/event-slot-functions'

type Tone = 'warning' | 'success'

const TONE: Record<Tone, { background: string; color: string }> = {
  warning: { background: 'var(--app-warning-soft)', color: '#b45309' },
  success: { background: 'var(--app-success-soft)', color: '#15803d' },
}

/**
 * Banner status slot di bawah judul event. Setelah submit banner bisa diketuk
 * untuk membuka sheet status. Bisa ditutup (X); penutupan diingat per status,
 * jadi banner muncul lagi hanya kalau statusnya berubah.
 */
export default function EventSlotBanner({
  eventId,
  onOpenStatus,
}: {
  eventId: string
  onOpenStatus: () => void
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(() =>
    readDismissed(eventId),
  )
  const { data: summary } = useQuery({
    queryKey: ['event-slot', eventId],
    queryFn: () => getEventSlotSummary({ data: { eventId } }),
    refetchInterval: 30_000,
  })
  if (!summary) return null

  const sanggahCount = summary.disanggahCount
  const stateKey = `${summary.status}:${sanggahCount}`
  if (dismissedKey === stateKey) return null

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
      text = `${sanggahCount} barang ditolak partner. Kirim pengganti lewat Submit ulang.`
      break
    default:
      tone = 'success'
      text =
        'Pesanan sudah disetujui. Barang yang tidak dapat tidak masuk tagihan.'
  }

  const interactive = summary.submittedAt !== null
  const Body = interactive ? 'button' : 'div'
  return (
    <div
      className="mb-4 flex w-full items-start gap-1 rounded-xl py-3 pl-3.5 pr-2 text-[13px] leading-snug"
      style={TONE[tone]}
    >
      <Body
        {...(interactive
          ? { type: 'button' as const, onClick: onOpenStatus }
          : {})}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
      >
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <span>{text}</span>
      </Body>
      <button
        type="button"
        aria-label="Tutup info"
        onClick={() => {
          writeDismissed(eventId, stateKey)
          setDismissedKey(stateKey)
        }}
        className="flex-shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  )
}

const storageKey = (eventId: string) => `slot-banner-dismissed:${eventId}`

function readDismissed(eventId: string): string | null {
  try {
    return localStorage.getItem(storageKey(eventId))
  } catch {
    return null
  }
}

function writeDismissed(eventId: string, value: string) {
  try {
    localStorage.setItem(storageKey(eventId), value)
  } catch {
    // Penyimpanan diblokir: banner tetap tertutup selama halaman terbuka.
  }
}
