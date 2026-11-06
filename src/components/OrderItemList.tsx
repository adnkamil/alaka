import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Trash2, X } from 'lucide-react'
import ConfirmModal from './ui/ConfirmModal'
import RupiahInput from './ui/RupiahInput'
import { lineTotal } from '../lib/order-totals'
import type { PendingRuleInfo } from '../lib/partner-paket-pending'
import {
  bundleRuleLabel,
  componentDisplayName,
  pendingNoteText,
  splitOrderItems,
} from '../lib/order-item-groups'

export type OrderItemView = {
  id: string
  name: string
  /** Nama aturan paket untuk barang satuan (kosong jika tidak masuk aturan). */
  groupLabel?: string | null
  isBundle: boolean
  partnerRuleId: string | null
  ruleName: string | null
  partnerVariantId: string | null
  qty: number
  originalPrice: string
  fee: string
  components: Array<{
    id: string
    partnerVariantId: string | null
    productName: string
    size: string | null
    variation: string | null
    qty: number
  }>
}

export type VariantOption = { id: string; label: string }

interface OrderItemListProps {
  items: Array<OrderItemView>
  /** Kartu ringkasan: paket tidak dirinci, cukup satu kalimat jumlah paket dan pcs. */
  bundleSummaryOnly?: boolean
  pendingRules: Array<PendingRuleInfo>
  formatIDR: (value: number) => string
  /** Simpan harga jual dan fee satu paket. */
  onSaveBundlePrice: (item: OrderItemView, sellPrice: number, fee: number) => Promise<void>
  onRemoveComponent: (componentId: string) => Promise<void>
  /** Tidak dipakai lagi: isi paket tidak bisa diganti, hanya dihapus lalu ditambah ulang. */
  variantOptionsByRule?: Record<string, Array<VariantOption>>
  onChangeComponent?: (componentId: string, partnerVariantId: string) => Promise<void>
}

type ComponentView = OrderItemView['components'][number]
type PriceDraft = { sell: string; fee: string }

/** Baris paket setelah barang yang sama digabung (hanya untuk tampilan). */
type MergedLine = {
  key: string
  component: ComponentView
  /** Id komponen asli, urut dari yang paling lama masuk. */
  ids: Array<string>
  qty: number
}

function mergeComponents(groupItems: Array<OrderItemView>): Array<MergedLine> {
  const lines = new Map<string, MergedLine>()
  for (const item of groupItems) {
    for (const c of item.components) {
      const key = `${c.partnerVariantId ?? ''}|${c.productName}|${c.size ?? ''}|${c.variation ?? ''}`
      const existing = lines.get(key)
      if (existing) {
        existing.ids.push(c.id)
        existing.qty += c.qty
      } else {
        lines.set(key, { key, component: c, ids: [c.id], qty: c.qty })
      }
    }
  }
  return [...lines.values()]
}

/** Satu komponen dengan tampilan yang sama seperti barang satuan: nama, varian di bawahnya. */
function ComponentLine({ component }: { component: ComponentView }) {
  const label = [component.size, component.variation].filter(Boolean).join(' / ')
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm">{component.productName}</p>
      {label && (
        <p className="truncate text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
          {label}
        </p>
      )}
    </div>
  )
}

