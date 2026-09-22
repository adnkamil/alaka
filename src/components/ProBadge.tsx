/**
 * Penanda kecil "PRO" buat kontrol yang cuma kebuka di paket PRO (trial & PRO
 * punya akses penuh, FREE terkunci).
 */
export default function ProBadge() {
  return (
    <span
      className="app-badge flex-shrink-0"
      style={{
        background: 'var(--app-accent-soft)',
        color: 'var(--app-accent)',
      }}
    >
      PRO
    </span>
  )
}
