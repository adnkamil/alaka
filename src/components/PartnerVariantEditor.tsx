import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, X } from 'lucide-react'
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import RupiahInput from './ui/RupiahInput'
import {
  blobToDataUrl,
  fileToProductPhotoBlob,
} from '../lib/product-photo-image'
import {
  getPartnerProductVariants,
  savePartnerProductVariants,
} from '../lib/partner-variant-functions'
import { getAutoStockCheckActive } from '../lib/stock-check-functions'
import PartnerTableToolbar from './ui/PartnerTableToolbar'
import { useClientPager } from '../lib/use-client-pager'

export type PartnerVariantEditorHandle = {
  /** `targetId` dipakai halaman tambah produk: id produk yang baru dibuat. */
  save: (targetId?: string) => Promise<void>
  /** Pesan galat kalau isian belum lengkap, atau null kalau siap disimpan. */
  validate: () => string | null
  /** Harga produk tanpa varian (null kalau kosong). */
  price: () => number | null
}

/** Data awal untuk produk yang belum dibuat (halaman tambah produk). */
const EMPTY_VARIANTS = {
  hasVariants: false,
  price: null as number | null,
  stock: 0,
  sizes: [] as Array<string>,
  variations: [] as Array<string>,
  variationPhotos: {} as Record<string, string>,
  variants: [] as Array<{
    size: string | null
    variation: string | null
    price: number
    stock: number
    isActive: boolean
  }>,
}

type Cell = { on: boolean; price: string; stock: string }

/** Perubahan foto satu variasi yang belum disimpan. */
type PhotoChange = { action: 'remove' } | { action: 'replace'; dataUrl: string }