export default function OrderItemList({
  items,
  bundleSummaryOnly = false,
  pendingRules,
  formatIDR,
  onSaveBundlePrice,
  onRemoveComponent,
}: OrderItemListProps) {
  const { singles: rawSingles, bundles } = splitOrderItems(items)
  // Barang satuan yang sama (varian, harga, fee) ditampilkan sebagai satu baris dengan qty.
  const singles = useMemo(() => {
    const map = new Map<string, OrderItemView & { mergedQty: number }>()
    for (const item of rawSingles) {
      const key = `${item.partnerVariantId ?? item.id}|${Number(item.originalPrice)}|${Number(item.fee)}`
      const existing = map.get(key)
      if (existing) {
        existing.mergedQty += item.qty
      } else {
        map.set(key, { ...item, mergedQty: item.qty })
      }
    }
    return [...map.values()]
  }, [rawSingles])

  // Baris paket yang sedang dibuka (menampilkan harga dan tombol hapus).
  const [expandedLines, setExpandedLines] = useState<Set<string>>(() => new Set())
  function toggleLine(key: string) {
    setExpandedLines((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Paket dikelompokkan per nama aturan, urutan mengikuti kemunculan pertama.
  const groups = useMemo(() => {
    const map = new Map<string, Array<OrderItemView>>()
    for (const item of bundles) {
      const key = bundleRuleLabel(item)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()].map(([label, groupItems]) => {
      const sells = new Set(groupItems.map((i) => Math.round(Number(i.originalPrice))))
      const fees = new Set(groupItems.map((i) => Math.round(Number(i.fee))))
      const uniform = sells.size === 1 && fees.size === 1
      return {
        label,
        bundles: groupItems,
        lines: mergeComponents(groupItems),
        uniformPrice: uniform ? { sell: [...sells][0], fee: [...fees][0] } : null,
      }
    })
  }, [bundles])

  // Modal "Ubah harga dan fee" dibuka per jenis paket (per aturan).
  const [priceGroup, setPriceGroup] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState<PriceDraft>({ sell: '0', fee: '0' })
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<{
    componentId: string
    text: string
  } | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const activeGroup = groups.find((g) => g.label === priceGroup) ?? null

  function openGroupPrice(group: (typeof groups)[number]) {
    setPriceError(null)
    const first = group.bundles[0]
    setPriceDraft({
      sell: String(Math.round(Number(first.originalPrice))),
      fee: String(Math.round(Number(first.fee))),
    })
    setPriceGroup(group.label)
  }

  async function saveGroupPrice() {
    if (!activeGroup) return
    setPriceBusy(true)
    setPriceError(null)
    try {
      const sell = Number(priceDraft.sell) || 0
      const fee = Number(priceDraft.fee) || 0
      for (const item of activeGroup.bundles) {
        await onSaveBundlePrice(item, sell, fee)
      }
      setPriceGroup(null)
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Gagal menyimpan harga paket')
    } finally {
      setPriceBusy(false)
    }
  }

  function askRemove(component: ComponentView, componentId: string) {
    setRemoveError(null)
    setPendingRemove({
      componentId,
      text: `${componentDisplayName(component)} hilang dari pesanan pemesan. Sisa paket kembali ke barang satuan lalu dicek ulang untuk paket baru.`,
    })
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    setRemoveBusy(true)
    setRemoveError(null)
    try {
      await onRemoveComponent(pendingRemove.componentId)
      setPendingRemove(null)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Gagal menghapus barang dari paket')
    } finally {
      setRemoveBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {singles.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--app-text-soft)' }}>
            Barang satuan
          </p>
          {singles.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="break-words">{item.name}</p>
                {item.groupLabel && (
                  <p className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
                    {item.groupLabel}
                  </p>
                )}
              </div>
              <span className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
                {item.mergedQty > 1 && (
                  <span
                    className="app-badge"
                    style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
                  >
                    ×{item.mergedQty}
                  </span>
                )}
                {formatIDR(lineTotal({ ...item, qty: item.mergedQty }))}
              </span>
            </div>
          ))}
          {pendingRules.map((p) => (
            <p key={p.ruleId} className="text-xs" style={{ color: 'var(--app-accent)' }}>
              {pendingNoteText(p)}
            </p>
          ))}
        </section>
      )}

      {bundleSummaryOnly && bundles.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
          Terdapat {bundles.reduce((sum, b) => sum + b.qty, 0)} paket, dengan jumlah item{' '}
          {bundles.reduce(
            (sum, b) => sum + b.components.reduce((s, c) => s + c.qty, 0) * b.qty,
            0,
          )}{' '}
          pcs
        </p>
      )}

      {!bundleSummaryOnly && bundles.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--app-text-soft)' }}>
            Paket
          </p>

          {groups.map((group) => {
            const first = group.bundles[0]
            const pcsPerBundle = first
              ? first.components.reduce((sum, c) => sum + c.qty, 0) || 1
              : 1
            const perPcs = first
              ? (Math.round(Number(first.originalPrice)) + Math.round(Number(first.fee))) / pcsPerBundle
              : 0
            return (
              <div key={group.label} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{group.label}</p>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">{formatIDR(perPcs)}</span>
                    <button
                      type="button"
                      aria-label="Ubah harga dan fee"
                      onClick={() => openGroupPrice(group)}
                      className="p-1"
                      style={{ color: 'var(--app-accent)' }}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
                {group.lines.map((line) => {
                  const open = expandedLines.has(line.key)
                  return (
                    <div
                      key={line.key}
                      className="flex flex-col rounded-xl border"
                      style={{ borderColor: 'var(--app-border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleLine(line.key)}
                        aria-expanded={open}
                        className="flex items-center gap-2 px-3 py-2 text-left"
                      >
                        <ComponentLine component={line.component} />
                        {line.qty > 1 && (
                          <span
                            className="app-badge flex-shrink-0"
                            style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
                          >
                            ×{line.qty}
                          </span>
                        )}
                        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {open && (
                        <div
                          className="flex items-center justify-end border-t px-3 py-2"
                          style={{ borderColor: 'var(--app-border)' }}
                        >
                          <button
                            type="button"
                            aria-label={`Hapus ${componentDisplayName(line.component)}`}
                            className="flex-shrink-0 p-1"
                            style={{ color: 'var(--app-danger)' }}
                            onClick={() => askRemove(line.component, line.ids[line.ids.length - 1])}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>
      )}

      {activeGroup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => !priceBusy && setPriceGroup(null)}
        >
          <div className="app-card w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Ubah harga dan fee {activeGroup.label}</p>
              <button
                type="button"
                aria-label="Tutup"
                disabled={priceBusy}
                onClick={() => setPriceGroup(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-xs" style={{ color: 'var(--app-text-mute)' }}>
              Berlaku untuk {activeGroup.bundles.length} paket di aturan ini.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div
                className="flex flex-col gap-1 rounded-xl border p-2"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span className="text-xs">Harga jual</span>
                <RupiahInput
                  value={priceDraft.sell}
                  onChange={(v) => setPriceDraft((prev) => ({ ...prev, sell: v }))}
                />
              </div>
              <div
                className="flex flex-col gap-1 rounded-xl border p-2"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span className="text-xs">Fee jastip</span>
                <RupiahInput
                  value={priceDraft.fee}
                  onChange={(v) => setPriceDraft((prev) => ({ ...prev, fee: v }))}
                />
              </div>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Total: {formatIDR((Number(priceDraft.sell) || 0) + (Number(priceDraft.fee) || 0))}
            </p>
            {priceError && (
              <p className="mt-3 text-xs" style={{ color: 'var(--app-danger)' }}>
                {priceError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={priceBusy}
                onClick={() => setPriceGroup(null)}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: 'var(--app-border)' }}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={priceBusy}
                onClick={saveGroupPrice}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--app-accent)', color: '#fff' }}
              >
                {priceBusy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingRemove !== null}
        title="Hapus barang dari paket?"
        content={
          removeError
            ? `${pendingRemove?.text ?? ''}\n\n${removeError}`
            : pendingRemove?.text
        }
        okText="Hapus"
        danger
        loading={removeBusy}
        onOk={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  )
}
