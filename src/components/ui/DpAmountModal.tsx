import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import NumberInput from './NumberInput'

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

interface DpAmountModalProps {
  open: boolean
  /** Total tagihan pesanan — dipakai buat validasi & tampilan bantu. */
  total: number
  /** Nominal awal yang ditampilkan di input (mis. saat sudah pernah DP). */
  defaultAmount?: number
  loading?: boolean
  onCancel: () => void
  onConfirm: (amount: number) => void
}

export default function DpAmountModal({
  open,
  total,
  defaultAmount = 0,
  loading = false,
  onCancel,
  onConfirm,
}: DpAmountModalProps) {
  const [amount, setAmount] = useState(defaultAmount)

  // Reset input setiap kali modal dibuka, biar gak kebawa nilai dari order lain.
  useEffect(() => {
    if (open) setAmount(defaultAmount)
  }, [open, defaultAmount])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  // Nominal DP wajib > 0 dan < total — kalau 0 statusnya balik jadi "unpaid",
  // kalau >= total seharusnya "paid" (lihat derivePaymentStatus di order-totals.ts).
  const isValid = amount > 0 && amount < total

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!loading) onCancel()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-[390px] overflow-hidden rounded-2xl border p-5 shadow-2xl transition-all"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="absolute right-4 top-4 rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
          style={{ color: 'var(--app-text-mute)' }}
          aria-label="Tutup"
        >
          <X size={18} />
        </button>

        <h3 className="text-base font-bold leading-tight">
          Berapa DP yang dibayarkan?
        </h3>
        <p
          className="mt-1.5 text-xs leading-relaxed"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Dari total tagihan {formatIDR(total)}, masukkan nominal yang sudah
          diterima dari pelanggan.
        </p>

        <NumberInput
          value={amount}
          onChange={setAmount}
          placeholder="Contoh: 50.000"
          className="app-input mt-4 w-full"
        />
        {amount > 0 && !isValid && (
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-danger)' }}>
            Nominal harus lebih dari 0 dan kurang dari total tagihan (
            {formatIDR(total)}).
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              border: '1px solid var(--app-border)',
              background: 'transparent',
              color: 'var(--app-text-soft)',
            }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={loading || !isValid}
            onClick={() => onConfirm(amount)}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--app-accent)' }}
          >
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  )
}