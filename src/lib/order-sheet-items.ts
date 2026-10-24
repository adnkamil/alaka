import { cleanBundleNames } from './item-bundle'

/**
 * Aturan kartu barang yang bisa dibuka-tutup di form Tambah/Edit Pesanan
 * (`AddOrderSheet`). Modulnya murni, jadi bisa diuji tanpa browser.
 */
interface ItemNameLike {
  name: string
  bundle: boolean
  bundleNames: Array<string>
}

interface ItemValidityLike extends ItemNameLike {
  originalPrice: number
}

/**
 * Judul kartu waktu ditutup. Paket bundling tampil sebagai "A + B" (sama
 * seperti nama yang tersimpan); string kosong = nama belum diisi.
 */
export function itemTitle(item: ItemNameLike) {
  return item.bundle ? cleanBundleNames(item.bundleNames) : item.name.trim()
}

/**
 * Index barang pertama yang belum lengkap (nama kosong atau harga asli 0),
 * atau -1 kalau semua sudah lengkap. Validasi bawaan browser (`required`)
 * cuma menjangkau kartu yang sedang terbuka — kartu yang ditutup tidak
 * dirender isinya — jadi pengecekan ini yang menjaga barang di kartu tertutup.
 */
export function firstIncompleteItemIndex(items: Array<ItemValidityLike>) {
  return items.findIndex(
    (item) => itemTitle(item).length === 0 || !(item.originalPrice > 0),
  )
}

/**
 * Kartu mana yang terbuka setelah barang ke-`removedIndex` dihapus: yang
 * dihapus sedang terbuka -> semua tertutup; yang terbuka ada di bawahnya ->
 * index-nya mundur satu supaya tetap menunjuk kartu yang sama.
 */
export function openIndexAfterRemove(
  openIndex: number | null,
  removedIndex: number,
) {
  if (openIndex === null || openIndex === removedIndex) return null
  return openIndex > removedIndex ? openIndex - 1 : openIndex
}
