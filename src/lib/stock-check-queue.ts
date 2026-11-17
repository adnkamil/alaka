// Pengecekan stok otomatis per event kalender partner (server-only, dipanggil
// dari stock-check-functions.ts). Satu run = satu kali tombol ditekan. Setiap
// submit diproses dalam transaksi sendiri lewat reviewSubmission, jadi hasilnya
// sama dengan cek manual dan status log-nya ikut tercatat.
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm'
import {
  eventSubmissions,
  events,
  itemComponents,
  items,
  partnerVariants,
  stockCheckRuns,
} from '../db/schema'
import type { OrderTx } from './order-status-queries'
import {
  HEARTBEAT_STALE_MS,
  allocateAutoApprovals,
} from './stock-check-allocate'
import { reviewSubmission } from './submit-queries'

export { HEARTBEAT_STALE_MS } from './stock-check-allocate'

export type StockCheckRun = typeof stockCheckRuns.$inferSelect

/** Submit belum dicek dalam satu event kalender, urut sesuai antrean. */
export async function loadPendingQueue(
  tx: OrderTx,
  calendarEventId: string,
  afterSeq: number,
  upperSeq: number,
  limit: number,
): Promise<Array<{ id: string; queueSeq: number }>> {
  return tx
    .select({ id: eventSubmissions.id, queueSeq: eventSubmissions.queueSeq })
    .from(eventSubmissions)
    .innerJoin(events, eq(events.id, eventSubmissions.eventId))
    .where(
      and(
        eq(events.calendarEventId, calendarEventId),
        isNull(eventSubmissions.stockCheckedAt),
        gt(eventSubmissions.queueSeq, afterSeq),
        lte(eventSubmissions.queueSeq, upperSeq),
      ),
    )
    .orderBy(asc(eventSubmissions.queueSeq))
    .limit(limit)
}

async function countPending(
  tx: OrderTx,
  calendarEventId: string,
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(eventSubmissions)
    .innerJoin(events, eq(events.id, eventSubmissions.eventId))
    .where(
      and(
        eq(events.calendarEventId, calendarEventId),
        isNull(eventSubmissions.stockCheckedAt),
      ),
    )
  return row?.n ?? 0
}

/**
 * Mulai run baru, atau lanjutkan run yang berhenti. Mengembalikan null kalau
 * tidak ada submit yang perlu dicek. Satu event hanya boleh punya satu run
 * "running" (dijaga index unik di database).
 */
export async function startOrResumeRun(
  tx: OrderTx,
  calendarEventId: string,
  now: Date,
): Promise<StockCheckRun | null> {
  const [running] = await tx
    .select()
    .from(stockCheckRuns)
    .where(
      and(
        eq(stockCheckRuns.calendarEventId, calendarEventId),
        eq(stockCheckRuns.status, 'running'),
      ),
    )
    .for('update')
  if (running) {
    if (now.getTime() - running.heartbeatAt.getTime() < HEARTBEAT_STALE_MS) {
      return running
    }
    await tx
      .update(stockCheckRuns)
      .set({ status: 'paused', currentSubmissionId: null })
      .where(eq(stockCheckRuns.id, running.id))
  }

  const [latest] = await tx
    .select()
    .from(stockCheckRuns)
    .where(eq(stockCheckRuns.calendarEventId, calendarEventId))
    .orderBy(desc(stockCheckRuns.startedAt))
    .limit(1)
    .for('update')
  if (latest?.status === 'paused') {
    const [resumed] = await tx
      .update(stockCheckRuns)
      .set({ status: 'running', heartbeatAt: now })
      .where(eq(stockCheckRuns.id, latest.id))
      .returning()
    return resumed
  }

  const [newest] = await tx
    .select({ queueSeq: eventSubmissions.queueSeq })
    .from(eventSubmissions)
    .innerJoin(events, eq(events.id, eventSubmissions.eventId))
    .where(
      and(
        eq(events.calendarEventId, calendarEventId),
        isNull(eventSubmissions.stockCheckedAt),
      ),
    )
    .orderBy(desc(eventSubmissions.queueSeq))
    .limit(1)
  if (!newest) return null

  const [created] = await tx
    .insert(stockCheckRuns)
    .values({
      calendarEventId,
      upperSeq: newest.queueSeq,
      totalCount: await countPending(tx, calendarEventId),
      heartbeatAt: now,
    })
    .returning()
  return created
}

