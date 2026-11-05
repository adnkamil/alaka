import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { clampPage, pageOffset, pageParamsSchema } from './pagination'
import { requirePartner } from './partner-auth'
import { hasPartnerPro } from './partner-entitlement'
import { assertRuleScopesNoOverlap } from './partner-pricing'
import { syncDefaultVariant } from './partner-default-variant'

const idSchema = z.uuid()

const ruleInputSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1, 'Nama aturan wajib diisi').max(80),
  minQty: z.number().int().min(1, 'Jumlah pcs minimal 1'),
  bundlePrice: z.number().nonnegative('Harga paket tidak boleh negatif'),
  isActive: z.boolean(),
  productIds: z.array(idSchema).min(1, 'Pilih minimal satu produk'),
  sizes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
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
    const { partnerPricingRules, partnerRuleProducts, partnerRuleSizes } =
      await import('../db/schema')
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
    const sizeRows = rules.length
      ? await db
          .select()
          .from(partnerRuleSizes)
          .where(
            inArray(
              partnerRuleSizes.ruleId,
              rules.map((r) => r.id),
            ),
          )
      : []
    // Pemulihan untuk produk yang sudah masuk aturan sebelum varian default ada.
    for (const partnerProductId of new Set(
      links.map((l) => l.partnerProductId),
    )) {
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
      sizes: sizeRows.filter((z) => z.ruleId === rule.id).map((z) => z.sizeName),
    }))
  },
)

/**
 * Satu halaman aturan paket untuk tabel Aturan Paket (paginasi di database).
 * `listPartnerRules` tetap dipakai form/kartu yang memang butuh semua aturan.
 */
