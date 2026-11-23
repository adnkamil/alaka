import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'
import { billingBucket, bundleBillingAmount } from './partner-billing'

const idSchema = z.uuid()

export type JastiperDetailRow = {
  /** Varian produk partner; dipakai untuk mencocokkan baris dengan hasil pengecekan. */
  variantId: string | null
  productName: string
  size: string | null
  variation: string | null
  /** Null untuk barang satuan. */
  ruleId: string | null
  ruleName: string | null
  qty: number
  /** Harga produk yang ditentukan partner (per pcs). */
  unitPrice: number
}

type JastiperEventDetail = {
  brandId: string
  /** Nilai barang yang masih menunggu cek partner (pengajuan). Belum ditagih. */
  pendingAmount: number
  brandName: string
  waNumber: string | null
  orderCount: number
  totalPcs: number
  satuanPcs: number
  paketPcs: number
  /** Pcs yang sudah disetujui (satuan + paket). */
  approvedPcs: number
  /** Pcs yang masih menunggu cek partner. */
  pendingPcs: number
  /** Nomor submit yang sudah disetujui (untuk baris Disetujui). */
  approvedSubmitNos: Array<number>
  /** Nomor submit yang masih menunggu cek (untuk baris Pengajuan). */
  pendingSubmitNos: Array<number>
  /** Pengajuan per submit: satu baris per submit di daftar partner. */
  pendingBySubmit: Array<{ submitNo: number; pcs: number; amount: number }>
  paketCount: number
  /**
   * Tagihan ke partner: harga paket untuk paket lengkap, harga satuan untuk
   * sisanya (termasuk paket yang belum lengkap, sementara).
   */
  totalAmount: number
  rows: Array<JastiperDetailRow>
}

/**
 * Hitung detail satu jastiper di satu event. Harga memakai harga varian
 * produk partner (per pcs), termasuk pcs dari paket. Nama pemesan, harga jual,
 * dan fee tidak ikut.
 */
