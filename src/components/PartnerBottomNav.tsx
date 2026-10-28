import { Link, useRouterState } from '@tanstack/react-router'
import { PARTNER_TABS, isPartnerTabActive } from './partner-nav-items'

/**
 * Bottom tab Partner Portal, mengikuti desain Figma (nav putih, ikon 22px,
 * label 11px; tab aktif bold berwarna aksen). Tinggi tetap 72px agar halaman
 * ber-footer tombol (`.pm-footer`) bisa menempel tepat di atasnya.
 */
export default function PartnerBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full lg:hidden -translate-x-1/2 border-t"
      style={{
        maxWidth: 480,
        height: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        borderColor: 'var(--app-border)',
        background: '#ffffff',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="mx-auto flex h-[72px] max-w-lg items-center justify-between px-2">
        {PARTNER_TABS.map((tab) => {
          const Icon = tab.icon
          const active = isPartnerTabActive(pathname, tab.to)
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