export const listPartnerRulesPage = createServerFn({ method: 'GET' })
  .validator(pageParamsSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerPricingRules, partnerRuleProducts, partnerRuleSizes } =
      await import('../db/schema')
    const owned = eq(partnerPricingRules.partnerId, partner.id)
    const [{ total }] = await db
      .select({ total: count() })
      .from(partnerPricingRules)
      .where(owned)
    const page = clampPage(data.page, total, data.pageSize)
    const rules = await db
      .select()
      .from(partnerPricingRules)
      .where(owned)
      .orderBy(asc(partnerPricingRules.position), asc(partnerPricingRules.id))
      .limit(data.pageSize)
      .offset(pageOffset(page, data.pageSize))
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
    const sizeRows = rules.length
      ? await db
          .select()
          .from(partnerRuleSizes)
          .where(
            inArray(
              partnerRuleSizes.ruleId,
              rules.map((r) => r.id),
            ),
          )
      : []
    // Pemulihan varian default hanya untuk aturan di halaman ini.
    for (const partnerProductId of new Set(
      links.map((l) => l.partnerProductId),
    )) {
      await syncDefaultVariant(db, partnerProductId)
    }
    return {
      rows: rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        minQty: rule.minQty,
        bundlePrice: Number(rule.bundlePrice),
        isActive: rule.isActive,
        productIds: links
          .filter((l) => l.ruleId === rule.id)
          .map((l) => l.partnerProductId),
        sizes: sizeRows.filter((z) => z.ruleId === rule.id).map((z) => z.sizeName),
      })),
      total,
      page,
      pageSize: data.pageSize,
    }
  })

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
    const {
      partnerProducts,
      partnerPricingRules,
      partnerRuleProducts,
      partnerRuleSizes,
    } = await import('../db/schema')

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
    const otherSizes = otherRuleIds.length
      ? await db
          .select()
          .from(partnerRuleSizes)
          .where(inArray(partnerRuleSizes.ruleId, otherRuleIds))
      : []
    try {
      assertRuleScopesNoOverlap([
        ...otherRuleIds.map((id) => ({
          id,
          productIds: otherLinks
            .filter((l) => l.ruleId === id)
            .map((l) => l.partnerProductId),
          sizes: otherSizes
            .filter((z) => z.ruleId === id)
            .map((z) => z.sizeName),
        })),
        {
          id: data.id ?? 'new',
          productIds: data.productIds,
          sizes: data.sizes,
        },
      ])
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Ada produk dengan ukuran yang sama di aturan paket lain.',
      )
    }
    const sizes = [...new Set(data.sizes)]

    return db.transaction(async (tx) => {
      let ruleId = data.id
      const values = {
        name: data.name,
        minQty: data.minQty,
        bundlePrice: String(data.bundlePrice),
        isActive: data.isActive,
      }
      let changed = false
      if (ruleId) {
        // Cek apakah isi aturan benar-benar berubah sebelum memberi tahu jastiper.
        const before = await tx.query.partnerPricingRules.findFirst({
          where: eq(partnerPricingRules.id, ruleId),
        })
        const beforeProducts = await tx
          .select({ id: partnerRuleProducts.partnerProductId })
          .from(partnerRuleProducts)
          .where(eq(partnerRuleProducts.ruleId, ruleId))
        const beforeSizes = await tx
          .select({ name: partnerRuleSizes.sizeName })
          .from(partnerRuleSizes)
          .where(eq(partnerRuleSizes.ruleId, ruleId))
        if (before) {
          const sameProducts =
            beforeProducts.length === data.productIds.length &&
            beforeProducts.every((p) => data.productIds.includes(p.id))
          const sameSizes =
            beforeSizes.length === sizes.length &&
            beforeSizes.every((z) => sizes.includes(z.name))
          changed =
            before.name !== values.name ||
            before.minQty !== values.minQty ||
            Number(before.bundlePrice) !== Number(values.bundlePrice) ||
            before.isActive !== values.isActive ||
            !sameProducts ||
            !sameSizes
        }
        const updated = await tx
          .update(partnerPricingRules)
          .set(values)
          .where(eq(partnerPricingRules.id, ruleId))
          .returning({ id: partnerPricingRules.id })
        if (updated.length === 0) throw new Error('Aturan tidak ditemukan')
        if (changed) await notifyRuleChange(tx, ruleId, values.name, 'updated')
        await tx
          .delete(partnerRuleProducts)
          .where(eq(partnerRuleProducts.ruleId, ruleId))
        await tx
          .delete(partnerRuleSizes)
          .where(eq(partnerRuleSizes.ruleId, ruleId))
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
      if (sizes.length > 0) {
        await tx.insert(partnerRuleSizes).values(
          sizes.map((sizeName) => ({ ruleId: ruleId!, sizeName })),
        )
      }
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
    // Jastiper dikabari dulu (sebelum tautan barang dilepas oleh penghapusan).
    const deleted = await db.transaction(async (tx) => {
      const owned = await tx.query.partnerPricingRules.findFirst({
        where: and(
          eq(partnerPricingRules.id, data.id),
          eq(partnerPricingRules.partnerId, partner.id),
        ),
      })
      if (!owned) return []
      await notifyRuleChange(tx, owned.id, owned.name, 'deleted')
      return tx
        .delete(partnerPricingRules)
        .where(
          and(
            eq(partnerPricingRules.id, data.id),
            eq(partnerPricingRules.partnerId, partner.id),
          ),
        )
        .returning({ id: partnerPricingRules.id })
    })
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
        and(
          eq(partnerProducts.id, data.productId),
          eq(partnerProducts.partnerId, partner.id),
        ),
      )
    if (!product) throw new Error('Produk tidak ditemukan')

    if (data.ruleId) {
      await assertPro(partner.id)
      const [rule] = await db
        .select({ id: partnerPricingRules.id })
        .from(partnerPricingRules)
        .where(
          and(
            eq(partnerPricingRules.id, data.ruleId),
            eq(partnerPricingRules.partnerId, partner.id),
          ),
        )
      if (!rule) throw new Error('Aturan tidak ditemukan')

      // Satu produk boleh di beberapa aturan asal rentang ukurannya tidak
      // tumpang tindih. Cek hanya terhadap aturan lain yang sudah memuat produk ini.
      const { partnerRuleSizes } = await import('../db/schema')
      const otherLinks = await db
        .select({ ruleId: partnerRuleProducts.ruleId })
        .from(partnerRuleProducts)
        .where(eq(partnerRuleProducts.partnerProductId, data.productId))
      const otherRuleIds = otherLinks
        .map((l) => l.ruleId)
        .filter((id) => id !== data.ruleId)
      if (otherRuleIds.length > 0) {
        const sizeRows = await db
          .select()
          .from(partnerRuleSizes)
          .where(
            inArray(partnerRuleSizes.ruleId, [...otherRuleIds, data.ruleId]),
          )
        try {
          assertRuleScopesNoOverlap(
            [...otherRuleIds, data.ruleId].map((id) => ({
              id,
              productIds: [data.productId],
              sizes: sizeRows
                .filter((z) => z.ruleId === id)
                .map((z) => z.sizeName),
            })),
          )
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? error.message
              : 'Produk ini sudah punya aturan dengan ukuran yang sama.',
          )
        }
      }
    }

    return db.transaction(async (tx) => {
      if (data.ruleId) {
        // Menambah ke aturan ini saja, tanpa melepas dari aturan lain.
        const existing = await tx
          .select({ ruleId: partnerRuleProducts.ruleId })
          .from(partnerRuleProducts)
          .where(
            and(
              eq(partnerRuleProducts.partnerProductId, data.productId),
              eq(partnerRuleProducts.ruleId, data.ruleId),
            ),
          )
        if (existing.length === 0) {
          await tx
            .insert(partnerRuleProducts)
            .values({ ruleId: data.ruleId, partnerProductId: data.productId })
        }
        await syncDefaultVariant(
          tx as unknown as typeof import('../db').db,
          data.productId,
        )
      } else {
        // Tanpa aturan: produk dikeluarkan dari semua aturan.
        await tx
          .delete(partnerRuleProducts)
          .where(eq(partnerRuleProducts.partnerProductId, data.productId))
      }
      return { ok: true as const }
    })
  })

