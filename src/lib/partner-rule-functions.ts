import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { hasPartnerPro } from './partner-entitlement'
import { assertRuleProductsUnique } from './partner-pricing'
import { syncDefaultVariant } from './partner-default-variant'

const idSchema = z.uuid()

const ruleInputSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1, 'Nama aturan wajib diisi').max(80),
  minQty: z.number().int().min(1, 'Jumlah pcs minimal 1'),
  bundlePrice: z.number().nonnegative('Harga paket tidak boleh negatif'),
  isActive: z.boolean(),
  productIds: z.array(idSchema).min(1, 'Pilih minimal satu produk'),
})

async function assertPro(partnerId: string) {
  const { db } = await import('../db')
  const { partnerSubscriptions } = await import('../db/schema')
  const subs = await db
    .select({
      status: partnerSubscriptions.status,
      startedAt: partnerSubscriptions.startedAt,
      endsAt: partnerSubscriptions.endsAt,
    })
    .from(partnerSubscriptions)
    .where(eq(partnerSubscriptions.partnerId, partnerId))
  if (!hasPartnerPro(subs)) {
    throw new Error('Aturan paket membutuhkan langganan PRO partner.')
  }
}

/** Daftar aturan paket milik partner, beserta produk di tiap aturan. */
export const listPartnerRules = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerPricingRules, partnerRuleProducts } = await import(
      '../db/schema'
    )
    const rules = await db
      .select()
      .from(partnerPricingRules)
      .where(eq(partnerPricingRules.partnerId, partner.id))
      .orderBy(partnerPricingRules.position)
    const links = rules.length
      ? await db
          .select()
          .from(partnerRuleProducts)
          .where(
            inArray(
              partnerRuleProducts.ruleId,
              rules.map((r) => r.id),
            ),
          )
      : []
    // Pemulihan untuk produk yang sudah masuk aturan sebelum varian default ada.
    for (const partnerProductId of new Set(links.map((l) => l.partnerProductId))) {
      await syncDefaultVariant(db, partnerProductId)
    }
    return rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      minQty: rule.minQty,
      bundlePrice: Number(rule.bundlePrice),
      isActive: rule.isActive,
      productIds: links
        .filter((l) => l.ruleId === rule.id)
        .map((l) => l.partnerProductId),
    }))
  },
)

/**
 * Buat atau ubah aturan paket. Produk harus milik partner ini, dan satu produk
 * hanya boleh ada di satu aturan (dicek terhadap aturan partner lain).
 */
export const savePartnerRule = createServerFn({ method: 'POST' })
  .validator(ruleInputSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    await assertPro(partner.id)
    const { db } = await import('../db')
    const { partnerProducts, partnerPricingRules, partnerRuleProducts } =
      await import('../db/schema')

    const ownProducts = await db
      .select({ id: partnerProducts.id })
      .from(partnerProducts)
      .where(inArray(partnerProducts.id, data.productIds))
    if (ownProducts.length !== new Set(data.productIds).size) {
      throw new Error('Ada produk yang bukan milik partner ini.')
    }

    const existingRules = await db
      .select({ id: partnerPricingRules.id })
      .from(partnerPricingRules)
      .where(eq(partnerPricingRules.partnerId, partner.id))
    const otherRuleIds = existingRules
      .map((r) => r.id)
      .filter((id) => id !== data.id)
    const otherLinks = otherRuleIds.length
      ? await db
          .select()
          .from(partnerRuleProducts)
          .where(inArray(partnerRuleProducts.ruleId, otherRuleIds))
      : []
    try {
      assertRuleProductsUnique([
        ...otherRuleIds.map((id) => ({
          id,
          productIds: otherLinks
            .filter((l) => l.ruleId === id)
            .map((l) => l.partnerProductId),
        })),
        { id: data.id ?? 'new', productIds: data.productIds },
      ])
    } catch {
      throw new Error('Ada produk yang sudah masuk aturan paket lain.')
    }

    return db.transaction(async (tx) => {
      let ruleId = data.id
      const values = {
        name: data.name,
        minQty: data.minQty,
        bundlePrice: String(data.bundlePrice),
        isActive: data.isActive,
      }
      if (ruleId) {
        const updated = await tx
          .update(partnerPricingRules)
          .set(values)
          .where(eq(partnerPricingRules.id, ruleId))
          .returning({ id: partnerPricingRules.id })
        if (updated.length === 0) throw new Error('Aturan tidak ditemukan')
        await tx
          .delete(partnerRuleProducts)
          .where(eq(partnerRuleProducts.ruleId, ruleId))
      } else {
        const [created] = await tx
          .insert(partnerPricingRules)
          .values({ ...values, partnerId: partner.id })
          .returning({ id: partnerPricingRules.id })
        ruleId = created.id
      }
      await tx.insert(partnerRuleProducts).values(
        data.productIds.map((partnerProductId) => ({
          ruleId: ruleId!,
          partnerProductId,
        })),
      )
      // Produk tanpa varian wajib punya varian Standar supaya bisa dipilih di paket.
      for (const partnerProductId of data.productIds) {
        await syncDefaultVariant(
          tx as unknown as typeof import('../db').db,
          partnerProductId,
        )
      }
      return { id: ruleId! }
    })
  })

