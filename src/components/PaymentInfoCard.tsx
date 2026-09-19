import { useState } from 'react'
import { Check, Copy, Download, Landmark, Wallet } from 'lucide-react'

export interface PaymentMethodInfo {
  id: string
  type: 'bank' | 'wallet' | 'qris'
  provider: string
  accountNumber: string | null
  accountName: string | null
  qrisImage: string | null
}

interface PaymentInfoCardProps {
  /** Metode pembayaran AKTIF milik penjual (dari Profil → Pembayaran). */
  methods: Array<PaymentMethodInfo>
  /** Tampil kalau belum ada metode aktif sama sekali. */
  emptyMessage: string
  /** Nama file unduhan QRIS (kalau diisi, tombol "Simpan QRIS" ikut tampil). */
  qrisDownloadName?: string
}

/**
 * Kartu "Pembayaran" di halaman invoice (internal) & tagihan (publik).
 * Menampilkan semua metode aktif: transfer bank/e-wallet (bisa disalin) dan QRIS.
 */
export default function PaymentInfoCard({
  methods,
  emptyMessage,
  qrisDownloadName,
}: PaymentInfoCardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const transferMethods = methods.filter((method) => method.type !== 'qris')
  const qrisMethods = methods.filter((method) => method.type === 'qris')

  async function copyNumber(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="app-card mb-4 p-5">
      <p className="mb-1 text-sm font-bold">Pembayaran</p>

      {methods.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {emptyMessage}
        </p>
      )}

      {transferMethods.length > 0 && (
        <>
          <p className="mb-3 text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Silakan transfer ke rekening berikut, lalu konfirmasi pembayaran.
          </p>
          <div className="flex flex-col gap-2">
            {transferMethods.map((method) => {
              const copied = copiedId === method.id

              return (
                <div
                  key={method.id}
                  className="flex items-center gap-3 rounded-xl p-4"
                  style={{ background: 'var(--app-accent-soft)' }}
                >
                  <span
                    className="app-icon-tile h-10 w-10 flex-shrink-0"
                    style={{ borderRadius: 999 }}
                  >
                    {method.type === 'wallet' ? (
                      <Wallet size={18} />
                    ) : (
                      <Landmark size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: 'var(--app-accent)' }}
                    >
                      {method.provider}
                    </p>
                    <p className="truncate text-base font-bold tracking-wide">
                      {method.accountNumber}
                    </p>
                    {method.accountName && (
                      <p
                        className="truncate text-xs"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        a/n {method.accountName}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      copyNumber(String(method.accountNumber ?? ''), method.id)
                    }
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                    style={{ background: 'var(--app-accent)' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Tersalin!' : 'Salin'}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {qrisMethods.map((method, index) => (
        <div
          key={method.id}
          className={
            transferMethods.length > 0 || index > 0
              ? 'mt-4 border-t pt-4'
              : 'mt-1'
          }
          style={{ borderColor: 'var(--app-border)' }}
        >
          <p className="mb-3 text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {transferMethods.length > 0
              ? 'Atau bayar dengan scan QRIS:'
              : 'Bayar dengan scan QRIS:'}
          </p>
          {method.qrisImage && (
            <>
              <div className="flex justify-center">
                <img
                  src={method.qrisImage}
                  alt="QRIS"
                  className="h-56 w-56 rounded-xl border object-contain p-2"
                  style={{ borderColor: 'var(--app-border)' }}
                />
              </div>
              {qrisDownloadName && (
                <a
                  href={method.qrisImage}
                  download={`${qrisDownloadName}.${
                    method.qrisImage.match(/^data:image\/(\w+);/)?.[1] ?? 'png'
                  }`}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
                  style={{
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text-soft)',
                  }}
                >
                  <Download size={14} />
                  Simpan QRIS
                </a>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