type RuleTx = Parameters<
  Parameters<typeof import('../db')['db']['transaction']>[0]
>[0]

/**
 * Catat notifikasi untuk tiap event jastiper yang punya barang dari aturan ini.
 * Dipanggil sebelum/sesudah perubahan di transaksi yang sama.
 */
async function notifyRuleChange(
  tx: RuleTx,
  ruleId: string,
  ruleName: string,
  changeType: 'updated' | 'deleted',
) {
  const { items, orders, partnerRuleNotices } = await import('../db/schema')
  const { sql } = await import('drizzle-orm')
  const rows = await tx
    .select({
      eventId: orders.eventId,
      affected: sql<number>`count(${items.id})::int`,
    })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(eq(items.partnerRuleId, ruleId))
    .groupBy(orders.eventId)
  if (rows.length === 0) return
  await tx.insert(partnerRuleNotices).values(
    rows.map((r) => ({
      eventId: r.eventId,
      ruleName,
      changeType,
      affectedItems: r.affected,
    })),
  )
}

/**
 * Mengatur seluruh aturan paket satu produk sekaligus. Satu produk boleh
 * punya beberapa aturan asal rentang ukurannya tidak tumpang tindih.
 */
export const setPartnerProductRules = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      productId: idSchema,
      ruleIds: z.array(idSchema).max(50),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const {
      partnerProducts,
      partnerPricingRules,
      partnerRuleProducts,
      partnerRuleSizes,
    } = await import('../db/schema')

    const [product] = await db
      .select({ id: partnerProducts.id })
      .from(partnerProducts)
      .where(
        and(
          eq(partnerProducts.id, data.productId),
          eq(partnerProducts.partnerId, partner.id),
        ),
      )
    if (!product) throw new Error('Produk tidak ditemukan')

    const ruleIds = [...new Set(data.ruleIds)]
    if (ruleIds.length > 0) {
      await assertPro(partner.id)
      const owned = await db
        .select({ id: partnerPricingRules.id })
        .from(partnerPricingRules)
        .where(
          and(
            inArray(partnerPricingRules.id, ruleIds),
            eq(partnerPricingRules.partnerId, partner.id),
          ),
        )
      if (owned.length !== ruleIds.length) {
        throw new Error('Aturan tidak ditemukan')
      }

      const sizeRows = await db
        .select()
        .from(partnerRuleSizes)
        .where(inArray(partnerRuleSizes.ruleId, ruleIds))
      try {
        assertRuleScopesNoOverlap(
          ruleIds.map((id) => ({
            id,
            productIds: [data.productId],
            sizes: sizeRows.filter((z) => z.ruleId === id).map((z) => z.sizeName),
          })),
        )
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Produk ini sudah punya aturan dengan ukuran yang sama.',
        )
      }
    }

    return db.transaction(async (tx) => {
      // Lepas dari aturan milik partner ini yang tidak lagi dipilih.
      const current = await tx
        .select({ ruleId: partnerRuleProducts.ruleId })
        .from(partnerRuleProducts)
        .where(eq(partnerRuleProducts.partnerProductId, data.productId))
      const currentIds = current.map((c) => c.ruleId)
      const toRemove = currentIds.filter((id) => !ruleIds.includes(id))
      if (toRemove.length > 0) {
        await tx
          .delete(partnerRuleProducts)
          .where(
            and(
              eq(partnerRuleProducts.partnerProductId, data.productId),
              inArray(partnerRuleProducts.ruleId, toRemove),
            ),
          )
      }
      const toAdd = ruleIds.filter((id) => !currentIds.includes(id))
      if (toAdd.length > 0) {
        await tx.insert(partnerRuleProducts).values(
          toAdd.map((ruleId) => ({ ruleId, partnerProductId: data.productId })),
        )
      }
      await syncDefaultVariant(
        tx as unknown as typeof import('../db').db,
        data.productId,
      )
      return { ok: true as const }
    })
  })
