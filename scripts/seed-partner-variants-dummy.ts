// Seed data dummy katalog partner: produk dengan varian (ukuran + variasi),
// produk tanpa varian, dan aturan paket. Menghapus dulu SEMUA produk dan
// aturan paket milik partner target (cascade ke varian, event produk, dan
// isi paket).
//
// Cara pakai (WAJIB pakai --email, script ini menghapus data):
//   pnpm tsx scripts/seed-partner-variants-dummy.ts -- --email=micibaby07@gmail.com
//
// Email partner harus huruf kecil dan sudah terdaftar di tabel partners.

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

type OptionDef = { type: 'ukuran' | 'variasi'; values: Array<string> }
type VariantDef = { ukuran?: string; variasi?: string; price: number }
type ProductDef = {
  name: string
  code?: string
  hasVariants: boolean
  price?: number // untuk produk tanpa varian
  options?: Array<OptionDef>
  variants?: Array<VariantDef>
}

const PRODUCTS: Array<ProductDef> = [
  {
    name: 'Setelan Piyama Anak Kancing Depan',
    code: 'SPK-001',
    hasVariants: true,
    options: [
      { type: 'ukuran', values: ['Newborn', 'S', 'M', 'L'] },
      { type: 'variasi', values: ['Jungle King', 'Marine Cove', 'Ocean Whale'] },
    ],
    variants: [
      { ukuran: 'Newborn', variasi: 'Jungle King', price: 52500 },
      { ukuran: 'Newborn', variasi: 'Marine Cove', price: 52500 },
      // Ocean Whale tidak dijual untuk Newborn: sengaja tidak ada baris
      { ukuran: 'S', variasi: 'Jungle King', price: 55000 },
      { ukuran: 'S', variasi: 'Marine Cove', price: 55000 },
      { ukuran: 'S', variasi: 'Ocean Whale', price: 58000 },
      { ukuran: 'M', variasi: 'Jungle King', price: 60000 },
      { ukuran: 'M', variasi: 'Marine Cove', price: 60000 },
      { ukuran: 'M', variasi: 'Ocean Whale', price: 65000 },
      { ukuran: 'L', variasi: 'Jungle King', price: 56500 },
      { ukuran: 'L', variasi: 'Marine Cove', price: 56500 },
      { ukuran: 'L', variasi: 'Ocean Whale', price: 115000 },
    ],
  },
  {
    name: 'Kaos Anak Katun Combed',
    code: 'KKC-002',
    hasVariants: true,
    options: [
      { type: 'ukuran', values: ['S', 'M', 'L'] },
      { type: 'variasi', values: ['Navy', 'Krem'] },
    ],
    variants: [
      { ukuran: 'S', variasi: 'Navy', price: 45000 },
      { ukuran: 'S', variasi: 'Krem', price: 45000 },
      { ukuran: 'M', variasi: 'Navy', price: 48000 },
      { ukuran: 'M', variasi: 'Krem', price: 48000 },
      { ukuran: 'L', variasi: 'Navy', price: 52000 },
      { ukuran: 'L', variasi: 'Krem', price: 52000 },
    ],
  },
  {
    name: 'Jumper Bayi Rajut Lembut',
    code: 'JBR-003',
    hasVariants: true,
    options: [
      { type: 'ukuran', values: ['Newborn', 'S'] },
      { type: 'variasi', values: ['Krem', 'Abu-abu'] },
    ],
    variants: [
      { ukuran: 'Newborn', variasi: 'Krem', price: 78000 },
      { ukuran: 'Newborn', variasi: 'Abu-abu', price: 78000 },
      { ukuran: 'S', variasi: 'Krem', price: 85000 },
      { ukuran: 'S', variasi: 'Abu-abu', price: 85000 },
    ],
  },
  {
    name: 'Set Piyama Newborn Hadiah',
    code: 'SPN-004',
    hasVariants: true,
    options: [
      { type: 'ukuran', values: ['Newborn'] },
      { type: 'variasi', values: ['Kuning', 'Pink', 'Biru'] },
    ],
    variants: [
      { ukuran: 'Newborn', variasi: 'Kuning', price: 89000 },
      { ukuran: 'Newborn', variasi: 'Pink', price: 89000 },
      { ukuran: 'Newborn', variasi: 'Biru', price: 89000 },
    ],
  },
  {
    name: 'Piyama Anak Lengan Pendek',
    code: 'PLP-005',
    hasVariants: true,
    options: [{ type: 'ukuran', values: ['S', 'M', 'L', 'XL'] }],
    variants: [
      { ukuran: 'S', price: 48000 },
      { ukuran: 'M', price: 52000 },
      { ukuran: 'L', price: 56000 },
      { ukuran: 'XL', price: 62000 },
    ],
  },
  // Produk tanpa varian (harga induk)
  { name: 'Topi Bayi Rajut', code: 'TBR-006', hasVariants: false, price: 25000 },
  { name: 'Celana Pendek Anak', code: 'CPA-007', hasVariants: false, price: 35000 },
  { name: 'Bib Bayi Katun', code: 'BBK-008', hasVariants: false, price: 15000 },
  { name: 'Kaos Kaki Bayi', code: 'KKB-009', hasVariants: false, price: 12000 },
]

type RuleDef = {
  name: string
  minQty: number
  bundlePrice: number
  productNames: Array<string>
}

