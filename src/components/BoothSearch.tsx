import { useEffect, useMemo, useRef, useState } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { MapPin, Search, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { listCalendarEventBooths } from '../lib/calendar-events-functions'
import { boothNeighbors, searchBooths } from '../lib/event-booth'
import type { EventBooth } from '../lib/event-booth'

/** Hasil yang dirender dibatasi supaya ketikan 1 huruf tetap ringan. */
const MAX_RESULTS = 50

const boothsQuery = (calendarEventId: string) =>
  queryOptions({
    queryKey: ['calendar-event-booths', calendarEventId],
    queryFn: () => listCalendarEventBooths({ data: { id: calendarEventId } }),
    // Data booth jarang berubah selama event berlangsung.
    staleTime: 30 * 60_000,
  })

/**
 * Tombol "Cari Booth" untuk event offline. Tidak tampil kalau event belum
 * punya data booth. Dipakai di detail event kalender dan halaman event
 * belanja jastiper yang terhubung ke event kalender.
 */
export default function BoothSearchButton({
  calendarEventId,
  className = '',
}: {
  calendarEventId: string
  className?: string
}) {
  const { data: booths = [] } = useQuery(boothsQuery(calendarEventId))
  const [open, setOpen] = useState(false)

  if (booths.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`app-btn-outline h-11 w-full gap-2 ${className}`}
      >
        <MapPin size={18} />
        Cari Booth
      </button>
      {open && (
        <BoothSearchSheet booths={booths} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function BoothSearchSheet({
  booths,
  onClose,
}: {
  booths: EventBooth[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useBackToClose(true, onClose)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => searchBooths(booths, query), [booths, query])
  const areaCount = useMemo(
    () => new Set(booths.map((b) => b.area)).size,
    [booths],
  )
  const hasQuery = query.trim() !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cari booth"
        className="relative flex w-full max-w-lg flex-col rounded-t-3xl pt-3"
        style={{ background: 'var(--app-card)', height: '85dvh' }}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 flex-shrink-0 rounded-full"
          style={{ background: 'var(--app-border)' }}
        />

        <div className="flex flex-shrink-0 items-center justify-between px-5">
          <h2 className="text-lg font-bold">Cari Booth</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-shrink-0 px-5 pb-3 pt-2">
          <div className="relative">
            <Search
              size={18}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--app-text-mute)' }}
            />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nama brand atau kode booth"
              aria-label="Nama brand atau kode booth"
              className="app-input pl-10 text-base"
            />
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {!hasQuery ? (
            <p
              className="pt-6 text-center text-sm"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {booths.length} brand di {areaCount} area. Ketik nama brand untuk
              melihat lokasi booth-nya.
            </p>
          ) : results.length === 0 ? (
            <p
              className="pt-6 text-center text-sm"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Brand "{query.trim()}" tidak ada di daftar. Coba ejaan lain atau
              tanya petugas Ask Me Counter.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {results.slice(0, MAX_RESULTS).map((booth) => (
                  <BoothRow
                    key={`${booth.code}|${booth.brand}`}
                    booth={booth}
                    neighbors={boothNeighbors(booths, booth)}
                  />
                ))}
              </ul>
              {results.length > MAX_RESULTS && (
                <p
                  className="pt-3 text-center text-xs"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  {results.length - MAX_RESULTS} hasil lain. Ketik lebih
                  lengkap untuk mempersempit.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BoothRow({
  booth,
  neighbors,
}: {
  booth: EventBooth
  neighbors: string[]
}) {
  const shown = neighbors.slice(0, 3)
  const more = neighbors.length - shown.length
  return (
    <li className="app-card flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{booth.brand}</p>
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {booth.area}
        </p>
        {shown.length > 0 && (
          <p
            className="mt-0.5 line-clamp-2 text-xs"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Satu booth dengan {shown.join(', ')}
            {more > 0 && ` +${more} lainnya`}
          </p>
        )}
      </div>
      <span
        className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums"
        style={{
          background: 'var(--app-accent-soft)',
          color: 'var(--app-accent)',
        }}
      >
        {booth.code}
      </span>
    </li>
  )
}
