import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Download, Landmark, Printer } from 'lucide-react'
import { getPublicOrderInvoice } from '../lib/orders-functions'
import { lineTotal, summarizeItems } from '../lib/order-totals'

export const Route = createFileRoute('/tagihan/$eventId/$orderId')({
  loader: ({ context, params }) => {
    const query = queryOptions({
      queryKey: ['public-invoice', params.eventId, params.orderId],
      queryFn: () =>
        getPublicOrderInvoice({
          data: { eventId: params.eventId, orderId: params.orderId },
        }),
    })
    return context.queryClient.ensureQueryData(query)
  },
  component: PublicInvoicePage,
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
  paid: 'Lunas',
  shipped: 'Dikirim',
}

function PublicInvoicePage() {
  const { eventId, orderId } = Route.useParams()

  const query = queryOptions({
    queryKey: ['public-invoice', eventId, orderId],
    queryFn: () =>
      getPublicOrderInvoice({ data: { eventId, orderId } }),
  })
  const { data } = useSuspenseQuery(query)

  const { total } = summarizeItems(data.items)

  const invoiceNo = data.order.id.slice(0, 8).toUpperCase()
  const invoiceDate = new Date(data.order.createdAt).toLocaleDateString(
    'id-ID',
    { day: 'numeric', month: 'long', year: 'numeric' },
  )
  const bankText =
    data.user.bankName && data.user.bankAccountNumber
      ? data.user.bankAccountNumber
      : null
  const completed = data.order.paymentStatus !== 'unpaid'

  return (
    <main className="app-shell relative mx-auto min-h-screen max-w-lg px-4 pb-10 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Invoice</h1>
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
          {data.order.paymentStatus === 'paid' ? 'lunas' : 'dikirim'} —
          invoice ditampilkan untuk arsip.
        </div>
      )}

      {/* ====== INVOICE CARD ====== */}
      <div className="app-card mb-4 overflow-hidden">
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
                  {item.qty > 1 ? (
                    <>
                      {item.qty} × ({formatIDR(item.originalPrice)} + Fee{' '}
                      {formatIDR(item.fee)})
                    </>
                  ) : (
                    <>
                      Harga {formatIDR(item.originalPrice)} + Fee{' '}
                      {formatIDR(item.fee)}
                    </>
                  )}
                </p>
              </div>
              <p className="font-medium">{formatIDR(lineTotal(item))}</p>
            </div>
          ))}
        </div>

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
      </div>

      {/* ====== PEMBAYARAN ====== */}
      {!completed && (
        <div className="app-card mb-4 p-5">
          <p className="mb-1 text-sm font-bold">Pembayaran</p>
          {bankText ? (
            <>
              <p
                className="mb-3 text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Silakan transfer ke rekening berikut, lalu konfirmasi
                pembayaran ke penjual.
              </p>
              <div
                className="flex items-center gap-3 rounded-xl p-4"
                style={{ background: 'var(--app-accent-soft)' }}
              >
                <span
                  className="app-icon-tile h-10 w-10 flex-shrink-0"
                  style={{ borderRadius: 999 }}
                >
                  <Landmark size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-semibold"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    {data.user.bankName}
                  </p>
                  <p className="truncate text-base font-bold tracking-wide">
                    {data.user.bankAccountNumber}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Silakan hubungi penjual untuk info rekening pembayaran.
            </p>
          )}

          {data.user.qrisImage && (
            <div
              className={bankText ? 'mt-4 border-t pt-4' : ''}
              style={{ borderColor: 'var(--app-border)' }}
            >
              <p
                className="mb-3 text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {bankText ? 'Atau bayar dengan scan QRIS:' : 'Bayar dengan scan QRIS:'}
              </p>
              <div className="flex justify-center">
                <img
                  src={data.user.qrisImage}
                  alt="QRIS"
                  className="h-56 w-56 rounded-xl border object-contain p-2"
                  style={{ borderColor: 'var(--app-border)' }}
                />
              </div>
              <a
                href={data.user.qrisImage}
                download={`qris-${data.user.brandName || data.user.name || 'jastip'}.${
                  data.user.qrisImage.match(/^data:image\/(\w+);/)?.[1] ?? 'png'
                }`}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
                style={{
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text-soft)',
                }}
              >
                <Download size={14} />
                Simpan QRIS
              </a>
            </div>
          )}
        </div>
      )}

      {/* ====== STATUS ====== */}
      <div className="app-card flex items-center justify-between p-5">
        <span className="text-sm font-semibold">Status Pembayaran</span>
        <span
          className={`app-badge ${
            data.order.paymentStatus === 'unpaid'
              ? 'app-badge-warning'
              : data.order.paymentStatus === 'paid'
                ? 'app-badge-success'
                : 'app-badge-info'
          }`}
        >
          {statusLabel[data.order.paymentStatus]}
        </span>
      </div>

      <p
        className="mt-6 text-center text-xs"
        style={{ color: 'var(--app-text-mute)' }}
      >
        Terima kasih sudah berbelanja di {data.user.brandName || data.user.name}
      </p>
    </main>
  )
}