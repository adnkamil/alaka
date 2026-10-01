import { useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Info, Upload, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { formatPhoneNumber } from '../lib/format'
import {
  MAX_IMPORT_ORDERS,
  MAX_IMPORT_ROWS,
  buildImportPreview,
  readRowsFromFile,
} from '../lib/order-import'
import type { ImportOrderInput, ImportPreview } from '../lib/order-import'

interface FeeTier {
  minPrice: string
  maxPrice: string
  feeAmount: string
}

interface ExistingOrder {
  id: string
  customerName: string
  paymentStatus: 'unpaid' | 'dp' | 'paid' | 'shipped'
  createdAt: Date | string
}

interface ImportOrdersModalProps {
  eventName: string
  /** Aturan fee event ini — kosong = event belum punya aturan fee jastip. */
  feeTiers: Array<FeeTier>
  /** Nama aturan fee event ini (buat keterangan dari mana fee-nya diambil). */
  feeRuleName: string | null
  /** Pesanan yang sudah ada di event ini, buat info "bakal digabung". */
  existingOrders?: Array<ExistingOrder>
  onClose: () => void
  onSubmit: (orders: Array<ImportOrderInput>) => Promise<void>
}

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

/**
 * Import pesanan dari file Excel/CSV: pilih file → preview apa yang bakal masuk
 * → import. Dipakai dari menu tiga titik di halaman Detail Event.
 *
 * Fee jastip TIDAK diambil dari file, tapi dihitung dari aturan fee event ini
 * (aturan yang sama dipakai form Tambah Pesanan); kalau event belum punya
 * aturan fee atau harganya di luar semua tier, fee-nya 0.
 */
export default function ImportOrdersModal({
  eventName,
  feeTiers,
  feeRuleName,
  existingOrders = [],
  onClose,
  onSubmit,
}: ImportOrdersModalProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useBackToClose(true, onClose)

  const parsedTiers = feeTiers.map((tier) => ({
    minPrice: Number(tier.minPrice),
    maxPrice: Number(tier.maxPrice),
    feeAmount: Number(tier.feeAmount),
  }))

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setIsReading(true)
    try {
      const rows = await readRowsFromFile(file)
      const next = buildImportPreview(rows, parsedTiers, { existingOrders })
      setPreview(next)
      setFileName(file.name)
      // `fatalError` sudah tampil sebagai banner di badan modal, jadi tidak
      // perlu diulang di bawah — `error` buat kegagalan lain (file tak terbaca).
    } catch (err) {
      setPreview(null)
      setFileName(file.name)
      setError(err instanceof Error ? err.message : 'File-nya gagal dibaca')
    } finally {
      setIsReading(false)
      // Direset supaya memilih file yang sama lagi tetap memicu onChange.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!preview || preview.fatalError || preview.errors.length > 0) return

    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(
        preview.orders.map(({ customerName, customerPhone, items }) => ({
          customerName,
          customerPhone,
          items,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal import data')
    } finally {
      setIsSubmitting(false)
    }
  }

  const importable =
    Boolean(preview) &&
    !preview?.fatalError &&
    (preview?.errors.length ?? 0) === 0
  const mergeCount =
    preview?.orders.filter((order) => order.mergeIntoExisting).length ?? 0
  const grandTotal =
    preview?.orders.reduce((sum, order) => sum + order.total, 0) ?? 0
  const itemCount =
    preview?.orders.reduce((sum, order) => sum + order.items.length, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div
        className="app-shell mx-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <FileSpreadsheet size={20} />
                Import data
              </h2>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{ color: 'var(--app-text-soft)' }}
                aria-label="Tutup"
              >
                <X size={22} />
              </button>
            </div>

            <span
              className="app-badge mb-4 inline-flex"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
              }}
            >
              {eventName}
            </span>

            {/* File yang dipilih cuma dipakai buat baca baris-barisnya di
                browser; isinya tidak diupload ke server. */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />

            {isReading && (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Membaca file...
              </p>
            )}

            {!isReading && !preview && (
              <div className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed">
                  Upload file Excel (.xlsx) atau CSV berisi data pesanan. Kolom
                  yang dibaca:
                </p>
                <div
                  className="app-card overflow-hidden p-0 text-xs"
                  style={{ background: 'var(--app-card-hover)' }}
                >
                  <div
                    className="grid grid-cols-4 gap-2 border-b px-3 py-2 font-semibold"
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    <span>No urut</span>
                    <span>Nama-no wa</span>
                    <span>item</span>
                    <span>harga</span>
                  </div>
                  <div
                    className="grid grid-cols-4 gap-2 px-3 py-2"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    <span>1</span>
                    <span className="truncate">Nia - 08123456789</span>
                    <span className="truncate">Kaos</span>
                    <span className="whitespace-nowrap">15.000</span>
                  </div>
                </div>
                <p className="text-xs leading-relaxed">
                  Urutan kolom bebas, yang penting nama header-nya ada. Satu
                  pelanggan boleh muncul di beberapa baris — barangnya otomatis
                  dikumpulkan jadi satu tagihan.
                </p>
              </div>
            )}

            {!isReading && preview?.fatalError && (
              <div
                className="rounded-xl border p-4"
                style={{
                  borderColor: 'var(--app-danger-soft)',
                  background: 'var(--app-danger-soft)',
                }}
              >
                <p
                  className="flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--app-danger)' }}
                >
                  <AlertTriangle size={16} />
                  File-nya belum bisa dipakai
                </p>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: 'var(--app-danger)' }}
                >
                  {preview.fatalError}
                </p>
              </div>
            )}

            {!isReading && preview && !preview.fatalError && (
              <div className="flex flex-col gap-3">
                <div className="app-card p-4">
                  <p className="text-sm font-semibold">
                    {preview.orders.length} pelanggan · {itemCount} barang
                  </p>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Total tagihan {formatIDR(grandTotal)} · {preview.dataRows}{' '}
                    baris dibaca
                    {fileName ? ` · ${fileName}` : ''}
                  </p>
                </div>

                <p
                  className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed"
                  style={{
                    borderColor: 'var(--app-accent-soft)',
                    background: 'var(--app-accent-soft)',
                  }}
                >
                  <Info size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {feeRuleName
                      ? `Fee jastip diisi otomatis dari aturan fee "${feeRuleName}" milik event ini.`
                      : 'Event ini belum punya aturan fee jastip, jadi fee-nya diisi 0. Bisa diubah nanti dari pesanannya.'}
                  </span>
                </p>

                {mergeCount > 0 && (
                  <p
                    className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed"
                    style={{
                      borderColor: 'var(--app-warning-soft)',
                      background: 'var(--app-warning-soft)',
                      color: 'var(--app-warning)',
                    }}
                  >
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span>
                      {mergeCount} pelanggan sudah punya pesanan yang belum
                      lunas di event ini — barangnya digabung ke pesanan itu,
                      bukan bikin tagihan baru.
                    </span>
                  </p>
                )}

                {preview.errors.length > 0 && (
                  <div
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: 'var(--app-danger-soft)',
                      background: 'var(--app-danger-soft)',
                    }}
                  >
                    <p
                      className="flex items-center gap-2 text-sm font-semibold"
                      style={{ color: 'var(--app-danger)' }}
                    >
                      <AlertTriangle size={16} />
                      {preview.errors.length} baris belum benar
                    </p>
                    <p
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: 'var(--app-danger)' }}
                    >
                      Perbaiki dulu baris-baris ini di file-nya, lalu pilih
                      ulang file-nya. Belum ada data yang masuk ke event.
                    </p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {preview.errors.slice(0, 15).map((rowError) => (
                        <li
                          key={`${rowError.rowNumber}-${rowError.message}`}
                          className="text-xs"
                          style={{ color: 'var(--app-danger)' }}
                        >
                          Baris {rowError.rowNumber}: {rowError.message}
                        </li>
                      ))}
                    </ul>
                    {preview.errors.length > 15 && (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: 'var(--app-danger)' }}
                      >
                        …dan {preview.errors.length - 15} baris lainnya.
                      </p>
                    )}
                  </div>
                )}

                {preview.emptyRows > 0 && (
                  <p
                    className="text-xs"
                    style={{ color: 'var(--app-text-mute)' }}
                  >
                    {preview.emptyRows} baris kosong dilewati.
                  </p>
                )}

                {preview.orders.map((order) => (
                  <div key={order.customerName} className="app-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {order.customerName}
                        </p>
                        <p
                          className="mt-0.5 text-xs"
                          style={{ color: 'var(--app-text-soft)' }}
                        >
                          {order.customerPhone
                            ? formatPhoneNumber(order.customerPhone)
                            : 'Tanpa no. WA'}
                          {` · ${order.items.length} barang`}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold">
                        {formatIDR(order.total)}
                      </span>
                    </div>

                    {order.mergeIntoExisting && (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: 'var(--app-warning)' }}
                      >
                        Digabung ke pesanan yang belum lunas.
                      </p>
                    )}

                    <div className="mt-2 flex flex-col gap-2">
                      {order.items.map((item) => (
                        <div
                          key={`${item.name}-${item.originalPrice}`}
                          className="flex items-start justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate">
                              {item.qty > 1 && <b>{item.qty}x </b>}
                              {item.name}
                            </p>
                            <p style={{ color: 'var(--app-text-mute)' }}>
                              {formatIDR(item.originalPrice)} × {item.qty}
                              {item.fee > 0
                                ? ` · fee ${formatIDR(item.fee)}/barang`
                                : ' · tanpa fee'}
                            </p>
                          </div>
                          <span className="whitespace-nowrap font-medium">
                            {formatIDR(
                              (item.originalPrice + item.fee) * item.qty,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-xs leading-relaxed">
                  Fee berlaku per barang dan ikut dikalikan jumlah. Semua
                  pesanan hasil import masuk sebagai <b>Belum Lunas</b> — status
                  pembayarannya ditandai nanti seperti pesanan biasa.
                </p>
              </div>
            )}
          </div>

          <div
            className="flex-shrink-0 border-t p-5"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--app-card)',
            }}
          >
            {error && (
              <p
                className="mb-3 text-sm"
                style={{ color: 'var(--app-danger)' }}
              >
                {error}
              </p>
            )}

            {importable && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="app-btn-primary mb-2 w-full"
              >
                {isSubmitting
                  ? 'Mengimport...'
                  : `Import ${preview?.orders.length ?? 0} pesanan`}
              </button>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="app-btn-outline flex-1 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isReading || isSubmitting}
                className="app-btn-outline flex-1 disabled:opacity-50"
              >
                <Upload size={16} />
                {preview ? 'Ganti file' : 'Pilih file'}
              </button>
            </div>

            <p
              className="mt-3 text-[11px] leading-relaxed"
              style={{ color: 'var(--app-text-mute)' }}
            >
              Maksimal {MAX_IMPORT_ORDERS} pelanggan & {MAX_IMPORT_ROWS} baris
              sekali import.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
