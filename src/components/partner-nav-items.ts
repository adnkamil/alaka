import { CalendarDays, Home, Layers, Package, Receipt } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface PartnerTabDef {
  to:
    | '/partner'
    | '/partner/katalog'
    | '/partner/paket'
    | '/partner/event'
    | '/partner/tagihan'
  /** Kunci label di kamus `t.shell.nav`. */
  labelKey: 'dashboard' | 'products' | 'bundling' | 'event' | 'invoices'
  icon: LucideIcon
}

/** Menu utama Partner Portal; dipakai bottom nav (mobile) & sidebar (desktop). */
export const PARTNER_TABS: Array<PartnerTabDef> = [
  { to: '/partner', labelKey: 'dashboard', icon: Home },
  { to: '/partner/katalog', labelKey: 'products', icon: Package },
  { to: '/partner/paket', labelKey: 'bundling', icon: Layers },
  { to: '/partner/event', labelKey: 'event', icon: CalendarDays },
  { to: '/partner/tagihan', labelKey: 'invoices', icon: Receipt },
]

/**
 * Tab aktif ditentukan dari pathname, bukan `activeProps`, supaya Beranda
 * tidak ikut menyala di `/partner/katalog`.
 */
export function isPartnerTabActive(pathname: string, to: PartnerTabDef['to']) {
  const current = pathname.replace(/\/+$/, '')
  return current === to || (to !== '/partner' && current.startsWith(`${to}/`))
}
