import { eq } from 'drizzle-orm'
import { db } from '../db'
import { partners } from '../db/schema'

/** Metadata katalog PDF partner (berkasnya sendiri di storage). Server-only. */
export type PartnerCatalogMeta = {
  name: string
  size: number
  updatedAt: Date
}

export async function getPartnerCatalogMeta(
  partnerId: string,
): Promise<PartnerCatalogMeta | null> {
  const rows = await db
    .select({
      name: partners.catalogPdfName,
      size: partners.catalogPdfSize,
      updatedAt: partners.catalogPdfUpdatedAt,
    })
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1)
  if (rows.length === 0) return null
  const { name, size, updatedAt } = rows[0]
  if (name === null || size === null || updatedAt === null) return null
  return { name, size, updatedAt }
}

/** Simpan metadata katalog baru, atau `null` untuk menghapusnya. */
export async function setPartnerCatalogMeta(
  partnerId: string,
  meta: { name: string; size: number } | null,
): Promise<void> {
  const now = new Date()
  await db
    .update(partners)
    .set(
      meta
        ? {
            catalogPdfName: meta.name,
            catalogPdfSize: meta.size,
            catalogPdfUpdatedAt: now,
            updatedAt: now,
          }
        : {
            catalogPdfName: null,
            catalogPdfSize: null,
            catalogPdfUpdatedAt: null,
            updatedAt: now,
          },
    )
    .where(eq(partners.id, partnerId))
}