/** Isian stok kosong dianggap 0 (habis). */
function stockNumber(raw: string): number {
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function cellKey(size: string | null, variation: string | null) {
  return `${size ?? ''}\u0001${variation ?? ''}`
}

/**
 * Editor varian produk partner. Gaya mengikuti PartnerProductForm: kartu
 * `app-card`, input `app-input`, chip `pm-chip`, dan switch hijau.
 */
export default function PartnerVariantEditor({
  productId,
  onSizesChange,
  ref,
}: {
  /** Kosong di halaman tambah produk: editor mulai dari data kosong. */
  productId?: string
  /** Dipanggil saat daftar ukuran berubah (dipakai kartu Paket). */
  onSizesChange?: (sizes: Array<string>) => void
  ref?: React.Ref<PartnerVariantEditorHandle>
}) {
  const queryClient = useQueryClient()
  const { data: loaded, error: loadError } = useQuery({
    queryKey: ['partner-product-variants', productId],
    queryFn: () =>
      getPartnerProductVariants({ data: { productId: productId! } }),
    enabled: productId !== undefined,
  })
  const data = productId === undefined ? EMPTY_VARIANTS : loaded

  // Stok dikunci selama pengecekan stok otomatis berjalan.
  const { data: stockActive } = useQuery({
    queryKey: ['auto-stock-check-active'],
    queryFn: () => getAutoStockCheckActive(),
    refetchInterval: 5_000,
  })
  const stockLocked = stockActive?.active === true

  const [hasVariants, setHasVariants] = useState(false)
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [sizes, setSizes] = useState<Array<string>>([])
  const [variations, setVariations] = useState<Array<string>>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [newSize, setNewSize] = useState('')
  const [newVariation, setNewVariation] = useState('')
  useEffect(() => {
    onSizesChange?.(sizes)
  }, [sizes])
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  )

  useEffect(() => {
    if (!data) return
    setHasVariants(data.hasVariants)
    setPrice(data.price === null ? '' : String(data.price))
    setStock(String(data.stock))
    setSizes(data.sizes)
    setVariations(data.variations)
    const next: Record<string, Cell> = {}
    for (const v of data.variants) {
      if (!v.isActive) continue
      next[cellKey(v.size, v.variation)] = {
        on: true,
        price: String(v.price),
        stock: String(v.stock),
      }
    }
    setCells(next)
    setPhotoChanges({})
  }, [data])

  // Foto per variasi (opsional). Satu input file dipakai bergantian.
  const [photoChanges, setPhotoChanges] = useState<Record<string, PhotoChange>>(
    {},
  )
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string | null>(null)

  function photoOf(name: string): string | null {
    const change = photoChanges[name] as PhotoChange | undefined
    if (change?.action === 'replace') return change.dataUrl
    if (change?.action === 'remove') return null
    return data?.variationPhotos[name] ?? null
  }

  function pickPhoto(name: string) {
    photoTarget.current = name
    photoInput.current?.click()
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
    e.target.value = ''
    const name = photoTarget.current
    if (!file || !name) return
    setStatus(null)
    setPhotoBusy(name)
    try {
      const dataUrl = await blobToDataUrl(await fileToProductPhotoBlob(file))
      setPhotoChanges((c) => ({ ...c, [name]: { action: 'replace', dataUrl } }))
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Foto tidak bisa diproses',
      })
    } finally {
      setPhotoBusy(null)
    }
  }

  function removePhoto(name: string) {
    setPhotoChanges((c) => {
      // Foto yang belum pernah disimpan cukup dilepas.
      if (!data?.variationPhotos[name]) {
        const { [name]: _dropped, ...rest } = c
        return rest
      }
      return { ...c, [name]: { action: 'remove' } }
    })
  }

  const rowLabels = useMemo<Array<string | null>>(
    () => (variations.length ? variations : [null]),
    [variations],
  )
  const colLabels = useMemo<Array<string | null>>(
    () => (sizes.length ? sizes : [null]),
    [sizes],
  )
  // Baris (variasi) dipaginasi dan bisa dicari; kolom (ukuran) tampil semua.
  const [rowSearch, setRowSearch] = useState('')
  const filteredRowLabels = rowLabels.filter((row) =>
    (row ?? 'Standar').toLowerCase().includes(rowSearch.trim().toLowerCase()),
  )
  const rowPager = useClientPager(filteredRowLabels)
  // Tanpa grup ukuran dan variasi, satu-satunya baris diberi label "Standar".
  const showVariationCol = variations.length > 0 || sizes.length === 0

  function addValue(kind: 'size' | 'variation') {
    const raw = kind === 'size' ? newSize : newVariation
    const name = raw.trim()
    const list = kind === 'size' ? sizes : variations
    if (name && !list.includes(name)) {
      if (kind === 'size') setSizes([...sizes, name])
      else setVariations([...variations, name])
    }
    if (kind === 'size') setNewSize('')
    else setNewVariation('')
  }

  function removeValue(kind: 'size' | 'variation', name: string) {
    if (kind === 'size') {
      setSizes(sizes.filter((s) => s !== name))
      setCells(
        Object.fromEntries(
          Object.entries(cells).filter(([k]) => !k.startsWith(`${name}\u0001`)),
        ),
      )
    } else {
      setVariations(variations.filter((v) => v !== name))
      setCells(
        Object.fromEntries(
          Object.entries(cells).filter(([k]) => !k.endsWith(`\u0001${name}`)),
        ),
      )
    }
  }

  function setCell(
    size: string | null,
    variation: string | null,
    patch: Partial<Cell>,
  ) {
    const key = cellKey(size, variation)
    const current = cells[key] ?? { on: false, price: '', stock: '0' }
    setCells({ ...cells, [key]: { ...current, ...patch } })
  }

  /** Isi harga/stok ke semua kombinasi sekaligus (hanya kolom yang diisi) dan nyalakan semuanya. */
  function applyToAll() {
    if (bulkPrice === '' && bulkStock === '') return
    const next = { ...cells }
    for (const row of rowLabels) {
      for (const col of colLabels) {
        const key = cellKey(col, row)
        const current = next[key] ?? { on: false, price: '', stock: '0' }
        next[key] = {
          on: true,
          price: bulkPrice === '' ? current.price : bulkPrice,
          stock:
            bulkStock === '' ? current.stock : String(stockNumber(bulkStock)),
        }
      }
    }
    setCells(next)
  }

  function validate(): string | null {
    if (!hasVariants && price === '') return 'Isi harga produk.'
    return null
  }

  async function handleSave(targetId?: string) {
    const id = targetId ?? productId
    if (!id) throw new Error('Produk belum tersimpan')
    setStatus(null)
    try {
      const chosen: Array<{
        size: string | null
        variation: string | null
        price: number
        stock: number
      }> = []
      if (hasVariants) {
        for (const row of rowLabels) {
          for (const col of colLabels) {
            const cell = cells[cellKey(col, row)]
            if (!cell?.on) continue
            const value = Number(cell.price)
            chosen.push({
              size: col,
              variation: row,
              price: Number.isFinite(value) ? value : 0,
              stock: stockNumber(cell.stock),
            })
          }
        }
      }
      await savePartnerProductVariants({
        data: {
          productId: id,
          hasVariants,
          price: price === '' ? null : Number(price),
          stock: stockNumber(stock),
          sizes,
          variations,
          variants: chosen,
          // Hanya variasi yang masih ada; variasi yang dihapus ikut kehilangan fotonya.
          variationPhotos: Object.fromEntries(
            Object.entries(photoChanges).filter(([name]) =>
              variations.includes(name),
            ),
          ),
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-product-variants', id],
      })
      setStatus({ ok: true, text: 'Varian tersimpan.' })
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Gagal menyimpan varian',
      })
      throw err
    }
  }

  useImperativeHandle(ref, () => ({
    save: handleSave,
    validate,
    price: () => (price === '' ? null : Number(price)),
  }))

  if (loadError) {
    return (
      <div className="app-card p-4 text-sm text-red-600">
        Gagal memuat varian.
      </div>
    )
  }
  if (!data) return null

  return (
    <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
      {stockLocked && (
        <p className="text-xs font-semibold text-amber-700">
          Pengecekan stok otomatis sedang berjalan. Varian dan stok dikunci
          sampai selesai.
        </p>
      )}
      <fieldset disabled={stockLocked} className="contents">
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoFile}
        />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="pm-display text-base">Informasi penjualan</h2>
            <p
              className="text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {hasVariants
                ? 'Varian aktif (PRO). Harga dan stok diisi per kombinasi di tabel.'
                : 'Aktifkan varian (PRO) kalau harga atau stok beda per ukuran/variasi.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hasVariants}
            aria-label="Buat varian"
            onClick={() => setHasVariants((v) => !v)}
            className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors"
            style={{ background: hasVariants ? '#3f7d58' : '#d9cfbf' }}
          >
            <span
              className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
              style={{ left: hasVariants ? 23 : 3 }}
            />
          </button>
        </div>

        {!hasVariants && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Harga</span>
            <RupiahInput
              value={price}
              onChange={setPrice}
              className="app-input pm-num"
              placeholder="0"
            />
          </label>
        )}

        {!hasVariants && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Stok</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="app-input pm-num"
              placeholder="0"
            />
            <span
              className="text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Stok 0 tetap tampil di katalog sebagai Habis dan tidak bisa
              dipesan jastiper.
            </span>
          </label>
        )}

        {hasVariants && (
          <>
            <ValueEditor
              label="Ukuran"
              placeholder="Mis. S, M, L, XL"
              values={sizes}
              draft={newSize}
              onDraft={setNewSize}
              onAdd={() => addValue('size')}
              onRemove={(name) => removeValue('size', name)}
            />
            <ValueEditor
              label="Variasi"
              placeholder="Mis. Mocca, Cream, Black"
              values={variations}
              draft={newVariation}
              onDraft={setNewVariation}
              onAdd={() => addValue('variation')}
              onRemove={(name) => removeValue('variation', name)}
            />

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold">Daftar variasi</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <RupiahInput
                  value={bulkPrice}
                  onChange={setBulkPrice}
                  placeholder="Harga"
                  className="app-input pm-num"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={bulkStock}
                  onChange={(e) => setBulkStock(e.target.value)}
                  placeholder="Stok"
                  aria-label="Stok untuk semua variasi"
                  className="app-input pm-num"
                />
                <button
                  type="button"
                  onClick={applyToAll}
                  disabled={bulkPrice === '' && bulkStock === ''}
                  className="app-btn-primary shrink-0 disabled:opacity-50"
                  style={{ minHeight: 44, fontSize: 14 }}
                >
                  Terapkan ke semua
                </button>
              </div>
              <span
                className="text-[11px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Mengisi dan menyalakan semua kombinasi. Kolom yang dikosongkan
                tidak diubah.
              </span>
            </div>

            <PartnerTableToolbar
              search={rowSearch}
              onSearchChange={(value) => {
                setRowSearch(value)
                rowPager.resetPage()
              }}
              placeholder="Cari variasi"
              label="Cari variasi"
              pager={rowPager.pager}
            />
            <div
              className="overflow-x-auto rounded-2xl border"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <table className="w-full min-w-[560px] text-[13px]">
                <thead style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
                  <tr>
                    {showVariationCol && <Th>Variasi</Th>}
                    {sizes.length > 0 && <Th>Ukuran</Th>}
                    <Th>Harga</Th>
                    <Th>Stok</Th>
                    <Th>Dijual</Th>
                  </tr>
                </thead>
                <tbody>
                  {rowPager.paged.map((row) =>
                    colLabels.map((col, index) => {
                      const cell = cells[cellKey(col, row)] ?? {
                        on: false,
                        price: '',
                        stock: '0',
                      }
                      return (
                        <tr
                          key={`${row ?? '-'}|${col ?? '-'}`}
                          className="border-t"
                          style={{
                            borderColor: 'var(--app-border)',
                            opacity: cell.on ? 1 : 0.6,
                          }}
                        >
                          {showVariationCol && index === 0 && (
                            <td
                              rowSpan={colLabels.length}
                              className="border-r px-3 py-2 text-center align-middle font-bold"
                              style={{ borderColor: 'var(--app-border)' }}
                            >
                              {row === null ? (
                                'Standar'
                              ) : (
                                <span className="flex flex-col items-center gap-1.5">
                                  <VariationPhoto
                                    name={row}
                                    url={photoOf(row)}
                                    busy={photoBusy === row}
                                    onPick={() => pickPhoto(row)}
                                    onRemove={() => removePhoto(row)}
                                  />
                                  {row}
                                </span>
                              )}
                            </td>
                          )}
                          {sizes.length > 0 && (
                            <td className="px-3 py-2 text-center font-semibold">
                              {col}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <RupiahInput
                              disabled={!cell.on}
                              value={cell.price}
                              onChange={(v) => setCell(col, row, { price: v })}
                              placeholder="Harga"
                              className="app-input pm-num w-[150px] !py-2 disabled:opacity-50"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              disabled={!cell.on}
                              value={cell.stock}
                              onChange={(e) =>
                                setCell(col, row, { stock: e.target.value })
                              }
                              placeholder="0"
                              aria-label={`Stok ${row ?? 'standar'} ${col ?? ''}`}
                              className="app-input pm-num w-[110px] !py-2 disabled:opacity-50"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={cell.on}
                              onChange={(e) =>
                                setCell(col, row, { on: e.target.checked })
                              }
                              className="h-4 w-4 accent-[#3f7d58]"
                              aria-label={`Dijual ${row ?? 'standar'} ${col ?? ''}`}
                            />
                          </td>
                        </tr>
                      )
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {status && (
          <p
            className="text-sm"
            style={{ color: status.ok ? '#3f7d58' : '#b42318' }}
            role="status"
          >
            {status.text}
          </p>
        )}
      </fieldset>
    </section>
  )
}

/** Kotak foto satu variasi: kosong = tombol tambah, terisi = thumbnail + hapus. */
function VariationPhoto({
  name,
  url,
  busy,
  onPick,
  onRemove,
}: {
  name: string
  url: string | null
  busy: boolean
  onPick: () => void
  onRemove: () => void
}) {
  if (url) {
    return (
      <span className="relative block size-14">
        <button
          type="button"
          onClick={onPick}
          title="Ganti foto"
          aria-label={`Ganti foto ${name}`}
          className="block size-14 overflow-hidden rounded-lg border"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <img src={url} alt={name} className="size-full object-cover" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Hapus foto ${name}`}
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
        >
          <X size={12} />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      title="Tambah foto (opsional)"
      aria-label={`Tambah foto ${name}`}
      className="flex size-14 items-center justify-center rounded-lg border border-dashed disabled:opacity-50"
      style={{ borderColor: 'var(--app-border)', color: '#7a4a2a' }}
    >
      {busy ? (
        <span className="text-[10px] font-semibold">...</span>
      ) : (
        <ImagePlus size={20} />
      )}
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-3 text-center text-[11px] font-semibold"
      style={{ color: 'var(--app-text-soft)' }}
    >
      {children}
    </th>
  )
}

function ValueEditor(props: {
  label: string
  placeholder: string
  values: Array<string>
  draft: string
  onDraft: (v: string) => void
  onAdd: () => void
  onRemove: (name: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold">{props.label}</span>
      {props.values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {props.values.map((v) => (
            <span key={v} className="pm-chip">
              {v}
              <button
                type="button"
                aria-label={`Hapus ${v}`}
                onClick={() => props.onRemove(v)}
                className="ml-1 text-[14px] leading-none"
                style={{ color: 'var(--app-text-soft)' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={props.draft}
          onChange={(e) => props.onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              props.onAdd()
            }
          }}
          placeholder={props.placeholder}
          className="app-input"
        />
        <button
          type="button"
          onClick={props.onAdd}
          className="app-btn-outline shrink-0"
          style={{ minHeight: 44 }}
        >
          Tambah
        </button>
      </div>
    </div>
  )
}
