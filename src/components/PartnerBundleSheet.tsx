import { useMemo, useState } from 'react'
import RupiahInput from './ui/RupiahInput'

export type CatalogRule = {
  id: string
  name: string
  minQty: number
  bundlePrice: number
  productIds: Array<string>
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

/**
 * Form "Pakai paket" untuk jastiper. Jastiper memilih aturan, lalu mengisi qty
 * tiap varian sampai total pcs tepat sama dengan jumlah pcs aturan. Produk tanpa
 * varian tampil sebagai "Standar".
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

  const rule = catalog.rules.find((r) => r.id === ruleId) ?? null
  const productName = useMemo(
    () => new Map(catalog.products.map((p) => [p.id, p.name])),
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
  const isExact = rule !== null && pcs === rule.minQty

  function chooseRule(id: string) {
    setRuleId(id)
    setQtyByVariant({})
    setSellPrice('')
    setError(null)
  }

  function setQty(variantId: string, qty: number) {
    setQtyByVariant((prev) => ({ ...prev, [variantId]: Math.max(0, qty) }))
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

  const total = (effectiveSellPrice + (Number(fee) || 0)) * bundleCount

  return (
    <div className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="pm-display text-base">Pakai paket</h2>
        <p className="text-[12px]" style={{ color: 'var(--app-text-soft)' }}>
          Pelanggan: <span className="font-bold" style={{ color: 'var(--app-text)' }}>{customerName}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold">Aturan paket</span>
        <div className="flex flex-wrap gap-2">
          {catalog.rules.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === ruleId}
              onClick={() => chooseRule(r.id)}
              className={`pm-chip ${r.id === ruleId ? 'pm-chip--active' : ''}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {rule && (
        <>
          <div
            className="flex items-center justify-between rounded-2xl border px-4 py-3"
            style={{ borderColor: isExact ? '#3f7d58' : 'var(--app-border)' }}
          >
            <span className="text-sm">Isi tepat {rule.minQty} pcs</span>
            <span className="pm-num text-sm font-bold" style={{ color: isExact ? '#3f7d58' : 'var(--app-accent)' }}>
              {pcs} / {rule.minQty}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--app-border)' }}>
            <table className="w-full text-[13px]">
              <thead style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>Produk</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>Varian</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {rule.productIds.flatMap((productId) =>
                  catalog.variants
                    .filter((v) => v.productId === productId)
                    .map((v) => (
                      <tr key={v.id} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                        <td className="px-4 py-2.5 font-bold">{productName.get(productId) ?? 'Produk'}</td>
                        <td className="px-4 py-2.5">
                          {[v.size, v.variation].filter(Boolean).join(' · ') || 'Standar'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              aria-label="Kurangi"
                              onClick={() => setQty(v.id, (qtyByVariant[v.id] ?? 0) - 1)}
                              className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0"
                            >
                              −
                            </button>
                            <span className="pm-num w-6 text-center font-bold">{qtyByVariant[v.id] ?? 0}</span>
                            <button
                              type="button"
                              aria-label="Tambah"
                              onClick={() => setQty(v.id, (qtyByVariant[v.id] ?? 0) + 1)}
                              className="app-btn-outline !h-8 !w-8 !min-h-0 !p-0"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          </div>
          {rule.productIds.every((id) => !catalog.variants.some((v) => v.productId === id)) && (
            <p className="text-sm" style={{ color: '#b42318' }}>
              Produk dalam aturan ini belum punya varian. Minta partner menyimpan produknya ulang.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Jumlah paket</span>
              <input
                type="number"
                min={1}
                value={bundleCount}
                onChange={(e) => setBundleCount(Math.max(1, Number(e.target.value) || 1))}
                className="app-input pm-num"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Harga jual per paket</span>
              <RupiahInput
                value={sellPrice === '' ? String(rule.bundlePrice) : sellPrice}
                onChange={setSellPrice}
                className="app-input pm-num"
              />
              <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                Default: harga paket Rp{rule.bundlePrice.toLocaleString('id-ID')}
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Fee per paket</span>
              <RupiahInput value={fee} onChange={setFee} className="app-input pm-num" placeholder="0" />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
            <span className="text-sm">Total tagihan</span>
            <span className="pm-num text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
              Rp{total.toLocaleString('id-ID')}
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
          {isSubmitting ? 'Menyimpan…' : 'Tambah paket'}
        </button>
      </div>
    </div>
  )
}
