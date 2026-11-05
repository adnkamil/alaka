// Mengubah nama aturan paket yang sudah tersimpan (dan nama paket di pesanan
// yang memakainya) menjadi format dari data aturan, misalnya "100K / 2pcs (S, M, L)".
//
// Dry-run (default, tidak menulis apa pun):
//   pnpm tsx scripts/rename-partner-rule-labels.ts -- --email=micibaby07@gmail.com
//
// Tulis ke database:
//   pnpm tsx scripts/rename-partner-rule-labels.ts -- --email=micibaby07@gmail.com --apply
//
// Tanpa --email, semua partner ikut diproses.

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

import { formatRuleLabel } from '../src/lib/partner-rule-label'

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
}

async function main() {
  const email = arg('email')?.trim().toLowerCase()
  const apply = process.argv.includes('--apply')

  const { eq, inArray } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { partners, partnerPricingRules, partnerRuleSizes } = await import(
    '../src/db/schema'
  )

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
    .select({
      id: partnerPricingRules.id,
      name: partnerPricingRules.name,
      minQty: partnerPricingRules.minQty,
      bundlePrice: partnerPricingRules.bundlePrice,
    })
    .from(partnerPricingRules)
    .where(partnerIds ? inArray(partnerPricingRules.partnerId, partnerIds) : undefined)

  const sizeRows = rules.length
    ? await db
        .select({ ruleId: partnerRuleSizes.ruleId, sizeName: partnerRuleSizes.sizeName })
        .from(partnerRuleSizes)
        .where(inArray(partnerRuleSizes.ruleId, rules.map((r) => r.id)))
    : []

  const changes = rules
    .map((rule) => {
      const sizes = sizeRows.filter((z) => z.ruleId === rule.id).map((z) => z.sizeName)
      const label = formatRuleLabel({
        minQty: rule.minQty,
        bundlePrice: Number(rule.bundlePrice),
        sizes,
      })
      return { id: rule.id, from: rule.name, to: label }
    })
    .filter((c) => c.from !== c.to)

  console.log(`Aturan dicek: ${rules.length}, yang berubah: ${changes.length}`)
  for (const c of changes.slice(0, 20)) console.log(`  ${c.from}  ->  ${c.to}`)
  if (changes.length > 20) console.log(`  ... dan ${changes.length - 20} lagi`)

  if (!apply) {
    console.log('\nDry-run. Tambahkan --apply untuk menulis ke database.')
    return
  }

  await db.transaction(async (tx) => {
    for (const c of changes) {
      await tx
        .update(partnerPricingRules)
        .set({ name: c.to })
        .where(eq(partnerPricingRules.id, c.id))
    }
  })
  console.log(`Selesai: ${changes.length} aturan diubah namanya.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
