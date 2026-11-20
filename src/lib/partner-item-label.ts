// Tipe dan helper katalog item partner untuk event jastiper. Sengaja tanpa
// import database: dipakai juga oleh komponen UI.

export interface PartnerItemVariant {
  id: string
  /** Gabungan ukuran dan variasi, misalnya "S / Marine Cove". Kosong kalau produk tanpa opsi. */
  label: string
  size: string | null
  variation: string | null
  price: number
  /** Stok saat katalog dimuat. 0 = habis, tidak bisa ditambahkan ke pesanan. */
  stock: number
}

export interface PartnerItemRule {
  id: string
  name: string
  minQty: number
  bundlePrice: number
  /**
   * Ukuran yang ikut aturan, per produk (productId -> nama ukuran). Varian
   * berukuran hanya ikut kalau ukurannya ada di sini; lihat ruleCoversVariant.
   */
  productSizes: Record<string, Array<string>>
}

export interface PartnerItemProduct {
  id: string
  name: string
  /** URL foto produk, null kalau belum ada foto. */
  photoUrl?: string | null
  /** Semua aturan paket yang memuat produk ini (kosong kalau tidak ada / bukan PRO). */
  rules?: Array<PartnerItemRule>
  variants: Array<PartnerItemVariant>
}

export interface PartnerEventItemCatalog {
  /** True kalau event terhubung ke partner. Di event ini nama barang tidak boleh diketik bebas. */
  isPartnerEvent: boolean
  /** Aturan paket aktif di event ini, untuk filter katalog. */
  rules?: Array<PartnerItemRule>
  products: Array<PartnerItemProduct>
}

export function variantLabel(options: {
  size: string | null
  variation: string | null
}): string {
  return [options.size, options.variation].filter(Boolean).join(' / ')
}

/** Nama barang yang tersimpan: "Kana Longsleeve Set (S / Marine Cove)". */
export function partnerItemName(productName: string, label: string): string {
  return label ? `${productName} (${label})` : productName
}

/** Ukuran yang umum: S, XL, 3XL, All size, atau angka seperti 39. */
const SIZE_ONLY = /^(?:\d?x{0,3}[sl]|m|\d{1,2}(?:\.\d)?|all ?size|one ?size|free ?size)$/i

/**
 * Pecah nama barang tersimpan "Produk (Ukuran / Variasi)" jadi tiga bagian.
 * Kalau hanya ada satu opsi di dalam kurung, ukuran dikenali dari bentuknya
 * (S, XL, 39, All size); selain itu dianggap variasi.
 */
export function splitItemName(name: string): {
  product: string
  size: string | null
  variation: string | null
} {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name)
  const parts = m ? m[2].split(' / ').map((p) => p.trim()).filter(Boolean) : []
  if (!m || parts.length === 0) {
    return { product: name, size: null, variation: null }
  }
  const product = m[1] || name
  if (parts.length === 1) {
    return SIZE_ONLY.test(parts[0])
      ? { product, size: parts[0], variation: null }
      : { product, size: null, variation: parts[0] }
  }
  return { product, size: parts[0], variation: parts.slice(1).join(' / ') }
}
