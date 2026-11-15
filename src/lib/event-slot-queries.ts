// Query alur slot event partner (server-only, menerima `tx` dari pemanggil).
// Aturan alur dan penamaan status ada di `event-slot.ts`.
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import {
  brands,
  calendarEvents,
  events,
  itemComponents,
  items,
  orders,
  partners,
} from '../db/schema'
import { deriveSlotStatus, slotPhase } from './event-slot'
import { eventSubmissions, itemStatusLogs } from '../db/schema'
import type { SlotConfig, SlotStatus } from './event-slot'
import type { OrderTx } from './order-status-queries'

export async function loadSlotConfig(
  tx: OrderTx,
  calendarEventId: string | null,
): Promise<SlotConfig | null> {
  if (!calendarEventId) return null
  const rows = await tx
    .select({
      partnerId: calendarEvents.partnerId,
      opensAt: calendarEvents.slotOpensAt,
      closesAt: calendarEvents.slotClosesAt,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, calendarEventId))
  return rows.at(0) ?? null
}

/**
 * Urutan submit satu jastiper di satu event kalender: "Urutan #rank dari
 * total". Dihitung di database (bukan di JS) supaya presisi mikrodetik dari
 * `now()` ikut menentukan urutan; `id` hanya pemecah kalau waktunya persis sama.
 */
export async function getSubmitPosition(
  tx: OrderTx,
  calendarEventId: string,
  eventId: string,
): Promise<{ rank: number; total: number } | null> {
  const result = await tx.execute(sql`
    select rank, total from (
      select id,
             row_number() over (order by submitted_at, id) as rank,
             count(*) over () as total
      from events
      where calendar_event_id = ${calendarEventId} and submitted_at is not null
    ) q
    where id = ${eventId}
  `)
  const row = result.rows.at(0) as
    { rank: string | number; total: string | number } | undefined
  if (!row) return null
  return { rank: Number(row.rank), total: Number(row.total) }
}

/** Jumlah baris barang yang dapat dikirim (qty > 0) di semua pesanan event ini. */
export async function countSubmittableItems(
  tx: OrderTx,
  eventId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: items.id })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(and(eq(orders.eventId, eventId), sql`${items.qty} > 0`))
  return rows.length
}

/** Status review tiap paket (`ok`/`sanggah`/`verifikasi`) per event. */
export type SubmitCounts = { pending: number; disanggah: number }

/**
 * Hitung baris yang masih menunggu partner dan yang disanggah, per event.
 * Hanya baris yang sudah pernah disubmit (submission_id terisi) yang dihitung.
 */
export async function loadSubmitCountsByEvent(
  tx: OrderTx,
  eventIds: Array<string>,
): Promise<Map<string, SubmitCounts>> {
  const result = new Map<string, SubmitCounts>()
  if (eventIds.length === 0) return result
  const bump = (eventId: string, status: string | null, qty: number) => {
    const cur = result.get(eventId) ?? { pending: 0, disanggah: 0 }
    if (status === 'pengajuan') cur.pending += 1
    if (status === 'disanggah') cur.disanggah += 1
    result.set(eventId, cur)
    void qty
  }
  const satuan = await tx
    .select({
      eventId: orders.eventId,
      status: items.submitStatus,
      qty: items.qty,
    })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        inArray(orders.eventId, eventIds),
        eq(items.isBundle, false),
        isNotNull(items.submitStatus),
      ),
    )
  const komponen = await tx
    .select({
      eventId: orders.eventId,
      status: itemComponents.submitStatus,
      qty: itemComponents.qty,
    })
    .from(itemComponents)
  .innerJoin(items, eq(items.id, itemComponents.itemId))
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        inArray(orders.eventId, eventIds),
        isNotNull(itemComponents.submitStatus),
      ),
    )
  for (const row of [...satuan, ...komponen]) {
    bump(row.eventId, row.status, row.qty)
  }
  return result
}

