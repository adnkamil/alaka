// Penulisan notifikasi Partner Portal (server-only). Dipanggil dari jalur yang
// menyentuh partner: jastiper ikut event, klaim bayar, verifikasi top up.
import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  brands,
  calendarEvents,
  invoices,
  partnerNotifications,
} from '../db/schema'
import { formatInvoiceNumber } from './invoice-rules'
import { formatRupiah } from './partner-product-rules'

export type PartnerNotificationInput = {
  partnerId: string
  kind:
    | 'jastiper_ikut'
    | 'bukti_bayar'
    | 'topup_disetujui'
    | 'topup_ditolak'
  title: string
  body?: string | null
  link?: string | null
}

/**
 * Kirim satu notifikasi ke satu partner. Gagal kirim tidak boleh membatalkan
 * aksi aslinya, jadi galat ditelan di sini dan hanya dicatat.
 */
export async function notifyPartner(input: PartnerNotificationInput) {
  try {
    await db.insert(partnerNotifications).values({
      partnerId: input.partnerId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })
  } catch (error) {
    console.error('Gagal mengirim notifikasi partner', error)
  }
}

/** Jastiper menekan "Ikut Event" di event milik partner. */
export async function notifyPartnerJastiperJoined(input: {
  calendarEventId: string
  brandId: string
}) {
  try {
    const [event, brand] = await Promise.all([
      db
        .select({ name: calendarEvents.name, partnerId: calendarEvents.partnerId })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, input.calendarEventId))
        .then((rows) => rows.at(0)),
      db
        .select({ name: brands.name })
        .from(brands)
        .where(eq(brands.id, input.brandId))
        .then((rows) => rows.at(0)),
    ])
    if (!event?.partnerId) return
    await notifyPartner({
      partnerId: event.partnerId,
      kind: 'jastiper_ikut',
      title: `${brand?.name ?? 'Jastiper'} ikut event`,
      body: event.name,
      link: `/partner/event/${input.calendarEventId}`,
    })
  } catch (error) {
    console.error('Gagal mengirim notifikasi partner', error)
  }
}

/** Jastiper mengunggah bukti bayar tagihan: partner perlu memeriksanya. */
export async function notifyPartnerPaymentClaimed(invoiceId: string) {
  try {
    const row = await db
      .select({
        partnerId: invoices.partnerId,
        number: invoices.number,
        totalAmount: invoices.totalAmount,
        brandName: brands.name,
      })
      .from(invoices)
      .innerJoin(brands, eq(brands.id, invoices.brandId))
      .where(eq(invoices.id, invoiceId))
      .then((rows) => rows.at(0))
    if (!row) return
    await notifyPartner({
      partnerId: row.partnerId,
      kind: 'bukti_bayar',
      title: `Bukti bayar ${formatInvoiceNumber(row.number)} masuk`,
      body: `${row.brandName} · ${formatRupiah(Number(row.totalAmount))}. Periksa dan konfirmasi.`,
      link: `/partner/tagihan/${invoiceId}`,
    })
  } catch (error) {
    console.error('Gagal mengirim notifikasi partner', error)
  }
}
