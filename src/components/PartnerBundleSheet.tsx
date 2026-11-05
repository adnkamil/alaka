import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import RupiahInput from './ui/RupiahInput'

export type CatalogRule = {
  id: string
  name: string
  minQty: number
  bundlePrice: number
  productIds: Array<string>
  /** Kosong atau tidak ada = semua ukuran. */
  sizes?: Array<string>
}

export type CatalogProduct = { id: string; name: string }

export type CatalogVariant = {
  id: string
  productId: string
  size: string | null
  variation: string | null
  price: number
}

export type PartnerBundleCatalog = {
  rules: Array<CatalogRule>
  products: Array<CatalogProduct>
  variants: Array<CatalogVariant>
}

export type PartnerBundleSubmit = {
  ruleId: string
  components: Array<{ partnerVariantId: string; qty: number }>
  sellPrice: number
  fee: number
  bundleCount: number
}

interface PartnerBundleSheetProps {
  customerName: string
  catalog: PartnerBundleCatalog
  onClose: () => void
  onSubmit: (value: PartnerBundleSubmit) => Promise<void>
}

const GREEN = '#3f7d58'

function rupiah(n: number) {
  return `Rp${n.toLocaleString('id-ID')}`
}

function variantLabel(v: CatalogVariant) {
  return [v.size, v.variation].filter(Boolean).join(' · ') || 'Standar'
}

/**
 * Form "Pilih paket" untuk jastiper (frame 5A–5E). Jastiper memilih aturan,
 * lalu mengisi isi paket sampai jumlahnya tepat sama dengan pcs aturan. Tiap
 * produk dibuka di sheet "Pilih isi paket" untuk memilih ukuran & variasi.
 */
