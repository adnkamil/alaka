import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Landmark,
  Lock,
  MessageCircle,
  Printer,
  SquarePen,
} from 'lucide-react'
import { getOrderInvoice } from '../../lib/orders-functions'
import { createCustomer } from '../../lib/customers-functions'
import {
  buildWhatsAppLink,
  formatPhoneNumber,
  isValidIndonesianPhone,
} from '../../lib/format'
import {
  DEFAULT_WA_MESSAGE_TEMPLATE,
  renderMessageTemplate,
} from '../../lib/message-template'
import { lineTotal, summarizeItems } from '../../lib/order-totals'
import CustomerFormModal from '../../components/CustomerFormModal'
import PaymentInfoCard from '../../components/PaymentInfoCard'

export const Route = createFileRoute('/_app/invoice/$eventId/$orderId')({
  loader: ({ context, params }) => {
    const query = queryOptions({
      queryKey: ['invoice', params.eventId, params.orderId],
      queryFn: () =>
        getOrderInvoice({
          data: { eventId: params.eventId, orderId: params.orderId },
        }),
    })
    return context.queryClient.ensureQueryData(query)
  },
  component: InvoicePage,
  errorComponent: InvoiceError,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

const statusLabel: Record<string, string> = {
  unpaid: 'Belum Lunas',
  dp: 'DP (Sudah Bayar Sebagian)',
  paid: 'Lunas',
  shipped: 'Dikirim',
}

/**
 * `getOrderInvoice` bisa ditolak server — salah satunya kalau fitur PRO
 * `billing` sudah terkunci (masa trial habis & belum PRO). Daripada muncul
 * halaman error default, tampilkan pesannya langsung + jalan kembali.
 */
function InvoiceError({ error }: ErrorComponentProps) {
  const message =
    error instanceof Error
      ? error.message
      : 'Terjadi kesalahan saat memuat tagihan.'

  return (
    <main className="app-shell relative mx-auto min-h-screen max-w-lg px-4 pb-10 pt-6">
      <div className="flex flex-col items-center py-16 text-center">
        <span className="app-icon-tile mb-4 h-12 w-12">
          <Lock size={22} />
        </span>
        <h1 className="mb-1.5 text-lg font-bold">
          Halaman tagih tidak bisa dibuka
        </h1>
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {message}
        </p>
        <Link
          to="/"
          className="app-btn-outline mt-6 inline-flex items-center gap-2 no-underline"
        >
          <ArrowLeft size={16} />
          Kembali ke Beranda
        </Link>
      </div>
    </main>
  )
}

function InvoicePage() {
  const { eventId, orderId } = Route.useParams()
  const [phone, setPhone] = useState('')
  const [phoneInitialized, setPhoneInitialized] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const queryClient = useQueryClient()

  const query = queryOptions({
    queryKey: ['invoice', eventId, orderId],
    queryFn: () => getOrderInvoice({ data: { eventId, orderId } }),
  })
  const { data } = useSuspenseQuery(query)

  // Isi awal input No. HP cuma sekali (biar nggak ke-reset kalau
  // di-refetch), diambil dari nomor yang berhasil dicocokkan di server.
  if (!phoneInitialized) {
    setPhone(data.order.customerPhone ?? '')
    setPhoneInitialized(true)
  }

  // "niar 6608" -> "niar" (buang 4-digit terakhir yang keisi otomatis
  // dari suggestion), biar nama yang ke-prefill ke modal Tambah Customer
  // lebih rapi. Kalau nggak ada pola gitu, dipakai apa adanya.
  const suggestedCustomerName = data.order.customerName.replace(/\s\d{4}$/, '')

  const { subtotal, totalFee, total } = summarizeItems(data.items)
  const isDp = data.order.paymentStatus === 'dp'
  const paidAmount = Number(data.order.paidAmount)
  const remaining = Math.max(0, total - paidAmount)

  const invoiceNo = data.order.id.slice(0, 8).toUpperCase()
  const invoiceDate = new Date(data.order.createdAt).toLocaleDateString(
    'id-ID',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  )
  // Bank/e-wallet aktif pertama dipakai buat variabel {bank}/{bankAccount} di chat WA.
  const primaryTransfer = data.paymentMethods.find(
    (method) => method.type !== 'qris',
  )

  const completed =
    data.order.paymentStatus === 'paid' ||
    data.order.paymentStatus === 'shipped'

  const invoiceLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/tagihan/${eventId}/${orderId}`

  const defaultTemplate = isDp
    ? [
        'Halo kak {customer}, ini invoice belanja di *{event}* ya kak, bisa dicek detailnya di link ini: {link}',
        '',
        'Subtotal: {subtotal}',
        'Fee jastip: {fee}',
        'Total Tagihan: {total}',
        'DP Dibayar: {dp}',
        '*Sisa Tagihan: {sisa}*',
        '{bankLine}',
        'mohon dikirim bukti transfernya ya kak',
        '',
        'Terima kasih sudah berbelanja di {brand}!',
      ].join('\n')
    : DEFAULT_WA_MESSAGE_TEMPLATE

  const waMessage = renderMessageTemplate(
    data.user.waMessageTemplate ?? defaultTemplate,
    {
      customer: data.order.customerName,
      event: data.event.name,
      link: invoiceLink,
      subtotal: formatIDR(subtotal),
      fee: formatIDR(totalFee),
      total: formatIDR(total),
      dp: formatIDR(paidAmount),
      sisa: formatIDR(remaining),
      bank: primaryTransfer?.provider ?? '',
      bankAccount: primaryTransfer?.accountNumber ?? '',
      brand: data.user.brandName || data.user.name,
    },
  )

  const phoneValid = isValidIndonesianPhone(phone)

  async function handleAddCustomer(value: { name: string; phone: string }) {
    await createCustomer({ data: value })
    await queryClient.invalidateQueries({ queryKey: ['customers'] })
    await queryClient.invalidateQueries({
      queryKey: ['invoice', eventId, orderId],
    })
    setPhone(value.phone)
    setShowAddCustomer(false)
  }

  return (
    <main className="app-shell relative mx-auto min-h-screen max-w-lg px-4 pb-10 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/events/$eventId" params={{ eventId }}>
            <ArrowLeft size={22} style={{ color: 'var(--app-text)' }} />
          </Link>
          <h1 className="text-lg font-bold">Tagih Pesanan</h1>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold"
          style={{
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-soft)',
          }}
        >
          <Printer size={14} />
          Cetak
        </button>
      </header>

      {completed && (
        <div
          className="mb-4 rounded-xl border px-4 py-3 text-sm font-medium"
          style={{
            borderColor: 'var(--app-success-soft)',
            background: 'var(--app-success-soft)',
            color: 'var(--app-success)',
          }}
        >
          Pesanan ini sudah{' '}
          {data.order.paymentStatus === 'paid' ? 'lunas' : 'dikirim'} — invoice
          ditampilkan untuk arsip.
        </div>
      )}

      {/* ====== INVOICE CARD ====== */}
      <div className="app-card mb-4 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between p-5"
          style={{ background: 'var(--app-accent-soft)' }}
        >
          <div>
            <p className="text-lg font-bold">
              {data.user.brandName || data.user.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              INVOICE · {invoiceNo}
            </p>
          </div>
          <span
            className="app-icon-tile h-11 w-11"
            style={{ borderRadius: 999 }}
          >
            <Landmark size={20} />
          </span>
        </div>

        {/* Info order */}
        <div
          className="flex flex-col gap-1.5 border-b p-5 pb-4"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <p className="text-sm font-semibold">
            Untuk: {data.order.customerName}
          </p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Event: {data.event.name}
          </p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Tanggal invoice: {invoiceDate}
          </p>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-1 p-5 pb-4">
          <div
            className="mb-1 flex justify-between text-xs font-semibold"
            style={{ color: 'var(--app-text-mute)' }}
          >
            <span>Barang</span>
            <span>Harga Jual</span>
          </div>
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between gap-3 py-1 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.name}</p>
                <p
                  className="text-xs"
                  style={{ color: 'var(--app-text-mute)' }}
                >
                  <>
                    {item.qty} × ({formatIDR(item.originalPrice)} + Fee{' '}
                    {formatIDR(item.fee)})
                  </>
                </p>
              </div>
              <p className="font-medium">{formatIDR(lineTotal(item))}</p>
            </div>
          ))}
        </div>

        {/* Total */}
        <div
          className="flex items-center justify-between border-t p-5 pt-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <span className="font-bold">Total Tagihan</span>
          <span
            className="text-lg font-bold"
            style={{ color: 'var(--app-accent)' }}
          >
            {formatIDR(total)}
          </span>
        </div>

        {isDp && (
          <div
            className="flex flex-col gap-1 border-t px-5 py-3 text-sm"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--app-accent-soft)',
            }}
          >
            <div className="flex justify-between">
              <span>DP sudah dibayar</span>
              <span className="font-semibold">{formatIDR(paidAmount)}</span>
            </div>
            <div
              className="flex justify-between font-bold"
              style={{ color: 'var(--app-warning)' }}
            >
              <span>Sisa yang harus dibayar</span>
              <span>{formatIDR(remaining)}</span>
            </div>
          </div>
        )}
      </div>
      {/* ====== PEMBAYARAN ====== */}
      {!completed && (
        <PaymentInfoCard
          methods={data.paymentMethods}
          emptyMessage="Belum ada metode pembayaran aktif. Tambahkan lewat menu Profil → Pembayaran agar pelanggan bisa transfer."
        />
      )}

      {/* ====== STATUS ====== */}
      <div className="app-card mb-4 flex items-center justify-between p-5">
        <span className="text-sm font-semibold">Status Pembayaran</span>
        <span
          className={`app-badge ${
            data.order.paymentStatus === 'unpaid'
              ? 'app-badge-warning'
              : data.order.paymentStatus === 'dp'
                ? 'app-badge-accent'
                : data.order.paymentStatus === 'paid'
                  ? 'app-badge-success'
                  : 'app-badge-info'
          }`}
        >
          {statusLabel[data.order.paymentStatus]}
        </span>
      </div>

      {/* ====== KIRIM KE WHATSAPP ====== */}
      <div className="app-card p-5">
        <div className="mb-1 flex items-center justify-between text-sm font-bold">
          <p className="flex items-center gap-2">
            <MessageCircle size={16} style={{ color: 'var(--app-accent)' }} />
            Kirim ke WhatsApp
          </p>
          <Link
            to="/profil"
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <SquarePen size={13} />
            Template
          </Link>
        </div>

        {!data.order.customerRegistered && (
          <div
            className="mb-3 flex items-start gap-2 rounded-xl p-3 text-xs"
            style={{
              background: 'var(--app-accent-soft)',
              color: 'var(--app-accent)',
            }}
          >
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="mb-2">
                Nomor pelanggan ini belum terdaftar di daftar Customer.
                Tambahkan dulu supaya nomornya kesimpen buat pesanan berikutnya.
              </p>
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: 'var(--app-accent)' }}
              >
                Tambah ke Customer
              </button>
            </div>
          </div>
        )}

        <label className="mb-3 flex flex-col gap-1 text-sm font-medium">
          No. HP pelanggan
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xxxxxxxxxx"
            className="app-input"
          />
          {phone && !phoneValid && (
            <span className="text-xs" style={{ color: 'var(--app-danger)' }}>
              Format nomor HP kelihatannya belum benar.
            </span>
          )}
          {formatPhoneNumber(phone) && phoneValid && (
            <span className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
              {formatPhoneNumber(phone)}
            </span>
          )}
        </label>

        <a
          href={phoneValid ? buildWhatsAppLink(phone, waMessage) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!phoneValid}
          onClick={(e) => {
            if (!phoneValid) e.preventDefault()
          }}
          className="app-btn-primary w-full"
          style={{
            background: '#25D366',
            opacity: phoneValid ? 1 : 0.5,
            pointerEvents: phoneValid ? 'auto' : 'none',
          }}
        >
          <MessageCircle size={18} />
          Kirim ke WhatsApp
        </a>
      </div>

      <p
        className="mt-6 text-center text-xs"
        style={{ color: 'var(--app-text-mute)' }}
      >
        Terima kasih sudah berbelanja di {data.user.brandName || data.user.name}
      </p>

      {showAddCustomer && (
        <CustomerFormModal
          title="Tambah Customer"
          submitLabel="Simpan"
          initialValue={{ name: suggestedCustomerName, phone }}
          onClose={() => setShowAddCustomer(false)}
          onSubmit={handleAddCustomer}
        />
      )}
    </main>
  )
}
