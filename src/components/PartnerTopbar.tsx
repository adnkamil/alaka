import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, Package, Search } from 'lucide-react'
import PartnerLogo from './PartnerLogo'
import { matchesSearch } from '../lib/partner-dashboard-rules'
import { partnerInitials } from '../lib/partner-logo-rules'
import { partnerEventsQuery, partnerProductsQuery } from '../lib/queries'

interface PartnerTopbarProps {
  name: string
  logoUrl: string | null
}

const MAX_RESULTS = 5

/**
 * Topbar Partner Portal desktop: kolom cari produk/event + identitas partner.
 * Pencarian dilakukan di client dari data katalog & event yang sudah dimiliki
 * partner (jumlahnya kecil), dan baru dimuat saat kolom cari difokuskan.
 */
export default function PartnerTopbar({ name, logoUrl }: PartnerTopbarProps) {
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const { data: products = [] } = useQuery({
    ...partnerProductsQuery,
    enabled: armed,
  })
  const { data: events = [] } = useQuery({
    ...partnerEventsQuery,
    enabled: armed,
  })

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const productHits = products
    .filter((p) => matchesSearch(keyword, p.name, p.code))
    .slice(0, MAX_RESULTS)
  const eventHits = events
    .filter((e) => matchesSearch(keyword, e.name, e.location))
    .slice(0, MAX_RESULTS)
  const hasKeyword = keyword.trim().length > 0
  const noHits = productHits.length === 0 && eventHits.length === 0

  function close() {
    setOpen(false)
    setKeyword('')
  }

  return (
    <header className="pm-topbar">
      <div ref={boxRef} className="relative w-full max-w-[362px]">
        <Search
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--app-text-soft)' }}
        />
        <input
          type="search"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setArmed(true)
            setOpen(true)
          }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Cari produk, event..."
          aria-label="Cari produk atau event"
          className="app-input pl-10"
          style={{ height: 42, borderRadius: 12 }}
        />

        {open && hasKeyword && (
          <div
            className="app-card absolute left-0 right-0 top-[calc(100%+6px)] z-50 flex flex-col gap-1 p-2"
            style={{ boxShadow: '0 12px 32px rgba(43,33,24,0.12)' }}
          >
            {noHits && (
              <p
                className="px-3 py-2 text-sm"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Tidak ada produk atau event yang cocok.
              </p>
            )}
            {productHits.map((p) => (
              <Link
                key={p.id}
                to="/partner/katalog/$id"
                params={{ id: p.id }}
                onClick={close}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline hover:bg-[var(--pm-tint)]"
                style={{ color: 'inherit' }}
              >
                <Package size={15} style={{ color: 'var(--app-accent)' }} />
                <span className="truncate font-medium">{p.name}</span>
                <span
                  className="ml-auto text-[11px]"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  Produk
                </span>
              </Link>
            ))}
            {eventHits.map((e) => (
              <Link
                key={e.id}
                to="/partner/event/$id"
                params={{ id: e.id }}
                onClick={close}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline hover:bg-[var(--pm-tint)]"
                style={{ color: 'inherit' }}
              >
                <CalendarDays
                  size={15}
                  style={{ color: 'var(--app-accent)' }}
                />
                <span className="truncate font-medium">{e.name}</span>
                <span
                  className="ml-auto text-[11px]"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  Event
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <PartnerLogo
          name={name}
          logoUrl={logoUrl}
          size={36}
          shape="circle"
          initials={partnerInitials(name)}
          className="pm-display text-xs"
        />
        <span className="text-[13px] font-bold">{name}</span>
      </div>
    </header>
  )
}
