import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { customers } from '../db/schema'

/**
 * Akses data customer (server-side), sama polanya dengan `subscription-queries.ts`
 * dan `admin-queries.ts`: fungsi murni tanpa `createServerFn`. Endpoint-nya ada
 * di `src/lib/customers-functions.ts` / `customer-suggestions-functions.ts`.
 *
 * SENGAJA dipisah dari `customers-functions.ts`: file itu di-import halaman
 * client (Profil → Customer), dan helper ini butuh `db` di level modul. Kalau
 * query-nya ditulis di file server function, bundler ikut menarik
 * `drizzle-orm/node-postgres` → `pg` → `events` ke bundle browser, dan app-nya
 * mati dengan error "Cannot access events.EventEmitter in client code".
 * Client TIDAK boleh meng-import file ini.
 */

/**
 * Daftar customer aktif milik user — dipakai `listCustomers` di
 * `customers-functions.ts` DAN `getCustomerSuggestions` di
 * `customer-suggestions-functions.ts`, supaya query-nya nggak ditulis dua kali.
 */
export function queryActiveCustomers(userId: string) {
  return db
    .select()
    .from(customers)
    .where(and(eq(customers.userId, userId), isNull(customers.deletedAt)))
    .orderBy(asc(customers.name))
}
