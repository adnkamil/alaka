import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import RupiahInput from './ui/RupiahInput'
import {
  getPartnerProductVariants,
  savePartnerProductVariants,
} from '../lib/partner-variant-functions'

type Cell = { on: boolean; price: string }

function cellKey(size: string | null, variation: string | null) {
  return `${size ?? ''}\u0001${variation ?? ''}`
}

/**
 * Editor varian produk partner. Gaya mengikuti PartnerProductForm: kartu
 * `app-card`, input `app-input`, chip `pm-chip`, dan switch hijau.
 */
export default function PartnerVariantEditor({ productId }: { productId: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['partner-product-variants', productId]
  const { data, error: loadError } = useQuery({
    queryKey,
    queryFn: () => getPartnerProductVariants({ data: { productId } }),
  })

  const [hasVariants, setHasVariants] = useState(false)
  const [price, setPrice] = useState('')
  const [sizes, setSizes] = useState<Array<string>>([])
  const [variations, setVariations] = useState<Array<string>>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [newSize, setNewSize] = useState('')
  const [newVariation, setNewVariation] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    setHasVariants(data.hasVariants)
    setPrice(data.price === null ? '' : String(data.price))
    setSizes(data.sizes)
    setVariations(data.variations)
    const next: Record<string, Cell> = {}
    for (const v of data.variants) {
      if (!v.isActive) continue
      next[cellKey(v.size, v.variation)] = { on: true, price: String(v.price) }
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
    const current = cells[key] ?? { on: false, price: '' }
    setCells({ ...cells, [key]: { ...current, ...patch } })
  }

  async function handleSave() {
    setStatus(null)
    setSaving(true)
    try {
      const chosen: Array<{ size: string | null; variation: string | null; price: number }> = []
      if (hasVariants) {
        for (const row of rowLabels) {
          for (const col of colLabels) {
            const cell = cells[cellKey(col, row)]
            if (!cell?.on) continue
            const value = Number(cell.price)
            chosen.push({ size: col, variation: row, price: Number.isFinite(value) ? value : 0 })
          }
        }
      }
      await savePartnerProductVariants({
        data: {
          productId,
          hasVariants,
          price: price === '' ? null : Number(price),
          sizes,
          variations,
          variants: chosen,
        },
      })
      await queryClient.invalidateQueries({ queryKey })
      setStatus({ ok: true, text: 'Varian tersimpan.' })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan varian' })
    } finally {
      setSaving(false)
    }
  }

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
            Membutuhkan langganan PRO. Harga tiap kombinasi diisi sendiri.
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

          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--app-border)' }}>
            <table className="w-full text-[13px]">
              <thead style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>
                    Variasi
                  </th>
                  {colLabels.map((col) => (
                    <th
                      key={col ?? '-'}
                      className="px-3 py-2 text-left text-[11px] font-semibold"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {col ?? 'Standar'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowLabels.map((row) => (
                  <tr key={row ?? '-'} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                    <td className="px-3 py-2 font-bold">{row ?? 'Standar'}</td>
                    {colLabels.map((col) => {
                      const cell = cells[cellKey(col, row)] ?? { on: false, price: '' }
                      return (
                        <td key={col ?? '-'} className="px-3 py-2">
                          <div className="flex flex-col gap-1.5">
                            <label className="flex items-center gap-1.5 text-[12px]">
                              <input
                                type="checkbox"
                                checked={cell.on}
                                onChange={(e) => setCell(col, row, { on: e.target.checked })}
                                className="h-4 w-4 accent-[#3f7d58]"
                                aria-label={`Dijual ${row ?? 'standar'} ${col ?? ''}`}
                              />
                              Dijual
                            </label>
                            <RupiahInput
                              disabled={!cell.on}
                              value={cell.price}
                              onChange={(v) => setCell(col, row, { price: v })}
                              placeholder="Harga"
                              className="app-input pm-num w-[120px] !py-2 disabled:opacity-50"
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="app-btn-primary"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          {saving ? 'Menyimpan…' : 'Simpan varian'}
        </button>
      </div>
    </section>
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
