import { Link, useRouterState } from '@tanstack/react-router'
import { ADMIN_TABS, isAdminTabActive } from './admin-nav-items'

/**
 * Bottom tab admin — lima halaman admin. Gayanya sama dengan
 * `PartnerBottomNav` (nav putih 72px, ikon 22px, label 11px, tab aktif bold
 * berwarna aksen).
 *
 * Halaman aktif ditentukan dari `pathname` yang sudah dirapikan, BUKAN
 * `activeProps`: kecocokan route bawaan TanStack Router itu berawalan (prefix),
 * jadi tab Dashboard (`/admin`) ikut menyala di `/admin/customers`. Cara ini
 * sekaligus menyamakan `/admin` dan `/admin/`.
 */
export default function AdminBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full -translate-x-1/2 border-t lg:hidden"
      style={{
        maxWidth: 480,
        height: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        borderColor: 'var(--app-border)',
        background: '#ffffff',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="mx-auto flex h-[72px] max-w-lg items-center justify-between px-1">
        {ADMIN_TABS.map((tab) => {
          const Icon = tab.icon
          const active = isAdminTabActive(pathname, tab.to)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] no-underline"
              style={{
                color: active ? 'var(--app-accent)' : 'var(--app-text-soft)',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={22} />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
