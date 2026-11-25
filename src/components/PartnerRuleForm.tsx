import { useState } from 'react'
import { X } from 'lucide-react'
import PartnerTableToolbar from './ui/PartnerTableToolbar'
import RupiahInput from './ui/RupiahInput'
import { DEFAULT_PAGE_SIZE, pageCount } from '../lib/pagination'
import {
  bulkToggleSize,
  canAddProduct,
  freeSizes,
  productsMissingSizes,
  sizesUsedByOtherRules,
  toggleSize
  
} from '../lib/partner-rule-form-sizes'
import type {FormOtherRule} from '../lib/partner-rule-form-sizes';

export type RuleFormValue = {
  name: string
  minQty: string
  bundlePrice: string
  isActive: boolean
  productIds: Array<string>
  /** Ukuran yang ikut aturan, per produk. Produk tanpa ukuran tidak punya entri. */
  productSizes: Record<string, Array<string>>
}

/** Lebar kolom tabel produk di modal, mengikuti tabel katalog partner. */
const PICKER_COLUMNS = 'grid-cols-[28px_minmax(0,1fr)_130px]'
/** Kolom daftar produk terpilih di halaman aturan: produk, ukuran, status, aksi. */
const LIST_COLUMNS = 'grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_100px_48px]'

/** id form aturan, dipakai tombol Simpan di header halaman lewat atribut `form`. */
export const FORM_ID = 'partner-rule-form'

export type RuleFormProduct = {
  id: string
  name: string
  isActive: boolean
  /** Ukuran milik produk ini (huruf, nomor sepatu, dll). Kosong = produk tanpa ukuran. */
  sizes: Array<string>
}

/** Aturan paket milik partner, untuk mengecek ukuran yang sudah dipakai aturan lain. */
export type RuleFormOtherRule = FormOtherRule

function SizeChip({
  label,
  on,
  disabled = false,
  title,
  onClick,
}: {
  label: string
  on: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="rounded-full border px-2.5 py-0.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: on ? 'var(--app-accent-strong)' : 'transparent',
        color: on ? '#fff' : 'var(--app-text)',
        borderColor: 'var(--app-border)',
      }}
    >
      {label}
    </button>
  )
}

interface PartnerRuleFormProps {
  title: string
  initial: RuleFormValue
  products: Array<RuleFormProduct>
  /** Semua aturan partner. Aturan yang sedang diedit dikenali lewat ruleId. */
  allRules?: Array<RuleFormOtherRule>
  ruleId?: string
  saving: boolean
  error: string | null
  onSubmit: (value: RuleFormValue) => void
  onCancel: () => void
}

