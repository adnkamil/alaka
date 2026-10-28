import { useState } from 'react'
import { partnerInitial } from '../lib/partner-logo-rules'

interface PartnerLogoProps {
  name: string
  /** Alamat logo (`partnerLogoUrl`); null = belum ada logo (tampil inisial). */
  logoUrl: string | null
  /** Sisi kotak dalam px. */
  size?: number
  /** `circle` untuk avatar bulat (Beranda); default kotak bersudut membulat. */
  shape?: 'rounded' | 'circle'
  /** Pengganti inisial default (satu huruf) saat belum ada logo, mis. "WO". */
  initials?: string
  className?: string
}

/**
 * Logo partner persegi bersudut membulat. Kalau belum ada logo (atau gagal
 * dimuat) jatuh ke inisial nama, sama seperti avatar brand jastiper.
 */
export default function PartnerLogo({
  name,
  logoUrl,
  size = 40,
  shape = 'rounded',
  initials,
  className = '',
}: PartnerLogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = logoUrl !== null && failedSrc !== logoUrl

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden font-bold ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? '9999px' : Math.round(size * 0.28),
        background: 'var(--app-accent-soft)',
        color: 'var(--app-accent)',
        fontSize: Math.round(size * 0.4),
      }}
    >
      {showImage ? (
        <img
          src={logoUrl}
          alt=""
          draggable={false}
          onError={() => setFailedSrc(logoUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        (initials ?? partnerInitial(name))
      )}
    </div>
  )
}
