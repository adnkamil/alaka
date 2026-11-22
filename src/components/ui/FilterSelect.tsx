import { ChevronDown } from 'lucide-react'

interface FilterSelectProps<T extends string> {
  /** Teks di depan nilai, mis. "Submit" → "Submit: Semua". */
  label: string
  value: T
  options: Array<{ value: T; label: string; disabled?: boolean }>
  onChange: (value: T) => void
}

/**
 * Dropdown filter ringkas untuk baris toolbar di atas tabel. Dipakai sebagai
 * pengganti deretan chip supaya filter tidak memakan satu baris sendiri.
 */
export default function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps<T>) {
  return (
    <label
      className="relative inline-flex h-[42px] shrink-0 items-center rounded-xl border pl-3.5 text-[13px] focus-within:border-[var(--app-accent)]"
      style={{ borderColor: 'var(--app-border)', background: 'var(--app-card)' }}
    >
      <span className="whitespace-nowrap" style={{ color: 'var(--app-text-soft)' }}>
        {label}:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className="h-full cursor-pointer appearance-none bg-transparent pl-1.5 pr-9 font-semibold outline-none"
        style={{ color: 'var(--app-text)' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--app-text-soft)' }}
      />
    </label>
  )
}
