// Penyusunan baris barang di invoice: barang satuan tampil per baris, paket tampil
// sebagai satu blok dengan komponennya. Harga per komponen tidak ditampilkan, dan
// HPP tidak pernah dibawa ke sini. Logika murni.
import { componentDisplayName } from './order-item-groups'

export type InvoiceComponent = {
  id: string
  productName: string
  size: string | null
  variation: string | null
  qty: number
}

export type InvoiceItemInput = {
  id: string
  name: string
  qty: number
  originalPrice: string | number
  fee: string | number
  isBundle: boolean
  components: Array<InvoiceComponent>
}

export type InvoiceBlock =
  | { kind: 'single'; item: InvoiceItemInput }
  | {
      kind: 'bundle'
      item: InvoiceItemInput
      lines: Array<{ id: string; text: string }>
    }

/**
 * Barang satuan dulu, lalu paket. Urutan di dalam masing-masing kelompok
 * mengikuti urutan asal. Paket hanya menampilkan komponennya tanpa harga.
 */
export function buildInvoiceBlocks(items: Array<InvoiceItemInput>): Array<InvoiceBlock> {
  const singles: Array<InvoiceBlock> = []
  const bundles: Array<InvoiceBlock> = []
  for (const item of items) {
    if (!item.isBundle) {
      singles.push({ kind: 'single' as const, item })
    } else {
      bundles.push({
        kind: 'bundle' as const,
        item,
        lines: item.components.map((c) => ({
          id: c.id,
          text: `${c.qty}× ${componentDisplayName(c)}`,
        })),
      })
    }
  }
  return [...singles, ...bundles]
}
