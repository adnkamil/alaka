import { useRef, useState } from 'react'
import { Landmark, QrCode, Trash2, Wallet, X } from 'lucide-react'
import Switch from './ui/Switch'

export type PaymentMethodType = 'bank' | 'wallet' | 'qris'

export interface PaymentMethodFormValue {
  type: PaymentMethodType
  provider: string
  accountNumber: string
  accountName: string
  qrisImage: string | null
  isActive: boolean
}

interface PaymentMethodModalProps {
  title: string
  submitLabel?: string
  /** Ada isinya = mode edit (tombol Hapus ikut muncul). */
  initialValue?: PaymentMethodFormValue
  onClose: () => void
  onSubmit: (value: PaymentMethodFormValue) => Promise<void>
  onDelete?: () => Promise<void>
}

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
  type: PaymentMethodType
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

function isCustomOption(options: Array<string>, value: string) {
  return Boolean(value) && !options.includes(value)
}

export default function PaymentMethodModal({
  title,
  submitLabel = 'Simpan',
  initialValue,
  onClose,
  onSubmit,
  onDelete,
}: PaymentMethodModalProps) {
  const isEdit = Boolean(initialValue)
  const [type, setType] = useState<PaymentMethodType>(
    initialValue?.type ?? 'bank',
  )
  const initialOptions =
    initialValue?.type === 'wallet' ? WALLET_OPTIONS : BANK_OPTIONS
  const [selectedOption, setSelectedOption] = useState(
    initialValue && initialValue.type !== 'qris'
      ? isCustomOption(initialOptions, initialValue.provider)
        ? `${initialValue.type === 'wallet' ? 'E-Wallet' : 'Bank'} Lainnya`
        : initialValue.provider
      : '',
  )
  const [customProvider, setCustomProvider] = useState(
    initialValue &&
      initialValue.type !== 'qris' &&
      isCustomOption(initialOptions, initialValue.provider)
      ? initialValue.provider
      : '',
  )
  const [accountNumber, setAccountNumber] = useState(
    initialValue?.accountNumber ?? '',
  )
  const [accountName, setAccountName] = useState(
    initialValue?.accountName ?? '',
  )
  const [qrisImage, setQrisImage] = useState<string | null>(
    initialValue?.qrisImage ?? null,
  )
  const [isActive, setIsActive] = useState(initialValue?.isActive ?? true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = isSubmitting || isDeleting
  const options = type === 'wallet' ? WALLET_OPTIONS : BANK_OPTIONS
  const customLabel = type === 'wallet' ? 'E-Wallet Lainnya' : 'Bank Lainnya'
  const ActiveIcon =
    type === 'qris' ? QrCode : type === 'wallet' ? Wallet : Landmark

  /** Ganti jenis metode: reset pilihan provider biar nggak nyangkut antar jenis. */
  function handleTypeChange(next: PaymentMethodType) {
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
      setQrisImage(await fileToDataUrl(file))
    } catch {
      setError('Gagal membaca gambar, coba file lain')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (type === 'qris') {
      if (!qrisImage) {
        setError('Upload gambar QRIS dulu')
        return
      }
    } else if (accountNumber.trim().length < 3) {
      setError('Nomor rekening/akun wajib diisi')
      return
    }

    const provider =
      type === 'qris'
        ? 'QRIS'
        : (selectedOption === customLabel
            ? customProvider
            : selectedOption
          ).trim()
    if (type !== 'qris' && !provider) {
      setError('Pilih bank/e-wallet dulu')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        type,
        provider,
        accountNumber: type === 'qris' ? '' : accountNumber.trim(),
        accountName: type === 'qris' ? '' : accountName.trim(),
        qrisImage: type === 'qris' ? qrisImage : null,
        isActive,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan metode pembayaran',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setError(null)
    setIsDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal menghapus metode pembayaran',
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!busy) onClose()
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
            <h3 className="text-base font-bold leading-tight">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Pilih jenis metode pembayaran */}
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((option) => {
              const Icon = option.icon
              const active = type === option.type

              return (
                <button
                  key={option.type}
                  type="button"
                  disabled={busy}
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
                {type === 'wallet' ? 'E-wallet' : 'Bank'}
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
                    placeholder={
                      type === 'wallet' ? 'cth. Sakuku' : 'cth. CIMB Niaga'
                    }
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value)}
                    className="app-input"
                  />
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm font-medium">
                {type === 'wallet' ? 'No. HP / akun' : 'No. rekening'}
                <input
                  required
                  inputMode="numeric"
                  placeholder={type === 'wallet' ? '08123456789' : '1234567890'}
                  value={accountNumber}
                  onChange={(e) =>
                    setAccountNumber(e.target.value.replace(/\s+/g, ''))
                  }
                  className="app-input"
                />
                <span
                  className="text-xs"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  Nomor ini tampil di invoice/tagih, bisa disalin pelanggan saat
                  transfer.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium">
                Atas nama (opsional)
                <input
                  placeholder="cth. Adnan Kamil"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="app-input"
                />
              </label>
            </>
          )}

          {type === 'qris' && (
            <>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Upload gambar QRIS — tampil di invoice/tagih supaya pelanggan
                tinggal scan buat bayar.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4"
                style={{ borderColor: 'var(--app-border)' }}
              >
                {qrisImage ? (
                  <img
                    src={qrisImage}
                    alt="Preview QRIS"
                    className="h-48 w-48 rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <QrCode
                      size={32}
                      style={{ color: 'var(--app-text-mute)' }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      Tap untuk pilih gambar QRIS
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
              {qrisImage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setQrisImage(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="self-start text-xs font-semibold disabled:opacity-50"
                  style={{ color: 'var(--app-danger)' }}
                >
                  Hapus gambar ini
                </button>
              )}
            </>
          )}

          {/* Aktif / nonaktif */}
          <div
            className="flex items-center justify-between gap-3 rounded-xl border p-3"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">Metode aktif</span>
              <span
                className="block text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {isActive
                  ? 'Tampil di halaman invoice/tagih'
                  : 'Disimpan, tapi tidak ditampilkan ke pelanggan'}
              </span>
            </span>
            <Switch
              checked={isActive}
              onChange={setIsActive}
              label="Metode aktif"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
              {error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2.5">
            {isEdit && onDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={handleDelete}
                className="mr-auto flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{
                  border: '1px solid var(--app-danger-soft)',
                  background: 'transparent',
                  color: 'var(--app-danger)',
                }}
              >
                <Trash2 size={14} />
                {isDeleting ? 'Menghapus...' : 'Hapus'}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
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
              disabled={busy}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--app-accent)' }}
            >
              {isSubmitting ? 'Menyimpan...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
