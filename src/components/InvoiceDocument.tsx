import { formatWibDateTime } from '../lib/event-slot'
import type { InvoiceDetail } from '../lib/invoice-functions'
import { formatInvoiceNumber, parseBundleLabel } from '../lib/invoice-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import { splitItemName } from '../lib/partner-item-label'
import { toLocalPhoneNumber } from '../lib/format'

type Line = InvoiceDetail['lines'][number]

const STATUS_STAMP: Partial<
  Record<InvoiceDetail['status'], { text: string; color: string }>
> = {
  lunas: { text: 'LUNAS', color: '#15803d' },
  dibatalkan: { text: 'DIBATALKAN', color: '#b91c1c' },
}

/** Pcs satu baris: paket dihitung dari isinya, satuan dari qty. */
function pcsOf(line: Line): number {
  if (line.kind !== 'paket') return line.qty
  const parsed = parseBundleLabel(line.label)
  const perBundle = parsed ? parsed.items.reduce((n, i) => n + i.qty, 0) : 1
  return perBundle * line.qty
}

function ItemName({ name, qty }: { name: string; qty?: number }) {
  const { product, size, variation } = splitItemName(name)
  const detail = [variation && `Varian: ${variation}`, size && `Ukuran: ${size}`]
    .filter(Boolean)
    .join('   ')
  return (
    <>
      <span className="inv-strong">
        {qty ? `${qty}× ` : ''}
        {product}
      </span>
      {detail && <span className="inv-sub">{detail}</span>}
    </>
  )
}

/**
 * Lembar invoice (kertas putih ala A4) dari snapshot tagihan. Dipakai sebagai
 * pratinjau di layar dan untuk dicetak / disimpan PDF oleh partner dan
 * jastiper. Warnanya tetap terang walau aplikasi sedang mode gelap, supaya
 * hasil cetaknya konsisten. Gaya ada di `.inv-sheet` (styles.css).
 */
export default function InvoiceDocument({ invoice: d }: { invoice: InvoiceDetail }) {
  const stamp = STATUS_STAMP[d.status]
  const submitNos = [...new Set(d.lines.map((l) => l.submitNo))].sort((a, b) => a - b)
  const multiSubmit = submitNos.length > 1
  const bank = d.partnerBank
  const paid = d.status === 'lunas' || d.status === 'dibatalkan'
  const issuedAt = formatWibDateTime(d.sentAt)

  return (
    <article className="inv-sheet" aria-label={`Invoice ${formatInvoiceNumber(d.number)}`}>
      {stamp && (
        <div className="inv-stamp" style={{ color: stamp.color, borderColor: stamp.color }}>
          {stamp.text}
        </div>
      )}

      <header className="inv-head">
        <div className="inv-brand">
          {d.partnerLogoUrl ? (
            <img src={d.partnerLogoUrl} alt="" className="inv-logo" />
          ) : (
            <span className="inv-logo inv-logo--initial">
              {d.partnerName.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="inv-partner">{d.partnerName}</h1>
            {d.partnerWa && (
              <p className="inv-muted">WA: {toLocalPhoneNumber(d.partnerWa)}</p>
            )}
          </div>
        </div>
        <div className="inv-title">
          <p className="inv-doc">INVOICE</p>
          <p className="inv-number">{formatInvoiceNumber(d.number)}</p>
          <p className="inv-muted">Tanggal: {issuedAt}</p>
        </div>
      </header>

      <section className="inv-boxes">
        <div className="inv-box">
          <p className="inv-label">Diterbitkan untuk</p>
          <p className="inv-box-title">{d.brandName}</p>
          {d.brandWa && <p className="inv-muted">WA: {toLocalPhoneNumber(d.brandWa)}</p>}
        </div>
        <div className="inv-box">
          <p className="inv-label">Event</p>
          <p className="inv-box-title">{d.eventName}</p>
          <p className="inv-muted">
            Submit{' '}
            {submitNos.map((n) => `#${n}`).join(', ')}
          </p>
        </div>
      </section>

      <table className="inv-table">
        <thead>
          <tr>
            <th className="inv-c-no">No</th>
            <th>Deskripsi item</th>
            <th className="inv-c-qty">Qty</th>
            <th className="inv-c-money">Harga</th>
            <th className="inv-c-money">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => {
            const bundle = l.kind === 'paket' ? parseBundleLabel(l.label) : null
            return (
              <tr key={l.id}>
                <td className="inv-c-no inv-muted">{i + 1}</td>
                <td>
                  {l.kind === 'paket' ? (
                    <>
                      <span className="inv-strong">
                        Paket · {bundle ? bundle.ruleName : l.label}
                      </span>
                      {bundle && (
                        <ul className="inv-bundle">
                          {bundle.items.map((item, k) => (
                            <li key={k}>
                              <ItemName name={item.name} qty={item.qty * l.qty} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <ItemName name={l.label} />
                  )}
                  {multiSubmit && <span className="inv-sub">Submit #{l.submitNo}</span>}
                </td>
                <td className="inv-c-qty inv-strong">
                  {l.kind === 'paket' ? `${l.qty} paket` : l.qty}
                </td>
                <td className="inv-c-money">{formatRupiah(l.unitPrice)}</td>
                <td className="inv-c-money inv-strong">{formatRupiah(l.amount)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <section className="inv-summary">
        <div className="inv-pay">
          {!paid && (
            <div className="inv-box inv-box--pay">
              <p className="inv-label">Info transfer pembayaran</p>
              {bank ? (
                <>
                  <p className="inv-strong">{bank.bankName}</p>
                  <p className="inv-account">{bank.accountNumber}</p>
                  <p>a/n {bank.accountName}</p>
                </>
              ) : (
                <p className="inv-muted">
                  Rekening belum diisi partner. Hubungi {d.partnerName}
                  {d.partnerWa ? ` (${toLocalPhoneNumber(d.partnerWa)})` : ''}.
                </p>
              )}
            </div>
          )}
          {d.status === 'lunas' && d.paidConfirmedAt && (
            <p className="inv-muted">
              Lunas pada {formatWibDateTime(d.paidConfirmedAt)}
            </p>
          )}
          {d.status === 'dibatalkan' && (
            <p className="inv-muted">
              Dibatalkan{d.cancelledAt ? ` ${formatWibDateTime(d.cancelledAt)}` : ''}
              {d.cancelReason ? ` · ${d.cancelReason}` : ''}
            </p>
          )}
        </div>
        <dl className="inv-totals">
          <div>
            <dt>Total qty</dt>
            <dd>{d.lines.reduce((n, l) => n + pcsOf(l), 0)} pcs</dd>
          </div>
          <div className="inv-grand">
            <dt>Total bayar</dt>
            <dd>{formatRupiah(d.totalAmount)}</dd>
          </div>
        </dl>
      </section>

      <footer className="inv-foot">Terima kasih telah berbelanja bersama {d.partnerName}!</footer>
    </article>
  )
}
