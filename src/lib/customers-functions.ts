import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { customers } from '../db/schema'
import { getSessionUser } from './auth'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

/**
 * Query murni (bukan server function) buat daftar customer aktif milik user —
 * dipakai `listCustomers` di sini DAN `getCustomerSuggestions` di
 * `customer-suggestions-functions.ts`, supaya query-nya nggak ditulis dua kali.
 */
export function queryActiveCustomers(userId: string) {
  return db
    .select()
    .from(customers)
    .where(and(eq(customers.userId, userId), isNull(customers.deletedAt)))
    .orderBy(asc(customers.name))
}

const customerInputSchema = z.object({
  name: z.string().min(1, 'Nama customer wajib diisi'),
  phone: z.string().trim().optional(),
})

export const listCustomers = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    return queryActiveCustomers(user.id)
  },
)

export const createCustomer = createServerFn({ method: 'POST' })
  .validator(customerInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [customer] = await db
      .insert(customers)
      .values({
        userId: user.id,
        name: data.name,
        phone: data.phone || null,
      })
      .returning()
    return customer
  })

export const updateCustomer = createServerFn({ method: 'POST' })
  .validator(customerInputSchema.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const existing = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, data.id),
        eq(customers.userId, user.id),
        isNull(customers.deletedAt),
      ),
    })
    if (!existing) throw new Error('Customer tidak ditemukan')

    await db
      .update(customers)
      .set({ name: data.name, phone: data.phone || null, updatedAt: new Date() })
      .where(eq(customers.id, data.id))
  })

// Soft delete: tandai deletedAt, baris tidak dihapus dari database supaya
// riwayat/relasi lain yang mungkin merujuk ke customer ini tetap aman.
export const deleteCustomer = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .update(customers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, data.id),
          eq(customers.userId, user.id),
          isNull(customers.deletedAt),
        ),
      )
  })