async function loadJastiperEventDetail(
  partnerId: string,
  jastiperEventId: string,
  brand: { id: string; name: string | null; waNumber: string | null },
): Promise<JastiperEventDetail> {
  const { db } = await import('../db')
  const schema = await import('../db/schema')
  const {
    orders,
    items,
    itemComponents,
    partnerPricingRules,
    partnerProducts,
    partnerVariants,
    partnerVariantValues,
    partnerOptionValues,
    partnerOptionGroups,
  } = schema

  const orderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.eventId, jastiperEventId))
  // Event yang sudah disubmit pakai alur submit bertahap: barang draft belum
  // dikirim ke partner dan tidak dihitung.
  const eventRow = await db
    .select({ submittedAt: schema.events.submittedAt })
    .from(schema.events)
    .where(eq(schema.events.id, jastiperEventId))
    .then((rows) => rows.at(0))
  const slotFlow = eventRow?.submittedAt != null

  const rules = await db
    .select({ id: partnerPricingRules.id, name: partnerPricingRules.name })
    .from(partnerPricingRules)
    .where(eq(partnerPricingRules.partnerId, partnerId))
  const ruleNameById = new Map(rules.map((r) => [r.id, r.name]))

  const itemRows = orderRows.length
    ? await db
        .select()
        .from(items)
        .where(
          inArray(
            items.orderId,
            orderRows.map((o) => o.id),
          ),
        )
    : []

  const variantIds = [
    ...new Set(
      itemRows
        .filter((i) => !i.isBundle && i.partnerVariantId)
        .map((i) => i.partnerVariantId!),
    ),
  ]
  const bundleItemIds = itemRows.filter((i) => i.isBundle).map((i) => i.id)
  const componentRows = bundleItemIds.length
    ? await db
        .select()
        .from(itemComponents)
        .where(inArray(itemComponents.itemId, bundleItemIds))
    : []
  for (const c of componentRows) {
    if (c.partnerVariantId) variantIds.push(c.partnerVariantId)
  }
  const uniqueVariantIds = [...new Set(variantIds)]

  const variantMeta = new Map<
    string,
    {
      productName: string
      size: string | null
      variation: string | null
      price: number
    }
  >()
  if (uniqueVariantIds.length) {
    const variants = await db
      .select({
        id: partnerVariants.id,
        price: partnerVariants.price,
        productName: partnerProducts.name,
      })
      .from(partnerVariants)
      .innerJoin(
        partnerProducts,
        eq(partnerProducts.id, partnerVariants.partnerProductId),
      )
      .where(inArray(partnerVariants.id, uniqueVariantIds))
    const links = await db
      .select({
        variantId: partnerVariantValues.variantId,
        name: partnerOptionValues.name,
        type: partnerOptionGroups.type,
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
      .where(inArray(partnerVariantValues.variantId, uniqueVariantIds))
    for (const v of variants) {
      const mine = links.filter((l) => l.variantId === v.id)
      variantMeta.set(v.id, {
        productName: v.productName,
        size: mine.find((l) => l.type === 'ukuran')?.name ?? null,
        variation: mine.find((l) => l.type === 'variasi')?.name ?? null,
        price: Number(v.price),
      })
    }
  }

  const rows: Array<JastiperDetailRow> = []
  let satuanPcs = 0
  let paketPcs = 0
  let approvedPcs = 0
  let pendingPcs = 0
  const approvedSubmitIds = new Set<string>()
  const pendingSubmitIds = new Set<string>()
  const pendingBySubmitId = new Map<string, { pcs: number; amount: number }>()
  const addPendingBySubmit = (id: string | null, pcs: number, amount: number) => {
    if (!id) return
    const cur = pendingBySubmitId.get(id) ?? { pcs: 0, amount: 0 }
    cur.pcs += pcs
    cur.amount += amount
    pendingBySubmitId.set(id, cur)
  }
  let totalAmount = 0
  let pendingAmount = 0
  const paketCountByRule = new Map<string, number>()

  for (const item of itemRows) {
    if (item.isBundle) {
      const ruleId = item.partnerRuleId
      if (ruleId)
        paketCountByRule.set(
          ruleId,
          (paketCountByRule.get(ruleId) ?? 0) + item.qty,
        )
      const comps = componentRows.filter((c) => c.itemId === item.id)
      for (const c of comps) {
        if (c.submitStatus === 'pengajuan' && c.partnerVariantId) {
          pendingAmount +=
            item.qty * c.qty * (variantMeta.get(c.partnerVariantId)?.price ?? 0)
        }
      }
      totalAmount += bundleBillingAmount({
        bundleQty: item.qty,
        bundlePrice: item.hpp === null ? null : Number(item.hpp),
        components: comps.map((c) => ({
          qty: c.qty,
          status: c.submitStatus,
          unitPrice: c.partnerVariantId
            ? (variantMeta.get(c.partnerVariantId)?.price ?? 0)
            : 0,
        })),
      })
      for (const c of comps) {
        const meta = c.partnerVariantId
          ? variantMeta.get(c.partnerVariantId)
          : undefined
        const pcs = item.qty * c.qty
        paketPcs += pcs
        if (c.submitStatus === 'disetujui') {
          approvedPcs += pcs
          if (c.submissionId) approvedSubmitIds.add(c.submissionId)
        } else if (c.submitStatus === 'pengajuan') {
          pendingPcs += pcs
          if (c.submissionId) pendingSubmitIds.add(c.submissionId)
          addPendingBySubmit(
            c.submissionId,
            pcs,
            pcs * (variantMeta.get(c.partnerVariantId ?? '')?.price ?? 0),
          )
        }
        rows.push({
          variantId: c.partnerVariantId,
          productName: meta?.productName ?? c.productName,
          size: meta?.size ?? c.size,
          variation: meta?.variation ?? c.variation,
          ruleId,
          ruleName: ruleId ? (ruleNameById.get(ruleId) ?? null) : null,
          qty: pcs,
          unitPrice: meta?.price ?? 0,
        })
      }
    } else if (
      // Barang katalog harus punya varian yang dikenal. Barang tanpa varian
      // hanya dihitung kalau sudah disubmit, supaya pengajuan tidak hilang dari
      // daftar partner. Harganya 0 karena partner tidak punya harga untuk barang itu.
      (item.partnerVariantId
        ? variantMeta.has(item.partnerVariantId)
        : item.submitStatus !== null) &&
      // Disanggah tidak tersedia: tidak dihitung. Draft tidak dihitung kalau event sudah disubmit.
      item.submitStatus !== 'disanggah' &&
      !(slotFlow && item.submitStatus === null)
    ) {
      const meta = (item.partnerVariantId
        ? variantMeta.get(item.partnerVariantId)
        : undefined) ?? {
        productName: item.name,
        size: null,
        variation: null,
        price: 0,
      }
      if (item.submitStatus === 'pengajuan') {
        // Menunggu cek partner: belum dihitung sebagai pendapatan, hanya ditampilkan.
        pendingAmount += item.qty * meta.price
        pendingPcs += item.qty
        if (item.submissionId) pendingSubmitIds.add(item.submissionId)
        addPendingBySubmit(item.submissionId, item.qty, item.qty * meta.price)
      } else {
        approvedPcs += item.qty
        if (item.submissionId) approvedSubmitIds.add(item.submissionId)
        satuanPcs += item.qty
        totalAmount += item.qty * meta.price
        rows.push({
          variantId: item.partnerVariantId,
          productName: meta.productName,
          size: meta.size,
          variation: meta.variation,
          ruleId: null,
          ruleName: null,
          qty: item.qty,
          unitPrice: meta.price,
        })
      }
    }
  }

  const submitRows = await db
    .select({ id: schema.eventSubmissions.id, submitNo: schema.eventSubmissions.submitNo })
    .from(schema.eventSubmissions)
    .where(eq(schema.eventSubmissions.eventId, jastiperEventId))
  const submitNoById = new Map(submitRows.map((r) => [r.id, r.submitNo]))
  const toNos = (ids: Set<string>) =>
    [...ids]
      .map((id) => submitNoById.get(id))
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b)

  return {
    approvedPcs,
    pendingPcs,
    approvedSubmitNos: toNos(approvedSubmitIds),
    pendingSubmitNos: toNos(pendingSubmitIds),
    pendingBySubmit: [...pendingBySubmitId.entries()]
      .map(([id, v]) => ({ submitNo: submitNoById.get(id), ...v }))
      .filter((x): x is { submitNo: number; pcs: number; amount: number } => x.submitNo !== undefined)
      .sort((a, b) => a.submitNo - b.submitNo),
    brandId: brand.id,
    brandName: brand.name ?? 'Jastiper',
    pendingAmount,
    waNumber: brand.waNumber ?? null,
    orderCount: orderRows.length,
    totalPcs: satuanPcs + paketPcs,
    satuanPcs,
    paketPcs,
    paketCount: [...paketCountByRule.values()].reduce((s, n) => s + n, 0),
    totalAmount,
    rows,
  }
}

