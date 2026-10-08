/**
 * Template chat WhatsApp buat invoice/tagih.
 *
 * Tiap user bisa bikin template sendiri (disimpan di `users.wa_message_template`).
 * Template pakai placeholder `{variabel}` yang otomatis disubstitui dengan data
 * asli saat pesan dirender. Kalau user belum pernah set template, dipakai
 * DEFAULT_WA_MESSAGE_TEMPLATE.
 *
 * Variabel {tagihan} adalah blok ringkasan tagihan yang otomatis menyesuaikan
 * status DP — tidak perlu variabel terpisah {subtotal}, {fee}, {total}, {dp},
 * {sisa}. Variabel-variabel lama itu masih dirender untuk backward compat
 * template kustom yang sudah ada, tapi tidak ditampilkan di chips UI.
 *
 * Variabel {listItem} berisi daftar barang yang dipesan, satu baris per
 * barang dengan bullet "•" (tanpa "Rp", pakai pemisah ribuan titik).
 */

export const DEFAULT_WA_MESSAGE_TEMPLATE = [
  'Halo kak {customer}, ini invoice belanja di *{event}* ya kak, bisa dicek detailnya di link ini:',
  '{link}',
  '',
  '{tagihan}',
  '',
  '{bankLine}',
  'mohon dikirim bukti transfernya ya kak',
  '',
  'Terima kasih sudah berbelanja di {brand}!',
].join('\n')

/** Bentuk minimal satu barang pesanan untuk {listItem}. */
export interface MessageTemplateItem {
  name: string
  qty: number
  originalPrice: string | number
  fee: string | number
}

/** Angka dengan pemisah ribuan titik, tanpa \"Rp\" (100000 -> \"100.000\"). */
function formatNumber(value: string | number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(
    Number(value),
  )
}

export interface BuildItemListOptions {
  /**
   * Kalau true, fee tidak dipecah dari harga: satu baris cuma menampilkan
   * harga nett (harga asli + fee). Dipakai waktu event menyalakan
   * `hide_fee` (lihat `events.hide_fee`).
   */
  hideFee?: boolean
}

/**
 * Daftar barang untuk variabel {listItem}. Satu baris per barang:
 *   • Nama barang (harga + fee)
 *   • Nama barang x2 (harga + fee)   <- "xN" hanya muncul kalau qty > 1
 * Harga dan fee adalah nilai PER UNIT (sama seperti di invoice).
 * Dengan `hideFee`, yang tampil cuma harga nett tanpa rincian fee.
 */
export function buildItemList(
  items: Array<MessageTemplateItem>,
  options: BuildItemListOptions = {},
): string {
  return items
    .map((item) => {
      // Nama satu baris saja supaya satu barang = satu bullet di WhatsApp.
      const name = item.name.replace(/\s+/g, ' ').trim()
      const qty = item.qty > 1 ? ` x${item.qty}` : ''
      const price = options.hideFee
        ? formatNumber(Number(item.originalPrice) + Number(item.fee))
        : `${formatNumber(item.originalPrice)} + ${formatNumber(item.fee)}`
      return `• ${name}${qty} (${price})`
    })
    .join('\n')
}

export interface MessageTemplateContext {
  customer: string
  event: string
  link: string
  /** Dipakai untuk backward compat {subtotal}. */
  subtotal: string
  /** Dipakai untuk backward compat {fee}. */
  fee: string
  /** Total tagihan (subtotal + fee). Dipakai untuk {tagihan} dan backward compat {total}. */
  total: string
  bank: string
  bankAccount: string
  brand: string
  /** Nominal DP yang sudah dibayar. "Rp 0" jika belum DP. */
  dp: string
  /** Sisa tagihan setelah DP. Sama dengan total jika belum DP. */
  sisa: string
  /** Daftar barang hasil `buildItemList`, untuk {listItem}. */
  itemList: string
}

export interface MessageTemplateVariable {
  key: string
  label: string
  description: string
}

/**
 * Daftar variabel yang ditampilkan sebagai chips di UI.
 * {subtotal}, {fee}, {total}, {dp}, {sisa} sudah digabung ke {tagihan}
 * supaya template lebih ringkas dan otomatis handle status DP.
 */
export const MESSAGE_TEMPLATE_VARIABLES: MessageTemplateVariable[] = [
  { key: '{customer}', label: '{customer}', description: 'Nama pelanggan' },
  { key: '{event}', label: '{event}', description: 'Nama event belanja' },
  {
    key: '{link}',
    label: '{link}',
    description: 'Link halaman tagih/invoice',
  },
  {
    key: '{tagihan}',
    label: '{tagihan}',
    description:
      'Blok tagihan otomatis: total, DP, dan tagihan akhir — menyesuaikan status DP secara otomatis',
  },
  {
    key: '{listItem}',
    label: '{listItem}',
    description:
      'Daftar barang yang dipesan, satu baris per barang: • nama (harga + fee). Kalau event menyembunyikan rincian fee, yang tampil harga nett-nya saja',
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
      'Baris "Transfer ke ..." — otomatis hilang bila bank belum diatur',
  },
  {
    key: '{brand}',
    label: '{brand}',
    description: 'Nama brand jastip (atau nama user)',
  },
]

/** Contoh data untuk live-preview di halaman template (pakai contoh status DP). */
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
  brand: 'ALAKA',
  itemList: buildItemList([
    {
      name: 'Tas Charles & Keith',
      qty: 1,
      originalPrice: 1000000,
      fee: 100000,
    },
    { name: 'Sunscreen Biore', qty: 2, originalPrice: 250000, fee: 25000 },
  ]),
}

export function renderMessageTemplate(
  template: string,
  context: MessageTemplateContext,
) {
  const bankLine =
    context.bank.trim() && context.bankAccount.trim()
      ? `Transfer ke ${context.bank.trim()} ${context.bankAccount.trim()}`
      : ''

  // Blok {tagihan}: selalu tampilkan tiga baris supaya customer jelas
  // berapa total, sudah bayar berapa, dan sisa yang harus ditransfer.
  // Kalau belum DP, dp = "Rp 0" dan sisa = total — tetap konsisten.
  const tagihanBlock = [
    `Tagihan: ${context.total}`,
    `DP: ${context.dp}`,
    `*Tagihan akhir: ${context.sisa}*`,
  ].join('\n')

  const values: Record<string, string> = {
    '{customer}': context.customer,
    '{event}': context.event,
    '{link}': context.link,
    // Backward compat — template lama yang masih pakai variabel individual.
    '{subtotal}': context.subtotal,
    '{fee}': context.fee,
    '{total}': context.total,
    '{dp}': context.dp,
    '{sisa}': context.sisa,
    '{bank}': context.bank,
    '{bankAccount}': context.bankAccount,
    '{bankLine}': bankLine,
    '{brand}': context.brand,
    '{tagihan}': tagihanBlock,
    '{listItem}': context.itemList,
  }

  let result = template
  for (const [key, value] of Object.entries(values)) {
    // Fungsi replacement supaya karakter $ \ dalam value tidak
    // diinterpretasi sebagai special replacement pattern.
    result = result.replaceAll(key, () => value)
  }

  // Normalisasi baris kosong: maksimal satu baris kosong berurutan
  // (WA menampilkan baris kosong multiple sama seperti satu).
  return result.replace(/\n{3,}/g, '\n\n').trim()
}
