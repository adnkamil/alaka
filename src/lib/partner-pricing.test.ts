import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PricingError,
  assertRuleScopesNoOverlap,
  buildBundleLine,
  buildSingleLine,
  bundlePcsByComponent,
  lineInvoiceTotal,
  lineProfit,
  type BundleComponent,
  type PricingRule,
} from './partner-pricing'

const rule: PricingRule = {
  id: 'rule-3pcs',
  name: '3 pcs Rp100.000',
  minQty: 3,
  bundlePrice: 100000,
  productIds: ['p-longsleeve', 'p-pants', 'p-dress'],
}

const comp = (
  productId: string,
  name: string,
  qty = 1,
): BundleComponent => ({
  partnerProductId: productId,
  partnerVariantId: `${productId}-v1`,
  productName: name,
  size: 'L',
  variation: 'Marine Cove',
  qty,
})

const threeItems = [
  comp('p-longsleeve', 'Kana Longsleeve Set'),
  comp('p-pants', 'Kana Pants'),
  comp('p-dress', 'Kana Dress'),
]

describe('assertRuleScopesNoOverlap', () => {
  it('boleh satu produk di dua aturan kalau rentang ukurannya beda', () => {
    assert.doesNotThrow(() =>
      assertRuleScopesNoOverlap([
        { id: 'a', productIds: ['p1'], sizes: ['S', 'M', 'L'] },
        { id: 'b', productIds: ['p1'], sizes: ['XL', 'XXL', 'XXXL'] },
      ]),
    )
  })

  it('menolak produk yang punya ukuran sama di dua aturan', () => {
    assert.throws(
      () =>
        assertRuleScopesNoOverlap([
          { id: 'a', productIds: ['p1'], sizes: ['S', 'M'] },
          { id: 'b', productIds: ['p1'], sizes: ['M', 'L'] },
        ]),
      PricingError,
    )
  })

  it('aturan tanpa ukuran (semua ukuran) bentrok dengan aturan produk yang sama', () => {
    assert.throws(
      () =>
        assertRuleScopesNoOverlap([
          { id: 'a', productIds: ['p1'] },
          { id: 'b', productIds: ['p1'], sizes: ['S'] },
        ]),
      PricingError,
    )
  })

  it('produk berbeda tidak pernah bentrok', () => {
    assert.doesNotThrow(() =>
      assertRuleScopesNoOverlap([
        { id: 'a', productIds: ['p1'] },
        { id: 'b', productIds: ['p2'] },
      ]),
    )
  })
})

describe('buildBundleLine', () => {
  it('membuat bundle dengan HPP dari aturan dan harga jual dari input', () => {
    const line = buildBundleLine(rule, threeItems, {
      sellPrice: 120000,
      fee: 10000,
      bundleCount: 1,
    })
    assert.equal(line.isBundle, true)
    assert.equal(line.hpp, 100000)
    assert.equal(line.originalPrice, 120000)
    assert.equal(line.name, 'Kana Longsleeve Set + Kana Pants + Kana Dress')
    assert.equal(line.components.length, 3)
  })

  it('menolak barang yang bukan dari produk di aturan', () => {
    const items = [...threeItems.slice(0, 2), comp('p-lain', 'Produk Lain')]
    assert.throws(
      () =>
        buildBundleLine(rule, items, {
          sellPrice: 100000,
          fee: 0,
          bundleCount: 1,
        }),
      /tidak termasuk dalam aturan/,
    )
  })

  it('menolak kalau total pcs tidak tepat sama dengan minQty', () => {
    assert.throws(
      () =>
        buildBundleLine(rule, threeItems.slice(0, 2), {
          sellPrice: 100000,
          fee: 0,
          bundleCount: 1,
        }),
      /harus berisi tepat 3 pcs/,
    )
    assert.throws(
      () =>
        buildBundleLine(
          rule,
          [comp('p-pants', 'Kana Pants', 4)],
          { sellPrice: 100000, fee: 0, bundleCount: 1 },
        ),
      /harus berisi tepat 3 pcs/,
    )
  })

  it('menghitung pcs komponen dari jumlah paket', () => {
    const line = buildBundleLine(rule, threeItems, {
      sellPrice: 100000,
      fee: 0,
      bundleCount: 2,
    })
    assert.equal(line.qty, 2)
    const pcs = bundlePcsByComponent(line)
    assert.deepEqual(
      pcs.map((p) => p.pcs),
      [2, 2, 2],
    )
    assert.equal(
      pcs.reduce((s, p) => s + p.pcs, 0),
      6,
    )
  })

  it('menolak jumlah paket dan nominal yang tidak valid', () => {
    assert.throws(() =>
      buildBundleLine(rule, threeItems, {
        sellPrice: 100000,
        fee: 0,
        bundleCount: 0,
      }),
    )
    assert.throws(() =>
      buildBundleLine(rule, threeItems, {
        sellPrice: -1,
        fee: 0,
        bundleCount: 1,
      }),
    )
  })
})

describe('keuntungan dan tagihan', () => {
  it('keuntungan = fee + (harga jual - HPP), dikali qty', () => {
    const line = buildBundleLine(rule, threeItems, {
      sellPrice: 120000,
      fee: 10000,
      bundleCount: 2,
    })
    // (120000 - 100000 + 10000) * 2
    assert.equal(lineProfit(line), 60000)
  })

  it('default harga jual = harga paket, margin paket nol, profit = fee saja', () => {
    const line = buildBundleLine(rule, threeItems, {
      sellPrice: 100000,
      fee: 10000,
      bundleCount: 1,
    })
    assert.equal(lineProfit(line), 10000)
  })

  it('tagihan pemesan tidak terpengaruh HPP', () => {
    const line = buildBundleLine(rule, threeItems, {
      sellPrice: 120000,
      fee: 10000,
      bundleCount: 1,
    })
    assert.equal(lineInvoiceTotal(line), 130000)
  })

  it('barang satuan memakai HPP harga varian', () => {
    const line = buildSingleLine({
      partnerVariantId: 'v-s',
      hpp: 40000,
      sellPrice: 45000,
      fee: 5000,
      qty: 2,
      name: 'Kana Pants S',
    })
    // (45000 - 40000 + 5000) * 2
    assert.equal(lineProfit(line), 20000)
    assert.equal(line.isBundle, false)
  })
})

describe('buildBundleLine dengan rentang ukuran', () => {
  const rule = {
    id: 'r1',
    name: 'Get 2 S–L',
    minQty: 2,
    bundlePrice: 100000,
    productIds: ['p1'],
    sizes: ['S', 'M', 'L'],
  }
  const comp = (size: string | null) => ({
    partnerProductId: 'p1',
    partnerVariantId: `v-${size}`,
    productName: 'Qintha Summer Shirt',
    size,
    variation: 'Blue',
    qty: 1,
  })
  const input = { sellPrice: 120000, fee: 0, bundleCount: 1 }

  it('menerima paket yang semua ukurannya ada di rentang aturan', () => {
    assert.doesNotThrow(() =>
      buildBundleLine(rule, [comp('S'), comp('L')], input),
    )
  })

  it('menolak L + XL karena XL di luar rentang aturan', () => {
    assert.throws(
      () => buildBundleLine(rule, [comp('L'), comp('XL')], input),
      PricingError,
    )
  })

  it('menolak komponen tanpa ukuran kalau aturan membatasi ukuran', () => {
    assert.throws(
      () => buildBundleLine(rule, [comp(null), comp('S')], input),
      PricingError,
    )
  })
})
