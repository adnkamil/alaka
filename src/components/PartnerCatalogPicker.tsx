import { useMemo, useState } from 'react'
import { ChevronLeft, Search, X } from 'lucide-react'
import type {
  PartnerEventItemCatalog,
  PartnerItemProduct,
  PartnerItemVariant,
} from '../lib/partner-item-label'

export interface CatalogPick {
  partnerVariantId: string
  productName: string
  label: string
  price: number
  qty: number
}

interface PartnerCatalogPickerProps {
  customerName: string
  catalog: PartnerEventItemCatalog
  /** Jumlah per varian yang sudah ada di pesanan (variantId -> qty). */
  pickedQty: Record<string, number>
  /** "add" = tambah barang; "replace" = ubah varian barang yang sudah ada. */
  mode: 'add' | 'replace'
  initialVariantId: string | null
  initialQty: number
  onPick: (pick: CatalogPick) => void
  onDelete?: () => void
  onClose: () => void
}

const PINK = '#b42318'

function rupiah(n: number) {
  return `Rp${n.toLocaleString('id-ID')}`
}

function unique(values: Array<string | null>): Array<string> {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))))
}

function priceLabel(product: PartnerItemProduct): string {
  const prices = product.variants.map((v) => v.price)
  if (prices.length === 0) return '—'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? rupiah(min) : `${rupiah(min)} – ${rupiah(max)}`
}

/**
 * Halaman "Katalog" (frame 2) dengan sheet konfirmasi varian (frame 3).
 * Halaman ini full-screen; dibuka dari form tambah pesanan.
 */
export default function PartnerCatalogPicker({
  customerName,
  catalog,
  pickedQty,
  mode,
  initialVariantId,
  initialQty,
  onPick,
  onDelete,
  onClose,
}: PartnerCatalogPickerProps) {
  const [query, setQuery] = useState('')
  const [onlyPicked, setOnlyPicked] = useState(false)
  const initialProduct =
    initialVariantId === null
      ? null
      : (catalog.products.find((p) => p.variants.some((v) => v.id === initialVariantId)) ??
        null)
  const [product, setProduct] = useState<PartnerItemProduct | null>(initialProduct)

  const pickedOf = (p: PartnerItemProduct) =>
    p.variants.reduce((sum, v) => sum + (pickedQty[v.id] ?? 0), 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.products.filter((p) => {
      if (onlyPicked && pickedOf(p) === 0) return false
      return !q || p.name.toLowerCase().includes(q)
    })
    // pickedOf membaca pickedQty yang sudah masuk dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.products, query, onlyPicked, pickedQty])

  // Halaman katalog (frame 2)
  return (
    <div className="flex min-h-full flex-col" style={{ background: 'var(--app-bg, #fbf8f3)' }}>
      <div className="flex items-start gap-3 border-b p-4" style={{ borderColor: 'var(--app-border)' }}>
        <button type="button" onClick={onClose} aria-label="Kembali">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Katalog partner</p>
          <p className="truncate text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Untuk pesanan {customerName || '—'}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <label className="relative flex items-center">
          <Search size={16} className="absolute left-3" style={{ color: 'var(--app-text-soft)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama atau kode produk"
            className="app-input w-full pl-9"
            aria-label="Cari produk katalog"
            onKeyDown={(e) => {
              // Picker ada di dalam <form>; Enter di kolom cari tidak boleh submit pesanan.
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
        </label>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setOnlyPicked(false)}
            aria-pressed={!onlyPicked}
            className="rounded-full border px-3 py-1.5"
            style={{ borderColor: !onlyPicked ? 'var(--app-accent)' : 'var(--app-border)' }}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setOnlyPicked(true)}
            aria-pressed={onlyPicked}
            className="rounded-full border px-3 py-1.5"
            style={{ borderColor: onlyPicked ? 'var(--app-accent)' : 'var(--app-border)' }}
          >
            Sudah dipilih
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-24">
        {query.trim() && filtered.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {filtered.length} hasil untuk &quot;{query.trim()}&quot;
          </p>
        )}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-semibold">
              {query.trim() ? `Tidak ada "${query.trim()}" di katalog` : 'Belum ada barang yang dipilih'}
            </p>
            <p className="max-w-xs text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Hanya barang katalog yang sudah didaftarkan ke event ini yang bisa ditambahkan. Coba kata kunci lain, atau hubungi partner kalau barangnya belum terdaftar.
            </p>
            {(query || onlyPicked) && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setOnlyPicked(false)
                }}
                className="app-btn-outline"
                style={{ minHeight: 40, fontSize: 14 }}
              >
                Hapus pencarian
              </button>
            )}
          </div>
        )}
        {filtered.map((p) => {
          const count = pickedOf(p)
          const sizes = unique(p.variants.map((v) => v.size))
          const variations = unique(p.variants.map((v) => v.variation))
          const meta =
            sizes.length === 0 && variations.length === 0
              ? 'Tanpa varian'
              : [
                  sizes.length ? `${sizes.length} ukuran` : null,
                  variations.length ? `${variations.length} variasi` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setProduct(p)}
              className="flex items-center justify-between gap-3 rounded-xl border p-3 text-left"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--app-accent)' }}>{priceLabel(p)}</p>
                <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{meta}</p>
                {count > 0 && (
                  <span className="mt-1 inline-block rounded-md px-2 py-0.5 text-[11px]" style={{ background: '#fde2e2', color: PINK }}>
                    Di pesanan ×{count}
                  </span>
                )}
              </div>
              <ChevronLeft size={18} className="rotate-180" style={{ color: 'var(--app-text-soft)' }} />
            </button>
          )
        })}
      </div>

      {product && (
        <VariantSheet
          product={product}
          pickedQty={pickedQty}
          mode={mode}
          initialVariantId={product.variants.some((v) => v.id === initialVariantId) ? initialVariantId : null}
          initialQty={initialQty}
          onPick={(pick) => {
            onPick(pick)
            setProduct(null)
          }}
          onDelete={onDelete}
          onClose={() => setProduct(null)}
        />
      )}
    </div>
  )
}

