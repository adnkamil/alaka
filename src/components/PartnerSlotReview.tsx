import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toWibLocal } from '../lib/event-slot'
import {
  getPartnerReviewGroups,
  savePartnerReview,
} from '../lib/partner-slot-functions'

function variantText(g: {
  productName: string
  size: string | null
  variation: string | null
}) {
  const variant = [g.size, g.variation].filter(Boolean).join(' / ')
  return variant ? `${g.productName} (${variant})` : g.productName
}

/**
 * Pengecekan barang satu jastiper, per varian (tanpa nama pemesan). Pengecekan
 * pertama menyimpan hasil dan batas waktu sanggah. Sesudahnya partner bisa
 * mengoreksi hasil dan memverifikasi barang pengganti. Pcs yang dapat dibagikan
 * ke pemesan yang masuk lebih dulu.
 */
export default function PartnerSlotReview({
  calendarEventId,
  brandId,
}: {
  calendarEventId: string
  brandId: string
}) {
  const queryClient = useQueryClient()
  const queryKey = ['partner-review', calendarEventId, brandId]
  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      getPartnerReviewGroups({ data: { calendarEventId, brandId } }),
  })
  const [approved, setApproved] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, string>>({})
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    text: string
    error: boolean
  } | null>(null)

  useEffect(() => {
    if (!data) return
    const nextApproved: Record<string, string> = {}
    const nextPending: Record<string, string> = {}
    for (const g of data.groups) {
      nextApproved[g.variantId] = String(g.approvedPcs ?? g.requestedPcs)
      nextPending[g.variantId] = String(g.pendingPcs)
    }
    setApproved(nextApproved)
    setPending(nextPending)
    setDeadline(
      data.sanggahDeadline ? toWibLocal(new Date(data.sanggahDeadline)) : '',
    )
  }, [data])

  if (!data) return null
  if (data.submittedAt === null) {
    return (
      <section className="app-card p-5">
        <p className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
          Jastiper ini belum mengirim pesanan ke kamu.
        </p>
      </section>
    )
  }

  const reviewed = data.reviewedAt !== null

  async function save() {
    if (!data) return
    setBusy(true)
    setMessage(null)
    try {
      const results = data.groups.map((g) => {
        const result: {
          variantId: string
          approvedPcs?: number
          pendingApprovedPcs?: number
        } = { variantId: g.variantId }
        result.approvedPcs = Number(approved[g.variantId] ?? g.requestedPcs)
        if (g.pendingPcs > 0) {
          result.pendingApprovedPcs = Number(pending[g.variantId] ?? 0)
        }
        return result
      })
      await savePartnerReview({
        data: { calendarEventId, brandId, results, sanggahDeadline: deadline },
      })
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({
        queryKey: ['partner-slot-queue', calendarEventId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-jastiper-detail', calendarEventId, brandId],
      })
      setMessage({ text: 'Hasil pengecekan disimpan.', error: false })
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
          {reviewed ? 'Hasil pengecekan' : 'Cek barang'}
        </p>
        <p
          className="mt-1 text-[13px]"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {reviewed
            ? 'Kamu bisa mengoreksi hasil atau memverifikasi barang pengganti. Paket yang kekurangan barang kembali ke keputusan jastiper.'
            : 'Isi jumlah yang dapat untuk tiap barang. Bawaan: dapat semua. Barang yang kurang dibagikan ke pemesan yang masuk lebih dulu.'}
        </p>
      </div>

      <div className="flex flex-col">
        {data.groups.map((g) => (
          <div
            key={g.variantId}
            className="flex flex-col gap-2 border-t py-3 sm:flex-row sm:items-center"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">
                {variantText(g)}
              </p>
              <p
                className="text-[12px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Diminta {g.requestedPcs} pcs ({g.satuanPcs} satuan, {g.paketPcs}{' '}
                dari paket)
              </p>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              Dapat
              <input
                type="number"
                min={0}
                max={g.requestedPcs}
                inputMode="numeric"
                value={approved[g.variantId] ?? ''}
                onChange={(e) =>
                  setApproved((prev) => ({
                    ...prev,
                    [g.variantId]: e.target.value,
                  }))
                }
                className="pm-num w-20 rounded-xl border px-2 py-1.5 text-right text-sm"
                style={{ borderColor: 'var(--app-border)' }}
              />
              <span style={{ color: 'var(--app-text-soft)' }}>
                / {g.requestedPcs}
              </span>
            </label>
            {g.pendingPcs > 0 && (
              <label
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]"
                style={{ background: 'var(--app-accent-soft)' }}
              >
                Pengganti dapat
                <input
                  type="number"
                  min={0}
                  max={g.pendingPcs}
                  inputMode="numeric"
                  value={pending[g.variantId] ?? ''}
                  onChange={(e) =>
                    setPending((prev) => ({
                      ...prev,
                      [g.variantId]: e.target.value,
                    }))
                  }
                  className="pm-num w-20 rounded-xl border px-2 py-1.5 text-right text-sm"
                  style={{ borderColor: 'var(--app-border)' }}
                />
                <span style={{ color: 'var(--app-text-soft)' }}>
                  / {g.pendingPcs}
                </span>
              </label>
            )}
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        Batas waktu sanggah (WIB)
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm font-normal"
          style={{ borderColor: 'var(--app-border)' }}
        />
        <span
          className="text-[12px] font-normal"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {reviewed
            ? 'Hanya boleh diperpanjang. Lewat batas, paket bermasalah otomatis "tidak ganti".'
            : 'Wajib diisi. Lewat batas, paket bermasalah otomatis "tidak ganti".'}
        </span>
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="app-btn-primary disabled:opacity-50"
      >
        {reviewed ? 'Simpan perubahan' : 'Selesai dicek'}
      </button>
      {message && (
        <p
          className="text-[13px]"
          style={{ color: message.error ? '#b42318' : 'var(--app-success)' }}
        >
          {message.text}
        </p>
      )}
    </section>
  )
}
