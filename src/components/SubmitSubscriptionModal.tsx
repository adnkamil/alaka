import { useRef, useState } from 'react'
import { Landmark, QrCode, Wallet, X } from 'lucide-react'

export type SubmitSubscriptionValue = {
  amount: number
  paymentMethod: 'bank' | 'wallet' | 'qris'
  paymentProvider: string
  paymentSenderName: string
  paymentReference: string
  paymentProofImage: string
  paymentNote: string
}

interface SubmitSubscriptionModalProps {
  onClose: () => void
  onSubmit: (value: SubmitSubscriptionValue) => Promise<void>
}

// Sama dengan daftar di PaymentMethodModal.tsx, biar user tidak menghadapi
// dua daftar bank/e-wallet yang beda antara bayar tagihan pelanggan dan bayar
// langganan PRO.
const BANK_OPTIONS = ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'Bank Lainnya']
const WALLET_OPTIONS = [
  'GoPay',
  'OVO',
  'DANA',
  'ShopeePay',
  'LinkAja',
  'Jenius',
  'E-Wallet Lainnya',
]

const TYPE_OPTIONS: Array<{
  type: 'bank' | 'wallet' | 'qris'
  label: string
  icon: typeof Landmark
}> = [
  { type: 'bank', label: 'Bank', icon: Landmark },
  { type: 'wallet', label: 'E-Wallet', icon: Wallet },
  { type: 'qris', label: 'QRIS', icon: QrCode },
]

const MAX_BYTES = 1_500_000 // ~1.5MB, sama dengan validasi di server
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
}

export default function SubmitSubscriptionModal({
  onClose,
  onSubmit,
}: SubmitSubscriptionModalProps) {
  const [type, setType] = useState<'bank' | 'wallet' | 'qris'>('bank')
  const [selectedOption, setSelectedOption] = useState('')
  const [customProvider, setCustomProvider] = useState('')
  const [amount, setAmount] = useState('')
  const [senderName, setSenderName] = useState('')
  const [reference, setReference] = useState('')
  const [proofImage, setProofImage] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const options = type === 'wallet' ? WALLET_OPTIONS : BANK_OPTIONS
  const customLabel = type === 'wallet' ? 'E-Wallet Lainnya' : 'Bank Lainnya'
  const ActiveIcon = type === 'qris' ? QrCode : type === 'wallet' ? Wallet : Landmark

  function handleTypeChange(next: 'bank' | 'wallet' | 'qris') {
    if (next === type) return
    setType(next)
    setSelectedOption('')
    setCustomProvider('')
    setError(null)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Format harus PNG, JPEG, atau WEBP')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Ukuran gambar maksimal 1.5MB')
      return
    }

    try {
      setProofImage(await fileToDataUrl(file))
    } catch {
      setError('Gagal membaca gambar, coba file lain')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountValue = Number(amount.replace(/\D/g, ''))
    if (!amountValue || amountValue <= 0) {
      setError('Nominal transfer wajib diisi')
      return
    }
    if (senderName.trim().length < 1) {
      setError('Nama pengirim wajib diisi')
      return
    }
    if (!proofImage) {
      setError('Upload bukti transfer dulu')
      return
    }

    const provider =
      type === 'qris'
        ? 'QRIS'
        : (selectedOption === customLabel ? customProvider : selectedOption).trim()
    if (type !== 'qris' && !provider) {
      setError('Pilih bank/e-wallet dulu')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        amount: amountValue,
        paymentMethod: type,
        paymentProvider: provider,
        paymentSenderName: senderName.trim(),
        paymentReference: reference.trim(),
        paymentProofImage: proofImage,
        paymentNote: note.trim(),
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal mengirim pengajuan',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-[390px] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="app-icon-tile h-10 w-10">
              <ActiveIcon size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">
              Ajukan Upgrade PRO
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Transfer ke rekening/QRIS yang diinfokan admin, lalu isi form ini.
          Status PRO aktif otomatis begitu admin memverifikasi.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = type === option.type
              return (
                <button
                  key={option.type}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleTypeChange(option.type)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition-all disabled:opacity-50 ${
                    active
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-sm'
                      : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)]'
                  }`}
                >
                  <Icon size={16} />
                  {option.label}
                </button>
              )
            })}
          </div>

          {type !== 'qris' && (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">
                {type === 'wallet' ? 'E-wallet tujuan' : 'Bank tujuan'}
                <select
                  required
                  value={selectedOption}
                  onChange={(e) => setSelectedOption(e.target.value)}
                  className="app-input"
                >
                  <option value="" disabled>
                    Pilih {type === 'wallet' ? 'e-wallet' : 'bank'}
                  </option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              {selectedOption === customLabel && (
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Nama {type === 'wallet' ? 'e-wallet' : 'bank'} lain
                  <input
                    required
                    autoFocus
                    placeholder={type === 'wallet' ? 'cth. Sakuku' : 'cth. CIMB Niaga'}
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value)}
                    className="app-input"
                  />
                </label>
              )}
            </>
          )}

          <label className="flex flex-col gap-1 text-sm font-medium">
            Nominal transfer
            <input
              required
              inputMode="numeric"
              placeholder="cth. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              className="app-input"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Nama pengirim
            <input
              required
              placeholder="Nama sesuai rekening pengirim"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="app-input"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            No. referensi (opsional)
            <input
              placeholder="cth. 4 digit terakhir / no. transaksi"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="app-input"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Bukti transfer</span>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4"
              style={{ borderColor: 'var(--app-border)' }}
            >
              {proofImage ? (
                <img
                  src={proofImage}
                  alt="Preview bukti transfer"
                  className="h-40 w-40 rounded-lg object-contain"
                />
              ) : (
                <>
                  <span className="text-2xl">📎</span>
                  <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                    Tap untuk upload screenshot transfer
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            {proofImage && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setProofImage(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="self-start text-xs font-semibold disabled:opacity-50"
                style={{ color: 'var(--app-danger)' }}
              >
                Hapus gambar ini
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Catatan (opsional)
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="cth. transfer dari rekening istri"
              className="app-input resize-none text-sm font-normal"
              maxLength={500}
            />
          </label>

          {error && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
              {error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-text-soft)',
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Mengirim...' : 'Kirim Pengajuan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}