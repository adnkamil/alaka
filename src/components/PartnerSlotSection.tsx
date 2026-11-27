import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  parseWibLocal,
  slotWindowWarnings,
  toWibLocal,
} from '../lib/event-slot'
import {
  getPartnerSlotQueue,
  getPartnerSlotWindow,
  setPartnerSlotWindow,
} from '../lib/partner-slot-functions'
import { usePartnerT } from './PartnerI18n'

/**
 * Pengaturan slot pemesanan (waktu buka dan tutup, jam WIB) dan antrean
 * jastiper berurutan sesuai urutan submit. Tanpa tombol "Matikan slot":
 * mengosongkan kedua waktu lalu menyimpan tetap memakai alur lama.
 */
export default function PartnerSlotSection({
  calendarEventId,
  eventEndDate = null,
}: {
  calendarEventId: string
  /** Tanggal event berakhir (YYYY-MM-DD) untuk peringatan waktu tutup slot. */
  eventEndDate?: string | null
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
  // Antrean = yang menunggu dicek partner (pengajuan), lalu yang masih draft.
  const waiting = queue.filter(
    (row) => row.status === 'terkirim',
  )
  const drafts = queue.filter((row) => row.rank === null)
  const antrean = [...waiting, ...drafts]
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  // Hanya digit; kosong = tanpa minimal.
  const [minPurchase, setMinPurchase] = useState('')
  // Dikunci menurut jam buka yang tersimpan, sama dengan pemeriksaan server.
  const minLocked =
    window?.opensAt != null && new Date(window.opensAt).getTime() <= Date.now()
  const noSlot = opensAt === '' && closesAt === ''
  const t = usePartnerT()
  const s = t.eventDetail.slot
  const warnings = slotWindowWarnings({
    closesAt: closesAt === '' ? null : parseWibLocal(closesAt),
    eventEndDate,
    closesAfterEventMessage: s.closesAfterEvent,
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    text: string
    error: boolean
  } | null>(null)

  useEffect(() => {
    if (!window) return
    setOpensAt(window.opensAt ? toWibLocal(new Date(window.opensAt)) : '')
    setClosesAt(window.closesAt ? toWibLocal(new Date(window.closesAt)) : '')
    setMinPurchase(window.minPurchase ? String(window.minPurchase) : '')
  }, [window])

  async function save(nextOpens: string, nextCloses: string) {
    setBusy(true)
    setMessage(null)
    try {
      await setPartnerSlotWindow({
        data: {
          calendarEventId,
          opensAt: nextOpens,
          closesAt: nextCloses,
          minPurchase: Number(minPurchase) || null,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-slot-window', calendarEventId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-slot-queue', calendarEventId],
      })
      setMessage({ text: s.saved, error: false })
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : t.common.saveFailed,
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
          {s.title}
        </p>
        <p
          className="mt-1 text-[13px]"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {s.intro}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {s.opens}
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm font-normal"
            style={{ borderColor: 'var(--app-border)' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {s.closes}
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm font-normal"
            style={{ borderColor: 'var(--app-border)' }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {s.minPurchase}
          <input
            type="text"
            inputMode="numeric"
            value={
              minPurchase === ''
                ? ''
                : Number(minPurchase).toLocaleString('id-ID')
            }
            onChange={(e) =>
              setMinPurchase(
                e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12),
              )
            }
            placeholder={s.minPurchaseNone}
            disabled={minLocked || noSlot}
            className="rounded-xl border px-3 py-2 text-sm font-normal disabled:opacity-60"
            style={{ borderColor: 'var(--app-border)' }}
          />
          <span
            className="text-xs font-normal"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {minLocked ? s.minPurchaseLocked : s.minPurchaseHint}
          </span>
        </label>
      </div>
      {warnings.map((w) => (
        <p key={w} className="text-xs" style={{ color: 'var(--app-warning)' }}>
          {w}
        </p>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(opensAt, closesAt)}
          className="app-btn-primary flex-1 disabled:opacity-50"
        >
          {s.save}
        </button>
      </div>
      {message && (
        <p
          className="text-[13px]"
          style={{ color: message.error ? 'var(--app-danger)' : 'var(--app-success)' }}
        >
          {message.text}
        </p>
      )}

      {antrean.length > 0 && window?.opensAt && (
        <div className="flex flex-col">
          <p className="mb-1 text-[13px] font-bold">{s.queue}</p>
          {antrean.map((row) => (
            <Link
              key={row.eventId}
              to="/partner/event/jastiper/$id/$brandId"
              search={{ submit: undefined }}
              params={{ id: calendarEventId, brandId: row.brandId }}
              className="flex items-center gap-3 border-t py-2.5 text-[13px] no-underline"
              style={{ borderColor: 'var(--app-border)', color: 'inherit' }}
            >
              <span className="pm-num w-6 shrink-0 font-bold">
                {row.rank !== null ? `#${row.rank}` : '–'}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {row.brandName || t.eventDetail.noName}
              </span>
              <span
                className="shrink-0 text-[11px]"
                style={{
                  color:
                    row.status === 'terkirim'
                    ? 'var(--app-info)'
                      : 'var(--app-text-soft)',
                }}
              >
                {row.rank !== null ? s.submitted : s.draft}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
