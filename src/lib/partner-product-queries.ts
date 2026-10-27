import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { partnerProducts } from '../db/schema'

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
): Promise<Array<PartnerProductRow>> {
  const rows = await db
    .select()
    .from(partnerProducts)
    .where(eq(partnerProducts.partnerId, partnerId))
    .orderBy(desc(partnerProducts.createdAt))
  return rows.map(toRow)
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
