import { useState } from 'react'
import { Lock, Trash2, User, X } from 'lucide-react'
import NumberInput from './ui/NumberInput'
import { findFeeForPrice } from '../lib/fee-tier-validation'
import { formatPhoneNumber } from '../lib/format'
import { lineTotal, summarizeItems } from '../lib/order-totals'

interface FeeTier {
  minPrice: string
  maxPrice: string
  feeAmount: string
}

interface ItemDraft {
  name: string
  originalPrice: number
  fee: number
  qty: number
  // Checklist belanja; nggak ada inputnya di form, cuma dibawa terus dari pesanan
  // yang lagi di-edit supaya statusnya nggak ke-reset.
  obtained: boolean
}

interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

export interface AddOrderSheetValue {
  customerName: string
  paymentStatus?: 'unpaid' | 'dp' | 'paid' | 'shipped'
  paidAmount?: number
  items: Array<ItemDraft>
}

interface AddOrderSheetProps {
  eventName: string
  feeTiers: Array<FeeTier>
  customers?: Array<CustomerOption>
  itemNameSuggestions?: Array<string>
  itemPriceSuggestions?: Record<string, Array<number>>
  /**
   * Fitur PRO `order_suggestions` lagi terkunci (user FREE). Saran memang tidak
   * dikirim server, jadi di sini cukup ditampilkan alasannya.
   */
  suggestionsLocked?: boolean
  /** Sama seperti `suggestionsLocked`, tapi buat fitur PRO `customer_suggestions`. */
  customerSuggestionsLocked?: boolean
  title?: string
  submitLabel?: string
  initialValue?: AddOrderSheetValue
  onClose: () => void
  onSubmit: (value: {
    customerName: string
    paymentStatus: 'unpaid' | 'dp' | 'paid' | 'shipped'
    paidAmount?: number
    items: Array<{
      name: string
      originalPrice: number
      fee: number
      qty: number
      obtained: boolean
    }>
  }) => Promise<void>
}

const emptyItem: ItemDraft = {
  name: '',
  originalPrice: 0,
  fee: 0,
  qty: 1,
  obtained: false,
}

/**
 * qty ikut dipakai buat hitung uang (lineTotal & summarizeItems), jadi kalau
 * sampai undefined/NaN hasilnya "NaN" di ringkasan dan bisa bikin qty di DB
 * ke-reset ke default. Normalisasi di sini biar aman: nilai tidak valid
 * dibalikin ke 1, sama seperti default kolom qty di DB dan validasi zod di server.
 */
function normalizeQty(qty: number | undefined) {
  return Number.isFinite(qty) && Number(qty) >= 1 ? Math.floor(Number(qty)) : 1
}

function toDraft(item: ItemDraft): ItemDraft {
  return {
    ...emptyItem,
    ...item,
    qty: normalizeQty(item.qty),
    obtained: Boolean(item.obtained),
  }
}

