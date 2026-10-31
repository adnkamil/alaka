import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'
import {
  listPartnerEventProducts,
  replacePartnerEventProducts,
} from './partner-event-product-queries'

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
      // Tanpa batas jumlah; `replacePartnerEventProducts` memastikan semua id
      // adalah produk milik partner ini, jadi ukurannya terbatas oleh katalognya.
      productIds: z.array(z.string().uuid()),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    await replacePartnerEventProducts(partner.id, data.id, data.productIds)
    return { count: new Set(data.productIds).size }
  })
