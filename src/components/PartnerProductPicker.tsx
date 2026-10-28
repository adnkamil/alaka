import { useState } from 'react'
import { ArrowLeft, Package, Search } from 'lucide-react'
import {
  MAX_EVENT_PRODUCTS,
  selectableProducts,
} from '../lib/partner-event-product-rules'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../lib/partner-product-rules'
import type { PartnerProductRow } from '../lib/partner-product-queries'

/** Cocok kalau nama atau kode produk mengandung kata kunci (tanpa huruf besar/kecil). */
export function matchesProductQuery(product: PartnerProductRow, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    product.name.toLowerCase().includes(q) ||
    (product.code ?? '').toLowerCase().includes(q)
  )
}

export function ProductSearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div
      className="flex h-[46px] shrink-0 items-center gap-2 rounded-xl border px-3.5"
      style={{
        borderColor: 'var(--app-border)',
        background: 'var(--pm-input)',
      }}
    >
      <Search size={18} style={{ color: 'var(--app-text-mute)' }} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Cari nama atau kode produks"
        className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none"
        style={{ color: 'var(--app-text)' }}
      />
    </div>
  )
}

/** Satu baris produk dengan checkbox, sama seperti di halaman Kelola produk. */
export function ProductCheckRow({
  product,
  checked,
  disabled,
  onToggle,
}: {
  product: PartnerProductRow
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const photoUrl = partnerProductPhotoUrl(product.id, product.photoUpdatedAt)
  return (
    <label
      className="app-card flex shrink-0 cursor-pointer items-center gap-3 p-3"
      style={{
        borderColor: checked ? 'var(--app-accent)' : undefined,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="size-5 shrink-0"
        style={{ accentColor: '#b6584b' }}
      />
      <div
        className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
        style={{ background: 'var(--pm-tint)', color: 'var(--app-text-mute)' }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Package size={20} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{product.name}</p>
        <p className="pm-num text-sm" style={{ color: 'var(--app-accent)' }}>
          {formatRupiah(product.price)}
        </p>
        {product.code && (
          <p
            className="truncate text-[11px]"
            style={{ color: 'var(--app-text-mute)' }}
          >
            {product.code}
          </p>
        )}
      </div>
      {!product.isActive && (
        <span
          className="app-badge shrink-0"
          style={{
            background: 'var(--pm-muted)',
            color: 'var(--app-text-soft)',
          }}
        >
          Nonaktif
        </span>
      )}
    </label>
  )
}

/**
 * Layar penuh pilih produk untuk event (tampilan sama dengan Kelola produk).
 * Dipakai di form Buat event: pilihan dikumpulkan dulu, baru disimpan bersama
 * event. Dirender hanya saat terbuka, jadi pilihan awalnya selalu segar.
 */
export function PartnerProductPickerSheet({
  title,
  products,
  initialIds,
  onClose,
  onSave,
}: {
  title: string
  products: ReadonlyArray<PartnerProductRow>
  initialIds: Array<string>
  onClose: () => void
  onSave: (ids: Array<string>) => void
}) {
  const [selected, setSelected] = useState<Array<string>>(initialIds)
  const [query, setQuery] = useState('')

  const options = selectableProducts(products, new Set(initialIds))
  const visible = options.filter((p) => matchesProductQuery(p, query))
  const full = selected.length >= MAX_EVENT_PRODUCTS

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (current.length >= MAX_EVENT_PRODUCTS) return current
      return [...current, id]
    })
  }

  return (
    <div
      className="fixed inset-y-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 flex-col"
      style={{ background: 'var(--app-bg)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex items-center gap-3 px-5 pb-2 pt-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Kembali"
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="pm-display text-[22px] leading-tight">{title}</h1>
      </header>

      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-[120px] pt-2">
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {selected.length} dari {MAX_EVENT_PRODUCTS} produk unggulan dipilih
        </p>
        <ProductSearchInput value={query} onChange={setQuery} />

        {options.length === 0 ? (
          <div className="app-card flex flex-col items-center gap-3 p-8 text-center">
            <Package size={28} style={{ color: 'var(--app-text-mute)' }} />
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Belum ada produk aktif di katalog.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p
            className="py-6 text-center text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Tidak ada produk yang cocok dengan &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visible.map((product) => {
              const checked = selected.includes(product.id)
              return (
                <ProductCheckRow
                  key={product.id}
                  product={product}
                  checked={checked}
                  disabled={!checked && full}
                  onToggle={() => toggle(product.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 border-t px-5 py-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-bg)',
        }}
      >
        <button
          type="button"
          onClick={() => onSave(selected)}
          className="app-btn-primary w-full"
        >
          Simpan ({selected.length} produk)
        </button>
      </div>
    </div>
  )
}
