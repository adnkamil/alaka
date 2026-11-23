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
  /** Foto per variasi (nama variasi -> URL). Variasi tanpa foto tidak punya entri. */
  variationPhotos?: Record<string, string>
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

/**
 * Label varian untuk ditampilkan: variasi dulu, baru ukuran, mis.
 * "Marine Cove / S". `variantLabel` tetap ukuran dulu karena dipakai untuk
 * menyusun nama barang yang disimpan.
 */
export function variantDisplayLabel(options: {
  size: string | null
  variation: string | null
}): string {
  return [options.variation, options.size].filter(Boolean).join(' / ')
}

/**
 * Nama barang katalog partner untuk ditampilkan: variasi dulu, baru ukuran,
 * mis. "Kana Longsleeve Set (Marine Cove / S)". Nama tersimpan tetap
 * "Produk (Ukuran / Variasi)"; ini hanya mengubah tampilan. Hanya untuk nama
 * yang dibuat `partnerItemName`; nama ketikan bebas pakai `itemDisplayName`.
 */
export function displayItemName(name: string): string {
  const { product, size, variation } = splitItemName(name)
  if (!size || !variation) return name
  return partnerItemName(product, variantDisplayLabel({ size, variation }))
}

/**
 * Nama barang pesanan untuk ditampilkan. Barang katalog partner diurutkan
 * variasi dulu; nama ketikan bebas jastiper dibiarkan apa adanya. Di event
 * yang terhubung ke partner semua nama berasal dari katalog, jadi barang yang
 * variannya sudah dihapus partner (`partnerVariantId` null) tetap diurutkan.
 */
export function itemDisplayName(
  item: { name: string; partnerVariantId?: string | null },
  partnerEvent = false,
): string {
  return item.partnerVariantId || partnerEvent ? displayItemName(item.name) : item.name
}

/**
 * Label baris paket di tagihan untuk ditampilkan, mis.
 * "80K / 2pcs: 2× Rok (XL / Hitam) + Jaket (L)" -> isinya variasi dulu.
 */
export function displayBundleLabel(label: string): string {
  const at = label.indexOf(': ')
  if (at <= 0) return label
  const items = label.slice(at + 2).split(' + ').map(displayItemName)
  return `${label.slice(0, at + 2)}${items.join(' + ')}`
}
