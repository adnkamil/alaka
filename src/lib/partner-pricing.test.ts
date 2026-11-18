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
  productSizes: {
    'p-longsleeve': ['L'],
    'p-pants': ['L'],
    'p-dress': ['L'],
  },
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
  it('boleh satu produk di dua aturan kalau ukurannya beda', () => {
    assert.doesNotThrow(() =>
      assertRuleScopesNoOverlap([
        { id: 'a', productIds: ['p1'], productSizes: { p1: ['S', 'M', 'L'] } },
        { id: 'b', productIds: ['p1'], productSizes: { p1: ['XL', 'XXL', 'XXXL'] } },
      ]),
    )
  })

  it('ukuran dibandingkan per produk, bukan antar produk', () => {
    assert.doesNotThrow(() =>
      assertRuleScopesNoOverlap([
        { id: 'a', productIds: ['p1', 'p2'], productSizes: { p1: ['S'], p2: ['XL'] } },
        { id: 'b', productIds: ['p1', 'p2'], productSizes: { p1: ['XL'], p2: ['S'] } },
      ]),
    )
  })

  it('menolak produk yang punya ukuran sama di dua aturan', () => {
    assert.throws(
      () =>
        assertRuleScopesNoOverlap([
          { id: 'a', productIds: ['p1'], productSizes: { p1: ['S', 'M'] } },
          { id: 'b', productIds: ['p1'], productSizes: { p1: ['M', 'L'] } },
        ]),
      PricingError,
    )
  })

  it('produk tanpa ukuran di dua aturan bentrok', () => {
    assert.throws(
      () =>
        assertRuleScopesNoOverlap([
          { id: 'a', productIds: ['p1'] },
          { id: 'b', productIds: ['p1'] },
        ]),
      PricingError,
    )
  })

  it('produk tanpa ukuran tidak bentrok dengan aturan yang memilih ukuran produk itu', () => {
    assert.doesNotThrow(() =>
      assertRuleScopesNoOverlap([
        { id: 'a', productIds: ['p1'] },
        { id: 'b', productIds: ['p1'], productSizes: { p1: ['S'] } },
      ]),
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

describe('buildBundleLine dengan ukuran per produk', () => {
  const rule = {
    id: 'r1',
    name: 'Get 2 S–L',
    minQty: 2,
    bundlePrice: 100000,
    productIds: ['p1'],
    productSizes: { p1: ['S', 'M', 'L'] },
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

  it('menerima paket yang semua ukurannya dipilih untuk produk di aturan', () => {
    assert.doesNotThrow(() =>
      buildBundleLine(rule, [comp('S'), comp('L')], input),
    )
  })

  it('menolak L + XL karena XL tidak dipilih untuk produk di aturan', () => {
    assert.throws(
      () => buildBundleLine(rule, [comp('L'), comp('XL')], input),
      PricingError,
    )
  })

  it('menolak komponen tanpa ukuran kalau aturan memilih ukuran untuk produk itu', () => {
    assert.throws(
      () => buildBundleLine(rule, [comp(null), comp('S')], input),
      PricingError,
    )
  })
})

describe('buildBundleLine dengan ukuran berbeda per produk', () => {
  const rule = {
    id: 'r2',
    name: '110K / 2pcs',
    minQty: 2,
    bundlePrice: 110000,
    productIds: ['shirt', 'shoe'],
    productSizes: { shirt: ['XL', 'XXL'], shoe: ['40', '41'] },
  }
  const c = (productId: string, size: string | null) => ({
    partnerProductId: productId,
    partnerVariantId: `${productId}-${size}`,
    productName: productId,
    size,
    variation: null,
    qty: 1,
  })
  const input = { sellPrice: 150000, fee: 0, bundleCount: 1 }

  it('menerima ukuran huruf dan nomor sepatu sesuai produknya', () => {
    assert.doesNotThrow(() => buildBundleLine(rule, [c('shirt', 'XL'), c('shoe', '40')], input))
  })

  it('menolak ukuran milik produk lain', () => {
    assert.throws(() => buildBundleLine(rule, [c('shirt', '40'), c('shoe', '41')], input), PricingError)
  })

  it('ukuran yang tidak dipilih ditolak walau produknya ada di aturan', () => {
    assert.throws(() => buildBundleLine(rule, [c('shirt', 'XXXL'), c('shoe', '40')], input), PricingError)
  })

  it('produk tanpa ukuran boleh masuk tanpa ukuran', () => {
    const r = { ...rule, productIds: ['bag', 'shirt'], productSizes: { shirt: ['XL'] } }
    assert.doesNotThrow(() => buildBundleLine(r, [c('bag', null), c('shirt', 'XL')], input))
  })
})
