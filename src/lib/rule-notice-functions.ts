import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { events, partnerRuleNotices } from '../db/schema'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

export type RuleNotice = {
  id: string
  ruleName: string
  changeType: 'updated' | 'deleted'
  affectedItems: number
  createdAt: string
}

/** Notifikasi perubahan aturan paket yang belum ditutup, untuk satu event jastiper. */
export const getEventRuleNotices = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid() }))
  .handler(async ({ data }): Promise<Array<RuleNotice>> => {
    const { db } = await import('../db')
    const user = await requireUser()
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, data.eventId), eq(events.brandId, brandIdOf(user))),
    })
    if (!event) return []

    const rows = await db
      .select()
      .from(partnerRuleNotices)
      .where(
        and(
          eq(partnerRuleNotices.eventId, data.eventId),
          isNull(partnerRuleNotices.dismissedAt),
        ),
      )
      .orderBy(desc(partnerRuleNotices.createdAt))

    return rows.map((r) => ({
      id: r.id,
      ruleName: r.ruleName,
      changeType: r.changeType === 'deleted' ? 'deleted' : 'updated',
      affectedItems: r.affectedItems,
      createdAt: r.createdAt.toISOString(),
    }))
  })

/** Jastiper menutup notifikasi (\"Mengerti\"). */
export const dismissRuleNotice = createServerFn({ method: 'POST' })
  .validator(z.object({ noticeId: z.uuid() }))
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await requireUser()
    const notice = await db.query.partnerRuleNotices.findFirst({
      where: eq(partnerRuleNotices.id, data.noticeId),
    })
    if (!notice) throw new Error('Notifikasi tidak ditemukan')
    const event = await db.query.events.findFirst({
      where: and(eq(events.id, notice.eventId), eq(events.brandId, brandIdOf(user))),
    })
    if (!event) throw new Error('Notifikasi tidak ditemukan')
    await db
      .update(partnerRuleNotices)
      .set({ dismissedAt: new Date() })
      .where(eq(partnerRuleNotices.id, data.noticeId))
    return { ok: true as const }
  })
