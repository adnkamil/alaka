import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toWibLocal } from './event-slot'
import {
  getPartnerReviewGroups,
  savePartnerReview,
} from './partner-slot-functions'

/**
 * Keadaan pengecekan barang satu jastiper di Partner Portal. Jumlah yang dapat
 * diisi langsung di baris tabel (per varian, tanpa nama pemesan); batas sanggah
 * dan tombol simpan ada di `PartnerReviewFooter`.
 */
export function usePartnerReview(calendarEventId: string, brandId: string) {
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

  // Isi ulang dari server setiap data berubah (bawaan: dapat semua).
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

  async function save() {
    if (!data) return
    setBusy(true)
    setMessage(null)
    try {
      // Baris bentukan ulang untuk barang yang ditukar tidak punya pesanan sendiri.
      const results = data.groups
        .filter((g) => g.requestedPcs > 0 || g.pendingPcs > 0)
        .map((g) => ({
        variantId: g.variantId,
        approvedPcs: Number(approved[g.variantId] ?? g.requestedPcs),
        ...(g.pendingPcs > 0
          ? { pendingApprovedPcs: Number(pending[g.variantId] ?? 0) }
          : {}),
      }))
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
      await queryClient.invalidateQueries({
        queryKey: ['partner-event-revenue', calendarEventId],
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

  return {
    data,
    submitted: data?.submittedAt != null,
    reviewed: data?.reviewedAt != null,
    approved,
    setApprovedFor: (variantId: string, value: string) =>
      setApproved((prev) => ({ ...prev, [variantId]: value })),
    pending,
    setPendingFor: (variantId: string, value: string) =>
      setPending((prev) => ({ ...prev, [variantId]: value })),
    deadline,
    setDeadline,
    busy,
    message,
    save,
  }
}

export type PartnerReviewState = ReturnType<typeof usePartnerReview>
