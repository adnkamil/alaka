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
  partnerRuleProductSizes,
  partnerSubscriptions,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import { hasPartnerPro } from './partner-entitlement'
import { formBundles } from './partner-bundle-fifo'
import { ruleCoversVariant } from './partner-pricing'
import { productSizesForRule } from './partner-rule-sizes'
import { partnerItemName, variantLabel } from './partner-item-label'
import {
  recalculateOrderStatus,
  recalculateOrderStatuses,
  type OrderTx,
} from './order-status-queries'
import { chunk } from './chunk'

export type VariantInfo = {
  productId: string
  productName: string
  price: number
  /** Stok varian saat dibaca (live, bukan snapshot pesanan). */
  stock: number
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
      stockQty: partnerVariants.stockQty,
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
      stock: row.stockQty,
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
 * Aturan paket untuk satu barang: aturan yang memuat produknya dan ukuran
 * barang itu termasuk ukuran yang dipilih untuk produk tersebut di aturan.
 * Satu produk bisa punya beberapa aturan dengan ukuran yang berbeda.
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
      .select({ name: partnerRuleProductSizes.sizeName })
      .from(partnerRuleProductSizes)
      .where(
        and(
          eq(partnerRuleProductSizes.ruleId, link.ruleId),
          eq(partnerRuleProductSizes.partnerProductId, productId),
        ),
      )
    if (
      ruleCoversVariant(
        { productIds: [productId], productSizes: { [productId]: sizeRows.map((z) => z.name) } },
        productId,
        size,
      )
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
    .select({
      productId: partnerRuleProductSizes.partnerProductId,
      name: partnerRuleProductSizes.sizeName,
    })
    .from(partnerRuleProductSizes)
    .where(eq(partnerRuleProductSizes.ruleId, ruleId))
  const ruleScope = {
    productIds: [...ruleProductIds],
    productSizes: productSizesForRule(
      ruleSizeRows.map((z) => ({
        ruleId,
        partnerProductId: z.productId,
        sizeName: z.name,
      })),
      ruleId,
    ),
  }

  const singleRows = await tx
    .select({
      id: items.id,
      qty: items.qty,
      name: items.name,
      createdAt: items.createdAt,
      partnerVariantId: items.partnerVariantId,
      submitStatus: items.submitStatus,
      submissionId: items.submissionId,
    })
    .from(items)
    .where(and(eq(items.orderId, orderId), eq(items.isBundle, false)))

  const variantIds = singleRows
    .map((s) => s.partnerVariantId)
    .filter((id): id is string => id !== null)
  const infoMap = await loadVariantInfo(tx, variantIds)

  // Alur slot: setelah partner mengecek, `qty` = jumlah yang dapat. Baris
  // dengan qty 0 ("tidak dapat") tidak boleh ikut FIFO dan tidak boleh terhapus.
  const pool = singleRows.filter((s) => {
    if (s.qty <= 0) return false
    // Alur submit bertahap: pengajuan menunggu cek partner, disanggah tinggal
    // sebagai riwayat. Keduanya tidak boleh ikut membentuk paket.
    if (s.submitStatus === 'pengajuan' || s.submitStatus === 'disanggah') {
      return false
    }
    if (!s.partnerVariantId) return false
    const info = infoMap.get(s.partnerVariantId)
    if (info === undefined) return false
    // Hanya ukuran yang dipilih untuk produknya di aturan yang masuk paket.
    return ruleCoversVariant(ruleScope, info.productId, info.size)
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
        submitStatus: single.submitStatus,
        submissionId: single.submissionId,
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
        submitStatus: c.submitStatus,
        submissionId: c.submissionId,
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
export async function dissolveBundle(
  tx: OrderTx,
  bundleId: string,
): Promise<void> {
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
    const returnQty = c.qty
    const info = c.partnerVariantId ? infoMap.get(c.partnerVariantId) : undefined
    const price = info ? info.price : 0
    // Barang yang sama dan harganya sama digabung jadi satu baris dengan qty lebih besar.
    if (c.partnerVariantId) {
      // Hanya digabung dengan baris satuan yang status submitnya sama. Baris
      // draft, pengajuan, dan disetujui tidak boleh tercampur.
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
        (row) =>
          Number(row.originalPrice) === price &&
          Number(row.fee) === feePerPcs &&
          row.submitStatus === c.submitStatus &&
          row.submissionId === c.submissionId,
      )
      if (match) {
        await tx
          .update(items)
          .set({
            qty: match.qty + returnQty,
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
      qty: returnQty,
      submitStatus: c.submitStatus,
      submissionId: c.submissionId,
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
/**
 * Versi massal `regroupAllRulesInOrder` untuk banyak pesanan sekaligus. Barang
 * satuan, info varian, dan aturan dibaca sekali untuk semua pesanan; FIFO
 * (`regroupRuleInOrder`) hanya dijalankan untuk pesanan yang punya produk dalam
 * suatu aturan. Total pesanan dihitung ulang massal di akhir.
 */
export async function regroupAllRulesInOrders(
  tx: OrderTx,
  orderIds: ReadonlyArray<string>,
): Promise<void> {
  const uniqueOrderIds = [...new Set(orderIds)]
  if (uniqueOrderIds.length === 0) return

  const singles: Array<{ orderId: string; partnerVariantId: string | null }> = []
  for (const ids of chunk(uniqueOrderIds, 500)) {
    singles.push(
      ...(await tx
        .select({
          orderId: items.orderId,
          partnerVariantId: items.partnerVariantId,
        })
        .from(items)
        .where(and(inArray(items.orderId, ids), eq(items.isBundle, false)))),
    )
  }
  const variantIds = singles
    .map((s) => s.partnerVariantId)
    .filter((id): id is string => id !== null)

  if (variantIds.length > 0) {
    const infoMap = await loadVariantInfo(tx, variantIds)
    const productIds = [...new Set([...infoMap.values()].map((i) => i.productId))]
    if (productIds.length > 0) {
      const ruleRows = await tx
        .select({
          ruleId: partnerRuleProducts.ruleId,
          productId: partnerRuleProducts.partnerProductId,
        })
        .from(partnerRuleProducts)
        .where(inArray(partnerRuleProducts.partnerProductId, productIds))
      if (ruleRows.length > 0) {
        const rulesByProduct = new Map<string, Set<string>>()
        for (const r of ruleRows) {
          const set = rulesByProduct.get(r.productId) ?? new Set<string>()
          set.add(r.ruleId)
          rulesByProduct.set(r.productId, set)
        }
        const productsByOrder = new Map<string, Set<string>>()
        for (const s of singles) {
          const info = s.partnerVariantId ? infoMap.get(s.partnerVariantId) : undefined
          if (!info) continue
          const set = productsByOrder.get(s.orderId) ?? new Set<string>()
          set.add(info.productId)
          productsByOrder.set(s.orderId, set)
        }
        for (const orderId of uniqueOrderIds) {
          const ruleIds = new Set<string>()
          for (const productId of productsByOrder.get(orderId) ?? []) {
            for (const ruleId of rulesByProduct.get(productId) ?? []) {
              ruleIds.add(ruleId)
            }
          }
          for (const ruleId of ruleIds) {
            await regroupRuleInOrder(tx, orderId, ruleId)
          }
        }
      }
    }
  }
  await recalculateOrderStatuses(tx, uniqueOrderIds)
}

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
