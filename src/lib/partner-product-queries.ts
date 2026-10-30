import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { partnerProducts } from '../db/schema'
import { clampPage, pageOffset } from './pagination'
import { escapeLike } from './partner-list-filters'
import type { Paged } from './pagination'
import type { PartnerProductTab } from './partner-list-filters'

/**
 * Katalog produk partner — query database. Server-only. SEMUA query dibatasi
 * `partnerId` milik sesi partner (dari `requirePartner()`), jadi satu partner
 * tidak bisa membaca atau mengubah produk partner lain walaupun menebak id.
 */

export type PartnerProductRow = {
  id: string
  name: string
  code: string | null
  /** Rupiah bulat. */
  price: number
  description: string | null
  isActive: boolean
  photoUpdatedAt: Date | null
  createdAt: Date
}

/** Baris katalog + jumlah event yang membawa produk ini (untuk tabel desktop). */
export type PartnerProductListRow = PartnerProductRow & {
  eventCount: number
}

export function toRow(
  row: typeof partnerProducts.$inferSelect,
): PartnerProductRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    price: Number(row.price),
    description: row.description,
    isActive: row.isActive,
    photoUpdatedAt: row.photoUpdatedAt,
    createdAt: row.createdAt,
  }
}

export async function listPartnerProducts(
  partnerId: string,
): Promise<Array<PartnerProductListRow>> {
  // Nama tabel ditulis lengkap di subquery (bukan `${partnerProducts.id}`):
  // Drizzle membuang prefiks tabel pada kolom di dalam `sql` subquery.
  const rows = await db
    .select({
      product: partnerProducts,
      eventCount: sql<number>`(select count(*)::int from partner_event_products pep where pep.product_id = "partner_products"."id")`,
    })
    .from(partnerProducts)
    .where(eq(partnerProducts.partnerId, partnerId))
    .orderBy(desc(partnerProducts.createdAt))
  return rows.map((r) => ({ ...toRow(r.product), eventCount: r.eventCount }))
}

export type PartnerProductPage = Paged<PartnerProductListRow> & {
  /** Jumlah per tab, TIDAK terpengaruh kata kunci pencarian. */
  counts: Record<PartnerProductTab, number>
}

/**
 * Satu halaman katalog untuk tabel Katalog: filter tab + kata kunci (nama atau
 * kode) dikerjakan di database, jadi yang ditarik hanya baris halaman itu.
 * Halaman di luar jangkauan (mis. baris terakhir baru dihapus) dikembalikan
 * sebagai halaman terakhir.
 */
export async function listPartnerProductsPage(
  partnerId: string,
  input: {
    tab: PartnerProductTab
    search: string
    page: number
    pageSize: number
  },
): Promise<PartnerProductPage> {
  const owned = eq(partnerProducts.partnerId, partnerId)

  const [tabCounts] = await db
    .select({
      all: sql<number>`count(*)::int`,
      aktif: sql<number>`(count(*) filter (where ${partnerProducts.isActive}))::int`,
    })
    .from(partnerProducts)
    .where(owned)
  const counts: Record<PartnerProductTab, number> = {
    all: tabCounts.all,
    aktif: tabCounts.aktif,
    nonaktif: tabCounts.all - tabCounts.aktif,
  }

  const conditions = [owned]
  if (input.tab === 'aktif') conditions.push(eq(partnerProducts.isActive, true))
  if (input.tab === 'nonaktif') {
    conditions.push(eq(partnerProducts.isActive, false))
  }
  const keyword = input.search.trim()
  if (keyword) {
    const pattern = `%${escapeLike(keyword)}%`
    const match = or(
      ilike(partnerProducts.name, pattern),
      ilike(partnerProducts.code, pattern),
    )
    if (match) conditions.push(match)
  }
  const where = and(...conditions)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(partnerProducts)
    .where(where)
  const page = clampPage(input.page, total, input.pageSize)

  // Nama tabel ditulis lengkap di subquery (lihat `listPartnerProducts`).
  const rows = await db
    .select({
      product: partnerProducts,
      eventCount: sql<number>`(select count(*)::int from partner_event_products pep where pep.product_id = "partner_products"."id")`,
    })
    .from(partnerProducts)
    .where(where)
    .orderBy(desc(partnerProducts.createdAt), desc(partnerProducts.id))
    .limit(input.pageSize)
    .offset(pageOffset(page, input.pageSize))

  return {
    rows: rows.map((r) => ({ ...toRow(r.product), eventCount: r.eventCount })),
    total,
    page,
    pageSize: input.pageSize,
    counts,
  }
}

export async function getPartnerProduct(
  partnerId: string,
  id: string,
): Promise<PartnerProductRow | null> {
  const rows = await db
    .select()
    .from(partnerProducts)
    .where(
      and(eq(partnerProducts.id, id), eq(partnerProducts.partnerId, partnerId)),
    )
    .limit(1)
  return rows.length > 0 ? toRow(rows[0]) : null
}

export type PartnerProductFields = {
  name: string
  code: string | null
  price: number
  description: string | null
  isActive: boolean
}

export async function insertPartnerProduct(
  partnerId: string,
  id: string,
  fields: PartnerProductFields,
  photoUpdatedAt: Date | null,
): Promise<PartnerProductRow> {
  const [row] = await db
    .insert(partnerProducts)
    .values({
      id,
      partnerId,
      ...fields,
      price: String(fields.price),
      photoUpdatedAt,
    })
    .returning()
  return toRow(row)
}

/**
 * Ubah produk milik partner. `photoUpdatedAt`: `undefined` = jangan diubah,
 * `null` = hapus foto, `Date` = foto baru. Mengembalikan null kalau produknya
 * bukan milik partner / tidak ada.
 */
export async function updatePartnerProduct(
  partnerId: string,
  id: string,
  fields: Partial<PartnerProductFields>,
  photoUpdatedAt: Date | null | undefined,
): Promise<PartnerProductRow | null> {
  const set: Partial<typeof partnerProducts.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (fields.name !== undefined) set.name = fields.name
  if (fields.code !== undefined) set.code = fields.code
  if (fields.price !== undefined) set.price = String(fields.price)
  if (fields.description !== undefined) set.description = fields.description
  if (fields.isActive !== undefined) set.isActive = fields.isActive
  if (photoUpdatedAt !== undefined) set.photoUpdatedAt = photoUpdatedAt

  const rows = await db
    .update(partnerProducts)
    .set(set)
    .where(
      and(eq(partnerProducts.id, id), eq(partnerProducts.partnerId, partnerId)),
    )
    .returning()
  return rows.length > 0 ? toRow(rows[0]) : null
}
