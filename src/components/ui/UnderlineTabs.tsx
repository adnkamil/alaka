export interface UnderlineTabItem<TKey extends string> {
  key: TKey
  label: string
  /** Angka di badge kecil sebelah label. Kosong = tanpa badge. */
  count?: number
  /** Badge berwarna penuh saat jumlahnya > 0, untuk tab yang butuh tindakan. */
  highlight?: boolean
  /** Titik merah penanda ada yang perlu perhatian. */
  dot?: string
}

interface UnderlineTabsProps<TKey extends string> {
  items: ReadonlyArray<UnderlineTabItem<TKey>>
  value: TKey
  onChange: (key: TKey) => void
  ariaLabel: string
  className?: string
}

/**
 * Tab bergaris bawah untuk halaman partner. Tab aktif ditandai garis aksen,
 * jumlah tampil sebagai badge kecil. Kalau tab-nya banyak, baris bisa digeser
 * ke samping alih-alih turun ke baris baru.
 */
export default function UnderlineTabs<TKey extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = '',
}: UnderlineTabsProps<TKey>) {
  return (
    <div
      className={`flex gap-6 overflow-x-auto border-b [scrollbar-width:none] ${className}`}
      style={{ borderColor: 'var(--app-border)' }}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = value === item.key
        const urgent = item.highlight && (item.count ?? 0) > 0
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className="-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] font-semibold transition-colors"
            style={{
              borderColor: active ? 'var(--app-accent)' : 'transparent',
              color: active ? 'var(--app-text)' : 'var(--app-text-soft)',
            }}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className="pm-num rounded-full px-1.5 text-[11px] font-semibold leading-[18px]"
                style={
                  urgent
                    ? { background: 'var(--app-accent)', color: 'white' }
                    : {
                        background: active ? 'var(--app-accent-soft)' : 'var(--pm-tint)',
                        color: active ? 'var(--app-accent)' : 'var(--app-text-soft)',
                      }
                }
              >
                {item.count}
              </span>
            )}
            {item.dot && (
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: 'var(--app-danger)' }}
                title={item.dot}
                aria-label={item.dot}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