export default function AddOrderSheet({
  eventName,
  feeTiers,
  customers = [],
  itemNameSuggestions = [],
  itemPriceSuggestions = {},
  suggestionsLocked = false,
  customerSuggestionsLocked = false,
  title = 'Tambah Pesanan',
  submitLabel = 'Simpan pesanan',
  initialValue,
  onClose,
  onSubmit,
}: AddOrderSheetProps) {
  const [customerName, setCustomerName] = useState(
    initialValue?.customerName ?? '',
  )
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeItemSuggestionIndex, setActiveItemSuggestionIndex] = useState<
    number | null
  >(null)
  const [activePriceSuggestionIndex, setActivePriceSuggestionIndex] =
    useState<number | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'dp' | 'paid' | 'shipped'>(
    initialValue?.paymentStatus ?? 'unpaid',
  )
  // Nominal DP — hanya relevan saat paymentStatus === 'dp'.
  const [dpAmount, setDpAmount] = useState<number>(
    initialValue?.paidAmount ?? 0,
  )
  const [items, setItems] = useState<Array<ItemDraft>>(
    initialValue?.items.length
      ? initialValue.items.map((item) => toDraft(item))
      : [{ ...emptyItem }],
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedTiers = feeTiers.map((tier) => ({
    minPrice: Number(tier.minPrice),
    maxPrice: Number(tier.maxPrice),
    feeAmount: Number(tier.feeAmount),
  }))

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, ...patch }
        if (patch.originalPrice !== undefined) {
          const autoFee = findFeeForPrice(parsedTiers, patch.originalPrice)
          next.fee = autoFee ?? 0
        }
        return next
      }),
    )
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const {
    subtotal: totalPrice,
    totalFee,
    total: totalTagihan,
  } = summarizeItems(items)

  const filteredCustomers = customerName.trim()
    ? customers
        .filter((c) => {
          const query = customerName.trim().toLowerCase()
          return (
            c.name.toLowerCase().includes(query) ||
            (c.phone && c.phone.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')))
          )
        })
        .slice(0, 5)
    : customers.slice(0, 5)

  function customerLabel(customer: CustomerOption) {
    if (!customer.phone) return customer.name
    const last4 = customer.phone.replace(/\D/g, '').slice(-4)
    return last4 ? `${customer.name} ${last4}` : customer.name
  }

  function filteredItemNames(query: string) {
    const trimmed = query.trim().toLowerCase()
    const pool = trimmed
      ? itemNameSuggestions.filter((n) => n.toLowerCase().includes(trimmed))
      : itemNameSuggestions
    return pool.slice(0, 5)
  }

  function pricesForItemName(name: string) {
    const target = name.trim().toLowerCase()
    if (!target) return []
    const key = Object.keys(itemPriceSuggestions).find(
      (n) => n.trim().toLowerCase() === target,
    )
    return key ? itemPriceSuggestions[key] : []
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit({
        customerName,
        paymentStatus,
        paidAmount: paymentStatus === 'dp' ? dpAmount : undefined,
        items: items.map((item) => ({
          name: item.name,
          originalPrice: item.originalPrice,
          fee: item.fee,
          qty: item.qty,
          obtained: item.obtained,
        })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pesanan')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div
        className="app-shell mx-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
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

            <div className="flex flex-col gap-4">
              <label className="relative flex flex-col gap-1 text-sm font-medium">
                Nama pelanggan
                <input
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 120)
                  }
                  autoComplete="off"
                  className="app-input"
                />
                {showSuggestions && filteredCustomers.length > 0 && (
                  <div
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border shadow-lg"
                    style={{
                      background: 'var(--app-card)',
                      borderColor: 'var(--app-border)',
                    }}
                  >
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setCustomerName(customerLabel(customer))
                          setShowSuggestions(false)
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm"
                      >
                        <span className="app-icon-tile h-7 w-7 flex-shrink-0">
                          <User size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {customer.name}
                          </span>
                          {customer.phone && (
                            <span
                              className="block truncate text-xs"
                              style={{ color: 'var(--app-text-soft)' }}
                            >
                              {formatPhoneNumber(customer.phone)}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </label>

              {customerSuggestionsLocked && (
                <div
                  className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs"
                  style={{
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text-mute)',
                  }}
                >
                  <Lock size={13} className="flex-shrink-0" />
                  <span>
                    Saran nama &amp; no. HP pelanggan dari data customer
                    tersedia di paket PRO.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {suggestionsLocked && (
                  <div
                    className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs"
                    style={{
                      borderColor: 'var(--app-border)',
                      color: 'var(--app-text-mute)',
                    }}
                  >
                    <Lock size={13} className="flex-shrink-0" />
                    <span>
                      Saran nama barang &amp; harga dari riwayat pesanan
                      tersedia di paket PRO.
                    </span>
                  </div>
                )}
                {items.map((item, index) => (
                  <div key={index} className="app-card p-3">
                    <label className="relative mb-2 flex flex-col gap-1 text-xs">
                      Nama barang
                      <input
                        required
                        value={item.name}
                        onChange={(e) =>
                          updateItem(index, { name: e.target.value })
                        }
                        onFocus={() => setActiveItemSuggestionIndex(index)}
                        onBlur={() =>
                          setTimeout(
                            () => setActiveItemSuggestionIndex(null),
                            120,
                          )
                        }
                        autoComplete="off"
                        className="app-input"
                      />
                      {activeItemSuggestionIndex === index &&
                        filteredItemNames(item.name).length > 0 && (
                          <div
                            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border shadow-lg"
                            style={{
                              background: 'var(--app-card)',
                              borderColor: 'var(--app-border)',
                            }}
                          >
                            {filteredItemNames(item.name).map((name) => (
                              <button
                                key={name}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  updateItem(index, { name })
                                  setActiveItemSuggestionIndex(null)
                                }}
                                className="block w-full truncate px-3 py-2 text-left text-sm"
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="relative flex flex-col gap-1 text-xs">
                        Harga asli
                        <NumberInput
                          required
                          value={item.originalPrice}
                          onChange={(originalPrice) =>
                            updateItem(index, { originalPrice })
                          }
                          onFocus={() => setActivePriceSuggestionIndex(index)}
                          onBlur={() =>
                            setTimeout(
                              () => setActivePriceSuggestionIndex(null),
                              120,
                            )
                          }
                          className="app-input"
                        />
                        {activePriceSuggestionIndex === index &&
                          pricesForItemName(item.name).length > 0 && (
                            <div
                              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-xl border shadow-lg"
                              style={{
                                background: 'var(--app-card)',
                                borderColor: 'var(--app-border)',
                              }}
                            >
                              {pricesForItemName(item.name).map((price) => (
                                <button
                                  key={price}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    updateItem(index, { originalPrice: price })
                                    setActivePriceSuggestionIndex(null)
                                  }}
                                  className="block w-full truncate px-3 py-2 text-left text-sm"
                                >
                                  {price.toLocaleString('id-ID')}
                                </button>
                              ))}
                            </div>
                          )}
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        Fee jastip
                        <NumberInput
                          required
                          value={item.fee}
                          onChange={(fee) => updateItem(index, { fee })}
                          className="app-input"
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">Jumlah</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(index, {
                              qty: Math.max(1, item.qty - 1),
                            })
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg border text-base font-bold transition-colors"
                          style={{
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text-soft)',
                          }}
                          aria-label="Kurangi jumlah"
                        >
                          −
                        </button>
                        <input
                          inputMode="numeric"
                          value={item.qty}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '')
                            updateItem(index, {
                              qty:
                                digits === '' ? 1 : Math.max(1, Number(digits)),
                            })
                          }}
                          className="app-input w-14 px-2 py-1 text-center"
                          aria-label="Jumlah barang"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(index, { qty: item.qty + 1 })
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg border text-base font-bold transition-colors"
                          style={{
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text-soft)',
                          }}
                          aria-label="Tambah jumlah"
                        >
                          +
                        </button>
                      </div>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        = {lineTotal(item).toLocaleString('id-ID')}
                      </span>
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="mt-2 flex items-center gap-1 text-xs font-semibold"
                        style={{ color: 'var(--app-danger)' }}
                      >
                        <Trash2 size={14} />
                        Hapus barang
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addItem}
                className="app-btn-outline"
              >
                + Tambah barang
              </button>

              <div className="app-card p-3 text-sm">
                <p>Total harga jual: {totalPrice.toLocaleString('id-ID')}</p>
                <p>Total fee: {totalFee.toLocaleString('id-ID')}</p>
                <p className="font-semibold">
                  Total tagihan: {totalTagihan.toLocaleString('id-ID')}
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  Fee berlaku per barang, jadi jumlah ikut dikalikan.
                </p>
              </div>

              <label className="flex flex-col gap-1 text-sm font-medium">
                Status pembayaran
                <select
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(
                      e.target.value as 'unpaid' | 'dp' | 'paid' | 'shipped',
                    )
                  }
                  className="app-input"
                >
                  <option value="unpaid">Belum Lunas</option>
                  <option value="dp">DP (Bayar Sebagian)</option>
                  <option value="paid">Lunas</option>
                  <option value="shipped">Dikirim</option>
                </select>
              </label>

              {paymentStatus === 'dp' && (
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Nominal DP yang dibayar
                  <NumberInput
                    required
                    value={dpAmount}
                    onChange={(v) => setDpAmount(v)}
                    className="app-input"
                    placeholder="0"
                  />
                  {dpAmount > 0 && dpAmount < totalTagihan && (
                    <span
                      className="text-xs"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      Sisa tagihan:{' '}
                      {(totalTagihan - dpAmount).toLocaleString('id-ID')}
                    </span>
                  )}
                  {dpAmount >= totalTagihan && totalTagihan > 0 && (
                    <span
                      className="text-xs"
                      style={{ color: 'var(--app-warning)' }}
                    >
                      Nominal DP melebihi total tagihan — akan dianggap Lunas.
                    </span>
                  )}
                </label>
              )}

            </div>
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
            <button
              type="submit"
              disabled={isSubmitting}
              className="app-btn-primary w-full"
            >
              {isSubmitting ? 'Menyimpan...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}