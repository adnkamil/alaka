import { syncDefaultVariant } from './partner-default-variant'
import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { getPartnerProduct } from './partner-product-queries'
import { hasPartnerPro } from './partner-entitlement'
import {
  VariantPlanError,
  planVariantChanges,
  validateVariantInput,
  type ExistingVariant,
} from './partner-variant-plan'

const idSchema = z.uuid()

const variantInputSchema = z.object({
  size: z.string().nullable(),
  variation: z.string().nullable(),
  price: z.number().nonnegative(),
})

const saveSchema = z.object({
  productId: idSchema,
  hasVariants: z.boolean(),
  /** Harga induk. Wajib kalau `hasVariants` = false. */
  price: z.number().nonnegative().nullable(),
  sizes: z.array(z.string()).max(50),
  variations: z.array(z.string()).max(200),
  variants: z.array(variantInputSchema).max(2000),
})

async function assertOwnedProduct(partnerId: string, productId: string) {
  const product = await getPartnerProduct(partnerId, productId)
  if (!product) throw new Error('Produk tidak ditemukan')
  return product
}

/** Mengambil konfigurasi varian satu produk untuk form partner. */
export const getPartnerProductVariants = createServerFn({ method: 'GET' })
  .validator(z.object({ productId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const {
      partnerProducts,
      partnerOptionGroups,
      partnerOptionValues,
      partnerVariants,
      partnerVariantValues,
      items,
      itemComponents,
    } = await import('../db/schema')
    await assertOwnedProduct(partner.id, data.productId)
    const [product] = await db
      .select({
        name: partnerProducts.name,
        hasVariants: partnerProducts.hasVariants,
        price: partnerProducts.price,
      })
      .from(partnerProducts)
      .where(eq(partnerProducts.id, data.productId))

    const groups = await db
      .select()
      .from(partnerOptionGroups)
      .where(eq(partnerOptionGroups.partnerProductId, data.productId))
    const groupIds = groups.map((g) => g.id)
    const values = groupIds.length
      ? await db
          .select()
          .from(partnerOptionValues)
          .where(inArray(partnerOptionValues.optionGroupId, groupIds))
      : []
    const sortedNames = (type: 'ukuran' | 'variasi') => {
      const groupId = groups.find((g) => g.type === type)?.id
      return values
        .filter((v) => v.optionGroupId === groupId)
        .sort((a, b) => a.position - b.position)
        .map((v) => v.name)
    }

    const variantRows = await db
      .select()
      .from(partnerVariants)
      .where(eq(partnerVariants.partnerProductId, data.productId))
    const variantIds = variantRows.map((v) => v.id)
    const variantValueRows = variantIds.length
      ? await db
          .select()
          .from(partnerVariantValues)
          .where(inArray(partnerVariantValues.variantId, variantIds))
      : []
    const ordered = new Set<string>()
    if (variantIds.length) {
      const direct = await db
        .select({ id: items.partnerVariantId })
        .from(items)
        .where(inArray(items.partnerVariantId, variantIds))
      const inBundle = await db
        .select({ id: itemComponents.partnerVariantId })
        .from(itemComponents)
        .where(inArray(itemComponents.partnerVariantId, variantIds))
      for (const r of [...direct, ...inBundle]) if (r.id) ordered.add(r.id)
    }

    const valueById = new Map(values.map((v) => [v.id, v]))
    const groupTypeById = new Map(groups.map((g) => [g.id, g.type]))
    const variants = variantRows.map((row) => {
      const links = variantValueRows.filter((l) => l.variantId === row.id)
      const named = (type: 'ukuran' | 'variasi') => {
        const link = links.find((l) => {
          const val = valueById.get(l.optionValueId)
          return val && groupTypeById.get(val.optionGroupId) === type
        })
        return link ? (valueById.get(link.optionValueId)?.name ?? null) : null
      }
      return {
        id: row.id,
        size: named('ukuran'),
        variation: named('variasi'),
        price: Number(row.price),
        isActive: row.isActive,
        hasOrders: ordered.has(row.id),
      }
    })

    return {
      productName: product.name,
      hasVariants: product.hasVariants,
      price: product.price === null ? null : Number(product.price),
      sizes: sortedNames('ukuran'),
      variations: sortedNames('variasi'),
      variants,
    }
  })

/**
 * Menyimpan konfigurasi varian satu produk. Kalau `hasVariants` nyala, fitur
 * ini butuh PRO partner. Varian yang sudah pernah dipesan tidak dihapus,
 * hanya dinonaktifkan. Nilai ukuran/variasi yang masih dipakai varian tidak
 * bisa dihapus.
 */
export const savePartnerProductVariants = createServerFn({ method: 'POST' })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const schema = await import('../db/schema')
    const {
      partnerProducts,
      partnerOptionGroups,
      partnerOptionValues,
      partnerVariants,
      partnerVariantValues,
      partnerSubscriptions,
      items,
      itemComponents,
    } = schema
    await assertOwnedProduct(partner.id, data.productId)

    if (data.hasVariants) {
      const subs = await db
        .select({
          status: partnerSubscriptions.status,
          startedAt: partnerSubscriptions.startedAt,
          endsAt: partnerSubscriptions.endsAt,
        })
        .from(partnerSubscriptions)
        .where(eq(partnerSubscriptions.partnerId, partner.id))
      if (!hasPartnerPro(subs)) {
        throw new Error('Fitur varian membutuhkan langganan PRO partner.')
      }
    } else {
      if (data.price === null) throw new Error('Isi harga produk.')
    }

    return db.transaction(async (tx) => {
      // Produk tanpa varian: cukup simpan harga. Data varian tidak disentuh.
      if (!data.hasVariants) {
        await tx
          .update(partnerProducts)
          .set({ hasVariants: false, price: String(data.price) })
          .where(eq(partnerProducts.id, data.productId))
        await syncDefaultVariant(
          tx as unknown as typeof import('../db').db,
          data.productId,
        )
        return { ok: true as const }
      }

      try {
        validateVariantInput({
          sizes: data.sizes,
          variations: data.variations,
          variants: data.variants,
        })
      } catch (err) {
        if (err instanceof VariantPlanError) throw new Error(err.message)
        throw err
      }

      // 1. Pastikan grup opsi ada (atau dihapus kalau kosong).
      const groupFor = async (type: 'ukuran' | 'variasi', names: Array<string>) => {
        let group = await tx.query.partnerOptionGroups.findFirst({
          where: and(
            eq(partnerOptionGroups.partnerProductId, data.productId),
            eq(partnerOptionGroups.type, type),
          ),
        })
        if (!group && names.length > 0) {
          const [created] = await tx
            .insert(partnerOptionGroups)
            .values({ partnerProductId: data.productId, type })
            .returning()
          group = created
        }
        return group ?? null
      }
      const sizeGroup = await groupFor('ukuran', data.sizes)
      const variationGroup = await groupFor('variasi', data.variations)

      // 2. Sinkronkan nilai opsi per grup.
      const valueIdByGroupName = new Map<string, string>()
      const syncValues = async (
        group: { id: string } | null,
        names: Array<string>,
        type: 'ukuran' | 'variasi',
      ) => {
        if (!group) return
        const existing = await tx.query.partnerOptionValues.findMany({
          where: eq(partnerOptionValues.optionGroupId, group.id),
        })
        const wanted = new Set(names.map((n) => n.trim()))
        const removed = existing.filter((v) => !wanted.has(v.name))
        if (removed.length) {
          const used = await tx.query.partnerVariantValues.findFirst({
            where: inArray(partnerVariantValues.optionValueId, removed.map((v) => v.id)),
          })
          if (used) {
            throw new Error(
              `Nilai ${type} yang sudah dipakai varian tidak bisa dihapus: ${removed[0].name}. Nonaktifkan varian itu dulu.`,
            )
          }
          await tx
            .delete(partnerOptionValues)
            .where(inArray(partnerOptionValues.id, removed.map((v) => v.id)))
        }
        for (const [position, raw] of names.entries()) {
          const name = raw.trim()
          const found = existing.find((v) => v.name === name)
          if (found) {
            await tx
              .update(partnerOptionValues)
              .set({ position })
              .where(eq(partnerOptionValues.id, found.id))
            valueIdByGroupName.set(`${type}|${name}`, found.id)
          } else {
            const [created] = await tx
              .insert(partnerOptionValues)
              .values({ optionGroupId: group.id, name, position })
              .returning()
            valueIdByGroupName.set(`${type}|${name}`, created.id)
          }
        }
      }
      await syncValues(sizeGroup, data.sizes, 'ukuran')
      await syncValues(variationGroup, data.variations, 'variasi')

      // 3. Hitung rencana perubahan varian.
      const variantRows = await tx.query.partnerVariants.findMany({
        where: eq(partnerVariants.partnerProductId, data.productId),
      })
      const variantIds = variantRows.map((v) => v.id)
      const linkRows = variantIds.length
        ? await tx.query.partnerVariantValues.findMany({
            where: inArray(partnerVariantValues.variantId, variantIds),
          })
        : []
      const valueRows = await tx.query.partnerOptionValues.findMany({
        where: inArray(
          partnerOptionValues.optionGroupId,
          [sizeGroup?.id, variationGroup?.id].filter(
            (x): x is string => typeof x === 'string',
          ),
        ),
      })
      const valueMeta = new Map(
        valueRows.map((v) => [
          v.id,
          { name: v.name, type: v.optionGroupId === sizeGroup?.id ? 'ukuran' : 'variasi' },
        ]),
      )
      const nameOf = (variantId: string, type: 'ukuran' | 'variasi') => {
        const link = linkRows.find(
          (l) =>
            l.variantId === variantId &&
            valueMeta.get(l.optionValueId)?.type === type,
        )
        return link ? (valueMeta.get(link.optionValueId)?.name ?? null) : null
      }

      const orderedIds = new Set<string>()
      if (variantIds.length) {
        const direct = await tx
          .select({ id: items.partnerVariantId })
          .from(items)
          .where(inArray(items.partnerVariantId, variantIds))
        const bundle = await tx
          .select({ id: itemComponents.partnerVariantId })
          .from(itemComponents)
          .where(inArray(itemComponents.partnerVariantId, variantIds))
        for (const r of [...direct, ...bundle]) if (r.id) orderedIds.add(r.id)
      }

      const existing: Array<ExistingVariant> = variantRows.map((row) => ({
        id: row.id,
        size: nameOf(row.id, 'ukuran'),
        variation: nameOf(row.id, 'variasi'),
        isActive: row.isActive,
        hasOrders: orderedIds.has(row.id),
      }))
      const desired = data.variants.map((v) => ({
        size: v.size ? v.size.trim() : null,
        variation: v.variation ? v.variation.trim() : null,
        price: v.price,
      }))
      const plan = planVariantChanges(existing, desired)

      // 4. Terapkan rencana.
      for (const u of plan.update) {
        await tx
          .update(partnerVariants)
          .set({ price: String(u.price), isActive: true })
          .where(eq(partnerVariants.id, u.id))
      }
      for (const id of plan.deactivate) {
        await tx.update(partnerVariants).set({ isActive: false }).where(eq(partnerVariants.id, id))
      }
      if (plan.remove.length) {
        await tx.delete(partnerVariants).where(inArray(partnerVariants.id, plan.remove))
      }
      for (const want of plan.insert) {
        const [created] = await tx
          .insert(partnerVariants)
          .values({
            partnerProductId: data.productId,
            price: String(want.price),
            isActive: true,
          })
          .returning({ id: partnerVariants.id })
        const links: Array<{ variantId: string; optionValueId: string }> = []
        if (want.size) {
          links.push({ variantId: created.id, optionValueId: valueIdByGroupName.get(`ukuran|${want.size}`)! })
        }
        if (want.variation) {
          links.push({ variantId: created.id, optionValueId: valueIdByGroupName.get(`variasi|${want.variation}`)! })
        }
        if (links.length) await tx.insert(partnerVariantValues).values(links)
      }

      // 5. Induk tidak lagi memakai harga sendiri; simpan flag-nya.
      await tx
        .update(partnerProducts)
        .set({ hasVariants: true, price: data.price === null ? null : String(data.price) })
        .where(eq(partnerProducts.id, data.productId))

      return { ok: true as const }
    })
  })
