import { useMemo, useState } from 'react'

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
 * Form "Pakai paket". Jastiper memilih aturan, lalu mengisi qty tiap varian
 * sampai total pcs sama dengan `min_qty`. Harga jual default = harga paket dan
 * boleh diubah. Validasi akhir ada di server (`addPartnerBundle`).
 */
export default function PartnerBundleSheet({
  customerName,
  catalog,
  onClose,
  onSubmit,
}: PartnerBundleSheetProps) {
  const [ruleId, setRuleId] = useState<string | null>(
    catalog.rules[0]?.id ?? null,
  )
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

  // Harga jual otomatis terisi harga paket saat aturan dipilih.
  const effectiveSellPrice =
    sellPrice !== '' ? Number(sellPrice) : (rule?.bundlePrice ?? 0)

  const pcs = rule
    ? rule.productIds.length === 0
      ? 0
      : Object.entries(qtyByVariant)
          .filter(([variantId]) =>
            catalog.variants.some(
              (v) =>
                v.id === variantId && rule.productIds.includes(v.productId),
            ),
          )
          .reduce((sum, [, qty]) => sum + qty, 0)
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
    if (!isExact) {
      return setError(`Paket harus berisi tepat ${rule.minQty} pcs (sekarang ${pcs}).`)
    }
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
      <div className="p-4">
        <p>Event ini belum punya aturan paket.</p>
        <button type="button" onClick={onClose}>Tutup</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-sm">Pelanggan</p>
        <p className="font-medium">{customerName}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {catalog.rules.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => chooseRule(r.id)}
            className={r.id === ruleId ? 'font-semibold underline' : ''}
          >
            {r.name}
          </button>
        ))}
      </div>

      {rule && (
        <>
          <p className="text-sm">
            Isi tepat {rule.minQty} pcs. Terisi {pcs} / {rule.minQty}.
          </p>

          {rule.productIds.map((productId) => {
            const variants = catalog.variants.filter(
              (v) => v.productId === productId,
            )
            if (variants.length === 0) return null
            return (
              <section key={productId} className="flex flex-col gap-2">
                <p className="font-medium">{productName.get(productId)}</p>
                {variants.map((v) => (
                  <div key={v.id} className="flex items-center justify-between">
                    <span className="text-sm">
                      {[v.size, v.variation].filter(Boolean).join(' · ') ||
                        'Standar'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Kurangi"
                        onClick={() => setQty(v.id, (qtyByVariant[v.id] ?? 0) - 1)}
                      >
                        −
                      </button>
                      <span>{qtyByVariant[v.id] ?? 0}</span>
                      <button
                        type="button"
                        aria-label="Tambah"
                        onClick={() => setQty(v.id, (qtyByVariant[v.id] ?? 0) + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )
          })}

          <label className="flex flex-col gap-1">
            <span className="text-sm">Jumlah paket</span>
            <input
              type="number"
              min={1}
              value={bundleCount}
              onChange={(e) =>
                setBundleCount(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">
              Harga jual per paket (default: harga paket Rp{rule.bundlePrice})
            </span>
            <input
              type="number"
              min={0}
              value={sellPrice === '' ? rule.bundlePrice : sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">Fee per paket</span>
            <input
              type="number"
              min={0}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </label>

          <p className="text-sm">
            Total tagihan: Rp
            {((effectiveSellPrice + (Number(fee) || 0)) * bundleCount).toLocaleString('id-ID')}
          </p>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={isSubmitting}>
          Batal
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isExact || isSubmitting}
        >
          {isSubmitting ? 'Menyimpan…' : 'Tambah paket'}
        </button>
      </div>
    </div>
  )
}
