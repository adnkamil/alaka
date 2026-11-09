import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { SLOT_STATUS_LABEL, toWibLocal } from '../lib/event-slot'
import {
  getPartnerSlotQueue,
  getPartnerSlotWindow,
  setPartnerSlotWindow,
} from '../lib/partner-slot-functions'

/**
 * Pengaturan slot pemesanan (waktu buka dan tutup, jam WIB) dan antrean
 * jastiper berurutan sesuai urutan submit. Kosongkan kedua waktu untuk
 * memakai alur lama (jastiper bebas mengubah pesanan).
 */
export default function PartnerSlotSection({
  calendarEventId,
}: {
  calendarEventId: string
}) {
  const queryClient = useQueryClient()
  const { data: window } = useQuery({
    queryKey: ['partner-slot-window', calendarEventId],
    queryFn: () => getPartnerSlotWindow({ data: { calendarEventId } }),
  })
  const { data: queue = [] } = useQuery({
    queryKey: ['partner-slot-queue', calendarEventId],
    queryFn: () => getPartnerSlotQueue({ data: { calendarEventId } }),
    refetchInterval: 30_000,
  })
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    text: string
    error: boolean
  } | null>(null)

  useEffect(() => {
    if (!window) return
    setOpensAt(window.opensAt ? toWibLocal(new Date(window.opensAt)) : '')
    setClosesAt(window.closesAt ? toWibLocal(new Date(window.closesAt)) : '')
  }, [window])

  async function save(nextOpens: string, nextCloses: string) {
    setBusy(true)
    setMessage(null)
    try {
      await setPartnerSlotWindow({
        data: { calendarEventId, opensAt: nextOpens, closesAt: nextCloses },
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-slot-window', calendarEventId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-slot-queue', calendarEventId],
      })
      setMessage({ text: 'Pengaturan slot disimpan.', error: false })
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Gagal menyimpan',
        error: true,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card flex flex-col gap-4 p-5">
      <div>
        <p
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color: 'var(--pm-gold)' }}
        >
          Slot pemesanan
        </p>
        <p
          className="mt-1 text-[13px]"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Jastiper menyusun pesanan dari katalog dulu, lalu bisa mengirimnya ke
          kamu saat slot dibuka. Pesanan yang dikirim terkunci dan antreannya
          mengikuti urutan kirim. Kosongkan kedua waktu kalau event ini tidak
          memakai slot.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Slot dibuka (WIB)
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm font-normal"
            style={{ borderColor: 'var(--app-border)' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Slot ditutup (WIB)
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm font-normal"
            style={{ borderColor: 'var(--app-border)' }}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(opensAt, closesAt)}
          className="app-btn-primary flex-1 disabled:opacity-50"
        >
          Simpan slot
        </button>
        <button
          type="button"
          disabled={busy || (!opensAt && !closesAt)}
          onClick={() => void save('', '')}
          className="app-btn-outline disabled:opacity-50"
        >
          Matikan slot
        </button>
      </div>
      {message && (
        <p
          className="text-[13px]"
          style={{ color: message.error ? '#b42318' : 'var(--app-success)' }}
        >
          {message.text}
        </p>
      )}

      {queue.length > 0 && window?.opensAt && (
        <div className="flex flex-col">
          <p className="mb-1 text-[13px] font-bold">Antrean jastiper</p>
          {queue.map((row) => (
            <Link
              key={row.eventId}
              to="/partner/event/jastiper/$id/$brandId"
              params={{ id: calendarEventId, brandId: row.brandId }}
              className="flex items-center gap-3 border-t py-2.5 no-underline"
              style={{ borderColor: 'var(--app-border)', color: 'inherit' }}
            >
              <span className="pm-num w-8 shrink-0 text-center text-sm font-bold">
                {row.rank !== null ? `#${row.rank}` : '–'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {row.brandName || 'Tanpa nama'}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                <span className="text-[12px] font-semibold">
                  {row.status ? SLOT_STATUS_LABEL[row.status] : '–'}
                </span>
                {(row.sanggahBundles > 0 || row.verifyBundles > 0) && (
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {row.sanggahBundles > 0
                      ? `${row.sanggahBundles} paket sanggah`
                      : ''}
                    {row.sanggahBundles > 0 && row.verifyBundles > 0
                      ? ' · '
                      : ''}
                    {row.verifyBundles > 0
                      ? `${row.verifyBundles} paket perlu verifikasi`
                      : ''}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
