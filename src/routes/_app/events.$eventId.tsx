import { useState } from 'react'
import ConfirmModal from '../../components/ui/ConfirmModal'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Tag,
  Trash2,
} from 'lucide-react'
import { z } from 'zod'
import AddOrderSheet from '../../components/AddOrderSheet'
import { getEventDetail, updateEvent } from '../../lib/events-functions'
import { listFeeRules } from '../../lib/fee-rules-functions'
import { listCustomers } from '../../lib/customers-functions'
import { lineTotal, summarizeItems, totalUnits } from '../../lib/order-totals'
import {
  createOrder,
  deleteOrder,
  updateOrder,
  updateOrderPaymentStatus,
} from '../../lib/orders-functions'

const searchSchema = z.object({
  addOrder: z.boolean().optional(),
})

export const Route = createFileRoute('/_app/events/$eventId')({
  validateSearch: searchSchema,
  loader: ({ context, params }) => {
    const query = queryOptions({
      queryKey: ['event', params.eventId],
      queryFn: () => getEventDetail({ data: { id: params.eventId } }),
    })
    return context.queryClient.ensureQueryData(query)
  },
  component: EventDetailPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function EventDetailPage() {
  const { eventId } = Route.useParams()
  const { addOrder } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sheetMode, setSheetMode] = useState<
    | { type: 'create' }
    | { type: 'duplicate'; customerName: string }
    | { type: 'edit'; orderId: string }
    | null
  >(addOrder ? { type: 'create' } : null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'unpaid' | 'paid' | 'shipped' | null
  >(null)
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showEventMenu, setShowEventMenu] = useState(false)

  const query = queryOptions({
    queryKey: ['event', eventId],
    queryFn: () => getEventDetail({ data: { id: eventId } }),
  })
  const { data: event } = useSuspenseQuery(query)

  const feeRulesQuery = queryOptions({
    queryKey: ['fee-rules'],
    queryFn: () => listFeeRules(),
  })
  const { data: feeRules } = useSuspenseQuery(feeRulesQuery)

  const customersQuery = queryOptions({
    queryKey: ['customers'],
    queryFn: () => listCustomers(),
  })
  const { data: customers } = useSuspenseQuery(customersQuery)

  const amountIn = summarizeItems(
    event.orders
      .filter(
        (o) => o.paymentStatus === 'paid' || o.paymentStatus === 'shipped',
      )
      .flatMap((o) => o.items),
  ).total
  const outstanding = summarizeItems(
    event.orders
      .filter((o) => o.paymentStatus === 'unpaid')
      .flatMap((o) => o.items),
  ).total

  const unpaidCount = event.orders.filter((o) => o.paymentStatus === 'unpaid').length
  const paidCount = event.orders.filter((o) => o.paymentStatus === 'paid').length
  const shippedCount = event.orders.filter((o) => o.paymentStatus === 'shipped').length

  const filteredOrders = event.orders.filter((order) => {
    const matchesSearch = order.customerName
      .toLowerCase()
      .includes(search.toLowerCase())
    const matchesStatus = statusFilter
      ? order.paymentStatus === statusFilter
      : true
    return matchesSearch && matchesStatus
  })

  const editingOrder =
    sheetMode?.type === 'edit'
      ? event.orders.find((o) => o.id === sheetMode.orderId)
      : undefined

  async function handleCreateOrder(value: {
    customerName: string
    paymentStatus: 'unpaid' | 'paid' | 'shipped'
    items: Array<{
      name: string
      originalPrice: number
      fee: number
      qty: number
    }>
  }) {
    await createOrder({ data: { eventId, ...value } })
    await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
    setSheetMode(null)
    await navigate({ to: '/events/$eventId', params: { eventId }, search: {} })
  }

  async function handleUpdateOrder(
    orderId: string,
    value: {
      customerName: string
      paymentStatus: 'unpaid' | 'paid' | 'shipped'
      items: Array<{
        name: string
        originalPrice: number
        fee: number
        qty: number
      }>
    },
  ) {
    await updateOrder({ data: { orderId, ...value } })
    await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
    setSheetMode(null)
  }

  async function handlePaymentStatusChange(
    orderId: string,
    paymentStatus: 'unpaid' | 'paid' | 'shipped',
  ) {
    await updateOrderPaymentStatus({
      data: { orderId, paymentStatus },
    })
    await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
  }

  async function confirmDeleteOrder() {
    if (!deletingOrderId) return
    setIsDeleting(true)
    try {
      await deleteOrder({ data: { orderId: deletingOrderId } })
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      setDeletingOrderId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleFeeRuleChange(feeRuleId: string) {
    await updateEvent({
      data: {
        id: eventId,
        name: event.name,
        description: event.description ?? undefined,
        eventDate: new Date(event.eventDate).toISOString(),
        feeRuleId: feeRuleId || null,
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
  }

  return (
    <main className="app-shell relative mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" style={{ color: 'var(--app-text)' }}>
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="text-lg font-bold">{event.name}</h1>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Event date{' '}
              {new Date(event.eventDate).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEventMenu((v) => !v)}
            className="rounded-full p-1.5 transition-colors"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Menu event"
            aria-expanded={showEventMenu}
          >
            <MoreVertical size={20} />
          </button>

          {showEventMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowEventMenu(false)}
                aria-hidden="true"
              />
              <div
                className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border p-4 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  background: 'var(--app-card)',
                  borderColor: 'var(--app-border)',
                }}
              >
                <p
                  className="mb-2 text-xs font-semibold"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Aturan fee jastip untuk event ini
                </p>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    <Tag size={16} />
                  </span>
                  <select
                    value={event.feeRule?.id ?? ''}
                    onChange={(e) => {
                      handleFeeRuleChange(e.target.value)
                      setShowEventMenu(false)
                    }}
                    className="app-input appearance-none pl-9"
                  >
                    <option value="">Belum dipilih</option>
                    {feeRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3">
        <div className="app-card p-4">
          <p className="mb-1 text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Uang masuk
          </p>
          <p className="text-lg font-bold">{formatIDR(amountIn)}</p>
        </div>
        <div className="app-card p-4">
          <p className="mb-1 text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum bayar
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: 'var(--app-warning)' }}
          >
            {formatIDR(outstanding)}
          </p>
        </div>
      </section>

      <div className="relative mb-3">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
          style={{ color: 'var(--app-text-mute)' }}
        >
          <Search size={16} />
        </span>
        <input
          placeholder="Cari nama pelanggan"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input pl-9"
        />
      </div>

      {/* Filter Status Pembayaran */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'unpaid' ? null : 'unpaid')
          }
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-1 text-xs font-semibold transition-all border ${
            statusFilter === 'unpaid'
              ? 'border-[var(--app-warning)] bg-[var(--app-warning)] text-white shadow-sm'
              : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-warning)]'
          }`}
        >
          <span>Belum lunas</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              statusFilter === 'unpaid'
                ? 'bg-white/20 text-white'
                : 'bg-[var(--app-warning-soft)] text-[var(--app-warning)]'
            }`}
          >
            {unpaidCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'paid' ? null : 'paid')
          }
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-1 text-xs font-semibold transition-all border ${
            statusFilter === 'paid'
              ? 'border-[var(--app-success)] bg-[var(--app-success)] text-white shadow-sm'
              : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-success)]'
          }`}
        >
          <span>Lunas</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              statusFilter === 'paid'
                ? 'bg-white/20 text-white'
                : 'bg-[var(--app-success-soft)] text-[var(--app-success)]'
            }`}
          >
            {paidCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter(statusFilter === 'shipped' ? null : 'shipped')
          }
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-1 text-xs font-semibold transition-all border ${
            statusFilter === 'shipped'
              ? 'border-[#2563eb] bg-[#2563eb] text-white shadow-sm'
              : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[#2563eb]'
          }`}
        >
          <span>Dikirim</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              statusFilter === 'shipped'
                ? 'bg-white/20 text-white'
                : 'bg-[rgba(59,130,246,0.14)] text-[#2563eb]'
            }`}
          >
            {shippedCount}
          </span>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {filteredOrders.length === 0 && (
          <p
            className="py-10 text-center text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {statusFilter || search.trim()
              ? 'Tidak ada pesanan yang sesuai filter.'
              : 'Belum ada pesanan.'}
          </p>
        )}
        {filteredOrders.map((order) => {
          const orderTotal = summarizeItems(order.items).total
          const orderQty = totalUnits(order.items)
          return (
            <details key={order.id} className="app-card p-4">
              <summary className="flex cursor-pointer items-center gap-3">
                <span className="app-avatar h-9 w-9 flex-shrink-0">
                  {order.customerName.at(0)?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{order.customerName}</p>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {orderQty} item · {formatIDR(orderTotal)}
                  </p>
                </span>
                <div
                  className="relative flex items-center"
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <select
                    value={order.paymentStatus}
                    onChange={(e) => {
                      e.stopPropagation()
                      handlePaymentStatusChange(
                        order.id,
                        e.target.value as 'unpaid' | 'paid' | 'shipped',
                      )
                    }}
                    className={`cursor-pointer appearance-none rounded-full py-1 pl-2.5 pr-5 text-xs font-semibold outline-none transition-colors border-0 ${
                      order.paymentStatus === 'paid'
                        ? 'app-badge-success'
                        : order.paymentStatus === 'shipped'
                          ? 'app-badge-info'
                          : 'app-badge-warning'
                    }`}
                  >
                    <option value="unpaid">Belum lunas</option>
                    <option value="paid">Lunas</option>
                    <option value="shipped">Dikirim</option>
                  </select>
                  <ChevronDown
                    size={12}
                    className="pointer-events-none absolute right-1.5 opacity-60"
                  />
                </div>
                <ChevronRight
                  size={16}
                  style={{ color: 'var(--app-text-mute)' }}
                />
              </summary>
              <div
                className="mt-3 flex flex-col gap-2 border-t pt-3"
                style={{ borderColor: 'var(--app-border)' }}
              >
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {item.name}
                      {item.qty > 1 && (
                        <span style={{ color: 'var(--app-text-mute)' }}>
                          {' '}
                          × {item.qty}
                        </span>
                      )}
                    </span>
                    <span>{formatIDR(lineTotal(item))}</span>
                  </div>
                ))}
                <div
                  className="mt-1 flex justify-between border-t pt-2 text-sm font-semibold"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <span>Total</span>
                  <span>{formatIDR(orderTotal)}</span>
                </div>
                <div
                  className="mt-2 flex gap-2 border-t pt-3"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  {order.paymentStatus === 'unpaid' && (
                    <Link
                      to="/invoice/$eventId/$orderId"
                      params={{ eventId, orderId: order.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold no-underline"
                      style={{
                        borderColor: 'var(--app-accent-soft)',
                        color: 'var(--app-accent)',
                        background: 'var(--app-accent-soft)',
                      }}
                    >
                      <ReceiptText size={13} />
                      Tagih
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setSheetMode({ type: 'edit', orderId: order.id })
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold"
                    style={{
                      borderColor: 'var(--app-border)',
                      color: 'var(--app-text-soft)',
                    }}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setDeletingOrderId(order.id)
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold"
                    style={{
                      borderColor: 'var(--app-danger-soft)',
                      color: 'var(--app-danger)',
                    }}
                  >
                    <Trash2 size={13} />
                    Hapus
                  </button>
                </div>
              </div>
            </details>
          )
        })}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 mx-auto flex max-w-lg justify-end px-6">
        <button
          onClick={() => setSheetMode({ type: 'create' })}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
          style={{ background: 'var(--app-accent)' }}
          aria-label="Tambah Pesanan"
        >
          <Plus size={26} />
        </button>
      </div>

      {sheetMode?.type === 'create' && (
        <AddOrderSheet
          eventName={event.name}
          feeTiers={event.feeRule?.tiers ?? []}
          customers={customers}
          onClose={() => setSheetMode(null)}
          onSubmit={handleCreateOrder}
        />
      )}

      {sheetMode?.type === 'duplicate' && (
        <AddOrderSheet
          eventName={event.name}
          feeTiers={event.feeRule?.tiers ?? []}
          customers={customers}
          title="Tambah Pesanan"
          submitLabel="Simpan pesanan"
          initialValue={{
            customerName: sheetMode.customerName,
            paymentStatus: 'unpaid',
            items: [],
          }}
          onClose={() => setSheetMode(null)}
          onSubmit={handleCreateOrder}
        />
      )}

      {sheetMode?.type === 'edit' && editingOrder && (
        <AddOrderSheet
          eventName={event.name}
          feeTiers={event.feeRule?.tiers ?? []}
          customers={customers}
          title="Edit Pesanan"
          submitLabel="Simpan perubahan"
          initialValue={{
            customerName: editingOrder.customerName,
            paymentStatus: editingOrder.paymentStatus,
            items: editingOrder.items.map((item) => ({
              name: item.name,
              originalPrice: Number(item.originalPrice),
              fee: Number(item.fee),
              qty: item.qty,
            })),
          }}
          onClose={() => setSheetMode(null)}
          onSubmit={(value) => handleUpdateOrder(editingOrder.id, value)}
        />
      )}

      <ConfirmModal
        open={Boolean(deletingOrderId)}
        title="Hapus pesanan ini?"
        content="Pesanan dan semua item di dalamnya akan dihapus permanen."
        okText="Ya, hapus"
        cancelText="Batal"
        danger={true}
        loading={isDeleting}
        onOk={confirmDeleteOrder}
        onCancel={() => {
          if (!isDeleting) setDeletingOrderId(null)
        }}
      />
    </main>
  )
}