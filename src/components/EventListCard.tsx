import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { CalendarDays, Globe, MapPin, MessageCircle } from 'lucide-react'

export const EVENT_ROW_ICONS = {
  pin: MapPin,
  globe: Globe,
  calendar: CalendarDays,
  chat: MessageCircle,
} satisfies Record<string, LucideIcon>

export type EventRowIcon = keyof typeof EVENT_ROW_ICONS

export type EventListCardProps = {
  eventId: string
  name: string
  /** Tanggal (angka), contoh: 21. */
  day: number
  /** Singkatan bulan huruf kapital, contoh: "OKT". */
  month: string
  /** Singkatan hari, contoh: "Rab". */
  weekday: string
  /** Label status, contoh: "Sedang Berlangsung" atau "3 hari lagi". */
  tag?: string
  /** Baris detail di bawah nama event. */
  rows: { icon: EventRowIcon; text: string }[]
  /** Redupkan kartu (misalnya event yang sudah lewat). */
  dimmed?: boolean
}

/** Kartu daftar event sesuai desain Figma. Tidak menampilkan brand. */
export default function EventListCard({
  eventId,
  name,
  day,
  month,
  weekday,
  rows,
  dimmed,
}: EventListCardProps) {
  return (
    <Link
      to="/kalender/$eventId"
      params={{ eventId }}
      className="app-card flex items-stretch gap-4 px-4 py-3 no-underline"
      style={dimmed ? { opacity: 0.65 } : undefined}
    >
      <span
        className="flex w-14 flex-shrink-0 flex-col items-center self-center overflow-hidden rounded-xl"
        style={{ background: 'var(--app-card)', border: '1px solid var(--app-border)' }}
      >
        <span
          className="w-full py-0.5 text-center text-[10px] font-bold text-white"
          style={{ background: 'var(--app-accent)' }}
        >
          {month}
        </span>
        <span className="pt-0.5 text-2xl font-semibold leading-7" style={{ color: 'var(--app-text)' }}>
          {day}
        </span>
        <span
          className="pb-0.5 text-[9px] font-medium"
          style={{ color: 'var(--app-text)' }}
        >
          {weekday}
        </span>
      </span>

      <span className="min-w-0 flex-1 items-center self-center">
        <span 
          className="block truncate text-[15.5px] font-bold leading-5"
          style={{
              color: 'var(--app-accent)',
            }}
          >
            {name}
          </span>
        <span className="mt-1 flex flex-col gap-1">
          {rows.map((row, index) => {
            const Icon = EVENT_ROW_ICONS[row.icon]
            return (
              <span
                key={index}
                className="flex items-center gap-1.5 text-[11px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                <Icon size={14} className="flex-shrink-0" />
                <span className="truncate">{row.text}</span>
              </span>
            )
          })}
        </span>
      </span>
    </Link>
  )
}
