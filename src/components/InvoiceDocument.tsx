import { formatWibDateTime } from '../lib/event-slot'
import type { InvoiceDetail } from '../lib/invoice-functions'
import { formatInvoiceNumber, parseBundleLabel } from '../lib/invoice-rules'
import { formatRupiah } from '../lib/partner-product-rules'
import { splitItemName } from '../lib/partner-item-label'
import { toLocalPhoneNumber } from '../lib/format'
import { useOptionalPartnerI18n } from './PartnerI18n'

type Line = InvoiceDetail['lines'][number]

const STAMP_COLOR: Partial<Record<InvoiceDetail['status'], string>> = {
  lunas: 'var(--inv-success)',
  dibatalkan: 'var(--inv-danger)',
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
  const iv = useOptionalPartnerI18n().t.invoice
  const detail = [variation && iv.docVariant(variation), size && iv.docSize(size)]
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
  const { t, intlLocale } = useOptionalPartnerI18n()
  const iv = t.invoice
  const stampColor = STAMP_COLOR[d.status]
  const stamp = stampColor
    ? {
        color: stampColor,
        text: d.status === 'lunas' ? iv.stampPaid : iv.stampCancelled,
      }
    : null
  const submitNos = [...new Set(d.lines.map((l) => l.submitNo))].sort((a, b) => a - b)
  const multiSubmit = submitNos.length > 1
  const bank = d.partnerBank
  const paid = d.status === 'lunas' || d.status === 'dibatalkan'
  const issuedAt = formatWibDateTime(d.sentAt, intlLocale)

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
          <p className="inv-doc">{iv.docTitle}</p>
          <p className="inv-number">{formatInvoiceNumber(d.number)}</p>
          <p className="inv-muted">{iv.docDate(issuedAt)}</p>
        </div>
      </header>

      <section className="inv-boxes">
        <div className="inv-box">
          <p className="inv-label">{iv.docIssuedTo}</p>
          <p className="inv-box-title">{d.brandName}</p>
          {d.brandWa && <p className="inv-muted">WA: {toLocalPhoneNumber(d.brandWa)}</p>}
        </div>
        <div className="inv-box">
          <p className="inv-label">{iv.docEvent}</p>
          <p className="inv-box-title">{d.eventName}</p>
          <p className="inv-muted">
            {iv.docSubmits(submitNos.map((n) => `#${n}`).join(', '))}
          </p>
        </div>
      </section>

      <table className="inv-table">
        <thead>
          <tr>
            <th className="inv-c-no">{iv.docNo}</th>
            <th>{iv.docDescription}</th>
            <th className="inv-c-qty">{iv.docQty}</th>
            <th className="inv-c-money">{iv.docPrice}</th>
            <th className="inv-c-money">{iv.docAmount}</th>
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
                        {iv.docBundle(bundle ? bundle.ruleName : l.label)}
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
                  {multiSubmit && <span className="inv-sub">{iv.docSubmitNo(l.submitNo)}</span>}
                </td>
                <td className="inv-c-qty inv-strong">
                  {l.kind === 'paket' ? iv.docBundles(l.qty) : l.qty}
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
              <p className="inv-label">{iv.docTransferInfo}</p>
              {bank ? (
                <>
                  <p className="inv-strong">{bank.bankName}</p>
                  <p className="inv-account">{bank.accountNumber}</p>
                  <p>{iv.docAccountHolder(bank.accountName)}</p>
                </>
              ) : (
                <p className="inv-muted">
                  {iv.docNoBank(
                    d.partnerName,
                    d.partnerWa ? toLocalPhoneNumber(d.partnerWa) : '',
                  )}
                </p>
              )}
            </div>
          )}
          {d.status === 'lunas' && d.paidConfirmedAt && (
            <p className="inv-muted">
              {iv.docPaidOn(formatWibDateTime(d.paidConfirmedAt, intlLocale))}
            </p>
          )}
          {d.status === 'dibatalkan' && (
            <p className="inv-muted">
              {iv.docCancelled(
                d.cancelledAt ? formatWibDateTime(d.cancelledAt, intlLocale) : '',
              )}
              {d.cancelReason ? ` · ${d.cancelReason}` : ''}
            </p>
          )}
        </div>
        <dl className="inv-totals">
          <div>
            <dt>{iv.docTotalQty}</dt>
            <dd>{d.lines.reduce((n, l) => n + pcsOf(l), 0)} pcs</dd>
          </div>
          <div className="inv-grand">
            <dt>{iv.docTotalDue}</dt>
            <dd>{formatRupiah(d.totalAmount)}</dd>
          </div>
        </dl>
      </section>

      <footer className="inv-foot">{iv.docThanks(d.partnerName)}</footer>
    </article>
  )
}
