import { APP_TIME_ZONE } from './timezone'

/**
 * Format nomor HP Indonesia jadi kelompok 4 digit untuk tampilan,
 * misal "085397356608" -> "0853-9735-6608" dan
 * "0812345678901" -> "0812-3456-78901" (sisa digit terakhir digabung
 * ke kelompok sebelumnya, bukan jadi kelompok kecil sendiri).
 */
export function formatPhoneNumber(phone: string | null | undefined) {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return digits

  const groups: Array<string> = []
  let i = 0
  while (i < digits.length) {
    const remaining = digits.length - i
    if (remaining < 8) {
      groups.push(digits.slice(i))
      break
    }
    groups.push(digits.slice(i, i + 4))
    i += 4
  }
  return groups.join('-')
}

/**
 * Ubah nomor HP Indonesia ke format internasional yang dipakai wa.me,
 * misal "085397356608" atau "+6285397356608" -> "6285397356608".
 */
export function toWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

export function buildWhatsAppBusinessLink(phone: string, message: string) {
  const number = toWhatsAppNumber(phone)
  const text = encodeURIComponent(message)

  // Fallback kalau WA Business tidak terpasang
  const fallback = encodeURIComponent(`https://wa.me/${number}?text=${text}`)

  return (
    `intent://send?phone=${number}&text=${text}` +
    `#Intent;scheme=whatsapp;package=com.whatsapp.w4b;` +
    `S.browser_fallback_url=${fallback};end`
  )
}
export function buildWhatsAppLink(phone: string, message: string) {
  const number = toWhatsAppNumber(phone)
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
export function openWhatsApp(phone: string, message: string) {
  const isAndroid = /android/i.test(navigator.userAgent)

  window.location.href = isAndroid
    ? buildWhatsAppBusinessLink(phone, message)
    : buildWhatsAppLink(phone, message)
}

/**
 * Cek format nomor HP Indonesia secara longgar: setelah kode negara/awalan
 * 0 dibuang, harus diawali angka 8 dan panjangnya wajar (9-13 digit).
 * Ini cuma validasi FORMAT, bukan cek apakah nomornya beneran aktif/punya WA.
 */
/**
 * Tanggal panjang bahasa Indonesia, mis. "12 Agustus 2026". Terima `Date`,
 * string ISO (hasil serialisasi server function), atau null — null jadi string
 * kosong supaya aman dipakai langsung di JSX.
 *
 * Zona waktu dipatok ke `APP_TIME_ZONE` (WIB), bukan zona perangkat: tanggalnya
 * tanggal bisnis, jadi harus sama walau HP user lagi di luar negeri.
 */
export function formatDate(date: Date | string | null | undefined) {
  if (!date) return ''
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: APP_TIME_ZONE,
  })
}

export function isValidIndonesianPhone(phone: string | null | undefined) {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('62')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits
  return /^8\d{8,12}$/.test(normalized)
}
