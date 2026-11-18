// Menggabungkan aturan paket yang setara (partner, jumlah pcs, harga paket, dan
// status aktif sama) menjadi satu. Setelah ukuran dipilih per produk, aturan
// seperti "100K / 2pcs (S, M, L)" dan "100K / 2pcs (semua ukuran)" tidak perlu
// dipisah lagi. Barang pesanan yang memakai aturan yang digabung dialihkan ke
// aturan yang dipertahankan; nama aturan itu dibersihkan dari keterangan ukuran.
//
// Dry-run (default, tidak menulis apa pun):
//   pnpm tsx scripts/merge-partner-rules.ts -- --email=micibaby07@gmail.com
//
// Tulis ke database (satu transaksi):
//   pnpm tsx scripts/merge-partner-rules.ts -- --email=micibaby07@gmail.com --apply
//
// Tanpa --email, semua partner ikut diproses.
// Jangan jalankan rename-partner-rule-labels.ts setelah ini: label barunya
// memuat gabungan ukuran semua produk dan jadi menyesatkan.

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

import { planRuleMerges } from '../src/lib/partner-rule-merge'

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
}

async function main() {
  const email = arg('email')?.trim().toLowerCase()
  const apply = process.argv.includes('--apply')

  const { eq, inArray } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { partners, partnerPricingRules, partnerRuleProducts, partnerRuleProductSizes } =
    await import('../src/db/schema')
  const { applyRuleMerge } = await import('../src/lib/partner-rule-merge-queries')

  let partnerIds: Array<string> | null = null
  if (email) {
    const [partner] = await db
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.email, email))
    if (!partner) throw new Error(`Partner dengan email "${email}" tidak ditemukan.`)
    partnerIds = [partner.id]
  }

  const rules = await db
    .select()
    .from(partnerPricingRules)
    .where(partnerIds ? inArray(partnerPricingRules.partnerId, partnerIds) : undefined)
  const ruleIds = rules.map((r) => r.id)
  const links = ruleIds.length
    ? await db.select().from(partnerRuleProducts).where(inArray(partnerRuleProducts.ruleId, ruleIds))
    : []
  const sizes = ruleIds.length
    ? await db
        .select()
        .from(partnerRuleProductSizes)
        .where(inArray(partnerRuleProductSizes.ruleId, ruleIds))
    : []

  const plans = planRuleMerges(rules, links, sizes)
  if (plans.length === 0) {
    console.log('Tidak ada aturan setara yang bisa digabung.')
    return
  }
  console.log(`${apply ? 'MENULIS' : 'DRY-RUN'}: ${plans.length} kelompok aturan.\n`)
  for (const plan of plans) {
    console.log(`• Pertahankan "${plan.keeperName}" -> diberi nama "${plan.newName}"`)
    for (const name of plan.mergedNames) console.log(`    gabung & hapus: "${name}"`)
    console.log(`    total produk setelah gabung: ${plan.productIds.length}`)
  }

  if (!apply) {
    console.log('\nTidak ada yang ditulis. Tambahkan --apply untuk menjalankan.')
    return
  }
  await db.transaction(async (tx) => {
    for (const plan of plans) {
      const { itemsMoved } = await applyRuleMerge(tx, plan)
      console.log(`  ✓ "${plan.newName}": ${itemsMoved} barang pesanan dialihkan`)
    }
  })
  console.log('\nSelesai.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
