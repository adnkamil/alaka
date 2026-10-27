import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import {
  calendarEvents,
  partnerEventProducts,
  partnerProducts,
  partners,
} from '../db/schema'
import { partnerCatalogUrl } from './partner-catalog-rules'
import { MAX_EVENT_PRODUCTS } from './partner-event-product-rules'
import { partnerProductPhotoUrl } from './partner-product-rules'

/**
 * Etalase partner untuk halaman event sisi JASTIPER (read-only): maksimal
 * `MAX_EVENT_PRODUCTS` produk unggulan yang dipilih partner untuk event itu,
 * plus tautan katalog PDF lengkap. Server-only. Hanya produk AKTIF yang keluar,
 * dan hanya kolom yang aman dilihat jastiper (tanpa kode/deskripsi internal).
 */

export type PartnerShowcase = {
  partnerId: string
  partnerName: string
  products: Array<{
    id: string
    name: string
    price: number
    photoUrl: string | null
  }>
  catalog: { name: string; size: number; url: string } | null
}

/** Etalase untuk satu event kalender, atau null kalau bukan event partner. */
export async function getEventPartnerShowcase(
  calendarEventId: string,
): Promise<PartnerShowcase | null> {
  const owner = await db
    .select({
      partnerId: partners.id,
      partnerName: partners.name,
      catalogName: partners.catalogPdfName,
      catalogSize: partners.catalogPdfSize,
      catalogUpdatedAt: partners.catalogPdfUpdatedAt,
    })
    .from(calendarEvents)
    .innerJoin(partners, eq(calendarEvents.partnerId, partners.id))
    .where(eq(calendarEvents.id, calendarEventId))
    .limit(1)
  if (owner.length === 0) return null
  const partner = owner[0]

  const rows = await db
    .select({ product: partnerProducts })
    .from(partnerEventProducts)
    .innerJoin(
      partnerProducts,
      eq(partnerEventProducts.productId, partnerProducts.id),
    )
    .where(
      and(
        eq(partnerEventProducts.calendarEventId, calendarEventId),
        // Produk partner lain tidak pernah boleh bocor, walau barisnya salah.
        eq(partnerProducts.partnerId, partner.partnerId),
        eq(partnerProducts.isActive, true),
      ),
    )
    .orderBy(asc(partnerProducts.name))
    .limit(MAX_EVENT_PRODUCTS)

  const hasCatalog =
    partner.catalogName !== null &&
    partner.catalogSize !== null &&
    partner.catalogUpdatedAt !== null

  return {
    partnerId: partner.partnerId,
    partnerName: partner.partnerName,
    products: rows.map(({ product }) => ({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      photoUrl: partnerProductPhotoUrl(product.id, product.photoUpdatedAt),
    })),
    catalog: hasCatalog
      ? {
          name: partner.catalogName as string,
          size: partner.catalogSize as number,
          url: partnerCatalogUrl(
            partner.partnerId,
            partner.catalogUpdatedAt as Date,
          ),
        }
      : null,
  }
}