/** Sheet konfirmasi varian (frame 3). */
function VariantSheet({
  product,
  pickedQty,
  mode,
  initialVariantId,
  initialQty,
  onPick,
  onDelete,
  onClose,
}: {
  product: PartnerItemProduct
  pickedQty: Record<string, number>
  mode: 'add' | 'replace'
  initialVariantId: string | null
  initialQty: number
  onPick: (pick: CatalogPick) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const sizes = unique(product.variants.map((v) => v.size))
  const variations = unique(product.variants.map((v) => v.variation))
  const initial = product.variants.find((v) => v.id === initialVariantId) ?? null
  const [size, setSize] = useState<string | null>(initial?.size ?? (sizes.length === 1 ? sizes[0] : null))
  const [variation, setVariation] = useState<string | null>(
    initial?.variation ?? (variations.length === 1 ? variations[0] : null),
  )
  const [qty, setQty] = useState(initialQty)

  const matches = (v: PartnerItemVariant, s: string | null, va: string | null) =>
    (s === null || v.size === s) && (va === null || v.variation === va)

  // Kombinasi yang tidak dijual ditampilkan disabled (frame 3B).
  const available = (kind: 'size' | 'variation', value: string) =>
    product.variants.some(
      (v) =>
        (kind === 'size' ? v.size === value : v.variation === value) &&
        (kind === 'size' ? matches(v, null, variation) : matches(v, size, null)),
    )

  const groupsComplete = (sizes.length === 0 || size !== null) && (variations.length === 0 || variation !== null)
  const variant = groupsComplete ? (product.variants.find((v) => matches(v, size, variation)) ?? null) : null
  const alreadyInOrder = variant ? (pickedQty[variant.id] ?? 0) : 0
  const label = [size, variation].filter(Boolean).join(' / ')

  const ctaLabel =
    variant === null
      ? 'Pilih variasi dulu'
      : mode === 'replace'
        ? `Simpan perubahan · ${rupiah(variant.price * qty)}`
        : alreadyInOrder > 0
          ? `Tambah jumlah · ${rupiah(variant.price * qty)}`
          : `Tambah ke pesanan · ${rupiah(variant.price * qty)}`

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Pilih varian">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: 'var(--app-card)' }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{mode === 'replace' ? 'Ubah varian' : 'Pilih varian'}</p>
            <p className="font-semibold">{product.name}</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--app-accent)' }}>
              {variant ? rupiah(variant.price) : 'Pilih ukuran dan variasi'}
            </p>
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
                <Chip key={s} label={s} selected={size === s} disabled={!available('size', s)} onClick={() => setSize(s)} />
              ))}
            </div>
          </div>
        )}
        {variations.length > 0 && (
          <div>
            <p className="mb-2 text-xs" style={{ color: 'var(--app-text-soft)' }}>Variasi</p>
            <div className="flex flex-wrap gap-2">
              {variations.map((va) => (
                <Chip key={va} label={va} selected={variation === va} disabled={!available('variation', va)} onClick={() => setVariation(va)} />
              ))}
            </div>
          </div>
        )}
        {variant === null && (sizes.length > 0 || variations.length > 0) && (
          <p className="text-xs" style={{ color: PINK }}>
            {size && variation === null && variations.length > 0
              ? `${label} tidak dijual. Pilih variasi lain.`
              : 'Pilih ukuran dan variasi dulu.'}
          </p>
        )}

        {mode === 'add' && alreadyInOrder > 0 && (
          <p className="rounded-xl p-3 text-xs" style={{ background: '#fde2e2', color: PINK }}>
            Varian ini sudah ada di pesanan (×{alreadyInOrder}). Jumlah akan ditambahkan ke barang yang sama, bukan baris baru.
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm">Jumlah</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Kurangi jumlah" onClick={() => setQty((q) => Math.max(1, q - 1))} className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0">
              −
            </button>
            <span className="pm-num w-6 text-center font-bold">{qty}</span>
            <button type="button" aria-label="Tambah jumlah" onClick={() => setQty((q) => q + 1)} className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0">
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={variant === null}
          onClick={() => {
            if (!variant) return
            onPick({
              partnerVariantId: variant.id,
              productName: product.name,
              label,
              price: variant.price,
              qty,
            })
          }}
          className="app-btn-primary w-full"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          {ctaLabel}
        </button>
        {mode === 'replace' && onDelete && (
          <button type="button" onClick={onDelete} className="text-sm font-semibold" style={{ color: PINK }}>
            Hapus dari pesanan
          </button>
        )}
      </div>
    </div>
  )
}

function Chip({ label, selected, disabled, onClick }: { label: string; selected: boolean; disabled: boolean; onClick: () => void }) {
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
