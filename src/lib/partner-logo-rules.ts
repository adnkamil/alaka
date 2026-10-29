/** Alamat logo partner; `version` (logoUpdatedAt) mengganti URL saat logo diganti. */
export function partnerLogoUrl(
  partnerId: string,
  logoUpdatedAt: Date | string | null,
): string | null {
  if (!logoUpdatedAt) return null
  return `/api/partner-logo/${partnerId}?v=${new Date(logoUpdatedAt).getTime()}`
}

/** Inisial untuk avatar pengganti logo ("Wikibex Official" -> "W"). */
export function partnerInitial(name: string): string {
  return name.trim().at(0)?.toUpperCase() ?? '?'
}

/** Inisial dua huruf dari nama partner ("Wikibex Official" -> "WO"). */
export function partnerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
