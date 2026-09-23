import { createServerFn } from '@tanstack/react-start'
import { getSessionUser } from './auth'
import { queryActiveCustomers } from './customers-queries'
import { getUserEntitlements } from './entitlements'
import { canUseFeature } from './subscription'

/**
 * Saran nama pelanggan (autocomplete) untuk form Tambah/Edit Pesanan — fitur
 * PRO `customer_suggestions`. Data mentahnya (daftar customer) TETAP bisa
 * diakses lewat `listCustomers` di halaman Kelola Customer (Profil) — yang
 * di-gate di sini cuma kemudahan "muncul otomatis saat ngetik nama" itu
 * sendiri, sama seperti pola `order-suggestions-functions.ts`.
 *
 * Sama seperti `getOrderSuggestions`: endpoint ini TIDAK melempar error waktu
 * terkunci, cuma balikin `unlocked: false` + data kosong, supaya form pesanan
 * tetap bisa dipakai normal (nama pelanggan tetap bisa diketik manual).
 */
export interface CustomerSuggestions {
  unlocked: boolean
  customers: Array<{ id: string; name: string; phone: string | null }>
}

const LOCKED_CUSTOMER_SUGGESTIONS: CustomerSuggestions = {
  unlocked: false,
  customers: [],
}

export const getCustomerSuggestions = createServerFn({
  method: 'GET',
}).handler(async (): Promise<CustomerSuggestions> => {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')

  const entitlements = await getUserEntitlements(user)
  if (!canUseFeature(entitlements, 'customer_suggestions')) {
    return LOCKED_CUSTOMER_SUGGESTIONS
  }

  const rows = await queryActiveCustomers(user.id)
  return {
    unlocked: true,
    customers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
    })),
  }
})
