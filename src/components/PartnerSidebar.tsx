import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import PartnerLogo from './PartnerLogo'
import { PARTNER_TABS, isPartnerTabActive } from './partner-nav-items'
import { logoutPartner } from '../lib/partner-functions'
import { partnerInitials } from '../lib/partner-logo-rules'

interface PartnerSidebarProps {
  name: string
  logoUrl: string | null
}

/**
 * Sidebar Partner Portal untuk layar desktop (>= lg), sesuai desain Figma
 * "D2 Beranda Partner". Di mobile tidak dirender (bottom nav yang dipakai).
 */
export default function PartnerSidebar({ name, logoUrl }: PartnerSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const queryClient = useQueryClient()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logoutPartner()
      queryClient.clear()
      await router.navigate({ to: '/login' })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <aside className="pm-sidebar">
      <div className="flex items-center gap-3 px-1">
        <div
          className="pm-display flex h-10 w-10 items-center justify-center rounded-xl text-xl"
          style={{ background: 'var(--app-accent)', color: '#ffffff' }}
          aria-hidden
        >
          A
        </div>
        <div className="flex flex-col leading-tight">
          <span className="pm-display text-[17px] tracking-wide">ALAKA</span>
          <span
            className="text-[11px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Partner Portal
          </span>
        </div>
      </div>

      <nav className="mt-8 flex flex-col gap-1.5" aria-label="Menu partner">
        {PARTNER_TABS.map((tab) => {
          const Icon = tab.icon
          const active = isPartnerTabActive(pathname, tab.to)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className="flex h-[42px] items-center gap-3 rounded-xl px-3.5 text-sm no-underline"
              style={{
                background: active ? 'var(--app-accent-soft)' : 'transparent',
                color: active ? 'var(--app-accent)' : 'var(--app-text)',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={19} />
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <div
        className="mt-auto flex items-center gap-3 rounded-2xl p-3"
        style={{ background: 'var(--pm-tint)' }}
      >
        <PartnerLogo
          name={name}
          logoUrl={logoUrl}
          size={36}
          shape="circle"
          initials={partnerInitials(name)}
          className="pm-display text-xs"
        />
        <div className="flex min-w-0 flex-1 flex-col items-start leading-tight">
          <span className="w-full truncate text-[13px] font-bold">{name}</span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-xs font-medium disabled:opacity-60"
            style={{ color: 'var(--app-accent)' }}
          >
            Keluar
          </button>
        </div>
      </div>
    </aside>
  )
}