export type SlotSummary = {
  status: SlotStatus
  opensAt: Date
  closesAt: Date
  submittedAt: Date | null
  /** Urutan submit event ini di antara jastiper lain; null sebelum submit. */
  rank: number | null
  total: number | null
  /** Barang yang masih menunggu cek partner. */
  pendingCount: number
  /** Barang yang disanggah partner (riwayat, perlu diganti). */
  disanggahCount: number
  /** Barang baru yang belum dikirim (draft). */
  draftCount: number
  /** Jastiper boleh menekan Submit sekarang: slot terbuka dan ada draft. */
  canSubmit: boolean
  /** Riwayat setiap submit, urut dari yang pertama. */
  submissions: Array<SubmissionHistory>
  /** Kontak partner (brand) supaya jastiper bisa memastikan stok pengganti. */
  partnerContact: { name: string; waNumber: string | null } | null
}

type SlotEventRow = Pick<
  typeof events.$inferSelect,
  'id' | 'calendarEventId' | 'submittedAt'
>

/** Ringkasan alur slot satu event jastiper. Null = event tidak memakai alur slot. */
export async function getSlotSummary(
  tx: OrderTx,
  event: SlotEventRow,
  now: Date,
): Promise<SlotSummary | null> {
  const config = await loadSlotConfig(tx, event.calendarEventId)
  if (!config || !event.calendarEventId) return null
  const counts = (await loadSubmitCountsByEvent(tx, [event.id])).get(event.id)
  const pending = counts?.pending ?? 0
  const disanggah = counts?.disanggah ?? 0
  const draftCount = await loadDraftCount(tx, event.id)
  const open = slotPhase(config, now) === 'terbuka'
  const status = deriveSlotStatus({
    config,
    submittedAt: event.submittedAt,
    pendingCount: pending,
    disanggahCount: disanggah,
    now,
  })
  if (status === null) return null
  const position =
    event.submittedAt !== null
      ? await getSubmitPosition(tx, event.calendarEventId, event.id)
      : null
  return {
    status,
    opensAt: config.opensAt as Date,
    closesAt: config.closesAt as Date,
    submittedAt: event.submittedAt,
    rank: position?.rank ?? null,
    total: position?.total ?? null,
    pendingCount: pending,
    disanggahCount: disanggah,
    draftCount,
    canSubmit: open && draftCount > 0,
    submissions: await loadSubmissionHistory(tx, event.id),
    partnerContact: config.partnerId
      ? ((await tx
          .select({ name: partners.name, waNumber: partners.waNumber })
          .from(partners)
          .where(eq(partners.id, config.partnerId))
          .then((rows) => rows.at(0))) ?? null)
      : null,
  }
}

export type SlotQueueRow = {
  eventId: string
  brandId: string
  brandName: string | null
  submittedAt: Date | null
  rank: number | null
  status: SlotStatus | null
  pendingCount: number
  disanggahCount: number
}

/** Jastiper di satu event kalender, berurutan sesuai urutan submit (yang belum submit di bawah). */
export async function listSlotQueue(
  tx: OrderTx,
  calendarEventId: string,
  now: Date,
): Promise<Array<SlotQueueRow>> {
  const config = await loadSlotConfig(tx, calendarEventId)
  const rows = await tx
    .select({
      eventId: events.id,
      brandId: events.brandId,
      brandName: brands.name,
      submittedAt: events.submittedAt,
    })
    .from(events)
    .innerJoin(brands, eq(brands.id, events.brandId))
    .where(eq(events.calendarEventId, calendarEventId))
    .orderBy(sql`${events.submittedAt} asc nulls last`, asc(events.id))
  const countsByEvent = await loadSubmitCountsByEvent(
    tx,
    rows.map((r) => r.eventId),
  )
  let rank = 0
  return rows.map((r) => {
    const counts = countsByEvent.get(r.eventId)
    const pending = counts?.pending ?? 0
    const disanggah = counts?.disanggah ?? 0
    return {
      eventId: r.eventId,
      brandId: r.brandId,
      brandName: r.brandName,
      submittedAt: r.submittedAt,
      rank: r.submittedAt !== null ? ++rank : null,
      status: deriveSlotStatus({
        config,
        submittedAt: r.submittedAt,
        pendingCount: pending,
        disanggahCount: disanggah,
        now,
      }),
      pendingCount: pending,
      disanggahCount: disanggah,
    }
  })
}

