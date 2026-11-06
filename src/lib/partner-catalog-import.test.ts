import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planCatalogImport, type RawCatalog } from './partner-catalog-import'

const base = (over: Partial<RawCatalog['products'][number]>) => ({
  page: 1,
  name: 'X',
  sizes: [] as Array<string>,
  motifs: [] as Array<string>,
  satuan: [] as Array<{ sizes: Array<string>; price: number | null }>,
  rules: [] as Array<{ sizes: Array<string>; minQty: number; bundlePrice: number }>,
  needsReview: [] as Array<string>,
  ...over,
})

describe('planCatalogImport', () => {
  it('produk berukuran dan bermotif: varian = ukuran × motif, harga per ukuran', () => {
    const plan = planCatalogImport({
      partnerEmail: 'a@b.c',
      products: [
        base({
          name: 'Summer',
          sizes: ['S', 'XL'],
          motifs: ['Blue', 'Grey'],
          satuan: [
            { sizes: ['S'], price: 50000 },
            { sizes: ['XL'], price: 55000 },
          ],
        }),
      ],
    })
    assert.deepEqual(plan.errors, [])
    const v = plan.products[0].variants
    assert.equal(v.length, 4)
    assert.deepEqual(v.find((x) => x.ukuran === 'XL' && x.variasi === 'Grey'), {
      ukuran: 'XL',
      variasi: 'Grey',
      price: 55000,
    })
  })

  it('produk harga tunggal tanpa ukuran dan motif tanpa varian', () => {
    const plan = planCatalogImport({
      partnerEmail: 'a@b.c',
      products: [base({ name: 'Topi', satuan: [{ sizes: [], price: 35000 }] })],
    })
    assert.equal(plan.products[0].hasVariants, false)
    assert.equal(plan.products[0].price, 35000)
    assert.equal(plan.products[0].variants.length, 0)
  })

  it('menolak produk yang masih perlu dicek', () => {
    const plan = planCatalogImport({
      partnerEmail: 'a@b.c',
      products: [base({ name: 'Y', needsReview: ['ukuran belum terbaca'] })],
    })
    assert.ok(plan.errors.some((e) => e.includes('masih perlu dicek')))
  })

  it('menolak dua aturan dengan ukuran yang sama di satu produk', () => {
    const plan = planCatalogImport({
      partnerEmail: 'a@b.c',
      products: [
        base({
          name: 'Z',
          sizes: ['S', 'M'],
          satuan: [{ sizes: ['S', 'M'], price: 50000 }],
          rules: [
            { sizes: ['S', 'M'], minQty: 2, bundlePrice: 100000 },
            { sizes: ['M'], minQty: 2, bundlePrice: 90000 },
          ],
        }),
      ],
    })
    assert.ok(plan.errors.some((e) => e.startsWith('Z:')))
  })
})
