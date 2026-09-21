/**
 * Template chat WhatsApp buat invoice/tagih.
 *
 * Tiap user bisa bikin template sendiri (disimpan di `users.wa_message_template`).
 * Template pakai placeholder `{variabel}` yang otomatis disubstitui dengan data
 * asli saat pesan dirender. Kalau user belum pernah set template, dipakai
 * DEFAULT_WA_MESSAGE_TEMPLATE (format pesan yang lama).
 */

export const DEFAULT_WA_MESSAGE_TEMPLATE = [
  'Halo kak {customer}, ini invoice belanja di *{event}* ya kak, bisa dicek detailnya di link ini: {link}',
  '',
  'Subtotal: {subtotal}',
  'Fee jastip: {fee}',
  '*Total Tagihan: {total}*',
  '{bankLine}',
  'mohon dikirim bukti transfernya ya kak',
  '',
  'Terima kasih sudah berbelanja di {brand}!',
].join('\n')

export interface MessageTemplateContext {
  customer: string
  event: string
  link: string
  subtotal: string
  fee: string
  total: string
  bank: string
  bankAccount: string
  brand: string
  dp?: string
  sisa?: string
}

export interface MessageTemplateVariable {
  key: string
  label: string
  description: string
}

/** Daftar variabel yang didukung — dipakai juga buat chips di UI modal. */
export const MESSAGE_TEMPLATE_VARIABLES: MessageTemplateVariable[] = [
  { key: '{customer}', label: '{customer}', description: 'Nama pelanggan' },
  { key: '{event}', label: '{event}', description: 'Nama event belanja' },
  {
    key: '{link}',
    label: '{link}',
    description: 'Link halaman tagih/invoice',
  },
  {
    key: '{subtotal}',
    label: '{subtotal}',
    description: 'Total harga barang',
  },
  { key: '{fee}', label: '{fee}', description: 'Total fee jastip' },
  {
    key: '{total}',
    label: '{total}',
    description: 'Total tagihan (subtotal + fee)',
  },
  {
    key: '{dp}',
    label: '{dp}',
    description: 'Nominal DP yang sudah dibayar',
  },
  {
    key: '{sisa}',
    label: '{sisa}',
    description: 'Sisa tagihan yang harus dibayar',
  },
  {
    key: '{bank}',
    label: '{bank}',
    description: 'Nama bank/e-wallet aktif (Profil → Pembayaran)',
  },
  {
    key: '{bankAccount}',
    label: '{bankAccount}',
    description: 'No. rekening/akun bank/e-wallet aktif (Profil → Pembayaran)',
  },
  {
    key: '{bankLine}',
    label: '{bankLine}',
    description:
      'Baris "Transfer ke ..." — otomatis hupar bila bank belum diatur',
  },
  {
    key: '{brand}',
    label: '{brand}',
    description: 'Nama brand jastip (atau nama user)',
  },
]

/** Contoh data untat live-preview di modal template. */
export const MESSAGE_TEMPLATE_SAMPLE: MessageTemplateContext = {
  customer: 'Nia',
  event: 'Event Shopping 2026',
  link: 'https://jastip.app/tagihan/ab12cd/xy34',
  subtotal: 'Rp 1.500.000',
  fee: 'Rp 150.000',
  total: 'Rp 1.650.000',
  dp: 'Rp 500.000',
  sisa: 'Rp 1.150.000',
  bank: 'BCA',
  bankAccount: '1234567890',
  brand: 'Jastip by Mici',
}

export function renderMessageTemplate(
  template: string,
  context: MessageTemplateContext,
) {
  const bankLine =
    context.bank.trim() && context.bankAccount.trim()
      ? `Transfer ke ${context.bank.trim()} ${context.bankAccount.trim()}`
      : ''

  const values: Record<string, string> = {
    '{customer}': context.customer,
    '{event}': context.event,
    '{link}': context.link,
    '{subtotal}': context.subtotal,
    '{fee}': context.fee,
    '{total}': context.total,
    '{dp}': context.dp ?? '',
    '{sisa}': context.sisa ?? '',
    '{bank}': context.bank,
    '{bankAccount}': context.bankAccount,
    '{bankLine}': bankLine,
    '{brand}': context.brand,
  }

  let result = template
  for (const [key, value] of Object.entries(values)) {
    // Fungsi replacement supaya karakter $ \ dalam value diterbaliter
    // (nggak diinterpretasi as special replacement pattern).
    result = result.replaceAll(key, () => value)
  }

  // Normalisasi baris kosong: maksimun satu baris kosong sa disebelahan
  // (WA tampil baris kosong multiple sama saja satu).
  return result.replace(/\n{3,}/g, '\n\n').trim()
}