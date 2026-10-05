import { Landmark } from 'lucide-react'
import UserAvatar from './UserAvatar'

interface InvoiceBrandMarkProps {
  userId: string
  name: string
  /** ISO string; null = brand belum punya foto. */
  avatarUpdatedAt: string | null
}

/**
 * Penanda brand di pojok kanan header invoice: foto brand kalau sudah
 * diupload, kalau belum ikon bank seperti sebelumnya. Dipakai di invoice
 * internal dan halaman tagihan publik supaya tampilannya sama.
 */
export default function InvoiceBrandMark({
  userId,
  name,
  avatarUpdatedAt,
}: InvoiceBrandMarkProps) {
  if (!avatarUpdatedAt) {
    return (
      <span className="app-icon-tile h-11 w-11" style={{ borderRadius: 999 }}>
        <Landmark size={20} />
      </span>
    )
  }

  return (
    <UserAvatar
      userId={userId}
      name={name}
      avatarUpdatedAt={avatarUpdatedAt}
      className="h-14 w-14 border-2 border-white text-lg shadow-sm"
    />
  )
}