/** Chip ukuran satu produk: ukuran yang dipakai aturan lain dinonaktifkan. */
function ProductSizeChips({
  product,
  selected,
  used,
  onToggle,
}: {
  product: RuleFormProduct
  selected: Array<string>
  used: Map<string, string>
  onToggle: (size: string) => void
}) {
  if (product.sizes.length === 0) {
    return (
      <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
        Tanpa ukuran
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {product.sizes.map((size) => {
        const owner = used.get(size)
        return (
          <SizeChip
            key={size}
            label={size}
            on={selected.includes(size)}
            disabled={owner !== undefined}
            title={owner ? `Dipakai ${owner}` : undefined}
            onClick={() => onToggle(size)}
          />
        )
      })}
    </span>
  )
}

/**
 * Form aturan paket. Pilihan produk berupa tabel dengan checklist. Daftar produk
 * sudah disaring oleh pemanggil (hanya produk yang tersedia).
 */
export default function PartnerRuleForm({
  title,
  initial,
  products,
  allRules = [],
  ruleId,
  error,
  onSubmit,
}: PartnerRuleFormProps) {
  const [value, setValue] = useState<RuleFormValue>(initial)
  const [search, setSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [listPage, setListPage] = useState(1)
  const [listPageSize, setListPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [pickerPage, setPickerPage] = useState(1)
  const [pickerPageSize, setPickerPageSize] = useState<number>(DEFAULT_PAGE_SIZE)

  const [localError, setLocalError] = useState<string | null>(null)

  const selected = products.filter((p) => value.productIds.includes(p.id))
  const visibleSelected = selected.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  // Daftar di modal: produk yang masih punya ukuran bebas (belum dipakai aturan
  // lain), ditambah yang sudah dicentang di aturan ini supaya tetap bisa diubah.
  const pickable = products.filter(
    (p) => value.productIds.includes(p.id) || canAddProduct(p, allRules, ruleId),
  )
  const pickerVisible = pickable.filter((p) =>
    p.name.toLowerCase().includes(pickerSearch.trim().toLowerCase()),
  )
  const listSafePage = Math.min(listPage, pageCount(visibleSelected.length, listPageSize))
  const listPaged = visibleSelected.slice(
    (listSafePage - 1) * listPageSize,
    listSafePage * listPageSize,
  )
  const pickerSafePage = Math.min(pickerPage, pageCount(pickerVisible.length, pickerPageSize))
  const pickerPaged = pickerVisible.slice(
    (pickerSafePage - 1) * pickerPageSize,
    pickerSafePage * pickerPageSize,
  )
  const allPickerChecked =
    pickerPaged.length > 0 && pickerPaged.every((p) => value.productIds.includes(p.id))

  // Ukuran untuk "terapkan ke semua produk terpilih": gabungan ukuran produk yang dicentang.
  const bulkSizes = [...new Set(selected.flatMap((p) => p.sizes))]

  function addProducts(ids: Array<string>) {
    setLocalError(null)
    setValue((v) => ({
      ...v,
      productIds: [...new Set([...v.productIds, ...ids])],
    }))
  }

  function removeProducts(ids: Array<string>) {
    setLocalError(null)
    setValue((v) => {
      const productSizes = { ...v.productSizes }
      for (const id of ids) delete productSizes[id]
      return { ...v, productIds: v.productIds.filter((p) => !ids.includes(p)), productSizes }
    })
  }

  function togglePicker(id: string) {
    if (value.productIds.includes(id)) removeProducts([id])
    else addProducts([id])
  }

  function toggleAllPicker() {
    const visibleIds = pickerPaged.map((p) => p.id)
    if (allPickerChecked) removeProducts(visibleIds)
    else addProducts(visibleIds)
  }

  function removeProduct(id: string) {
    removeProducts([id])
  }

  function toggleProductSize(productId: string, size: string) {
    setLocalError(null)
    setValue((v) => ({
      ...v,
      productSizes: { ...v.productSizes, [productId]: toggleSize(v.productSizes[productId], size) },
    }))
  }

  function toggleBulkSize(size: string) {
    setLocalError(null)
    setValue((v) => ({
      ...v,
      productSizes: bulkToggleSize(v.productSizes, selected, allRules, ruleId, size),
    }))
  }

  return (
    <form
      id={FORM_ID}
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.productIds.length === 0) return
        const missing = productsMissingSizes(selected, value.productSizes)
        if (missing.length > 0) {
          setLocalError(
            `Pilih minimal satu ukuran untuk ${missing
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ')}${missing.length > 3 ? ` dan ${missing.length - 3} produk lain` : ''}.`,
          )
          return
        }
        onSubmit(value)
      }}
    >
      <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-1">
      <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
        <h2 className="pm-display text-base">{title}</h2>
        <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-4">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-xs font-semibold">Nama aturan</span>
            <input
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
              placeholder="Mis. 3 pcs Rp100.000"
              className="app-input"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Jumlah pcs per paket</span>
            <input
              type="number"
              min={1}
              value={value.minQty}
              onChange={(e) => setValue({ ...value, minQty: e.target.value })}
              className="app-input pm-num"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Harga paket (HPP jastiper)</span>
            <RupiahInput
              value={value.bundlePrice}
              onChange={(v) => setValue({ ...value, bundlePrice: v })}
              className="app-input pm-num"
              placeholder="100.000"
              required
            />
          </label>
        </div>

        <div
          className="flex items-center justify-between gap-3 rounded-2xl border p-3.5"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold">Aktif</span>
            <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
              Aturan nonaktif tidak bisa dipilih jastiper.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.isActive}
            aria-label="Aktif"
            onClick={() => setValue({ ...value, isActive: !value.isActive })}
            className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors"
            style={{ background: value.isActive ? 'var(--app-success)' : 'var(--pm-switch-off)' }}
          >
            <span
              className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
              style={{ left: value.isActive ? 23 : 3 }}
            />
          </button>
        </div>
      </section>

      {(localError ?? error) && (
        <p role="alert" className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {localError ?? error}
        </p>
      )}
      </div>

      <section className="app-card flex flex-col gap-3 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="pm-display text-base">Produk dalam aturan</h2>
            <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
              {selected.length} produk dipilih
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPickerSearch('')
                setPickerOpen(true)
              }}
              className="app-btn-outline whitespace-nowrap"
              style={{ minHeight: 40, fontSize: 13 }}
            >
              + Tambah produk
            </button>
          </div>
        </div>

        {selected.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada produk di aturan ini. Tekan "Tambah produk" untuk memilih.
          </p>
        ) : visibleSelected.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Tidak ada produk yang cocok dengan pencarian.
          </p>
        ) : (
          <>
          <PartnerTableToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value)
              setListPage(1)
            }}
            placeholder="Cari produk"
            label="Cari produk"
            pager={{
              page: listSafePage,
              pageSize: listPageSize,
              total: visibleSelected.length,
              onPageChange: setListPage,
              onPageSizeChange: (size: number) => {
                setListPageSize(size)
                setListPage(1)
              },
            }}
          />
          <div className="app-card overflow-hidden">
            <div
              className={`grid ${LIST_COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              <span>Produk</span>
              <span>Ukuran</span>
              <span>Status katalog</span>
              <span>Aksi</span>
            </div>
            {listPaged.map((p) => (
              <div
                key={p.id}
                className={`grid ${LIST_COLUMNS} items-center gap-4 border-t px-5 py-3`}
                style={{ borderColor: 'var(--app-border)' }}
              >
                <span className="truncate text-sm font-bold">{p.name}</span>
                <ProductSizeChips
                  product={p}
                  selected={value.productSizes[p.id] ?? []}
                  used={sizesUsedByOtherRules(allRules, ruleId, p.id)}
                  onToggle={(size) => toggleProductSize(p.id, size)}
                />
                <span>
                  <span className="app-badge">{p.isActive ? 'Aktif' : 'Nonaktif'}</span>
                </span>
                <span>
                  <button
                    type="button"
                    onClick={() => removeProduct(p.id)}
                    aria-label={`Keluarkan ${p.name}`}
                    className="p-1"
                    style={{ color: 'var(--app-danger)' }}
                  >
                    <X size={16} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          </>
        )}
      </section>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setPickerOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Tambah produk ke aturan"
            className="app-card flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 p-4 lg:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="pm-display text-base">Tambah produk</h3>
                <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  Pilih produk, lalu pilih ukuran yang ikut aturan ini. Ukuran yang sudah dipakai aturan lain tidak bisa dipilih lagi.
                </p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="Tutup" className="p-1">
                <X size={18} />
              </button>
            </div>
            <PartnerTableToolbar
              search={pickerSearch}
              onSearchChange={(value) => {
                setPickerSearch(value)
                setPickerPage(1)
              }}
              placeholder="Cari nama produk"
              label="Cari nama produk"
              pager={{
                page: pickerSafePage,
                pageSize: pickerPageSize,
                total: pickerVisible.length,
                onPageChange: setPickerPage,
                onPageSizeChange: (size: number) => {
                  setPickerPageSize(size)
                  setPickerPage(1)
                },
              }}
            />

            {bulkSizes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  Terapkan ukuran ke semua produk terpilih yang punya ukuran itu:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {bulkSizes.map((size) => {
                    const targets = selected.filter(
                      (p) => p.sizes.includes(size) && freeSizes(p, allRules, ruleId).includes(size),
                    )
                    return (
                      <SizeChip
                        key={size}
                        label={size}
                        on={targets.length > 0 && targets.every((p) => (value.productSizes[p.id] ?? []).includes(size))}
                        disabled={targets.length === 0}
                        onClick={() => toggleBulkSize(size)}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {pickable.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Tidak ada produk yang bisa ditambahkan ke aturan ini.
              </p>
            ) : pickerVisible.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Tidak ada produk yang cocok dengan pencarian.
              </p>
            ) : (
              <div className="app-card min-h-0 flex-1 overflow-y-auto overflow-hidden">
                <div
                  className={`grid ${PICKER_COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
                  style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
                >
                  <input
                    type="checkbox"
                    checked={allPickerChecked}
                    onChange={toggleAllPicker}
                    aria-label="Pilih semua"
                    className="h-4 w-4 accent-[var(--app-success)]"
                  />
                  <span>Produk</span>
                  <span>Status katalog</span>
                </div>
                {pickerPaged.map((p) => {
                  const checked = value.productIds.includes(p.id)
                  return (
                    <div
                      key={p.id}
                      className={`grid ${PICKER_COLUMNS} items-center gap-4 border-t px-5 py-3`}
                      style={{ borderColor: 'var(--app-border)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePicker(p.id)}
                        aria-label={`Pilih ${p.name}`}
                        className="h-4 w-4 accent-[var(--app-success)]"
                      />
                      <span className="flex min-w-0 flex-col gap-2">
                        <span className="truncate text-sm font-bold">{p.name}</span>
                        {checked && (
                          <ProductSizeChips
                            product={p}
                            selected={value.productSizes[p.id] ?? []}
                            used={sizesUsedByOtherRules(allRules, ruleId, p.id)}
                            onToggle={(size) => toggleProductSize(p.id, size)}
                          />
                        )}
                      </span>
                      <span>
                        <span className="app-badge">{p.isActive ? 'Aktif' : 'Nonaktif'}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="app-btn-primary"
                style={{ minHeight: 44, fontSize: 14 }}
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

    </form>
  )
}
