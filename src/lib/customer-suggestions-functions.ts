import { createServerFn } from '@tanstack/react-start'
import { brandIdOf } from './brand'
import { getSessionUser } from './auth'
import { queryActiveCustomers } from './customers-queries'

/**
 * Saran nama pelanggan (autocomplete) untuk form Tambah/Edit Pesanan. Data
 * mentahnya juga bisa diakses lewat `listCustomers` di halaman Kelola Customer
 * (Profil) — endpoint ini cuma memudahkan "muncul otomatis saat ngetik nama".
 *
 * Fitur ini TERBUKA untuk semua paket (termasuk FREE) — jadi tidak ada
 * pengecekan entitlement di sini.
 */
export interface CustomerSuggestions {
  customers: Array<{ id: string; name: string; phone: string | null }>
}

export const getCustomerSuggestions = createServerFn({
  method: 'GET',
}).handler(async (): Promise<CustomerSuggestions> => {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')

  const rows = await queryActiveCustomers(brandIdOf(user))
  return {
    customers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
    })),
  }
})
