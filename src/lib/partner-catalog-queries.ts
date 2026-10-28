import { eq } from 'drizzle-orm'
import { db } from '../db'
import { partners } from '../db/schema'

/** Link katalog partner (kolom `partners.catalog_url`). Server-only. */

export async function getPartnerCatalogUrl(
  partnerId: string,
): Promise<string | null> {
  const rows = await db
    .select({ url: partners.catalogUrl })
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1)
  return rows.length > 0 ? rows[0].url : null
}

/** Simpan link katalog, atau `null` untuk menghapusnya. */
export async function setPartnerCatalogUrl(
  partnerId: string,
  url: string | null,
): Promise<void> {
  await db
    .update(partners)
    .set({ catalogUrl: url, updatedAt: new Date() })
    .where(eq(partners.id, partnerId))
}