export default function PartnerBundleSheet({
  customerName,
  catalog,
  onClose,
  onSubmit,
}: PartnerBundleSheetProps) {
  const [ruleId, setRuleId] = useState<string | null>(catalog.rules[0]?.id ?? null)
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>({})
  const [sellPrice, setSellPrice] = useState<string>('')
  const [fee, setFee] = useState<string>('0')
  const [bundleCount, setBundleCount] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)

  const rule = catalog.rules.find((r) => r.id === ruleId) ?? null
  const productById = useMemo(
    () => new Map(catalog.products.map((p) => [p.id, p])),
    [catalog.products],
  )

  // Harga jual otomatis terisi harga paket, boleh diubah jastiper.
  const effectiveSellPrice = sellPrice !== '' ? Number(sellPrice) : (rule?.bundlePrice ?? 0)

  const pcs = rule
    ? Object.entries(qtyByVariant).reduce((sum, [variantId, qty]) => {
        const variant = catalog.variants.find((v) => v.id === variantId)
        return variant && rule.productIds.includes(variant.productId) ? sum + qty : sum
      }, 0)
    : 0
  const remaining = rule ? Math.max(0, rule.minQty - pcs) : 0
  const isExact = rule !== null && pcs === rule.minQty
  const totalPerBundle = effectiveSellPrice + (Number(fee) || 0)

  function chooseRule(id: string) {
    setRuleId(id)
    setQtyByVariant({})
    setSellPrice('')
    setError(null)
    setEditingProductId(null)
  }

  function setQty(variantId: string, qty: number) {
    setQtyByVariant((prev) => ({ ...prev, [variantId]: Math.max(0, qty) }))
  }

  function variantsOf(productId: string) {
    return catalog.variants.filter((v) => v.productId === productId)
  }

  function pickedOf(productId: string) {
    return variantsOf(productId).reduce((sum, v) => sum + (qtyByVariant[v.id] ?? 0), 0)
  }

  async function handleSubmit() {
    if (!rule) return setError('Pilih aturan paket dulu.')
    if (!isExact) return setError(`Paket harus berisi tepat ${rule.minQty} pcs (sekarang ${pcs}).`)
    const components = Object.entries(qtyByVariant)
      .filter(([, qty]) => qty > 0)
      .map(([partnerVariantId, qty]) => ({ partnerVariantId, qty }))
    setIsSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        ruleId: rule.id,
        components,
        sellPrice: effectiveSellPrice,
        fee: Number(fee) || 0,
        bundleCount,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan paket')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (catalog.rules.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm">Event ini belum punya aturan paket.</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="app-btn-outline" style={{ minHeight: 44, fontSize: 14 }}>
            Tutup
          </button>
        </div>
      </div>
    )
  }

  // Label tombol sesuai kondisi isi paket (frame 5A, 5B, 5C).
  const submitLabel =
    !rule || pcs === 0
      ? `Pilih ${rule?.minQty ?? 0} pcs dulu`
      : pcs < rule.minQty
        ? `Kurang ${rule.minQty - pcs} pcs lagi`
        : pcs > rule.minQty
          ? `Kelebihan ${pcs - rule.minQty} pcs`
          : `Tambah paket · ${rupiah(totalPerBundle * bundleCount)}`

  const editingProduct = editingProductId ? productById.get(editingProductId) ?? null : null

  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="pm-display text-base">Pilih paket</h2>
        <p className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
          Untuk pesanan <span className="font-bold" style={{ color: 'var(--app-text)' }}>{customerName}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold">Pilih paket</span>
        <div className="grid grid-cols-2 gap-2">
          {catalog.rules.map((r) => {
            const active = r.id === ruleId
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={active}
                onClick={() => chooseRule(r.id)}
                className="rounded-xl border p-3 text-left"
                style={{
                  borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                  background: active ? 'var(--app-accent-soft, #f3e3de)' : 'transparent',
                }}
              >
                <span className="block text-sm font-semibold">{r.name}</span>
                <span className="block text-xs" style={{ color: 'var(--app-text-soft)' }}>
                  {r.minQty} pcs · {rupiah(r.bundlePrice)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {rule && (
        <>
          {/* Progres isi paket (5A–5C) */}
          <div
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: isExact ? GREEN : 'var(--app-border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm">Isi tepat {rule.minQty} pcs</span>
              <span className="pm-num text-sm font-bold" style={{ color: isExact ? GREEN : 'var(--app-accent)' }}>
                {pcs} / {rule.minQty}
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: rule.minQty }).map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full"
                  style={{
                    background:
                      i < Math.min(pcs, rule.minQty)
                        ? isExact
                          ? GREEN
                          : 'var(--app-accent)'
                        : 'var(--app-border)',
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs" style={{ color: isExact ? GREEN : 'var(--app-text-soft)' }}>
              {isExact
                ? 'Pas! Paket sudah lengkap.'
                : pcs === 0
                  ? 'Pilih produk di bawah, lalu tentukan ukuran dan variasinya.'
                  : pcs < rule.minQty
                    ? `Kurang ${remaining} pcs lagi. Paket baru bisa ditambahkan kalau jumlahnya pas.`
                    : `Kelebihan ${pcs - rule.minQty} pcs. Kurangi dulu supaya pas.`}
            </p>
          </div>

          {/* Isi paket saya (5B, 5C) */}
          {pcs > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Isi paket saya</span>
                <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{pcs} pcs</span>
              </div>
              {catalog.variants
                .filter((v) => rule.productIds.includes(v.productId) && (qtyByVariant[v.id] ?? 0) > 0)
                .map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{productById.get(v.productId)?.name ?? 'Produk'}</p>
                      <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{variantLabel(v)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="Kurangi" onClick={() => setQty(v.id, (qtyByVariant[v.id] ?? 0) - 1)} className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0">
                        −
                      </button>
                      <span className="pm-num w-5 text-center font-bold">{qtyByVariant[v.id] ?? 0}</span>
                      <button
                        type="button"
                        aria-label="Tambah"
                        disabled={remaining === 0}
                        onClick={() => setQty(v.id, (qtyByVariant[v.id] ?? 0) + 1)}
                        className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Produk dalam paket (5A–5C): buka sheet pilih isi (5D) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Produk dalam paket</span>
              <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {rule.productIds.length} produk
              </span>
            </div>
            {rule.productIds.map((productId) => {
              const product = productById.get(productId)
              const list = variantsOf(productId)
              const sizes = new Set(list.map((v) => v.size).filter(Boolean))
              const variations = new Set(list.map((v) => v.variation).filter(Boolean))
              const picked = pickedOf(productId)
              const meta =
                list.length === 0
                  ? 'Belum punya varian'
                  : sizes.size === 0 && variations.size === 0
                    ? 'Tanpa varian'
                    : [
                        sizes.size > 0 ? `${sizes.size} ukuran` : null,
                        variations.size > 0 ? `${variations.size} variasi` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
              return (
                <button
                  key={productId}
                  type="button"
                  disabled={list.length === 0}
                  onClick={() => setEditingProductId(productId)}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product?.name ?? 'Produk'}</p>
                    <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{meta}</p>
                    {picked > 0 && (
                      <span className="mt-1 inline-block rounded-md px-2 py-0.5 text-[11px]" style={{ background: '#fde2e2', color: '#b42318' }}>
                        {picked} pcs dipilih
                      </span>
                    )}
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--app-text-soft)' }} />
                </button>
              )
            })}
            {rule.productIds.every((id) => variantsOf(id).length === 0) && (
              <p className="text-sm" style={{ color: '#b42318' }}>
                Produk dalam aturan ini belum punya varian. Minta partner menyimpan produknya ulang.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Jumlah paket</span>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Kurangi jumlah paket" onClick={() => setBundleCount((n) => Math.max(1, n - 1))} className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0">
                  −
                </button>
                <span className="pm-num w-6 text-center font-bold">{bundleCount}</span>
                <button type="button" aria-label="Tambah jumlah paket" onClick={() => setBundleCount((n) => n + 1)} className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0">
                  +
                </button>
              </div>
              <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                Tiap paket berisi susunan di atas.
              </span>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Harga jual per paket</span>
              <RupiahInput
                value={sellPrice === '' ? String(rule.bundlePrice) : sellPrice}
                onChange={setSellPrice}
                className="app-input pm-num"
              />
              <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                Default = harga paket partner ({rupiah(rule.bundlePrice)}). Bisa kamu ubah.
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Fee per paket</span>
              <RupiahInput value={fee} onChange={setFee} className="app-input pm-num" placeholder="0" />
              <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                Bisa diubah sesuai ketentuanmu.
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
            <span className="text-sm">Total tagihan</span>
            <span className="pm-num text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
              {rupiah(totalPerBundle * bundleCount)}
            </span>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: '#b42318' }}>{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="app-btn-outline" style={{ minHeight: 44, fontSize: 14 }}>
          Batal
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isExact || isSubmitting}
          className="app-btn-primary"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          {isSubmitting ? 'Menyimpan…' : submitLabel}
        </button>
      </div>

      {rule && editingProduct && (
        <ProductPackSheet
          product={editingProduct}
          variants={variantsOf(editingProduct.id)}
          qtyByVariant={qtyByVariant}
          remaining={remaining}
          bundleName={rule.name}
          bundlePrice={rule.bundlePrice}
          onAdd={(variantId, qty) => {
            setQty(variantId, (qtyByVariant[variantId] ?? 0) + qty)
            setEditingProductId(null)
          }}
          onClose={() => setEditingProductId(null)}
        />
      )}
    </div>
  )
}

/** Sheet "Pilih isi paket" (frame 5D): pilih ukuran & variasi, lalu jumlah. */
function ProductPackSheet({
  product,
  variants,
  qtyByVariant,
  remaining,
  bundleName,
  bundlePrice,
  onAdd,
  onClose,
}: {
  product: CatalogProduct
  variants: Array<CatalogVariant>
  qtyByVariant: Record<string, number>
  remaining: number
  bundleName: string
  bundlePrice: number
  onAdd: (variantId: string, qty: number) => void
  onClose: () => void
}) {
  const sizes = Array.from(new Set(variants.map((v) => v.size).filter((x): x is string => Boolean(x))))
  const variations = Array.from(new Set(variants.map((v) => v.variation).filter((x): x is string => Boolean(x))))
  const [size, setSize] = useState<string | null>(sizes.length === 1 ? sizes[0] : null)
  const [variation, setVariation] = useState<string | null>(variations.length === 1 ? variations[0] : null)
  const [pending, setPending] = useState(1)

  const matches = (v: CatalogVariant, s: string | null, va: string | null) =>
    (s === null || v.size === s) && (va === null || v.variation === va)

  // Pilihan tersedia kalau ada varian yang cocok dengan pilihan lain yang aktif.
  const available = (kind: 'size' | 'variation', value: string) =>
    variants.some(
      (v) =>
        (kind === 'size' ? v.size === value : v.variation === value) &&
        (kind === 'size' ? matches(v, null, variation) : matches(v, size, null)),
    )

  // Varian final hanya dipilih kalau semua grup yang ada sudah dipilih.
  const groupsComplete = (sizes.length === 0 || size !== null) && (variations.length === 0 || variation !== null)
  const variant = groupsComplete ? (variants.find((v) => matches(v, size, variation)) ?? null) : null
  const alreadyPacked = variant ? qtyByVariant[variant.id] ?? 0 : 0
  const maxPending = Math.max(0, remaining)
  const canAdd = variant !== null && maxPending > 0
  const chosenQty = Math.min(pending, maxPending)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Pilih isi paket">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: 'var(--app-card)' }}>
        <div className="flex items-start gap-2">
          <button type="button" onClick={onClose} aria-label="Kembali">
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>Pilih isi paket · {bundleName}</p>
            <p className="font-semibold">{product.name}</p>
            <span className="mt-1 inline-block rounded-md px-2 py-0.5 text-[11px]" style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
              Sisa isi paket: {remaining} pcs
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {sizes.length > 0 && (
          <div>
            <p className="mb-2 text-xs" style={{ color: 'var(--app-text-soft)' }}>Ukuran</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <OptionChip key={s} label={s} selected={size === s} disabled={!available('size', s)} onClick={() => setSize(s)} />
              ))}
            </div>
          </div>
        )}
        {variations.length > 0 && (
          <div>
            <p className="mb-2 text-xs" style={{ color: 'var(--app-text-soft)' }}>Variasi</p>
            <div className="flex flex-wrap gap-2">
              {variations.map((va) => (
                <OptionChip key={va} label={va} selected={variation === va} disabled={!available('variation', va)} onClick={() => setVariation(va)} />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Jumlah di paket</p>
            <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
              Maksimal {maxPending} pcs, sesuai sisa isi paket
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Kurangi" onClick={() => setPending((n) => Math.max(1, n - 1))} className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0">
              −
            </button>
            <span className="pm-num w-5 text-center font-bold">{chosenQty}</span>
            <button
              type="button"
              aria-label="Tambah"
              disabled={pending >= maxPending}
              onClick={() => setPending((n) => Math.min(maxPending, n + 1))}
              className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0"
            >
              +
            </button>
          </div>
        </div>

        <p className="rounded-xl p-3 text-xs" style={{ background: 'var(--app-card-soft, #f7f1e7)', color: 'var(--app-text-soft)' }}>
          Harga mengikuti paket ({rupiah(bundlePrice)}), bukan harga satuan. Fee dan harga jual diatur setelah paket lengkap.
          {alreadyPacked > 0 && ` Varian ini sudah ada di paket (×${alreadyPacked}).`}
        </p>

        <button
          type="button"
          disabled={!canAdd}
          onClick={() => variant && onAdd(variant.id, chosenQty)}
          className="app-btn-primary w-full"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          {maxPending === 0
            ? 'Paket sudah lengkap'
            : variant === null
              ? 'Pilih ukuran dan variasi dulu'
              : `Masukkan ke paket · +${chosenQty} pcs`}
        </button>
      </div>
    </div>
  )
}

function OptionChip({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-sm"
      style={{
        borderColor: selected ? 'var(--app-accent)' : 'var(--app-border)',
        color: disabled ? 'var(--app-text-mute)' : selected ? 'var(--app-accent)' : 'inherit',
        opacity: disabled ? 0.5 : 1,
        textDecoration: disabled ? 'line-through' : 'none',
      }}
    >
      {label}
    </button>
  )
}
