import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  calendarEvents,
  partnerEventProducts,
  partnerOptionGroups,
  partnerOptionValues,
  partnerProducts,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import {
  partnerItemName,
  variantLabel

} from './partner-item-label'
import type {PartnerEventItemCatalog} from './partner-item-label';

/**
 * Katalog produk partner yang dibawa ke satu event (produk aktif + varian aktif).
 * Event tanpa partner: `isPartnerEvent: false`, dan form tetap memakai input bebas.
 */
export async function loadEventPartnerItemCatalog(
  calendarEventId: string | null,
): Promise<PartnerEventItemCatalog> {
  if (!calendarEventId) return { isPartnerEvent: false, products: [] }

  const calendarEvent = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, calendarEventId),
    columns: { partnerId: true },
  })
  if (!calendarEvent?.partnerId) return { isPartnerEvent: false, products: [] }

  const productRows = await db
    .select({ id: partnerProducts.id, name: partnerProducts.name })
    .from(partnerEventProducts)
    .innerJoin(partnerProducts, eq(partnerProducts.id, partnerEventProducts.productId))
    .where(
      and(
        eq(partnerEventProducts.calendarEventId, calendarEventId),
        eq(partnerProducts.isActive, true),
      ),
    )
    .orderBy(partnerProducts.name)
  if (productRows.length === 0) return { isPartnerEvent: true, products: [] }

  const variantRows = await db
    .select({
      id: partnerVariants.id,
      productId: partnerVariants.partnerProductId,
      price: partnerVariants.price,
    })
    .from(partnerVariants)
    .where(
      and(
        inArray(
          partnerVariants.partnerProductId,
          productRows.map((p) => p.id),
        ),
        eq(partnerVariants.isActive, true),
      ),
    )

  const valueRows = variantRows.length
    ? await db
        .select({
          variantId: partnerVariantValues.variantId,
          type: partnerOptionGroups.type,
          value: partnerOptionValues.name,
        })
        .from(partnerVariantValues)
        .innerJoin(
          partnerOptionValues,
          eq(partnerOptionValues.id, partnerVariantValues.optionValueId),
        )
        .innerJoin(
          partnerOptionGroups,
          eq(partnerOptionGroups.id, partnerOptionValues.optionGroupId),
        )
        .where(
          inArray(
            partnerVariantValues.variantId,
            variantRows.map((v) => v.id),
          ),
        )
    : []

  const optionsByVariant = new Map<
    string,
    { size: string | null; variation: string | null }
  >()
  for (const row of valueRows) {
    const current = optionsByVariant.get(row.variantId) ?? {
      size: null,
      variation: null,
    }
    if (row.type === 'ukuran') current.size = row.value
    if (row.type === 'variasi') current.variation = row.value
    optionsByVariant.set(row.variantId, current)
  }

  return {
    isPartnerEvent: true,
    products: productRows
      .map((product) => ({
        id: product.id,
        name: product.name,
        variants: variantRows
          .filter((v) => v.productId === product.id)
          .map((v) => ({
            id: v.id,
            label: variantLabel(
              optionsByVariant.get(v.id) ?? { size: null, variation: null },
            ),
            price: Number(v.price),
          })),
      }))
      .filter((product) => product.variants.length > 0),
  }
}

export interface EventItemInput {
  name: string
  originalPrice: number
  fee: number
  qty: number
  obtained: boolean
  partnerVariantId?: string | null
}

export interface ResolvedEventItem extends EventItemInput {
  partnerVariantId: string | null
  /** Harga beli jastiper (HPP) per unit, diambil dari varian partner. */
  hpp: number | null
}

/**
 * Memastikan barang sesuai aturan event. Di event partner, setiap barang harus
 * memakai varian dari katalog event itu, dan namanya diambil dari katalog (bukan
 * dari klien). Di event lain, `partnerVariantId` diabaikan.
 * `originalPrice` tetap dari klien: itu harga jual yang boleh diubah jastiper.
 */
export async function resolveEventItems(
  calendarEventId: string | null,
  inputs: Array<EventItemInput>,
): Promise<Array<ResolvedEventItem>> {
  const catalog = await loadEventPartnerItemCatalog(calendarEventId)

  if (!catalog.isPartnerEvent) {
    return inputs.map((item) => ({ ...item, partnerVariantId: null, hpp: null }))
  }

  const variantById = new Map<
    string,
    { productName: string; label: string; price: number }
  >()
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      variantById.set(variant.id, {
        productName: product.name,
        label: variant.label,
        price: variant.price,
      })
    }
  }

  return inputs.map((item) => {
    const variantId = item.partnerVariantId
    const variant = variantId ? variantById.get(variantId) : undefined
    if (!variant) {
      throw new Error(
        'Barang harus dipilih dari katalog partner. Nama barang tidak bisa diketik bebas di event ini.',
      )
    }
    return {
      ...item,
      name: partnerItemName(variant.productName, variant.label),
      partnerVariantId: variantId ?? null,
      hpp: variant.price,
    }
  })
}
