import { LOW_STOCK_THRESHOLD } from '../lib/partner-event-analytics'

export type VariantStock = {
  id: string
  size: string | null
  variation: string | null
  price: number
  stock: number
}

const RED = { background: '#fbe4e1', color: '#b42318', borderColor: '#f3c6c0' }
const AMBER = { background: '#fbefd9', color: '#8a5a0c', borderColor: '#f0d9a8' }
const NEUTRAL = { background: '#ffffff', color: 'var(--app-text)', borderColor: 'var(--app-border)' }

function toneOf(stock: number) {
  if (stock <= 0) return RED
  if (stock <= LOW_STOCK_THRESHOLD) return AMBER
  return NEUTRAL
}

/** Ringkasan stok satu produk: total dan jumlah varian habis. */
export function stockSummary(variants: Array<VariantStock>) {
  return {
    total: variants.reduce((n, v) => n + Math.max(0, v.stock), 0),
    habis: variants.filter((v) => v.stock <= 0).length,
    hampir: variants.filter((v) => v.stock > 0 && v.stock <= LOW_STOCK_THRESHOLD).length,
  }
}

/** True kalau produk punya opsi ukuran/variasi (bukan hanya varian Standar). */
export function hasVariantOptions(variants: Array<VariantStock>) {
  return variants.some((v) => v.size || v.variation)
}

/**
 * Varian dan stok satu produk, dikelompokkan per variasi (variasi dulu, baru
 * ukuran). Produk tanpa opsi (varian Standar) tidak menampilkan daftar.
 */
export default function PartnerProductVariantStock({
  variants,
}: {
  variants: Array<VariantStock>
}) {
  if (!hasVariantOptions(variants)) return null

  // Urutan variasi dan ukuran mengikuti urutan katalog.
  const groups = new Map<string, Array<VariantStock>>()
  for (const v of variants) {
    const key = v.variation ?? ''
    const list = groups.get(key) ?? []
    list.push(v)
    groups.set(key, list)
  }

  return (
    <ul className="flex flex-col gap-2 border-t pt-2.5" style={{ borderColor: 'var(--app-border)' }}>
      {[...groups.entries()].map(([variation, list]) => (
        <li key={variation} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          {variation && (
            <span className="shrink-0 pt-0.5 text-[12px] font-semibold sm:w-28 sm:truncate" title={variation}>
              {variation}
            </span>
          )}
          <div className="flex flex-wrap gap-1.5">
            {list.map((v) => {
              const tone = toneOf(v.stock)
              const stockText = v.stock <= 0 ? 'Habis' : `${v.stock}`
              return (
                <span
                  key={v.id}
                  className="pm-num inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px]"
                  style={tone}
                  title={`${[v.variation, v.size].filter(Boolean).join(' / ')}: ${v.stock <= 0 ? 'stok habis' : `stok ${v.stock}`}`}
                >
                  {v.size && <span className="font-semibold">{v.size}</span>}
                  {v.size && <span aria-hidden="true">·</span>}
                  <span>{v.size ? stockText : `Stok ${stockText}`}</span>
                </span>
              )
            })}
          </div>
        </li>
      ))}
    </ul>
  )
}
