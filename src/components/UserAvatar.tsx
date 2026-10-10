import { useState } from 'react'

interface UserAvatarProps {
  /** Id BRAND pemilik foto (bukan id user). */
  brandId?: string
  name?: string
  /** ISO string; null/undefined = belum punya foto (tampil inisial). */
  avatarUpdatedAt?: string | null
  className?: string
}

/**
 * Foto brand bulat. Kalau user belum upload (atau fotonya gagal dimuat),
 * jatuh ke inisial nama seperti sebelumnya.
 */
export default function UserAvatar({
  brandId,
  name,
  avatarUpdatedAt,
  className = '',
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  // `?v=` bikin URL berubah tiap foto diganti, jadi cache browser yang lama
  // (1 tahun) tidak pernah menyajikan foto usang.
  const src =
    brandId && avatarUpdatedAt
      ? `/api/avatar/${brandId}?v=${new Date(avatarUpdatedAt).getTime()}`
      : null

  return (
    <div className={`app-avatar shrink-0 overflow-hidden ${className}`}>
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        (name?.at(0)?.toUpperCase() ?? '?')
      )}
    </div>
  )
}
