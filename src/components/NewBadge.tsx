/** Penanda kecil "New" buat menu/fitur yang baru dirilis. */
export default function NewBadge() {
  return (
    <span
      className="app-badge flex-shrink-0"
      style={{
        background: 'var(--app-accent-soft)',
        color: 'var(--app-accent)',
      }}
    >
      New
    </span>
  )
}
