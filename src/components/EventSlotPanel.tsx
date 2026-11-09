import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import {
  SLOT_STATUS_LABEL,
  bundleReviewState,
  formatRemaining,
  formatWibDateTime,
} from '../lib/event-slot'
import {
  getEventSlotSummary,
  keepBundleAfterReview,
  replaceBundleComponentAfterReview,
} from '../lib/event-slot-functions'
import type { VariantOption } from './OrderItemList'

type PanelOrder = {
  id: string
  customerName: string
  items: Array<{
    id: string
    name: string
    isBundle: boolean
    partnerRuleId: string | null
    components: Array<{
      id: string
      productName: string
      size: string | null
      variation: string | null
      qty: number
      approvedQty: number | null
    }>
  }>
}

function componentLabel(c: PanelOrder['items'][number]['components'][number]) {
  const variant = [c.size, c.variation].filter(Boolean).join(' / ')
  return variant ? `${c.productName} (${variant})` : c.productName
}

/** Detik demi detik supaya hitung mundur jalan tanpa memuat ulang data. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Panel alur slot di halaman event jastiper: kapan slot buka/tutup, tombol
 * "Submit orderan ke partner", urutan submit, dan keputusan sanggah per paket.
 * Tidak tampil untuk event yang tidak memakai alur slot.
 */
export default function EventSlotPanel({
  eventId,
  orders,
  variantOptionsByRule,
  onChanged,
  open,
  onClose,
}: {
  eventId: string
  orders: Array<PanelOrder>
  variantOptionsByRule: Record<string, Array<VariantOption>>
  onChanged: () => Promise<void>
  /** Dibuka dari tombol "Lihat status" di header event. */
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const now = useNow()
  const { data: summary } = useQuery({
    queryKey: ['event-slot', eventId],
    queryFn: () => getEventSlotSummary({ data: { eventId } }),
    refetchInterval: 30_000,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replacement, setReplacement] = useState<Record<string, string>>({})

  // Tombol back HP/browser menutup sheet, bukan meninggalkan halaman.
  useBackToClose(open, onClose)

  // Sebelum submit, tombol dan hitung mundur ada di header (EventSlotAction).
  if (
    !open ||
    !summary ||
    summary.status === 'belum_dibuka' ||
    summary.status === 'draft' ||
    summary.status === 'ditutup'
  ) {
    return null
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
    await onChanged()
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setBusy(false)
    }
  }

  const deadline = summary.sanggahDeadline
    ? new Date(summary.sanggahDeadline)
    : null
  const untilDeadline = deadline ? formatRemaining(deadline, now) : null

  // Paket yang perlu keputusan jastiper (status sanggah).
  const sanggahBundles = orders.flatMap((order) =>
    order.items
      .filter(
        (item) =>
          item.isBundle &&
          bundleReviewState(item.components) === 'sanggah' &&
          summary.bundleStates[item.id] === 'sanggah',
      )
      .map((item) => ({ order, item })),
  )
  const verifyCount = Object.values(summary.bundleStates).filter(
    (state) => state === 'verifikasi',
  ).length

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Status pesanan ke partner"
        className="app-card relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold">Status pesanan ke partner</p>
          <div className="flex items-center gap-2">
            <span
              className="app-badge"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
              }}
            >
              {SLOT_STATUS_LABEL[summary.status]}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="rounded-full p-1"
              style={{ color: 'var(--app-text-mute)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {summary.rank !== null && summary.total !== null && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{
              background: 'var(--app-accent-soft)',
              color: 'var(--app-accent)',
            }}
          >
            <Lock size={14} />
            <span className="font-semibold">
              Urutan #{summary.rank} dari {summary.total}
            </span>
            <span className="text-xs">
              · dikirim {formatWibDateTime(summary.submittedAt as Date)}
            </span>
          </div>
        )}
        {summary.status === 'terkirim' && (
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Pesanan terkunci. Menunggu partner mengecek barang.
          </p>
        )}

        {summary.status === 'menunggu_verifikasi' && (
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Barang pengganti ({verifyCount} paket) sedang diverifikasi partner.
          </p>
        )}

        {sanggahBundles.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold">
              {sanggahBundles.length} paket perlu keputusanmu
              {untilDeadline
                ? ` · batas ${formatWibDateTime(deadline as Date)} (sisa ${untilDeadline})`
                : deadline
                  ? ' · batas waktu sudah lewat'
                  : ''}
            </p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Pilih ganti barang yang tidak dapat (partner akan mengecek lagi),
              atau tidak ganti: sisa barang dari paket kembali jadi satuan.
              Kalau tidak memilih sampai batas waktu, otomatis tidak ganti.
            </p>
            {sanggahBundles.map(({ order, item }) => {
              const options = item.partnerRuleId
                ? (variantOptionsByRule[item.partnerRuleId] ?? [])
                : []
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border p-3"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <p
                    className="text-xs"
                    style={{ color: 'var(--app-text-mute)' }}
                  >
                    Pesanan {order.customerName}
                  </p>
                  {item.components.map((c) => {
                    const bad = c.approvedQty !== null && c.approvedQty < c.qty
                    return (
                      <div key={c.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 flex-1 break-words">
                            {c.qty}× {componentLabel(c)}
                          </span>
                          <span
                            className="app-badge flex-shrink-0"
                            style={
                              bad
                                ? {
                                    background: '#fdecea',
                                    color: 'var(--app-danger)',
                                  }
                                : {
                                    background: 'var(--app-accent-soft)',
                                    color: 'var(--app-accent)',
                                  }
                            }
                          >
                            {c.approvedQty === null
                              ? 'Menunggu verifikasi'
                              : c.approvedQty >= c.qty
                                ? 'Dapat'
                                : c.approvedQty === 0
                                  ? 'Tidak dapat'
                                  : `Dapat ${c.approvedQty} dari ${c.qty}`}
                          </span>
                        </div>
                        {bad && options.length > 0 && (
                          <div className="flex gap-2">
                            <select
                              aria-label={`Barang pengganti ${componentLabel(c)}`}
                              value={replacement[c.id] ?? ''}
                              onChange={(e) =>
                                setReplacement((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
                              style={{ borderColor: 'var(--app-border)' }}
                            >
                              <option value="">Pilih barang pengganti…</option>
                              {options.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy || !replacement[c.id]}
                              onClick={() =>
                                void run(() =>
                                  replaceBundleComponentAfterReview({
                                    data: {
                                      componentId: c.id,
                                      partnerVariantId: replacement[c.id],
                                    },
                                  }),
                                )
                              }
                              className="app-btn-outline disabled:opacity-50"
                              style={{ minHeight: 36, fontSize: 13 }}
                            >
                              Ganti
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!item.components.some((c) => c.approvedQty === null) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          keepBundleAfterReview({
                            data: { bundleId: item.id },
                          }),
                        )
                      }
                      className="app-btn-outline disabled:opacity-50"
                      style={{ minHeight: 36, fontSize: 13 }}
                    >
                      Tidak ganti
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {(summary.status === 'disetujui' ||
          summary.status === 'menyetujui') && (
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Pesanan sudah final. Barang yang tidak dapat tidak masuk tagihan.
          </p>
        )}

        {error && (
          <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
