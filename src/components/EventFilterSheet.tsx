import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'

export type Lokasi = 'online' | 'offline'

/** Pilihan cepat waktu dalam hari. 0 = hari ini. */
export const PRESET_DAYS: number[] = [0, 7, 30]
export const DEFAULT_CUSTOM_DAYS = 14

export function waktuLabel(days: number) {
  return days === 0 ? 'Hari ini' : `${days} hari`
}

export function lokasiLabel(lokasi: Lokasi) {
  return lokasi === 'online' ? 'Online' : 'Offline'
}

export function parseCustomDays(text: string): number | null {
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : null
}

export function FilterChip({
  active,
  disabled = false,
  onClick,
  icon,
  trailing,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon?: ReactNode
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium disabled:cursor-not-allowed"
      style={{
        borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
        background: active ? 'var(--app-accent-soft)' : 'var(--app-card)',
        color: disabled
          ? 'var(--app-text-mute)'
          : active
            ? 'var(--app-accent)'
            : 'var(--app-text)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      {children}
      {trailing}
    </button>
  )
}

type Props = {
  initialWaktu: number | null
  initialLokasi: Lokasi | null
  count: (waktu: number | null, lokasi: Lokasi | null) => number
  onApply: (waktu: number | null, lokasi: Lokasi | null) => void
  onClose: () => void
}

/** Bottom sheet filter: Waktu (preset atau custom) dan Lokasi. */
export default function EventFilterSheet({
  initialWaktu,
  initialLokasi,
  count,
  onApply,
  onClose,
}: Props) {
  const [waktu, setWaktu] = useState<number | null>(initialWaktu)
  const [lokasi, setLokasi] = useState<Lokasi | null>(initialLokasi)
  const isCustom = waktu !== null && !PRESET_DAYS.includes(waktu)
  const [customText, setCustomText] = useState(
    String(isCustom ? waktu : DEFAULT_CUSTOM_DAYS),
  )

  useBackToClose(true, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = count(waktu, lokasi)

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
        aria-label="Filter event"
        className="relative w-full max-w-lg rounded-t-3xl px-5 pb-8 pt-3"
        style={{ background: 'var(--app-card)' }}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: 'var(--app-border)' }}
        />

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">Filter</h2>
          <button
            type="button"
            onClick={() => {
              setWaktu(null)
              setLokasi(null)
            }}
            className="text-sm font-semibold"
            style={{ color: 'var(--app-accent)' }}
          >
            Reset
          </button>
        </div>

        <section className="mb-6">
          <h3 className="mb-2.5 text-sm font-semibold">Waktu</h3>
          <div className="flex flex-wrap gap-2">
            {PRESET_DAYS.map((days) => (
              <FilterChip
                key={days}
                active={waktu === days}
                onClick={() => setWaktu(days)}
              >
                {waktuLabel(days)}
              </FilterChip>
            ))}
            <FilterChip
              active={isCustom}
              onClick={() => {
                const n = parseCustomDays(customText) ?? DEFAULT_CUSTOM_DAYS
                setCustomText(String(n))
                setWaktu(n)
              }}
            >
              Custom
            </FilterChip>
          </div>

          {isCustom && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span>Dalam</span>
              <input
                inputMode="numeric"
                value={customText}
                onChange={(e) => {
                  setCustomText(e.target.value)
                  const n = parseCustomDays(e.target.value)
                  if (n !== null) setWaktu(n)
                }}
                aria-label="Jumlah hari ke depan"
                className="h-10 w-14 rounded-lg border text-center font-semibold"
                style={{
                  borderColor: 'var(--app-border)',
                  background: 'var(--app-card)',
                  color: 'var(--app-text)',
                }}
              />
              <span>hari ke depan</span>
            </div>
          )}

          <p
            className="mt-3 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Event yang tanggalnya masuk di rentang itu ikut tampil, termasuk yang
            sedang berlangsung.
          </p>
        </section>

        <section className="mb-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lokasi</h3>
            {lokasi && (
              <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                1 dipilih
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {(['online', 'offline'] as const).map((item) => {
              const active = lokasi === item
              return (
                <FilterChip
                  key={item}
                  active={active}
                  onClick={() => setLokasi(active ? null : item)}
                  icon={active ? <Check size={14} /> : null}
                >
                  {lokasiLabel(item)}
                </FilterChip>
              )
            })}
          </div>
          <p
            className="mt-3 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Offline: event langsung di suatu tempat. Online: PO ke brand lewat
            website atau chat admin, tanpa event fisik.
          </p>
        </section>

        <button
          type="button"
          onClick={() => onApply(waktu, lokasi)}
          className="h-12 w-full rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--app-accent)' }}
        >
          Tampilkan {total} event
        </button>
      </div>
    </div>
  )
}
