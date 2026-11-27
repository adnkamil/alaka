// Query total pesanan untuk minimal pembelian (server-only, menerima `tx`).
// Aturan murni ada di `min-purchase.ts`.
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { itemComponents, items, orders } from '../db/schema'
import { loadActiveRules } from './invoice-pooling-queries'
import { computeDraftTotal } from './min-purchase'
import type { DraftSource, DraftTotal } from './min-purchase'
import type { OrderTx } from './order-status-queries'
import { partnerItemName, variantLabel } from './partner-item-label'
import { loadVariantInfo } from './partner-paket-queries'

type Scope = { eventIds: Array<string> } | { submissionId: string }

/**
 * Pcs per sumber, dikelompokkan per event jastiper. Lingkup `eventIds` =
 * barang draft; `submissionId` = isi satu submit.
 */
export async function loadDraftSources(
  tx: OrderTx,
  scope: Scope,
): Promise<Map<string, Array<DraftSource>>> {
  const result = new Map<string, Array<DraftSource>>()
  if ('eventIds' in scope && scope.eventIds.length === 0) return result

  const satuan = await tx
    .select({
      key: items.id,
      eventId: orders.eventId,
      name: items.name,
      qty: items.qty,
      addedAt: items.createdAt,
      variantId: items.partnerVariantId,
    })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        eq(items.isBundle, false),
        'eventIds' in scope
          ? and(
              inArray(orders.eventId, scope.eventIds),
              isNull(items.submitStatus),
            )
          : eq(items.submissionId, scope.submissionId),
      ),
    )
  const components = await tx
    .select({
      key: itemComponents.id,
      eventId: orders.eventId,
      productName: itemComponents.productName,
      size: itemComponents.size,
      variation: itemComponents.variation,
      qty: itemComponents.qty,
      bundleQty: items.qty,
      addedAt: itemComponents.addedAt,
      variantId: itemComponents.partnerVariantId,
    })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      'eventIds' in scope
        ? and(
            inArray(orders.eventId, scope.eventIds),
            isNull(itemComponents.submitStatus),
          )
        : eq(itemComponents.submissionId, scope.submissionId),
    )

  const rows = [
    ...satuan.map((r) => ({ ...r, label: r.name })),
    ...components.map((c) => ({
      ...c,
      label: partnerItemName(
        c.productName,
        variantLabel({ size: c.size, variation: c.variation }),
      ),
      qty: c.bundleQty * c.qty,
    })),
  ]
  const variants = await loadVariantInfo(
    tx,
    rows.flatMap((r) => (r.variantId ? [r.variantId] : [])),
  )
  for (const r of rows) {
    if (r.qty <= 0) continue
    const info = r.variantId ? variants.get(r.variantId) : undefined
    const list = result.get(r.eventId) ?? []
    list.push({
      key: r.key,
      label: r.label,
      qty: r.qty,
      addedAt: r.addedAt,
      variant: info
        ? { productId: info.productId, size: info.size, price: info.price }
        : null,
    })
    result.set(r.eventId, list)
  }
  return result
}

/** Total draft tiap event jastiper, dengan aturan paket aktif partner saat ini. */
export async function loadDraftTotals(
  tx: OrderTx,
  partnerId: string,
  eventIds: Array<string>,
): Promise<Map<string, DraftTotal>> {
  const sources = await loadDraftSources(tx, { eventIds })
  if (sources.size === 0) return new Map()
  const rules = await loadActiveRules(tx, partnerId)
  return new Map(
    [...sources].map(([eventId, rows]) => [
      eventId,
      computeDraftTotal(rows, rules),
    ]),
  )
}
