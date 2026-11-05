// Operasi paket partner di dalam transaksi. Menerima `tx` dari pemanggil dan
// tidak mengimpor db. Aturan: barang satuan membentuk paket lewat FIFO per
// pemesan (pesanan), dengan aturan yang sama.
import { and, eq, inArray } from 'drizzle-orm'
import {
  itemComponents,
  items,
  partnerEventProducts,
  partnerOptionGroups,
  partnerOptionValues,
  partnerPricingRules,
  partnerProducts,
  partnerRuleProducts,
  partnerRuleSizes,
  partnerSubscriptions,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import { hasPartnerPro } from './partner-entitlement'
import { formBundles } from './partner-bundle-fifo'
import { partnerItemName, variantLabel } from './partner-item-label'
import { recalculateOrderStatus, type OrderTx } from './order-status-queries'

export type VariantInfo = {
  productId: string
  productName: string
  price: number
  size: string | null
  variation: string | null
}

/** Data varian yang dibutuhkan untuk barang satuan dan komponen paket. */
export async function loadVariantInfo(
  tx: OrderTx,
  variantIds: Array<string>,
): Promise<Map<string, VariantInfo>> {
  const map = new Map<string, VariantInfo>()
  const unique = [...new Set(variantIds)]
  if (unique.length === 0) return map

  const rows = await tx
    .select({
      id: partnerVariants.id,
      productId: partnerVariants.partnerProductId,
      price: partnerVariants.price,
      productName: partnerProducts.name,
    })
    .from(partnerVariants)
    .innerJoin(partnerProducts, eq(partnerProducts.id, partnerVariants.partnerProductId))
    .where(inArray(partnerVariants.id, unique))

  const valueRows = await tx
    .select({
      variantId: partnerVariantValues.variantId,
      type: partnerOptionGroups.type,
      name: partnerOptionValues.name,
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
    .where(inArray(partnerVariantValues.variantId, unique))

  for (const row of rows) {
    const values = valueRows.filter((v) => v.variantId === row.id)
    map.set(row.id, {
      productId: row.productId,
      productName: row.productName,
      price: Number(row.price),
      size: values.find((v) => v.type === 'ukuran')?.name ?? null,
      variation: values.find((v) => v.type === 'variasi')?.name ?? null,
    })
  }
  return map
}

/** Nama barang yang tersimpan, misalnya "Kana Longsleeve Set (S / Marine Cove)". */
export function variantItemName(info: {
  productName: string
  size: string | null
  variation: string | null
}): string {
  return partnerItemName(
    info.productName,
    variantLabel({ size: info.size, variation: info.variation }),
  )
}

/**
 * Aturan paket untuk satu barang: aturan yang memuat produknya dan rentang
 * ukurannya mencakup ukuran barang itu. Satu produk bisa punya beberapa aturan
 * dengan rentang ukuran yang berbeda.
 */
export async function findRuleForVariant(
  tx: OrderTx,
  productId: string,
  size: string | null,
): Promise<{ id: string } | null> {
  const links = await tx
    .select({ ruleId: partnerRuleProducts.ruleId })
    .from(partnerRuleProducts)
    .where(eq(partnerRuleProducts.partnerProductId, productId))
  for (const link of links) {
    const sizeRows = await tx
      .select({ name: partnerRuleSizes.sizeName })
      .from(partnerRuleSizes)
      .where(eq(partnerRuleSizes.ruleId, link.ruleId))
    if (
      sizeRows.length === 0 ||
      (size !== null && sizeRows.some((z) => z.name === size))
    ) {
      return { id: link.ruleId }
    }
  }
  return null
}

/**
 * Bentuk paket dari barang satuan di satu pesanan untuk aturan tertentu. Dijalankan
 * setelah barang satuan ditambahkan atau dikembalikan dari paket. Kunci baris
 * aturan supaya dua penambahan bersamaan tidak memakai pcs yang sama.
 */
export async function regroupRuleInOrder(
  tx: OrderTx,
  orderId: string,
  ruleId: string,
): Promise<void> {
  const [rule] = await tx
    .select({
      id: partnerPricingRules.id,
      partnerId: partnerPricingRules.partnerId,
      name: partnerPricingRules.name,
      minQty: partnerPricingRules.minQty,
      bundlePrice: partnerPricingRules.bundlePrice,
      isActive: partnerPricingRules.isActive,
    })
    .from(partnerPricingRules)
    .where(eq(partnerPricingRules.id, ruleId))
    .for('update')
  if (!rule || !rule.isActive) return

  // Fitur paket hanya untuk partner PRO. Di luar itu, barang tetap satuan.
  const subs = await tx
    .select({
      status: partnerSubscriptions.status,
      startedAt: partnerSubscriptions.startedAt,
      endsAt: partnerSubscriptions.endsAt,
    })
    .from(partnerSubscriptions)
    .where(eq(partnerSubscriptions.partnerId, rule.partnerId))
  if (!hasPartnerPro(subs)) return

  const ruleProductRows = await tx
    .select({ productId: partnerRuleProducts.partnerProductId })
    .from(partnerRuleProducts)
    .where(eq(partnerRuleProducts.ruleId, ruleId))
  const ruleProductIds = new Set(ruleProductRows.map((r) => r.productId))
  if (ruleProductIds.size === 0) return
  const ruleSizeRows = await tx
    .select({ name: partnerRuleSizes.sizeName })
    .from(partnerRuleSizes)
    .where(eq(partnerRuleSizes.ruleId, ruleId))
  const ruleSizes = new Set(ruleSizeRows.map((z) => z.name))

  const singleRows = await tx
    .select({
      id: items.id,
      qty: items.qty,
      name: items.name,
      createdAt: items.createdAt,
      partnerVariantId: items.partnerVariantId,
    })
    .from(items)
    .where(and(eq(items.orderId, orderId), eq(items.isBundle, false)))

  const variantIds = singleRows
    .map((s) => s.partnerVariantId)
    .filter((id): id is string => id !== null)
  const infoMap = await loadVariantInfo(tx, variantIds)

  const pool = singleRows.filter((s) => {
    if (!s.partnerVariantId) return false
    const info = infoMap.get(s.partnerVariantId)
    if (info === undefined || !ruleProductIds.has(info.productId)) return false
    // Dengan rentang ukuran, hanya ukuran di dalam rentang yang masuk paket.
    return ruleSizes.size === 0 || (info.size !== null && ruleSizes.has(info.size))
  })
  if (pool.length === 0) return

  const singleById = new Map(pool.map((s) => [s.id, s]))
  const plan = formBundles(
    pool.map((s) => ({ itemId: s.id, qty: s.qty, addedAt: s.createdAt })),
    rule.minQty,
  )
  if (plan.bundles.length === 0) return

  // Sisa qty tiap barang satuan setelah dipakai paket.
  const remaining = new Map(pool.map((s) => [s.id, s.qty]))
  for (const bundle of plan.bundles) {
    for (const part of bundle.parts) {
      remaining.set(part.itemId, (remaining.get(part.itemId) ?? 0) - part.qty)
    }
  }

  for (const bundle of plan.bundles) {
    const components = bundle.parts.map((part) => {
      const single = singleById.get(part.itemId)!
      const info = infoMap.get(single.partnerVariantId!)!
      return {
        partnerVariantId: single.partnerVariantId!,
        productName: info.productName,
        size: info.size,
        variation: info.variation,
        qty: part.qty,
        addedAt: single.createdAt,
      }
    })
    const [bundleRow] = await tx
      .insert(items)
      .values({
        orderId,
        name: components.map(variantItemName).join(' + '),
        originalPrice: rule.bundlePrice,
        fee: '0',
        qty: 1,
        obtained: false,
        isBundle: true,
        partnerRuleId: rule.id,
        ruleName: rule.name,
        ruleMinQty: rule.minQty,
        hpp: rule.bundlePrice,
      })
      .returning({ id: items.id })
    await tx.insert(itemComponents).values(
      components.map((c) => ({
        itemId: bundleRow.id,
        partnerVariantId: c.partnerVariantId,
        productName: c.productName,
        size: c.size,
        variation: c.variation,
        qty: c.qty,
        addedAt: c.addedAt,
      })),
    )
  }

  for (const [itemId, left] of remaining) {
    if (left <= 0) {
      await tx.delete(items).where(eq(items.id, itemId))
    } else if (left !== singleById.get(itemId)!.qty) {
      await tx.update(items).set({ qty: left }).where(eq(items.id, itemId))
    }
  }
}

/**
 * Bongkar paket: setiap komponen yang tersisa kembali menjadi barang satuan
 * dengan harga produk dan waktu masuk aslinya (untuk FIFO). Baris paket dihapus.
 */
export async function dissolveBundle(tx: OrderTx, bundleId: string): Promise<void> {
  const bundle = await tx.query.items.findFirst({
    where: eq(items.id, bundleId),
  })
  if (!bundle || !bundle.isBundle) throw new Error('Barang ini bukan paket')

  const components = await tx
    .select()
    .from(itemComponents)
    .where(eq(itemComponents.itemId, bundleId))

  // Fee paket dibagi per pcs (snapshot ruleMinQty). Setiap barang yang kembali
  // membawa fee per unit ini, sehingga total fee yang tersisa tetap sebanding.
  const pcsPerBundle =
    bundle.ruleMinQty ?? components.reduce((sum, c) => sum + c.qty, 0)
  const feePerPcs =
    pcsPerBundle > 0
      ? Math.round((Number(bundle.fee) / pcsPerBundle) * 100) / 100
      : 0

  const infoMap = await loadVariantInfo(
    tx,
    components
      .map((c) => c.partnerVariantId)
      .filter((id): id is string => id !== null),
  )

  for (const c of components) {
    const info = c.partnerVariantId ? infoMap.get(c.partnerVariantId) : undefined
    const price = info ? info.price : 0
    // Barang yang sama dan harganya sama digabung jadi satu baris dengan qty lebih besar.
    if (c.partnerVariantId) {
      const sameSingles = await tx
        .select()
        .from(items)
        .where(
          and(
            eq(items.orderId, bundle.orderId),
            eq(items.isBundle, false),
            eq(items.partnerVariantId, c.partnerVariantId),
          ),
        )
      const match = sameSingles.find(
        (row) => Number(row.originalPrice) === price && Number(row.fee) === feePerPcs,
      )
      if (match) {
        await tx
          .update(items)
          .set({
            qty: match.qty + c.qty,
            createdAt: match.createdAt < c.addedAt ? match.createdAt : c.addedAt,
          })
          .where(eq(items.id, match.id))
        continue
      }
    }
    await tx.insert(items).values({
      orderId: bundle.orderId,
      name: info
        ? variantItemName(info)
        : partnerItemName(c.productName, variantLabel({ size: c.size, variation: c.variation })),
      originalPrice: price.toString(),
      fee: feePerPcs.toFixed(2),
      qty: c.qty,
      obtained: false,
      isBundle: false,
      partnerVariantId: c.partnerVariantId,
      hpp: price.toString(),
      createdAt: c.addedAt,
    })
  }

  await tx.delete(items).where(eq(items.id, bundleId))
}

/** Produk induk yang dijual di event partner itu. */
export async function isProductInEvent(
  tx: OrderTx,
  calendarEventId: string,
  productId: string,
): Promise<boolean> {
  const row = await tx.query.partnerEventProducts.findFirst({
    where: and(
      eq(partnerEventProducts.calendarEventId, calendarEventId),
      eq(partnerEventProducts.productId, productId),
    ),
  })
  return row !== undefined
}

/**
 * Jalankan FIFO untuk semua aturan yang punya barang satuan di pesanan ini, lalu
 * hitung ulang total pesanan. Dipanggil setelah barang satuan ditulis (tambah atau
 * ubah pesanan).
 */
export async function regroupAllRulesInOrder(tx: OrderTx, orderId: string): Promise<void> {
  const singles = await tx
    .select({ partnerVariantId: items.partnerVariantId })
    .from(items)
    .where(and(eq(items.orderId, orderId), eq(items.isBundle, false)))
  const variantIds = singles
    .map((s) => s.partnerVariantId)
    .filter((id): id is string => id !== null)
  if (variantIds.length > 0) {
    const infoMap = await loadVariantInfo(tx, variantIds)
    const productIds = [...new Set([...infoMap.values()].map((i) => i.productId))]
    if (productIds.length > 0) {
      const ruleRows = await tx
        .select({ ruleId: partnerRuleProducts.ruleId })
        .from(partnerRuleProducts)
        .where(inArray(partnerRuleProducts.partnerProductId, productIds))
      for (const ruleId of new Set(ruleRows.map((r) => r.ruleId))) {
        await regroupRuleInOrder(tx, orderId, ruleId)
      }
    }
  }
  await recalculateOrderStatus(tx, orderId)
}
