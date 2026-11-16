import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useImperativeHandle, useMemo, useState } from 'react'
import RupiahInput from './ui/RupiahInput'
import {
  getPartnerProductVariants,
  savePartnerProductVariants,
} from '../lib/partner-variant-functions'
import PartnerTableToolbar from './ui/PartnerTableToolbar'
import { useClientPager } from '../lib/use-client-pager'

export type PartnerVariantEditorHandle = { save: () => Promise<void> }

type Cell = { on: boolean; price: string; stock: string }

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
  ref,
}: {
  productId: string
  ref?: React.Ref<PartnerVariantEditorHandle>
}) {
  const queryClient = useQueryClient()
  const queryKey = ['partner-product-variants', productId]
  const { data, error: loadError } = useQuery({
    queryKey,
    queryFn: () => getPartnerProductVariants({ data: { productId } }),
  })

  const [hasVariants, setHasVariants] = useState(false)
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [sizes, setSizes] = useState<Array<string>>([])
  const [variations, setVariations] = useState<Array<string>>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [newSize, setNewSize] = useState('')
  const [newVariation, setNewVariation] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

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
  }, [data])

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
      setCells(Object.fromEntries(Object.entries(cells).filter(([k]) => !k.startsWith(`${name}\u0001`))))
    } else {
      setVariations(variations.filter((v) => v !== name))
      setCells(Object.fromEntries(Object.entries(cells).filter(([k]) => !k.endsWith(`\u0001${name}`))))
    }
  }

  function setCell(size: string | null, variation: string | null, patch: Partial<Cell>) {
    const key = cellKey(size, variation)
    const current = cells[key] ?? { on: false, price: '', stock: '0' }
    setCells({ ...cells, [key]: { ...current, ...patch } })
  }

  async function handleSave() {
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
          productId,
          hasVariants,
          price: price === '' ? null : Number(price),
          stock: stockNumber(stock),
          sizes,
          variations,
          variants: chosen,
        },
      })
      await queryClient.invalidateQueries({ queryKey })
      setStatus({ ok: true, text: 'Varian tersimpan.' })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan varian' })
      throw err
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  if (loadError) {
    return <div className="app-card p-4 text-sm text-red-600">Gagal memuat varian.</div>
  }
  if (!data) return null

  return (
    <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="pm-display text-base">Varian</h2>
          <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            Membutuhkan langganan PRO. Harga dan stok tiap kombinasi diisi sendiri.
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
          <span className="text-xs font-semibold">Harga produk</span>
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
          <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            Stok 0 tetap tampil di katalog sebagai Habis dan tidak bisa dipesan jastiper.
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
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--app-border)' }}>
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
                    const cell = cells[cellKey(col, row)] ?? { on: false, price: '', stock: '0' }
                    return (
                      <tr
                        key={`${row ?? '-'}|${col ?? '-'}`}
                        className="border-t"
                        style={{ borderColor: 'var(--app-border)', opacity: cell.on ? 1 : 0.6 }}
                      >
                        {showVariationCol && index === 0 && (
                          <td
                            rowSpan={colLabels.length}
                            className="border-r px-3 py-2 text-center align-middle font-bold"
                            style={{ borderColor: 'var(--app-border)' }}
                          >
                            {row ?? 'Standar'}
                          </td>
                        )}
                        {sizes.length > 0 && (
                          <td className="px-3 py-2 text-center font-semibold">{col}</td>
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
                            onChange={(e) => setCell(col, row, { stock: e.target.value })}
                            placeholder="0"
                            aria-label={`Stok ${row ?? 'standar'} ${col ?? ''}`}
                            className="app-input pm-num w-[110px] !py-2 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={cell.on}
                            onChange={(e) => setCell(col, row, { on: e.target.checked })}
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
        <p className="text-sm" style={{ color: status.ok ? '#3f7d58' : '#b42318' }} role="status">
          {status.text}
        </p>
      )}
    </section>
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
        <button type="button" onClick={props.onAdd} className="app-btn-outline shrink-0" style={{ minHeight: 44 }}>
          Tambah
        </button>
      </div>
    </div>
  )
}
