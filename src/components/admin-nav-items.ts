import {
  CalendarDays,
  LayoutDashboard,
  Settings,
  CreditCard,
  Store,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface AdminTabDef {
  to:
    | '/admin'
    | '/admin/customers'
    | '/admin/event'
    | '/admin/partner'
    | '/admin/langganan-partner'
    | '/admin/pengaturan'
  label: string
  icon: LucideIcon
}

/** Menu admin; dipakai bottom nav (mobile) & sidebar (desktop). */
export const ADMIN_TABS: Array<AdminTabDef> = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/customers', label: 'Customer', icon: Users },
  { to: '/admin/event', label: 'Event', icon: CalendarDays },
  { to: '/admin/partner', label: 'Partner', icon: Store },
  { to: '/admin/langganan-partner', label: 'PRO Partner', icon: CreditCard },
  { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings },
]

/**
 * Dashboard (`/admin`) cuma aktif persis; tab lain juga aktif di halaman
 * turunannya (mis. `/admin/event/<id>` menyalakan tab Event).
 */
export function isAdminTabActive(pathname: string, to: AdminTabDef['to']) {
  const current = pathname.replace(/\/+$/, '')
  return current === to || (to !== '/admin' && current.startsWith(`${to}/`))
}
