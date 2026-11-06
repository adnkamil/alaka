import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Package, Search } from 'lucide-react'
import {
  deselectMany,
  selectMany,
  selectableProducts,
  selectionState,
  toggleSelection,
} from '../lib/partner-event-product-rules'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../lib/partner-product-rules'
import type { PartnerProductRow } from '../lib/partner-product-queries'
import Pagination from './ui/Pagination'
import { useClientPager } from '../lib/use-client-pager'

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
        placeholder="Cari nama atau kode produk"
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
  onToggle,
}: {
  product: PartnerProductRow
  checked: boolean
  onToggle: () => void
}) {
  const photoUrl = partnerProductPhotoUrl(product.id, product.photoUpdatedAt)
  return (
    <label
      className="app-card flex shrink-0 cursor-pointer items-center gap-3 p-3"
      style={{
        borderColor: checked ? 'var(--app-accent)' : undefined,
        background: checked ? 'var(--app-accent-soft)' : undefined,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
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

type Scope = 'semua' | 'dipilih'

/**
 * Checklist produk untuk event, dipakai di layar penuh (form event) maupun
 * halaman Produk di Event. Tanpa batas jumlah: ada "Pilih semua" (untuk hasil
 * yang sedang tampil, jadi bisa dipakai bersama pencarian), filter "Dipilih",
 * dan toolbar yang tetap menempel di atas saat daftar panjang di-scroll.
 */
export function ProductChecklist({
  options,
  selected,
  onChange,
  stickyTop = 'top-0',
  variant = 'mobile',
}: {
  /** Produk yang bisa dicentang (sudah lewat `selectableProducts`). */
  options: ReadonlyArray<PartnerProductRow>
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  /**
   * Kelas `top-*` toolbar yang menempel. Di halaman penuh desktop toolbar harus
   * turun di bawah topbar partner (72px); di layar penuh (sheet) cukup `top-0`.
   */
  stickyTop?: string
  /**
   * `mobile`: satu kolom, toolbar menempel (juga dipakai di layar penuh).
   * `desktop`: di dalam kartu, daftar produk berupa grid dua/tiga kolom.
   */
  variant?: 'mobile' | 'desktop'
}) {
  const desktop = variant === 'desktop'
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('semua')
  const allRef = useRef<HTMLInputElement>(null)

  const selectedCount = options.reduce(
    (n, p) => (selected.has(p.id) ? n + 1 : n),
    0,
  )
  const visible = options.filter(
    (p) =>
      matchesProductQuery(p, query) &&
      (scope === 'semua' || selected.has(p.id)),
  )
  const visibleIds = visible.map((p) => p.id)
  const state = selectionState(selected, visibleIds)
  const filtering = query.trim() !== '' || scope === 'dipilih'
  // Daftar tampil per halaman; "pilih semua" tetap bekerja pada seluruh hasil.
  const pager = useClientPager(visible)

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = state === 'some'
  }, [state])

  const scopes: Array<{ key: Scope; label: string }> = [
    { key: 'semua', label: `Semua ${options.length}` },
    { key: 'dipilih', label: `Dipilih ${selectedCount}` },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          desktop
            ? 'flex flex-col gap-3'
            : `sticky ${stickyTop} z-10 -mx-5 flex flex-col gap-3 px-5 pb-2 pt-1`
        }
        style={desktop ? undefined : { background: 'var(--app-bg)' }}
      >
        <div className="flex flex-col gap-2">
          <ProductSearchInput
            value={query}
            onChange={(value) => {
              setQuery(value)
              pager.resetPage()
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scopes.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setScope(item.key)}
              className={`pm-chip ${scope === item.key ? 'pm-chip--active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {visible.length > 0 && (
          <label
            className="flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--pm-input)',
            }}
          >
            <input
              ref={allRef}
              type="checkbox"
              checked={state === 'all'}
              onChange={() =>
                onChange(
                  state === 'all'
                    ? deselectMany(selected, visibleIds)
                    : selectMany(selected, visibleIds),
                )
              }
              className="size-5 shrink-0"
              style={{ accentColor: '#b6584b' }}
            />
            <span className="flex-1 text-sm font-bold">
              {state === 'all' ? 'Lepas semua' : 'Pilih semua'}
              {filtering ? ' hasil' : ''}
              <span
                className="ml-1.5 font-medium"
                style={{ color: 'var(--app-text-soft)' }}
              >
                ({visible.length})
              </span>
            </span>
          </label>
        )}
      </div>

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
          {query.trim()
            ? `Tidak ada produk yang cocok dengan “${query.trim()}”.`
            : 'Belum ada produk yang dipilih.'}
        </p>
      ) : (
        <div
          className={
            desktop
              ? 'grid grid-cols-2 gap-3 2xl:grid-cols-3'
              : 'flex flex-col gap-2.5'
          }
        >
          {pager.paged.map((product) => (
            <ProductCheckRow
              key={product.id}
              product={product}
              checked={selected.has(product.id)}
              onToggle={() => onChange(toggleSelection(selected, product.id))}
            />
          ))}
        </div>
      )}
      {visible.length > 0 && (
        <Pagination {...pager.pager} className="justify-center" />
      )}
    </div>
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
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialIds),
  )
  const options = selectableProducts(products, new Set(initialIds))
  const count = options.reduce((n, p) => (selected.has(p.id) ? n + 1 : n), 0)

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

      <div className="flex-1 overflow-y-auto px-5 pb-[120px] pt-1">
        <ProductChecklist
          options={options}
          selected={selected}
          onChange={setSelected}
        />
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
          onClick={() =>
            onSave(options.filter((p) => selected.has(p.id)).map((p) => p.id))
          }
          className="app-btn-primary w-full"
        >
          Simpan ({count} produk)
        </button>
      </div>
    </div>
  )
}
