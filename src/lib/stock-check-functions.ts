import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'

/**
 * Server functions tombol "cek stok otomatis" di halaman partner. Logika ada di
 * `stock-check-queue.ts`. `db` diimpor dinamis supaya tidak ikut ke bundle client.
 *
 * Browser memanggil `runAutoStockCheckStep` berulang sampai status selesai atau
 * berhenti. Tiap panggilan berhenti sendiri sebelum batas waktu fungsi, jadi
 * satu panggilan tidak pernah menahan ratusan submit sekaligus.
 */

const idSchema = z.uuid()

/** Batas waktu per panggilan, di bawah batas fungsi Netlify. */
const STEP_BUDGET_MS = 8_000
/** Maksimal submit per panggilan. */
const STEP_MAX_SUBMISSIONS = 20

async function assertPartnerEvent(calendarEventId: string) {
  const partner = await requirePartner()
  if (!(await partnerOwnsEvent(partner.id, calendarEventId))) {
    throw new Error('Event tidak ditemukan')
  }
  return partner
}

export const getAutoStockCheckStatus = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    await assertPartnerEvent(data.calendarEventId)
    const { db } = await import('../db')
    const { loadAutoStockCheckStatus } = await import('./stock-check-queue')
    return db.transaction((tx) =>
      loadAutoStockCheckStatus(tx, data.calendarEventId, new Date()),
    )
  })

/** Tekan "cek stok otomatis" atau "lanjutkan". Hanya membuat/menyambung run. */
export const startAutoStockCheck = createServerFn({ method: 'POST' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await assertPartnerEvent(data.calendarEventId)
    const { db } = await import('../db')
    const { startOrResumeRun, loadAutoStockCheckStatus } =
      await import('./stock-check-queue')
    return db.transaction(async (tx) => {
      // Kunci yang sama dengan simpan stok, supaya keduanya tidak jalan bersamaan.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${partner.id}))`)
      const now = new Date()
      await startOrResumeRun(tx, data.calendarEventId, now)
      return loadAutoStockCheckStatus(tx, data.calendarEventId, now)
    })
  })

/** Jalankan satu putaran pengecekan, berhenti sendiri sebelum batas waktu. */
export const runAutoStockCheckStep = createServerFn({ method: 'POST' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    await assertPartnerEvent(data.calendarEventId)
    const { db } = await import('../db')
    const {
      loadPendingQueue,
      loadAutoStockCheckStatus,
      processSubmissionAutoCheck,
    } = await import('./stock-check-queue')
    const { stockCheckRuns } = await import('../db/schema')

    const deadline = Date.now() + STEP_BUDGET_MS
    let done = 0
    while (Date.now() < deadline && done < STEP_MAX_SUBMISSIONS) {
      // Ambil satu submit berikutnya dan tandai sedang dicek. Kalau run sudah
      // tidak "running" (dihentikan partner), atau tidak ada yang tersisa, berhenti.
      const next = await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(stockCheckRuns)
          .where(
            and(
              eq(stockCheckRuns.calendarEventId, data.calendarEventId),
              eq(stockCheckRuns.status, 'running'),
            ),
          )
          .for('update')
        if (!run) return null

        const [queued] = await loadPendingQueue(
          tx,
          data.calendarEventId,
          run.lastSeq,
          run.upperSeq,
          1,
        )
        if (!queued) {
          await tx
            .update(stockCheckRuns)
            .set({
              status: 'done',
              currentSubmissionId: null,
              heartbeatAt: new Date(),
              finishedAt: new Date(),
            })
            .where(eq(stockCheckRuns.id, run.id))
          return null
        }
        await tx
          .update(stockCheckRuns)
          .set({ currentSubmissionId: queued.id, heartbeatAt: new Date() })
          .where(eq(stockCheckRuns.id, run.id))
        return { runId: run.id, ...queued }
      })
      if (!next) break

      try {
        await db.transaction((tx) =>
          processSubmissionAutoCheck(
            tx,
            next.runId,
            next.id,
            next.queueSeq,
            new Date(),
          ),
        )
      } catch (err) {
        // Gagal di satu submit: run dihentikan agar partner bisa melihat
        // kesalahannya dan menekan "lanjutkan" setelah diperbaiki.
        await db
          .update(stockCheckRuns)
          .set({ status: 'paused', currentSubmissionId: null })
          .where(eq(stockCheckRuns.id, next.runId))
        throw err
      }
      done++
    }

    return db.transaction((tx) =>
      loadAutoStockCheckStatus(tx, data.calendarEventId, new Date()),
    )
  })

/** Hentikan setelah submit yang sedang dicek selesai. */
export const stopAutoStockCheck = createServerFn({ method: 'POST' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    await assertPartnerEvent(data.calendarEventId)
    const { db } = await import('../db')
    const { stockCheckRuns } = await import('../db/schema')
    const { loadAutoStockCheckStatus } = await import('./stock-check-queue')
    await db
      .update(stockCheckRuns)
      .set({ status: 'paused' })
      .where(
        and(
          eq(stockCheckRuns.calendarEventId, data.calendarEventId),
          eq(stockCheckRuns.status, 'running'),
        ),
      )
    return db.transaction((tx) =>
      loadAutoStockCheckStatus(tx, data.calendarEventId, new Date()),
    )
  })

/** Apakah pengecekan stok otomatis sedang berjalan. Dipakai untuk mengunci edit stok. */
export const getAutoStockCheckActive = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { calendarEvents, stockCheckRuns } = await import('../db/schema')
    const { and, eq: eqOp } = await import('drizzle-orm')
    const { HEARTBEAT_STALE_MS } = await import('./stock-check-allocate')
    const [run] = await db
      .select({ heartbeatAt: stockCheckRuns.heartbeatAt })
      .from(stockCheckRuns)
      .innerJoin(
        calendarEvents,
        eqOp(calendarEvents.id, stockCheckRuns.calendarEventId),
      )
      .where(
        and(
          eqOp(calendarEvents.partnerId, partner.id),
          eqOp(stockCheckRuns.status, 'running'),
        ),
      )
      .limit(1)
    const active =
      !!run && Date.now() - run.heartbeatAt.getTime() < HEARTBEAT_STALE_MS
    return { active }
  },
)

