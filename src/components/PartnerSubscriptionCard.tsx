import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchPartnerSubscriptionPaymentInfo,
  fetchPartnerSubscriptionState,
  submitPartnerSubscriptionRequest,
} from '../lib/partner-subscription-functions'

const STATE_KEY = ['partner-subscription-state']

const STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu verifikasi',
  active: 'Aktif',
  rejected: 'Ditolak',
}

/** Kartu langganan PRO di halaman profil partner. Gaya mengikuti app-card. */
export default function PartnerSubscriptionCard() {
  const queryClient = useQueryClient()
  const { data: state } = useQuery({
    queryKey: STATE_KEY,
    queryFn: () => fetchPartnerSubscriptionState(),
  })
  const { data: payment } = useQuery({
    queryKey: ['partner-subscription-payment'],
    queryFn: () => fetchPartnerSubscriptionPaymentInfo(),
    enabled: !state?.hasPro && !state?.pending,
  })

  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  function pickFile(file: File | undefined) {
    setError(null)
    setDone(false)
    if (!file) return setProofUrl(null)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return setError('Bukti transfer harus berupa PNG, JPG, atau WEBP.')
    }
    if (file.size > 1_000_000) return setError('Ukuran bukti transfer maksimal 1MB.')
    const reader = new FileReader()
    reader.onload = () => setProofUrl(String(reader.result))
    reader.onerror = () => setError('Gagal membaca file.')
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!proofUrl) return
    setSaving(true)
    setError(null)
    try {
      await submitPartnerSubscriptionRequest({ data: { paymentProofImage: proofUrl } })
      await queryClient.invalidateQueries({ queryKey: STATE_KEY })
      setProofUrl(null)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim bukti transfer')
    } finally {
      setSaving(false)
    }
  }

  if (!state) return null

  const endsText = state.proEndsAt
    ? new Date(state.proEndsAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <section className="app-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="pm-display text-base">Langganan PRO</h2>
          <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            Membuka fitur varian dan aturan paket.
          </p>
        </div>
        <span className="app-badge shrink-0">
          {state.hasPro ? `Aktif s.d. ${endsText}` : 'Belum aktif'}
        </span>
      </div>

      {state.pending && (
        <p className="text-sm">
          Pengajuan {new Date(state.pending.createdAt).toLocaleDateString('id-ID')} sedang menunggu verifikasi admin.
        </p>
      )}

      {!state.hasPro && !state.pending && payment && (
        <div className="flex flex-col gap-3">
          {payment.qrisImage && (
            <img
              src={payment.qrisImage}
              alt="QRIS pembayaran PRO"
              className="mx-auto w-48 rounded-xl border bg-white p-2"
            />
          )}
          <p className="pm-num text-center text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
            Rp{Number(payment.proPrice).toLocaleString('id-ID')}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Bukti transfer</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0])}
              className="text-sm"
            />
          </label>
          {proofUrl && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="app-btn-primary"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              {saving ? 'Mengirim…' : 'Kirim bukti transfer'}
            </button>
          )}
        </div>
      )}

      {done && (
        <p className="text-sm" style={{ color: '#3f7d58' }}>
          Bukti transfer terkirim. Akses PRO aktif setelah admin memverifikasi.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: '#b42318' }}>{error}</p>
      )}

      {state.history.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: 'var(--app-border)' }}>
          <span className="text-xs font-semibold">Riwayat</span>
          {state.history.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-[12px]">
              <span>{new Date(h.createdAt).toLocaleDateString('id-ID')}</span>
              <span>
                {STATUS_LABEL[h.status] ?? h.status}
                {h.status === 'rejected' && h.reviewNote ? ` · ${h.reviewNote}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
