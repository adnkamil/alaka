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
import { lineTotal, summarizeItems } from '../../lib/order-totals'
import {
  createOrder,
  deleteOrder,
  updateItemsObtained,
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

type EventOrder = Awaited<ReturnType<typeof getEventDetail>>['orders'][number]

/** Barang yang dikirim balik ke server lewat create/update pesanan (qty per unit). */
type OrderItemInput = {
  name: string
  originalPrice: number
  fee: number
  qty: number
  obtained: boolean
}

/** Satu pelanggan yang memesan sebuah barang + total qty barang itu untuk dia. */
type ItemCustomer = {
  name: string
  qty: number
  obtainedQty: number
  orderCount: number
  /** Baris item milik pelanggan ini untuk barang tsb — buat checkbox per pelanggan. */
  itemIds: Array<string>
}

type ItemSummary = {
  name: string
  qty: number
  obtainedQty: number
  pendingQty: number
  orderCount: number
  /** Semua baris item dengan nama barang ini (lintas pesanan) — buat toggle checklist. */
  itemIds: Array<string>
  /** Jumlah baris item yang masih belum didapat. */
  pendingCount: number
  customers: Array<ItemCustomer>
}

/** Bentuk internal saat barang dikelompokkan (sebelum dirapikan jadi ItemSummary). */
type ItemGroupCustomer = {
  name: string
  qty: number
  obtainedQty: number
  itemIds: Array<string>
  orderIds: Set<string>
}

type ItemGroup = {
  name: string
  qty: number
  obtainedQty: number
  itemIds: Array<string>
  pendingCount: number
  orderIds: Set<string>
  customers: Map<string, ItemGroupCustomer>
}

/**
 * Ringkasan per item: total qty tiap barang di semua pesanan, digabung
 * berdasarkan nama barang (case-insensitive, trim spasi). Dipakai tab "Per Item"
 * supaya kelihatan total barang yang harus dibeli/dititip.
 *
 * Setiap item juga menyimpan daftar pelanggan yang memesannya (digabung per nama
 * pelanggan, jadi kalau satu orang punya beberapa pesanan qty-nya tetap dijumlah),
 * dipakai waktu baris item di-klik untuk lihat "siapa aja yang pesan".
 *
 * Info checklist belanja (`obtained`) ikut dihitung per barang & per pelanggan,
 * supaya ketahuan mana yang sudah didapat di toko dan mana yang belum.
 */
function summarizeItemQty(
  orders: Array<EventOrder>,
  keyword: string,
): ItemSummary[] {
  const query = keyword.trim().toLowerCase()
  const grouped = new Map<string, ItemGroup>()

  for (const order of orders) {
    const customerName = order.customerName.trim()
    const customerKey = customerName.toLowerCase()

    for (const item of order.items) {
      if (query && !item.name.toLowerCase().includes(query)) continue
      const key = item.name.trim().toLowerCase()
      const entry = grouped.get(key) ?? {
        name: item.name.trim(),
        qty: 0,
        obtainedQty: 0,
        itemIds: [],
        pendingCount: 0,
        orderIds: new Set<string>(),
        customers: new Map<string, ItemGroupCustomer>(),
      }
      entry.qty += item.qty
      entry.itemIds.push(item.id)
      if (item.obtained) {
        entry.obtainedQty += item.qty
      } else {
        entry.pendingCount += 1
      }
      entry.orderIds.add(order.id)

      const customer: ItemGroupCustomer = entry.customers.get(customerKey) ?? {
        name: customerName,
        qty: 0,
        obtainedQty: 0,
        itemIds: [],
        orderIds: new Set<string>(),
      }
      customer.qty += item.qty
      customer.itemIds.push(item.id)
      if (item.obtained) customer.obtainedQty += item.qty
      customer.orderIds.add(order.id)
      entry.customers.set(customerKey, customer)

      grouped.set(key, entry)
    }
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      name: entry.name,
      qty: entry.qty,
      obtainedQty: entry.obtainedQty,
      pendingQty: entry.qty - entry.obtainedQty,
      orderCount: entry.orderIds.size,
      itemIds: entry.itemIds,
      pendingCount: entry.pendingCount,
      customers: Array.from(entry.customers.values())
        .map((customer) => ({
          name: customer.name,
          qty: customer.qty,
          obtainedQty: customer.obtainedQty,
          orderCount: customer.orderIds.size,
          itemIds: customer.itemIds,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
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
  const [viewMode, setViewMode] = useState<'perCustomer' | 'perItem'>(
    'perCustomer',
  )
  // Filter tab Per Pelanggan: status pembayaran pesanan (seperti semula).
  const [statusFilter, setStatusFilter] = useState<
    'unpaid' | 'paid' | 'shipped' | null
  >(null)
  // Filter tab Per Item (checklist belanja): mana barang yang sudah didapat.
  const [obtainedFilter, setObtainedFilter] = useState<
    'obtained' | 'pending' | null
  >(null)
  // Nama barang (lowercase) yang panelnya lagi kebuka di tab Per Item.
  const [expandedItems, setExpandedItems] = useState<Array<string>>([])
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
      .filter((o) => o.paymentStatus === 'paid' || o.paymentStatus === 'shipped')
      .flatMap((o) => o.items),
  ).total
  const outstanding = summarizeItems(
    event.orders
      .filter((o) => o.paymentStatus === 'unpaid')
      .flatMap((o) => o.items),
  ).total

  const itemNameSuggestions = Array.from(
    new Set(event.orders.flatMap((o) => o.items.map((item) => item.name))),
  ).sort((a, b) => a.localeCompare(b))

  const itemPriceSuggestions: Record<string, Array<number>> = {}
  for (const item of event.orders.flatMap((o) => o.items)) {
    const price = Number(item.originalPrice)
    const list = itemPriceSuggestions[item.name] ?? []
    if (!list.includes(price)) list.push(price)
    itemPriceSuggestions[item.name] = list
  }
  for (const name in itemPriceSuggestions) {
    itemPriceSuggestions[name].sort((a, b) => a - b)
  }

  const unpaidCount = event.orders.filter(
    (o) => o.paymentStatus === 'unpaid',
  ).length
  const paidCount = event.orders.filter(
    (o) => o.paymentStatus === 'paid',
  ).length
  const shippedCount = event.orders.filter(
    (o) => o.paymentStatus === 'shipped',
  ).length

  // Tab Per Pelanggan: filter status pembayaran (kayak semula).
  const ordersByStatus = statusFilter
    ? event.orders.filter((order) => order.paymentStatus === statusFilter)
    : event.orders

  const filteredOrders = ordersByStatus.filter((order) =>
    order.customerName.toLowerCase().includes(search.toLowerCase()),
  )

  // Tab Per Item: checklist belanja dihitung dari SEMUA pesanan, nggak
  // dipengaruhi status pembayaran — yang dipakai cuma filter Dapat/Belum dapat.
  const eventItems = event.orders.flatMap((order) => order.items)
  const obtainedItemCount = eventItems.filter((item) => item.obtained).length
  const pendingItemCount = eventItems.length - obtainedItemCount

  const itemSummary = summarizeItemQty(event.orders, search).filter((item) =>
    obtainedFilter === 'obtained'
      ? item.pendingCount === 0
      : obtainedFilter === 'pending'
        ? item.pendingCount > 0
        : true,
  )
  const totalItemQty = itemSummary.reduce((sum, item) => sum + item.qty, 0)
  const totalPendingQty = itemSummary.reduce(
    (sum, item) => sum + item.pendingQty,
    0,
  )

  const editingOrder =
    sheetMode?.type === 'edit'
      ? event.orders.find((o) => o.id === sheetMode.orderId)
      : undefined

  async function handleCreateOrder(value: {
    customerName: string
    paymentStatus: 'unpaid' | 'paid' | 'shipped'
    items: Array<OrderItemInput>
  }) {
    await createOrder({ data: { eventId, ...value } })
    await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
    await queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
    setSheetMode(null)
    await navigate({ to: '/events/$eventId', params: { eventId }, search: {} })
  }

  async function handleUpdateOrder(
    orderId: string,
    value: {
      customerName: string
      paymentStatus: 'unpaid' | 'paid' | 'shipped'
      items: Array<OrderItemInput>
    },
  ) {
    await updateOrder({ data: { orderId, ...value } })
    await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
    await queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
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
    await queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
  }

  function toggleItemExpanded(key: string) {
    setExpandedItems((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  /**
   * Checklist belanja: tandai barang sudah/belum didapat di toko.
   * Langsung update cache dulu (optimistic) biar waktu live shopping checkbox-nya
   * berasa instan, lalu refetch buat memastikan data dari server.
   */
  async function handleToggleObtained(
    itemIds: Array<string>,
    obtained: boolean,
  ) {
    const idSet = new Set(itemIds)
    queryClient.setQueryData(query.queryKey, (old) =>
      old
        ? {
            ...old,
            orders: old.orders.map((order) => ({
              ...order,
              items: order.items.map((item) =>
                idSet.has(item.id) ? { ...item, obtained } : item,
              ),
            })),
          }
        : old,
    )

    try {
      await updateItemsObtained({ data: { itemIds, obtained } })
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    }
  }

  async function confirmDeleteOrder() {
    if (!deletingOrderId) return
    setIsDeleting(true)
    try {
      await deleteOrder({ data: { orderId: deletingOrderId } })
      await queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      await queryClient.invalidateQueries({ queryKey: ['finance-summary'] })
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

      {/* Tab tampilan: per pelanggan (default, seperti sebelumnya) atau per item */}
      <div
        className="mb-3 flex gap-1 rounded-xl border p-1"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setViewMode('perCustomer')
            setSearch('')
          }}
          className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
          style={
            viewMode === 'perCustomer'
              ? { background: 'var(--app-accent)', color: 'white' }
              : { color: 'var(--app-text-soft)' }
          }
          aria-pressed={viewMode === 'perCustomer'}
        >
          Per Pelanggan
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode('perItem')
            setSearch('')
          }}
          className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
          style={
            viewMode === 'perItem'
              ? { background: 'var(--app-accent)', color: 'white' }
              : { color: 'var(--app-text-soft)' }
          }
          aria-pressed={viewMode === 'perItem'}
        >
          Per Item
        </button>
      </div>

      <div className="relative mb-3">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
          style={{ color: 'var(--app-text-mute)' }}
        >
          <Search size={16} />
        </span>
        <input
          placeholder={
            viewMode === 'perItem' ? 'Cari nama barang' : 'Cari nama pelanggan'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="app-input pl-9"
        />
      </div>

      {viewMode === 'perCustomer' ? (
        /* Filter Status Pembayaran — khusus tab Per Pelanggan (seperti semula) */
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
      ) : (
        /* Filter checklist belanja — khusus tab Per Item */
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setObtainedFilter(obtainedFilter === 'pending' ? null : 'pending')
            }
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-1 text-xs font-semibold transition-all border ${
              obtainedFilter === 'pending'
                ? 'border-[var(--app-warning)] bg-[var(--app-warning)] text-white shadow-sm'
                : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-warning)]'
            }`}
          >
            <span>Belum dapat</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                obtainedFilter === 'pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--app-warning-soft)] text-[var(--app-warning)]'
              }`}
            >
              {pendingItemCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setObtainedFilter(
                obtainedFilter === 'obtained' ? null : 'obtained',
              )
            }
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-1 text-xs font-semibold transition-all border ${
              obtainedFilter === 'obtained'
                ? 'border-[var(--app-success)] bg-[var(--app-success)] text-white shadow-sm'
                : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-success)]'
            }`}
          >
            <span>Dapat</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                obtainedFilter === 'obtained'
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--app-success-soft)] text-[var(--app-success)]'
              }`}
            >
              {obtainedItemCount}
            </span>
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {viewMode === 'perCustomer' && filteredOrders.length === 0 && (
          <p
            className="py-10 text-center text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {statusFilter || search.trim()
              ? 'Tidak ada pesanan yang sesuai filter.'
              : 'Belum ada pesanan.'}
          </p>
        )}
        {viewMode === 'perItem' && itemSummary.length === 0 && (
          <p
            className="py-10 text-center text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {obtainedFilter || search.trim()
              ? 'Tidak ada barang yang sesuai filter.'
              : 'Belum ada barang.'}
          </p>
        )}
        {viewMode === 'perItem' && itemSummary.length > 0 && (
          <div className="app-card overflow-hidden">
            <div
              className="flex items-center justify-between border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
              style={{
                borderColor: 'var(--app-border)',
                color: 'var(--app-text-soft)',
              }}
            >
              <span>Item</span>
              <span>Qty</span>
            </div>
            {itemSummary.map((item) => {
              const key = item.name.toLowerCase()
              const isExpanded = expandedItems.includes(key)
              const allObtained = item.pendingCount === 0

              return (
                <div
                  key={key}
                  className="border-b last:border-b-0"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <div className="flex items-center gap-2 px-4 py-3">
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={allObtained}
                      // Sebagian didapat -> tampilkan state "sebagian" biar
                      // kelihatan masih ada sisa yang belum ketemu.
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            !allObtained && item.obtainedQty > 0
                        }
                      }}
                      onChange={() =>
                        handleToggleObtained(item.itemIds, !allObtained)
                      }
                      aria-label={`Tandai ${item.name} sudah didapat`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleItemExpanded(key)}
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {item.name}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: 'var(--app-text-soft)' }}
                        >
                          {item.orderCount} pesanan · {item.customers.length}{' '}
                          pembeli ·{' '}
                          {allObtained
                            ? 'semua sudah didapat'
                            : `${item.obtainedQty}/${item.qty} pcs didapat`}
                        </span>
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-1.5">
                        <span className="text-sm font-bold">{item.qty}</span>
                        <ChevronRight
                          size={16}
                          style={{
                            color: 'var(--app-text-mute)',
                            transform: isExpanded ? 'rotate(90deg)' : undefined,
                            transition: 'transform 150ms ease',
                          }}
                        />
                      </span>
                    </button>
                  </div>
                  {isExpanded && (
                    <div
                      className="flex flex-col gap-2 border-t px-4 py-3"
                      style={{
                        borderColor: 'var(--app-border)',
                        background: 'var(--app-card-hover)',
                      }}
                    >
                      <p
                        className="text-xs font-semibold"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        Yang pesan barang ini
                      </p>
                      {item.customers.map((customer) => {
                        const customerDone =
                          customer.obtainedQty === customer.qty
                        // Sebagian dapat (mis. qty 2, baru 1 pcs ketemu).
                        const customerPartial =
                          !customerDone && customer.obtainedQty > 0

                        return (
                          <div
                            key={customer.name.toLowerCase()}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="app-checkbox"
                              checked={customerDone}
                              ref={(el) => {
                                if (el) el.indeterminate = customerPartial
                              }}
                              onChange={() =>
                                handleToggleObtained(
                                  customer.itemIds,
                                  !customerDone,
                                )
                              }
                              aria-label={`Tandai ${item.name} untuk ${customer.name} sudah didapat`}
                            />
                            <span className="app-avatar h-6 w-6 flex-shrink-0 text-[10px]">
                              {customer.name.at(0)?.toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {customer.name}
                            </span>
                            <span className="flex-shrink-0 font-semibold">
                              {customerPartial
                                ? `${customer.obtainedQty}/${customer.qty} pcs`
                                : `${customer.qty} pcs`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            <div
              className="flex flex-col gap-0.5 px-4 py-3 text-sm font-semibold"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
              }}
            >
              <div className="flex items-center justify-between">
                <span>{itemSummary.length} jenis barang</span>
                <span>{totalItemQty} pcs</span>
              </div>
              {totalPendingQty > 0 && (
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>Belum didapat</span>
                  <span>{totalPendingQty} pcs</span>
                </div>
              )}
            </div>
          </div>
        )}
        {viewMode === 'perCustomer' &&
          filteredOrders.map((order) => {
            const orderTotal = summarizeItems(order.items).total
            return (
              <details key={order.id} className="app-card p-4">
                <summary className="flex cursor-pointer items-center gap-3">
                  <span className="app-avatar h-9 w-9 flex-shrink-0">
                    {order.customerName.at(0)?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {order.customerName}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {order.items.length} item · {formatIDR(orderTotal)}
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
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.name}</span>
                      <span>
                        {formatIDR(lineTotal(item))}
                      </span>
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
          itemNameSuggestions={itemNameSuggestions}
          itemPriceSuggestions={itemPriceSuggestions}
          onClose={() => setSheetMode(null)}
          onSubmit={handleCreateOrder}
        />
      )}

      {sheetMode?.type === 'duplicate' && (
        <AddOrderSheet
          eventName={event.name}
          feeTiers={event.feeRule?.tiers ?? []}
          customers={customers}
          itemNameSuggestions={itemNameSuggestions}
          itemPriceSuggestions={itemPriceSuggestions}
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
          itemNameSuggestions={itemNameSuggestions}
          itemPriceSuggestions={itemPriceSuggestions}
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
              // Checklist belanja dibawa terus, biar updateOrder yang hapus +
              // insert ulang item nggak me-reset status "sudah didapat".
              obtained: item.obtained,
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