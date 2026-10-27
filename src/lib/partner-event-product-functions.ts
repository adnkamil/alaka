import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'
import {
  listPartnerEventProducts,
  replacePartnerEventProducts,
} from './partner-event-product-queries'
import { MAX_EVENT_PRODUCTS } from './partner-event-product-rules'

/**
 * Pilihan produk per event. SETIAP handler wajib `requirePartner()` di baris
 * pertama; `partnerId` selalu dari sesi.
 */

const eventIdSchema = z.object({ id: z.string().uuid() })

export const fetchPartnerEventProducts = createServerFn({ method: 'GET' })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.id))) {
      throw new Error('Event tidak ditemukan')
    }
    return listPartnerEventProducts(partner.id, data.id)
  })

export const setPartnerEventProducts = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      productIds: z
        .array(z.string().uuid())
        .max(
          MAX_EVENT_PRODUCTS,
          `Maksimal ${MAX_EVENT_PRODUCTS} produk unggulan per event`,
        ),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    await replacePartnerEventProducts(partner.id, data.id, data.productIds)
    return { count: new Set(data.productIds).size }
  })
