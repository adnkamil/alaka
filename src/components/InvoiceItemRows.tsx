import { buildInvoiceBlocks, type InvoiceItemInput } from '../lib/invoice-items'
import { lineTotal } from '../lib/order-totals'

interface InvoiceItemRowsProps {
  items: Array<InvoiceItemInput>
  hideFee: boolean
  formatIDR: (value: string | number) => string
}

/**
 * Baris barang di invoice. Satuan tampil satu per baris. Paket tampil sebagai satu
 * blok dengan judul "Paket bundling", harga jual dan fee paket, lalu komponennya.
 */
export default function InvoiceItemRows({ items, hideFee, formatIDR }: InvoiceItemRowsProps) {
  const blocks = buildInvoiceBlocks(items)
  return (
    <>
      {blocks.map((block) => {
        const item = block.item
        if (block.kind === 'single') {
          return (
            <div key={item.id} className="flex justify-between gap-3 py-1 text-sm">
              <div className="min-w-0 flex-1">
                <p className="break-words">{item.name}</p>
                <p className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
                  {hideFee
                    ? `${item.qty} × ${formatIDR(Number(item.originalPrice) + Number(item.fee))}`
                    : `${item.qty} × (${formatIDR(item.originalPrice)} + Fee ${formatIDR(item.fee)})`}
                </p>
              </div>
              <p className="font-medium">{formatIDR(lineTotal(item))}</p>
            </div>
          )
        }
        return (
          <div
            key={item.id}
            className="my-1 text-sm"
          >
            <div className="flex justify-between gap-3">
              <p className="font-semibold">
                Paket bundling{item.qty > 1 ? ` · ${item.qty} paket` : ''}
              </p>
              <p className="font-medium">{formatIDR(lineTotal(item))}</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
              {hideFee
                ? `${item.qty} paket × ${formatIDR(Number(item.originalPrice) + Number(item.fee))}`
                : `Harga jual ${formatIDR(item.originalPrice)} + Fee ${formatIDR(item.fee)} × ${item.qty} paket`}
            </p>
            <div className="mt-1 flex flex-col gap-0.5 pl-4">
              {block.lines.map((line) => (
                <p key={line.id} className="break-words text-xs">
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}
