// Impor katalog partner dari berkas JSON (lihat scripts/data/katalog-batch2.json).
//
// Dry-run (default, tidak menulis apa pun):
//   pnpm tsx scripts/import-partner-catalog.ts -- --email=micibaby07@gmail.com
//
// Tulis ke database. MENGHAPUS semua produk dan aturan paket milik partner itu
// dulu (varian, grup opsi, dan isi paket ikut terhapus lewat cascade):
//   pnpm tsx scripts/import-partner-catalog.ts -- --email=micibaby07@gmail.com --apply
//
// Email harus huruf kecil dan sudah terdaftar di tabel partners.

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  planCatalogImport,
  type RawCatalog,
} from '../src/lib/partner-catalog-import'

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
}

async function main() {
  const email = arg('email')?.trim().toLowerCase()
  if (!email) throw new Error('Wajib pakai --email=...')
  const apply = process.argv.includes('--apply')
  const file = resolve(arg('file') ?? 'scripts/data/katalog-batch2.json')

  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawCatalog
  const plan = planCatalogImport(raw)

  const totalVariants = plan.products.reduce((s, p) => s + p.variants.length, 0)
  const totalRules = plan.rules.length
  console.log(`Berkas: ${file}`)
  console.log(
    `Rencana: ${plan.products.length} produk, ${totalVariants} varian, ${totalRules} aturan paket`,
  )
  if (plan.errors.length > 0) {
    console.error(`\n${plan.errors.length} masalah, impor dibatalkan:`)
    for (const e of plan.errors) console.error(`  - ${e}`)
    process.exit(1)
  }

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
    partnerRuleSizes,
  } = await import('../src/db/schema')

  const partner = await db.query.partners.findFirst({
    where: eq(partners.email, email),
  })
  if (!partner) throw new Error(`Partner dengan email "${email}" tidak ditemukan.`)

  const existing = await db
    .select({ id: partnerProducts.id })
    .from(partnerProducts)
    .where(eq(partnerProducts.partnerId, partner.id))
  const existingRules = await db
    .select({ id: partnerPricingRules.id })
    .from(partnerPricingRules)
    .where(eq(partnerPricingRules.partnerId, partner.id))
  console.log(
    `Partner: ${partner.name} (${partner.id}). Akan dihapus: ${existing.length} produk, ${existingRules.length} aturan paket.`,
  )

  if (!apply) {
    console.log('\nDry-run. Tambahkan --apply untuk menulis ke database.')
    return
  }

  await db.transaction(async (tx) => {
    // 1) Hapus produk dan aturan lama. Cascade membersihkan varian, grup opsi,
    //    dan isi aturan. Pesanan lama tetap utuh (HPP tersimpan di pesanan).
    await tx
      .delete(partnerPricingRules)
      .where(eq(partnerPricingRules.partnerId, partner.id))
    await tx
      .delete(partnerProducts)
      .where(eq(partnerProducts.partnerId, partner.id))

    const executor = tx as unknown as typeof db
    const productIdByName = new Map<string, string>()
    for (const product of plan.products) {
      const [row] = await tx
        .insert(partnerProducts)
        .values({
          partnerId: partner.id,
          name: product.name,
          hasVariants: product.hasVariants,
          price: product.hasVariants ? null : String(product.price),
          isActive: true,
        })
        .returning({ id: partnerProducts.id })
      productIdByName.set(product.name, row.id)

      if (!product.hasVariants) {
        await syncDefaultVariant(executor, row.id)
      } else {
        const valueIdByKey = new Map<string, string>()
        const groups: Array<{ type: 'ukuran' | 'variasi'; values: Array<string> }> = []
        if (product.sizes.length) groups.push({ type: 'ukuran', values: product.sizes })
        if (product.motifs.length) groups.push({ type: 'variasi', values: product.motifs })
        for (const [gi, group] of groups.entries()) {
          const [g] = await tx
            .insert(partnerOptionGroups)
            .values({ partnerProductId: row.id, type: group.type, position: gi })
            .returning({ id: partnerOptionGroups.id })
          for (const [vi, value] of group.values.entries()) {
            const [v] = await tx
              .insert(partnerOptionValues)
              .values({ optionGroupId: g.id, name: value, position: vi })
              .returning({ id: partnerOptionValues.id })
            valueIdByKey.set(`${group.type}:${value}`, v.id)
          }
        }

        for (const variant of product.variants) {
          const [vr] = await tx
            .insert(partnerVariants)
            .values({
              partnerProductId: row.id,
              price: String(variant.price),
              isActive: true,
              trackStock: false,
              allowPreorder: false,
            })
            .returning({ id: partnerVariants.id })
          const links: Array<{ variantId: string; optionValueId: string }> = []
          if (variant.ukuran) {
            links.push({
              variantId: vr.id,
              optionValueId: valueIdByKey.get(`ukuran:${variant.ukuran}`)!,
            })
          }
          if (variant.variasi) {
            links.push({
              variantId: vr.id,
              optionValueId: valueIdByKey.get(`variasi:${variant.variasi}`)!,
            })
          }
          if (links.length) await tx.insert(partnerVariantValues).values(links)
        }
      }
    }

    // Aturan paket: satu baris per aturan unik, dengan semua produk pemakainya.
    for (const rule of plan.rules) {
      const [r] = await tx
        .insert(partnerPricingRules)
        .values({
          partnerId: partner.id,
          name: rule.name,
          minQty: rule.minQty,
          bundlePrice: String(rule.bundlePrice),
          isActive: true,
          position: plan.rules.indexOf(rule),
        })
        .returning({ id: partnerPricingRules.id })
      const productIds = rule.productNames.map((name) => {
        const id = productIdByName.get(name)
        if (!id) throw new Error(`Produk "${name}" untuk aturan "${rule.name}" tidak ada.`)
        return id
      })
      await tx
        .insert(partnerRuleProducts)
        .values(productIds.map((partnerProductId) => ({ ruleId: r.id, partnerProductId })))
      if (rule.sizes.length) {
        await tx
          .insert(partnerRuleSizes)
          .values(rule.sizes.map((sizeName) => ({ ruleId: r.id, sizeName })))
      }
      for (const productId of productIds) {
        await syncDefaultVariant(executor, productId)
      }
    }
  })

  console.log(`Selesai: ${plan.products.length} produk, ${totalVariants} varian, ${totalRules} aturan.`)
  console.log('Ingat: aturan paket hanya tampil dan bisa dipakai kalau partner berlangganan PRO.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