/** Status untuk tombol dan progres di halaman partner dan jastiper. */
export async function loadAutoStockCheckStatus(
  tx: OrderTx,
  calendarEventId: string,
  now: Date,
) {
  const [run] = await tx
    .select()
    .from(stockCheckRuns)
    .where(eq(stockCheckRuns.calendarEventId, calendarEventId))
    .orderBy(desc(stockCheckRuns.startedAt))
    .limit(1)
  const pendingCount = await countPending(tx, calendarEventId)
  const isRunning = run?.status === 'running'
  const isStale =
    isRunning && now.getTime() - run.heartbeatAt.getTime() >= HEARTBEAT_STALE_MS
  return {
    run: run
      ? {
          id: run.id,
          status: run.status,
          processed: run.processedCount,
          total: run.totalCount,
          currentSubmissionId: run.currentSubmissionId,
          heartbeatAt: run.heartbeatAt,
        }
      : null,
    pendingCount,
    /** Tombol aktif kalau ada yang menunggu dan tidak ada proses yang hidup. */
    canStart: pendingCount > 0 && (!isRunning || isStale),
    isStale,
  }
}

/**
 * Cek satu submit secara otomatis: sisa stok per varian dibagi ke baris sesuai
 * urutan, lalu diteruskan ke reviewSubmission. Dipanggil dalam transaksi sendiri.
 */
export async function processSubmissionAutoCheck(
  tx: OrderTx,
  runId: string,
  submissionId: string,
  queueSeq: number,
  now: Date,
): Promise<void> {
  const [submission] = await tx
    .select()
    .from(eventSubmissions)
    .where(eq(eventSubmissions.id, submissionId))
    .for('update')

  if (submission && !submission.stockCheckedAt) {
    const pendingItems = await tx
      .select({
        id: items.id,
        qty: items.qty,
        partnerVariantId: items.partnerVariantId,
      })
      .from(items)
      .where(
        and(
          eq(items.submissionId, submissionId),
          eq(items.submitStatus, 'pengajuan'),
        ),
      )
      .orderBy(asc(items.createdAt), asc(items.id))
    const pendingComps = await tx
      .select({
        id: itemComponents.id,
        qty: itemComponents.qty,
        partnerVariantId: itemComponents.partnerVariantId,
      })
      .from(itemComponents)
      .where(
        and(
          eq(itemComponents.submissionId, submissionId),
          eq(itemComponents.submitStatus, 'pengajuan'),
        ),
      )
      .orderBy(asc(itemComponents.addedAt), asc(itemComponents.id))

    const variantIds = [
      ...new Set(
        [...pendingItems, ...pendingComps]
          .map((r) => r.partnerVariantId)
          .filter((id): id is string => !!id),
      ),
    ].sort()
    const stockByVariant = new Map<string, number>()
    if (variantIds.length > 0) {
      const variantRows = await tx
        .select({ id: partnerVariants.id, stockQty: partnerVariants.stockQty })
        .from(partnerVariants)
        .where(inArray(partnerVariants.id, variantIds))
        .orderBy(asc(partnerVariants.id))
        .for('update')
      for (const v of variantRows) stockByVariant.set(v.id, v.stockQty)
    }

    const approvals = allocateAutoApprovals(
      [
        ...pendingItems.map((r) => ({
          key: `i:${r.id}`,
          variantId: r.partnerVariantId,
          qty: r.qty,
        })),
        ...pendingComps.map((r) => ({
          key: `c:${r.id}`,
          variantId: r.partnerVariantId,
          qty: r.qty,
        })),
      ],
      stockByVariant,
    )

    await reviewSubmission(tx, {
      submissionId,
      itemDecisions: pendingItems.map((r) => ({
        id: r.id,
        approvedQty: approvals.get(`i:${r.id}`) ?? 0,
      })),
      componentDecisions: pendingComps.map((r) => ({
        id: r.id,
        approvedQty: approvals.get(`c:${r.id}`) ?? 0,
      })),
    })
  }

  await tx
    .update(stockCheckRuns)
    .set({
      lastSeq: queueSeq,
      processedCount: sql`${stockCheckRuns.processedCount} + 1`,
      currentSubmissionId: null,
      heartbeatAt: now,
    })
    .where(eq(stockCheckRuns.id, runId))
}
