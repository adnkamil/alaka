import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { clampPage, pageOffset, pageParamsSchema } from './pagination'
import { requirePartner } from './partner-auth'
import { RULE_SORT_KEYS } from './partner-rule-sort'
import { sortParamSchema } from './table-sort'
import { hasPartnerPro } from './partner-entitlement'
import { assertRuleScopesNoOverlap } from './partner-pricing'
import { productSizesForRule, validateProductSizes } from './partner-rule-sizes'
import { syncDefaultVariant } from './partner-default-variant'

const idSchema = z.uuid()

const ruleInputSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1, 'Nama aturan wajib diisi').max(80),
  minQty: z.number().int().min(1, 'Jumlah pcs minimal 1'),
  bundlePrice: z.number().nonnegative('Harga paket tidak boleh negatif'),
  isActive: z.boolean(),
  productIds: z.array(idSchema).min(1, 'Pilih minimal satu produk'),
  // Ukuran yang ikut aturan, per produk. Produk tanpa ukuran tidak perlu entri.
  productSizes: z
    .record(idSchema, z.array(z.string().trim().min(1).max(40)).max(50))
    .default({}),
})

type Db = typeof import('../db').db

/** Nama ukuran tiap produk (urut sesuai posisi), untuk validasi dan form aturan. */
async function loadProductSizeNames(
  db: Db,
  productIds: Array<string>,
): Promise<Map<string, Array<string>>> {
  const result = new Map<string, Array<string>>()
  if (productIds.length === 0) return result
  const { partnerOptionGroups, partnerOptionValues } = await import(
    '../db/schema'
  )
  const rows = await db
    .select({
      productId: partnerOptionGroups.partnerProductId,
      name: partnerOptionValues.name,
    })
    .from(partnerOptionGroups)
    .innerJoin(
      partnerOptionValues,
      eq(partnerOptionValues.optionGroupId, partnerOptionGroups.id),
    )
    .where(
      and(
        inArray(partnerOptionGroups.partnerProductId, productIds),
        eq(partnerOptionGroups.type, 'ukuran'),
      ),
    )
    .orderBy(asc(partnerOptionValues.position), asc(partnerOptionValues.name))
  for (const row of rows) {
    const list = result.get(row.productId) ?? []
    list.push(row.name)
    result.set(row.productId, list)
  }
  return result
}

/** Ukuran milik tiap produk partner, untuk memilih ukuran di form aturan. */
export const listPartnerProductSizes = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerProducts } = await import('../db/schema')
    const owned = await db
      .select({ id: partnerProducts.id })
      .from(partnerProducts)
      .where(eq(partnerProducts.partnerId, partner.id))
    const sizes = await loadProductSizeNames(
      db,
      owned.map((p) => p.id),
    )
    return Object.fromEntries(sizes) as Record<string, Array<string>>
  },
)

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
    const { partnerPricingRules, partnerRuleProducts, partnerRuleProductSizes } =
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
          .from(partnerRuleProductSizes)
          .where(
            inArray(
              partnerRuleProductSizes.ruleId,
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
      productSizes: productSizesForRule(sizeRows, rule.id),
    }))
  },
)

/**
 * Satu halaman aturan paket untuk tabel Aturan Paket (paginasi di database).
 * `listPartnerRules` tetap dipakai form/kartu yang memang butuh semua aturan.
 */
