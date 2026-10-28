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
