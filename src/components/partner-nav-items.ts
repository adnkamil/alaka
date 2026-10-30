import { CalendarDays, Home, Layers, Package, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface PartnerTabDef {
  to: '/partner' | '/partner/katalog' | '/partner/paket' | '/partner/event' | '/partner/profil'
  label: string
  icon: LucideIcon
}

/** Menu utama Partner Portal; dipakai bottom nav (mobile) & sidebar (desktop). */
export const PARTNER_TABS: Array<PartnerTabDef> = [
  { to: '/partner', label: 'Beranda', icon: Home },
  { to: '/partner/katalog', label: 'Katalog', icon: Package },
  { to: '/partner/paket', label: 'Paket', icon: Layers },
  { to: '/partner/event', label: 'Event', icon: CalendarDays },
  { to: '/partner/profil', label: 'Profil', icon: User },
]

/**
 * Tab aktif ditentukan dari pathname, bukan `activeProps`, supaya Beranda
 * tidak ikut menyala di `/partner/katalog`.
 */
export function isPartnerTabActive(pathname: string, to: PartnerTabDef['to']) {
  const current = pathname.replace(/\/+$/, '')
  return current === to || (to !== '/partner' && current.startsWith(`${to}/`))
}