export const listPartnerRulesPage = createServerFn({ method: 'GET' })
  .validator(
    pageParamsSchema.extend({
      search: z.string().max(100).default(''),
      sort: sortParamSchema(RULE_SORT_KEYS),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerPricingRules, partnerRuleProducts, partnerRuleProductSizes } =
      await import('../db/schema')
    const term = data.search.trim()
    const owned = term
      ? and(
          eq(partnerPricingRules.partnerId, partner.id),
          ilike(partnerPricingRules.name, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
        )
      : eq(partnerPricingRules.partnerId, partner.id)
    const [{ total }] = await db
      .select({ total: count() })
      .from(partnerPricingRules)
      .where(owned)
    const page = clampPage(data.page, total, data.pageSize)
    const sortColumns = {
      name: sql`lower(${partnerPricingRules.name})`,
      minQty: sql`${partnerPricingRules.minQty}`,
      bundlePrice: sql`${partnerPricingRules.bundlePrice}`,
      isActive: sql`${partnerPricingRules.isActive}`,
    }
    const fallbackOrder = [
      asc(partnerPricingRules.position),
      asc(partnerPricingRules.id),
    ]
    const order = data.sort
      ? [
          data.sort.dir === 'asc'
            ? asc(sortColumns[data.sort.key])
            : desc(sortColumns[data.sort.key]),
          ...fallbackOrder,
        ]
      : fallbackOrder
    const rules = await db
      .select()
      .from(partnerPricingRules)
      .where(owned)
      .orderBy(...order)
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
          .from(partnerRuleProductSizes)
          .where(
            inArray(
              partnerRuleProductSizes.ruleId,
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
        productSizes: productSizesForRule(sizeRows, rule.id),
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
      partnerRuleProductSizes,
    } = await import('../db/schema')

    const ownProducts = await db
      .select({ id: partnerProducts.id, name: partnerProducts.name })
      .from(partnerProducts)
      .where(
        and(
          inArray(partnerProducts.id, data.productIds),
          eq(partnerProducts.partnerId, partner.id),
        ),
      )
    if (ownProducts.length !== new Set(data.productIds).size) {
      throw new Error('Ada produk yang bukan milik partner ini.')
    }

    // Ukuran yang dipilih per produk harus berasal dari ukuran produk itu, dan
    // wajib dipilih minimal satu untuk produk yang punya ukuran.
    const productSizeNames = await loadProductSizeNames(db, data.productIds)
    const productSizes: Record<string, Array<string>> = {}
    for (const product of ownProducts) {
      const selected = [...new Set(data.productSizes[product.id] ?? [])]
      const problem = validateProductSizes(
        product.name,
        productSizeNames.get(product.id) ?? [],
        selected,
      )
      if (problem) throw new Error(problem)
      if (selected.length > 0) productSizes[product.id] = selected
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
          .from(partnerRuleProductSizes)
          .where(inArray(partnerRuleProductSizes.ruleId, otherRuleIds))
      : []
    try {
      assertRuleScopesNoOverlap([
        ...otherRuleIds.map((id) => ({
          id,
          productIds: otherLinks
            .filter((l) => l.ruleId === id)
            .map((l) => l.partnerProductId),
          productSizes: productSizesForRule(otherSizes, id),
        })),
        {
          id: data.id ?? 'new',
          productIds: data.productIds,
          productSizes,
        },
      ])
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Ada produk dengan ukuran yang sama di aturan paket lain.',
      )
    }
    const sizePairs = Object.entries(productSizes).flatMap(
      ([partnerProductId, names]) =>
        names.map((sizeName) => ({ partnerProductId, sizeName })),
    )

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
          .select({
            partnerProductId: partnerRuleProductSizes.partnerProductId,
            sizeName: partnerRuleProductSizes.sizeName,
          })
          .from(partnerRuleProductSizes)
          .where(eq(partnerRuleProductSizes.ruleId, ruleId))
        if (before) {
          const sameProducts =
            beforeProducts.length === data.productIds.length &&
            beforeProducts.every((p) => data.productIds.includes(p.id))
          const sizeKey = (z: { partnerProductId: string; sizeName: string }) =>
            `${z.partnerProductId}|${z.sizeName}`
          const nextSizeKeys = new Set(sizePairs.map(sizeKey))
          const sameSizes =
            beforeSizes.length === sizePairs.length &&
            beforeSizes.every((z) => nextSizeKeys.has(sizeKey(z)))
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
          .delete(partnerRuleProductSizes)
          .where(eq(partnerRuleProductSizes.ruleId, ruleId))
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
      if (sizePairs.length > 0) {
        await tx.insert(partnerRuleProductSizes).values(
          sizePairs.map(({ partnerProductId, sizeName }) => ({
            ruleId: ruleId!,
            partnerProductId,
            sizeName,
          })),
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
 * Mengeluarkan satu produk dari aturan paket dari halaman produknya. Hanya
 * bisa melepas: memasukkan produk ke aturan dilakukan dari halaman aturan,
 * karena ukuran yang ikut aturan harus dipilih di sana.
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

    const keepIds = [...new Set(data.ruleIds)]
    return db.transaction(async (tx) => {
      // Hanya aturan milik partner ini yang memuat produk ini yang dipertimbangkan.
      const current = await tx
        .select({ ruleId: partnerRuleProducts.ruleId })
        .from(partnerRuleProducts)
        .innerJoin(
          partnerPricingRules,
          eq(partnerPricingRules.id, partnerRuleProducts.ruleId),
        )
        .where(
          and(
            eq(partnerRuleProducts.partnerProductId, data.productId),
            eq(partnerPricingRules.partnerId, partner.id),
          ),
        )
      const currentIds = current.map((c) => c.ruleId)
      if (keepIds.some((id) => !currentIds.includes(id))) {
        throw new Error(
          'Tambahkan produk ke aturan dari halaman Paket, karena ukurannya perlu dipilih di sana.',
        )
      }
      const toRemove = currentIds.filter((id) => !keepIds.includes(id))
      if (toRemove.length > 0) {
        // Ukuran produk di aturan itu ikut terhapus (cascade).
        await tx
          .delete(partnerRuleProducts)
          .where(
            and(
              eq(partnerRuleProducts.partnerProductId, data.productId),
              inArray(partnerRuleProducts.ruleId, toRemove),
            ),
          )
      }
      return { ok: true as const }
    })
  })
