import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { buildPackingList, formatInvoiceNumber } from '../lib/invoice-rules'
import { formatWibDateTime } from '../lib/event-slot'
import { splitItemName } from '../lib/partner-item-label'
import { toLocalPhoneNumber } from '../lib/format'
import type { InvoiceDetail } from '../lib/invoice-functions'

/** Kolom: centang | Barang | Variasi | Ukuran | Pcs (kolom tengah hanya di layar lebar). */
const COLS = 'sm:grid-cols-[18px_minmax(0,1fr)_140px_72px_72px] sm:gap-3'

const storageKey = (invoiceId: string) => `packing-${invoiceId}`

/** Item yang sudah dicentang gudang; bertahan setelah halaman dimuat ulang. */
function useChecked(invoiceId: string) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(invoiceId))
      setChecked(new Set(raw ? (JSON.parse(raw) as Array<string>) : []))
    } catch {
      setChecked(new Set())
    }
  }, [invoiceId])
  const toggle = (name: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      try {
        localStorage.setItem(storageKey(invoiceId), JSON.stringify([...next]))
      } catch {
        // Penyimpanan tidak tersedia: centang tetap jalan selama halaman terbuka.
      }
      return next
    })
  return { checked, toggle }
}

/**
 * Daftar packing untuk tim gudang: nama item dan pcs saja, tanpa harga atau
 * paket. Item yang sama dari semua submit digabung. Bisa dicentang dan dicetak.
 */
export default function InvoicePackingList({
  invoice,
}: {
  invoice: InvoiceDetail
}) {
  const items = useMemo(() => buildPackingList(invoice.lines), [invoice.lines])
  const totalPcs = items.reduce((n, i) => n + i.qty, 0)
  const { checked, toggle } = useChecked(invoice.id)
  const donePcs = items
    .filter((i) => checked.has(i.name))
    .reduce((n, i) => n + i.qty, 0)

  return (
    <>
    <PackingSheet invoice={invoice} items={items} totalPcs={totalPcs} checked={checked} />
    <section className="app-card overflow-hidden print:hidden">
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 print:hidden"
        style={{ background: 'var(--pm-tint)' }}
      >
        <p className="pm-num text-[13px] font-semibold">
          Diambil {donePcs} / {totalPcs} pcs
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="app-btn-outline gap-1.5"
          style={{ minHeight: 36, fontSize: 12 }}
        >
          <Printer size={14} />
          Cetak
        </button>
      </div>

      <div
        className={`hidden px-4 py-2 text-[11px] font-semibold uppercase tracking-wide sm:grid ${COLS}`}
        style={{ color: 'var(--pm-gold-text)', background: 'var(--pm-tint)' }}
      >
        <span />
        <span>Barang</span>
        <span>Variasi</span>
        <span>Ukuran</span>
        <span className="text-right">Pcs</span>
      </div>
      <ul>
        {items.map((item) => {
          const done = checked.has(item.name)
          const { product, size, variation } = splitItemName(item.name)
          const soft = { color: 'var(--app-text-soft)' }
          return (
            <li
              key={item.name}
              className="border-t"
              style={{
                borderColor: 'var(--app-border)',
                textDecoration: done ? 'line-through' : undefined,
                color: done ? 'var(--app-text-soft)' : undefined,
              }}
            >
              <label
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm sm:grid ${COLS}`}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(item.name)}
                  className="size-[18px] shrink-0 accent-[var(--app-accent)]"
                />
                <span className="min-w-0 flex-1">
                  {product}
                  {/* Layar sempit: variasi dan ukuran di bawah nama. */}
                  {(variation || size) && (
                    <span className="block text-xs sm:hidden" style={soft}>
                      {[variation, size && `Ukuran ${size}`].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="hidden sm:block">{variation ?? '–'}</span>
                <span className="hidden sm:block">{size ?? '–'}</span>
                <span className="pm-num whitespace-nowrap text-right text-base font-bold">
                  {item.qty} pcs
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div
        className="flex items-center justify-between border-t px-4 py-3"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Total · {items.length} jenis item
        </span>
        <span className="pm-num text-base font-bold">{totalPcs} pcs</span>
      </div>
    </section>
    </>
  )
}

/**
 * Lembar packing untuk dicetak (tersembunyi di layar): tulisan besar, kotak
 * centang untuk dicoret gudang, dan kolom tanda tangan. Tanpa harga.
 */
function PackingSheet({
  invoice,
  items,
  totalPcs,
  checked,
}: {
  invoice: InvoiceDetail
  items: Array<{ name: string; qty: number }>
  totalPcs: number
  checked: Set<string>
}) {
  return (
    <article className="inv-sheet inv-sheet--packing hidden print:block">
      <header className="inv-head">
        <div>
          <p className="inv-doc">DAFTAR PACKING</p>
          <p className="inv-number">{formatInvoiceNumber(invoice.number)}</p>
        </div>
        <div className="inv-title">
          <p className="inv-strong">{invoice.partnerName}</p>
          <p className="inv-muted">Dicetak {formatWibDateTime(new Date())}</p>
        </div>
      </header>

      <section className="inv-boxes">
        <div className="inv-box">
          <p className="inv-label">Kirim ke</p>
          <p className="inv-box-title">{invoice.brandName}</p>
          {invoice.brandWa && (
            <p className="inv-muted">WA: {toLocalPhoneNumber(invoice.brandWa)}</p>
          )}
        </div>
        <div className="inv-box">
          <p className="inv-label">Event</p>
          <p className="inv-box-title">{invoice.eventName}</p>
          <p className="inv-muted">
            Submit {invoice.submitNos.map((n) => `#${n}`).join(', ')} ·{' '}
            {items.length} jenis · {totalPcs} pcs
          </p>
        </div>
      </section>

      <table className="inv-table inv-table--packing">
        <thead>
          <tr>
            <th className="inv-c-check">Ok</th>
            <th>Barang</th>
            <th className="inv-c-opt">Variasi</th>
            <th className="inv-c-opt">Ukuran</th>
            <th className="inv-c-qty">Pcs</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const { product, size, variation } = splitItemName(item.name)
            return (
              <tr key={item.name}>
                <td className="inv-c-check">
                  <span className="inv-checkbox">{checked.has(item.name) ? '✓' : ''}</span>
                </td>
                <td className="inv-strong">{product}</td>
                <td className="inv-c-opt">{variation ?? '–'}</td>
                <td className="inv-c-opt">{size ?? '–'}</td>
                <td className="inv-c-qty inv-qty-big">{item.qty}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="inv-strong">
              Total
            </td>
            <td className="inv-c-qty inv-qty-big">{totalPcs}</td>
          </tr>
        </tfoot>
      </table>

      <section className="inv-signs">
        <div>
          <span>Disiapkan oleh</span>
        </div>
        <div>
          <span>Dicek oleh</span>
        </div>
      </section>
    </article>
  )
}