/** Jastiper yang ikut satu event partner, beserta event belanjanya. */
async function listEventJastiper(calendarEventId: string) {
  const { db } = await import('../db')
  const schema = await import('../db/schema')
  const { brands, events } = schema
  const jastiperEvents = await db
    .select({ id: events.id, brandId: events.brandId })
    .from(events)
    .where(eq(events.calendarEventId, calendarEventId))
  if (jastiperEvents.length === 0) return []
  const brandRows = await db
    .select({ id: brands.id, name: brands.name, waNumber: brands.waNumber })
    .from(brands)
    .where(
      inArray(brands.id, [...new Set(jastiperEvents.map((e) => e.brandId))]),
    )
  const brandById = new Map(brandRows.map((b) => [b.id, b]))
  return jastiperEvents.flatMap((e) => {
    const brand = brandById.get(e.brandId)
    return brand ? [{ eventId: e.id, brand }] : []
  })
}

/**
 * Detail satu jastiper di event partner: ringkasan dan barang per produk.
 */
export const getPartnerJastiperDetail = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      calendarEventId: idSchema,
      brandId: idSchema,
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { brands, events } = await import('../db/schema')
    const [jastiperEvent] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.calendarEventId, data.calendarEventId),
          eq(events.brandId, data.brandId),
        ),
      )
    if (!jastiperEvent) throw new Error('Jastiper tidak ikut event ini')
    const [brand] = await db
      .select({ id: brands.id, name: brands.name, waNumber: brands.waNumber })
      .from(brands)
      .where(eq(brands.id, data.brandId))
    if (!brand) throw new Error('Jastiper tidak ditemukan')
    const detail = await loadJastiperEventDetail(
      partner.id,
      jastiperEvent.id,
      brand,
    )
    return detail
  })