/**
 * Hapus aturan paket. Pesanan yang sudah memakai aturan ini tetap utuh: HPP
 * sudah tersimpan di pesanan, hanya tautan ke aturannya yang dilepas.
 */
export const deletePartnerRule = createServerFn({ method: 'POST' })
  .validator(z.object({ id: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerPricingRules } = await import('../db/schema')
    // Kepemilikan dicek di kondisi hapus itu sendiri, bukan sesudahnya.
    const deleted = await db
      .delete(partnerPricingRules)
      .where(
        and(
          eq(partnerPricingRules.id, data.id),
          eq(partnerPricingRules.partnerId, partner.id),
        ),
      )
      .returning({ id: partnerPricingRules.id })
    if (deleted.length === 0) throw new Error('Aturan tidak ditemukan')
    return { ok: true as const }
  })

/**
 * Mengatur paket satu produk dari halaman produknya. `ruleId = null` berarti
 * produk dikeluarkan dari aturan mana pun. Memasukkan ke aturan butuh PRO.
 */
export const setPartnerProductRule = createServerFn({ method: 'POST' })
  .validator(z.object({ productId: idSchema, ruleId: idSchema.nullable() }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerProducts, partnerPricingRules, partnerRuleProducts } =
      await import('../db/schema')

    const [product] = await db
      .select({ id: partnerProducts.id })
      .from(partnerProducts)
      .where(
        and(eq(partnerProducts.id, data.productId), eq(partnerProducts.partnerId, partner.id)),
      )
    if (!product) throw new Error('Produk tidak ditemukan')

    if (data.ruleId) {
      await assertPro(partner.id)
      const [rule] = await db
        .select({ id: partnerPricingRules.id })
        .from(partnerPricingRules)
        .where(
          and(eq(partnerPricingRules.id, data.ruleId), eq(partnerPricingRules.partnerId, partner.id)),
        )
      if (!rule) throw new Error('Aturan tidak ditemukan')

      // Satu produk hanya boleh di satu aturan: cek aturan lain milik partner ini.
      const otherLink = await db
        .select({ ruleId: partnerRuleProducts.ruleId })
        .from(partnerRuleProducts)
        .where(eq(partnerRuleProducts.partnerProductId, data.productId))
      if (otherLink.some((l) => l.ruleId !== data.ruleId)) {
        throw new Error('Produk ini sudah masuk aturan paket lain. Keluarkan dulu dari aturan itu.')
      }
    }

    return db.transaction(async (tx) => {
      await tx
        .delete(partnerRuleProducts)
        .where(eq(partnerRuleProducts.partnerProductId, data.productId))
      if (data.ruleId) {
        await tx
          .insert(partnerRuleProducts)
          .values({ ruleId: data.ruleId, partnerProductId: data.productId })
        await syncDefaultVariant(
          tx as unknown as typeof import('../db').db,
          data.productId,
        )
      }
      return { ok: true as const }
    })
  })