const RULES: Array<RuleDef> = [
  {
    name: 'Paket Hemat 3 pcs',
    minQty: 3,
    bundlePrice: 100000,
    productNames: [
      'Setelan Piyama Anak Kancing Depan',
      'Kaos Anak Katun Combed',
      'Celana Pendek Anak',
    ],
  },
  {
    name: 'Paket Grosir 3 pcs',
    minQty: 3,
    bundlePrice: 80000,
    productNames: [
      'Set Piyama Newborn Hadiah',
      'Jumper Bayi Rajut Lembut',
      'Topi Bayi Rajut',
    ],
  },
  {
    name: 'Paket 2 pcs',
    minQty: 2,
    bundlePrice: 75000,
    productNames: ['Bib Bayi Katun', 'Kaos Kaki Bayi'],
  },
]

async function main() {
  // Import dinamis setelah dotenv (pola sama dengan seed-dummy-data.ts).
  const { eq } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { syncDefaultVariant } = await import('../src/lib/partner-default-variant')
  const {
    partners,
    partnerProducts,
    partnerOptionGroups,
    partnerOptionValues,
    partnerVariants,
    partnerVariantValues,
    partnerPricingRules,
    partnerRuleProducts,
  } = await import('../src/db/schema')

  const emailArg = process.argv
    .find((a) => a.startsWith('--email='))
    ?.split('=')[1]
  if (!emailArg) {
    throw new Error(
      'Wajib pakai --email=... (script ini menghapus produk & aturan paket partner tsb).',
    )
  }
  const email = emailArg.trim().toLowerCase()

  const partner = await db.query.partners.findFirst({
    where: eq(partners.email, email),
  })
  if (!partner) {
    throw new Error(`Partner dengan email "${email}" tidak ditemukan.`)
  }
  console.log(`Partner: ${partner.name} (${partner.id})`)

  // 1) Hapus aturan paket & produk lama. Varian, grup opsi, dan event produk
  //    ikut terhapus lewat cascade.
  await db
    .delete(partnerPricingRules)
    .where(eq(partnerPricingRules.partnerId, partner.id))
  await db
    .delete(partnerProducts)
    .where(eq(partnerProducts.partnerId, partner.id))
  console.log('Produk & aturan paket lama dihapus.')

  // 2) Insert produk.
  const productIdByName = new Map<string, string>()
  for (const p of PRODUCTS) {
    const [row] = await db
      .insert(partnerProducts)
      .values({
        partnerId: partner.id,
        name: p.name,
        code: p.code ?? null,
        hasVariants: p.hasVariants,
        price: p.hasVariants ? null : String(p.price),
        isActive: true,
      })
      .returning({ id: partnerProducts.id })
    productIdByName.set(p.name, row.id)

    if (!p.hasVariants) {
      // Produk tanpa varian tetap butuh satu baris varian "Standar" (harga induk).
      await syncDefaultVariant(db, row.id)
      continue
    }
    if (!p.options || !p.variants) continue

    // 3) Grup opsi dan nilainya.
    const valueIdByKey = new Map<string, string>() // "type:name" -> id
    for (const [gi, opt] of p.options.entries()) {
      const [group] = await db
        .insert(partnerOptionGroups)
        .values({
          partnerProductId: row.id,
          type: opt.type,
          position: gi,
        })
        .returning({ id: partnerOptionGroups.id })

      for (const [vi, val] of opt.values.entries()) {
        const [v] = await db
          .insert(partnerOptionValues)
          .values({
            optionGroupId: group.id,
            name: val,
            position: vi,
            imageUrl: null,
          })
          .returning({ id: partnerOptionValues.id })
        valueIdByKey.set(`${opt.type}:${val}`, v.id)
      }
    }

    // 4) Varian (hanya kombinasi yang dijual) + penghubung ke nilainya.
    for (const variant of p.variants) {
      const [vr] = await db
        .insert(partnerVariants)
        .values({
          partnerProductId: row.id,
          price: String(variant.price),
          isActive: true,
          trackStock: false,
          allowPreorder: false,
        })
        .returning({ id: partnerVariants.id })

      const keys: Array<string> = []
      if (variant.ukuran) keys.push(`ukuran:${variant.ukuran}`)
      if (variant.variasi) keys.push(`variasi:${variant.variasi}`)
      const links = keys
        .map((k) => valueIdByKey.get(k))
        .filter((x): x is string => Boolean(x))
        .map((optionValueId) => ({ variantId: vr.id, optionValueId }))
      if (links.length > 0) {
        await db.insert(partnerVariantValues).values(links)
      }
    }
    console.log(`  + ${p.name} (${p.variants.length} varian)`)
  }
  for (const p of PRODUCTS.filter((x) => !x.hasVariants)) {
    console.log(`  + ${p.name} (tanpa varian, Rp${p.price})`)
  }

  // 5) Aturan paket + isinya (satu produk hanya boleh di satu aturan).
  for (const [pos, rule] of RULES.entries()) {
    const [r] = await db
      .insert(partnerPricingRules)
      .values({
        partnerId: partner.id,
        name: rule.name,
        minQty: rule.minQty,
        bundlePrice: String(rule.bundlePrice),
        isActive: true,
        position: pos,
      })
      .returning({ id: partnerPricingRules.id })

    const productIds = rule.productNames.map((n) => {
      const id = productIdByName.get(n)
      if (!id) throw new Error(`Produk "${n}" untuk aturan "${rule.name}" tidak ada.`)
      return id
    })
    await db.insert(partnerRuleProducts).values(
      productIds.map((partnerProductId) => ({
        ruleId: r.id,
        partnerProductId,
      })),
    )
    console.log(`  + Aturan "${rule.name}": ${rule.minQty} pcs Rp${rule.bundlePrice}`)
  }

  console.log('Selesai.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