/**
 * Ringkasan tagihan seluruh jastiper di satu event partner. Untuk event dengan
 * alur slot, tagihan dikelompokkan: disetujui, menunggu persetujuan, dan draft
 * (draft tidak dihitung karena belum dikirim).
 */
export const getPartnerEventRevenue = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { listSlotQueue } = await import('./event-slot-queries')
    const jastiper = await listEventJastiper(data.calendarEventId)
    const now = new Date()
    const queue = await db.transaction((tx) =>
      listSlotQueue(tx, data.calendarEventId, now),
    )
    const statusByBrand = new Map(queue.map((q) => [q.brandId, q.status]))
    const slotEnabled = queue.some((q) => q.status !== null)
    const perBrand = await Promise.all(
      jastiper.map(async ({ eventId, brand }) => {
        const d = await loadJastiperEventDetail(partner.id, eventId, brand)
        const status = statusByBrand.get(brand.id) ?? null
        return {
          brandId: d.brandId,
          brandName: d.brandName,
          totalPcs: d.totalPcs,
          totalAmount: d.totalAmount,
          pendingAmount: d.pendingAmount,
          approvedPcs: d.approvedPcs,
          pendingPcs: d.pendingPcs,
          approvedSubmitNos: d.approvedSubmitNos,
          pendingSubmitNos: d.pendingSubmitNos,
          pendingBySubmit: d.pendingBySubmit,
          status,
          bucket: slotEnabled ? billingBucket(status) : 'approved',
        }
      }),
    )
    // Hitungan per barang (bukan per status event): brand yang sudah submit
    // tetap menghitung barang yang sudah disetujui, walau sebagian masih menunggu.
    const counted = perBrand.filter((b) => b.bucket !== 'draft')

    // Nominal yang ditampilkan hanya dari tagihan (snapshot harga), supaya angka
    // tidak ikut berubah kalau partner mengubah harga katalog. Tagihan yang
    // dibatalkan tidak dihitung: submitnya kembali bebas ditagih.
    const { invoices } = await import('../db/schema')
    const invoiceRows = await db
      .select({
        status: invoices.status,
        amount: sql<string>`coalesce(sum(${invoices.totalAmount}), 0)`,
        pcs: sql<string>`coalesce(sum(${invoices.totalPcs}), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.calendarEventId, data.calendarEventId),
          eq(invoices.partnerId, partner.id),
          ne(invoices.status, 'dibatalkan'),
        ),
      )
      .groupBy(invoices.status)
    const emptyBucket = { amount: 0, pcs: 0, count: 0 }
    const invoiced = {
      lunas: { ...emptyBucket },
      menunggu_review: { ...emptyBucket },
      ditagih: { ...emptyBucket },
    }
    for (const r of invoiceRows) {
      if (r.status === 'dibatalkan') continue
      invoiced[r.status] = {
        amount: Number(r.amount),
        pcs: Number(r.pcs),
        count: Number(r.count),
      }
    }

    return {
      /** Tagihan aktif per status. Nominal dari snapshot tagihan, tidak berubah. */
      invoiced,
      slotEnabled,
      totalAmount: perBrand.reduce((s, b) => s + b.totalAmount, 0),
      totalPcs: perBrand.reduce((s, b) => s + b.totalPcs, 0),
      approvedAmount: counted.reduce((s, b) => s + b.totalAmount, 0),
      /** Pcs yang sudah disetujui (paket dihitung per pcs isinya). */
      approvedPcs: counted.reduce((s, b) => s + b.totalPcs, 0),
      /** Nilai barang yang masih menunggu cek partner. Belum masuk pendapatan. */
      waitingAmount: counted.reduce((s, b) => s + b.pendingAmount, 0),
      draftCount: perBrand.filter((b) => b.bucket === 'draft').length,
      perBrand,
    }
  })
