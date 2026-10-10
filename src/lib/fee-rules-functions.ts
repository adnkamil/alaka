import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { feeRules, feeTiers } from '../db/schema'
import { getSessionUser } from './auth'
import { validateFeeTiers } from './fee-tier-validation'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const tierSchema = z.object({
  minPrice: z.number().nonnegative(),
  maxPrice: z.number().nonnegative(),
  feeAmount: z.number().nonnegative(),
})

const feeRuleInputSchema = z.object({
  name: z.string().min(1, 'Nama aturan wajib diisi'),
  tiers: z.array(tierSchema).min(1, 'Minimal satu tier'),
})

export const listFeeRules = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    return db.query.feeRules.findMany({
      where: eq(feeRules.userId, user.id),
      with: { tiers: true },
      orderBy: (table, { desc }) => desc(table.createdAt),
    })
  },
)

export const getFeeRule = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const rule = await db.query.feeRules.findFirst({
      where: and(eq(feeRules.id, data.id), eq(feeRules.userId, user.id)),
      with: { tiers: true },
    })
    if (!rule) throw new Error('Aturan fee tidak ditemukan')
    return rule
  })

export const createFeeRule = createServerFn({ method: 'POST' })
  .validator(feeRuleInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()

    const overlapErrors = validateFeeTiers(data.tiers)
    if (overlapErrors.length > 0) {
      throw new Error(overlapErrors[0].message)
    }

    const [rule] = await db
      .insert(feeRules)
      .values({ userId: user.id, brandId: user.brandId, name: data.name })
      .returning()

    await db.insert(feeTiers).values(
      data.tiers.map((tier) => ({
        feeRuleId: rule.id,
        minPrice: tier.minPrice.toString(),
        maxPrice: tier.maxPrice.toString(),
        feeAmount: tier.feeAmount.toString(),
      })),
    )

    return rule
  })

export const updateFeeRule = createServerFn({ method: 'POST' })
  .validator(feeRuleInputSchema.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const overlapErrors = validateFeeTiers(data.tiers)
    if (overlapErrors.length > 0) {
      throw new Error(overlapErrors[0].message)
    }

    const existing = await db.query.feeRules.findFirst({
      where: and(eq(feeRules.id, data.id), eq(feeRules.userId, user.id)),
    })
    if (!existing) throw new Error('Aturan fee tidak ditemukan')

    await db
      .update(feeRules)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(feeRules.id, data.id))

    await db.delete(feeTiers).where(eq(feeTiers.feeRuleId, data.id))
    await db.insert(feeTiers).values(
      data.tiers.map((tier) => ({
        feeRuleId: data.id,
        minPrice: tier.minPrice.toString(),
        maxPrice: tier.maxPrice.toString(),
        feeAmount: tier.feeAmount.toString(),
      })),
    )
  })

export const deleteFeeRule = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .delete(feeRules)
      .where(and(eq(feeRules.id, data.id), eq(feeRules.userId, user.id)))
  })