/** Jumlah barang draft (belum pernah dikirim) di satu event. */
export async function loadDraftCount(tx: OrderTx, eventId: string): Promise<number> {
  const satuan = await tx
    .select({ id: items.id })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(items.isBundle, false),
        isNull(items.submitStatus),
      ),
    )
  const komponen = await tx
    .select({ id: itemComponents.id })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(and(eq(orders.eventId, eventId), isNull(itemComponents.submitStatus)))
  return satuan.length + komponen.length
}

export type SubmissionHistory = {
  submissionId: string
  submitNo: number
  submittedAt: Date
  /** Pcs yang dikirim di submit ini (disetujui + disanggah + menunggu). */
  pcs: number
  approved: number
  rejected: number
  pending: number
  /** Waktu partner selesai mengecek (log terakhir). Null kalau masih menunggu. */
  checkedAt: Date | null
}

/** Riwayat submit satu event, urut dari submit pertama. */
export async function loadSubmissionHistory(
  tx: OrderTx,
  eventId: string,
): Promise<Array<SubmissionHistory>> {
  const subs = await tx
    .select()
    .from(eventSubmissions)
    .where(eq(eventSubmissions.eventId, eventId))
    .orderBy(asc(eventSubmissions.submitNo))
  if (subs.length === 0) return []
  const subIds = subs.map((s) => s.id)

  // Baris paket induk (isBundle) tidak dihitung: pcs-nya sudah ada di komponen.
  const satuan = await tx
    .select({ qty: items.qty, status: items.submitStatus, submissionId: items.submissionId })
    .from(items)
    .where(and(inArray(items.submissionId, subIds), eq(items.isBundle, false)))
  // Pcs komponen dikali jumlah paket, sama dengan halaman detail submit.
  const komponen = await tx
    .select({
      qty: sql<number>`${itemComponents.qty} * ${items.qty}`,
      status: itemComponents.submitStatus,
      submissionId: itemComponents.submissionId,
    })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .where(inArray(itemComponents.submissionId, subIds))
  const logs = await tx
    .select({
      submissionId: itemStatusLogs.submissionId,
      toStatus: itemStatusLogs.toStatus,
      createdAt: itemStatusLogs.createdAt,
    })
    .from(itemStatusLogs)
    .where(inArray(itemStatusLogs.submissionId, subIds))

  return subs.map((sub) => {
    const rows = [...satuan, ...komponen].filter((r) => r.submissionId === sub.id)
    const sumBy = (status: string) =>
      rows.filter((r) => r.status === status).reduce((n, r) => n + r.qty, 0)
    const approved = sumBy('disetujui')
    const rejected = sumBy('disanggah')
    const pending = sumBy('pengajuan')
    const checked = logs
      .filter(
        (l) =>
          l.submissionId === sub.id &&
          (l.toStatus === 'disetujui' || l.toStatus === 'disanggah'),
      )
      .map((l) => l.createdAt)
    const checkedAt =
      checked.length > 0
        ? new Date(Math.max(...checked.map((d) => new Date(d).getTime())))
        : null
    return {
      submissionId: sub.id,
      submitNo: sub.submitNo,
      submittedAt: sub.submittedAt,
      pcs: approved + rejected + pending,
      approved,
      rejected,
      pending,
      checkedAt: pending === 0 ? checkedAt : null,
    }
  })
}
