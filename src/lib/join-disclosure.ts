/**
 * Keterangan privasi di sheet "Ikut Event" untuk event milik PARTNER.
 *
 * Isinya HARUS cocok dengan data yang benar-benar dilihat partner di tab
 * Jastiper (`listCalendarEventParticipants`): nama brand, nomor WhatsApp,
 * tanggal ikut, dan JUMLAH pesanan di event itu — bukan isi pesanan atau data
 * customer. Kalau kolom di query itu bertambah, ubah teks ini juga.
 */
export const JOIN_DISCLOSURE_SHARED = [
  'nama brand',
  'nomor WhatsApp',
  'tanggal kamu ikut',
  'jumlah pesananmu di event ini',
] as const

export function joinDisclosureText(organizerName: string): string {
  const list = JOIN_DISCLOSURE_SHARED
  const shared = `${list.slice(0, -1).join(', ')}, dan ${list[list.length - 1]}`
  return `Dengan ikut, ${organizerName} bisa melihat ${shared}. Isi pesanan dan data customermu tidak ikut dibagikan.`
}
