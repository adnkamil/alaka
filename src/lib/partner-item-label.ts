// Tipe dan helper katalog item partner untuk event jastiper. Sengaja tanpa
// import database: dipakai juga oleh komponen UI.

export interface PartnerItemVariant {
  id: string
  /** Gabungan ukuran dan variasi, misalnya "S / Marine Cove". Kosong kalau produk tanpa opsi. */
  label: string
  size: string | null
  variation: string | null
  price: number
}

export interface PartnerItemProduct {
  id: string
  name: string
  variants: Array<PartnerItemVariant>
}

export interface PartnerEventItemCatalog {
  /** True kalau event terhubung ke partner. Di event ini nama barang tidak boleh diketik bebas. */
  isPartnerEvent: boolean
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
