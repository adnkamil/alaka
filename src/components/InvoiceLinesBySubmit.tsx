import { parseBundleLabel } from '../lib/invoice-rules'
import { splitItemName } from '../lib/partner-item-label'
import { formatRupiah } from '../lib/partner-product-rules'
import { useOptionalPartnerI18n } from './PartnerI18n'

type Line = {
  id: string
  submitNo: number
  kind: 'satuan' | 'paket'
  label: string
  qty: number
  unitPrice: number
  amount: number
}

/** Kolom: Barang | Variasi | Ukuran | Qty | Jumlah (kolom tengah hanya di layar lebar). */
const GRID = 'sm:grid sm:grid-cols-[minmax(0,1fr)_120px_64px_44px_104px] sm:gap-3'

/** Pcs satu baris: paket dihitung dari isinya, satuan dari qty. */
function pcsOf(line: Line): number {
  if (line.kind !== 'paket') return line.qty
  const parsed = parseBundleLabel(line.label)
  const perBundle = parsed ? parsed.items.reduce((n, i) => n + i.qty, 0) : 1
  return perBundle * line.qty
}

/** Satu barang: nama, variasi, ukuran, qty, dan (kalau ada) jumlahnya. */
function ItemRow({
  name,
  qty,
  amount,
  hint,
  indent,
}: {
  name: string
  qty: number
  amount?: number
  hint?: string
  indent?: boolean
}) {
  const { product, size, variation } = splitItemName(name)
  const soft = { color: 'var(--app-text-soft)' }
  const iv = useOptionalPartnerI18n().t.invoice
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2.5 pr-4 text-[13px] ${indent ? 'pl-9' : 'pl-4'} ${GRID}`}
    >
      <div className="min-w-0">
        <p>{product}</p>
        {hint && (
          <p className="pm-num text-[12px]" style={soft}>
            {hint}
          </p>
        )}
        {/* Layar sempit: variasi dan ukuran di bawah nama. */}
        {(variation || size) && (
          <p className="text-[12px] sm:hidden" style={soft}>
            {[variation, size && iv.sizeOf(size)].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <span className="hidden sm:block">{variation ?? '–'}</span>
      <span className="hidden sm:block">{size ?? '–'}</span>
      <span className="pm-num font-semibold sm:text-right">
        <span className="sm:hidden">× </span>
        {qty}
      </span>
      <span className="pm-num whitespace-nowrap text-right font-semibold">
        {amount === undefined ? '' : formatRupiah(amount)}
      </span>
    </div>
  )
}

/**
 * Rincian tagihan per submit. Paket tampil sebagai satu baris (nama aturan +
 * harga paket) dengan isinya di bawahnya; barang satuan sebagai baris sendiri.
 * Nama barang dipecah jadi kolom Barang, Variasi, dan Ukuran.
 */
export default function InvoiceLinesBySubmit({
  lines,
}: {
  lines: Array<Line>
}) {
  const submitNos = [...new Set(lines.map((l) => l.submitNo))].sort(
    (a, b) => a - b,
  )
  const head = {
    color: 'var(--pm-gold)',
  }
  const iv = useOptionalPartnerI18n().t.invoice
  return (
    <div className="flex flex-col">
      <div
        className={`hidden px-4 py-2 text-[11px] font-semibold uppercase tracking-wide ${GRID}`}
        style={{ ...head, background: 'var(--pm-tint)' }}
      >
        <span>{iv.linesItem}</span>
        <span>{iv.linesVariation}</span>
        <span>{iv.linesSize}</span>
        <span className="text-right">{iv.linesQty}</span>
        <span className="text-right">{iv.linesAmount}</span>
      </div>
      {submitNos.map((no) => {
        const rows = lines.filter((l) => l.submitNo === no)
        const packages = rows.filter((l) => l.kind === 'paket')
        const singles = rows.filter((l) => l.kind !== 'paket')
        const subtotal = rows.reduce((n, l) => n + l.amount, 0)
        const pcs = rows.reduce((n, l) => n + pcsOf(l), 0)
        return (
          <section
            key={no}
            className="border-t"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-2.5"
              style={{ background: 'var(--pm-tint)' }}
            >
              <h3
                className="text-[12px] font-bold uppercase tracking-wide"
                style={head}
              >
                {iv.submitHeading(no)}
                <span
                  className="ml-2 font-medium normal-case tracking-normal"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {pcs} pcs
                </span>
              </h3>
              <span className="pm-num whitespace-nowrap text-[13px] font-bold">
                {formatRupiah(subtotal)}
              </span>
            </div>

            <ul className="flex flex-col">
              {packages.map((l) => {
                const parsed = parseBundleLabel(l.label)
                return (
                  <li
                    key={l.id}
                    className="border-t first:border-t-0"
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-center justify-between gap-3 px-4 pt-3">
                      <p className="text-[13px] font-semibold">
                        <span
                          className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{
                            background: 'var(--app-accent-soft)',
                            color: 'var(--app-accent)',
                          }}
                        >
                          {iv.bundleTag}
                        </span>
                        {parsed ? parsed.ruleName : l.label}
                        {l.qty > 1 && <span className="pm-num"> · {l.qty}×</span>}
                      </p>
                      <span className="pm-num whitespace-nowrap text-[13px] font-semibold">
                        {formatRupiah(l.amount)}
                      </span>
                    </div>
                    {parsed && (
                      <ul className="pb-1">
                        {parsed.items.map((item, i) => (
                          <li key={i}>
                            <ItemRow
                              name={item.name}
                              qty={item.qty * l.qty}
                              indent
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
              {singles.map((l) => (
                <li
                  key={l.id}
                  className="border-t first:border-t-0"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <ItemRow
                    name={l.label}
                    qty={l.qty}
                    amount={l.amount}
                    hint={l.qty > 1 ? `@ ${formatRupiah(l.unitPrice)}` : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
