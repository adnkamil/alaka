import { useState } from 'react'
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Phone, Plus, Search, Trash2, User } from 'lucide-react'
import { formatPhoneNumber } from '../../../../lib/format.ts'
import CustomerFormModal from '../../../../components/CustomerFormModal'
import ConfirmModal from '../../../../components/ui/ConfirmModal'
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from '../../../../lib/customers-functions'

const customersQuery = queryOptions({
  queryKey: ['customers'],
  queryFn: () => listCustomers(),
})

export const Route = createFileRoute('/_app/profil/customers/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(customersQuery),
  component: CustomersPage,
})

function CustomersPage() {
  const { data: customers } = useSuspenseQuery(customersQuery)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<
    | { type: 'create' }
    | { type: 'edit'; id: string; name: string; phone: string }
    | null
  >(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filteredCustomers = customers.filter((c) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    const digitsQuery = query.replace(/\D/g, '')
    const nameMatch = c.name.toLowerCase().includes(query)
    const phoneMatch =
      digitsQuery.length > 0 &&
      (c.phone ?? '').replace(/\D/g, '').includes(digitsQuery)
    return nameMatch || phoneMatch
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  async function handleSubmit(value: { name: string; phone: string }) {
    if (modalMode?.type === 'edit') {
      await updateCustomer({ data: { id: modalMode.id, ...value } })
    } else {
      await createCustomer({ data: value })
    }
    await refresh()
    setModalMode(null)
  }

  async function confirmDelete() {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      await deleteCustomer({ data: { id: deletingId } })
      await refresh()
      setDeletingId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/profil" style={{ color: 'var(--app-text)' }}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="text-xl font-bold">Customer</h1>
      </header>

      <div className="relative mb-4">
        <span
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center"
          style={{ color: 'var(--app-text-mute)' }}
        >
          <Search size={16} />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau no. HP customer"
          className="app-input pl-9"
        />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        {customers.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada customer. Tambahkan supaya muncul jadi saran saat isi
            nama pelanggan.
          </p>
        )}
        {customers.length > 0 && filteredCustomers.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Tidak ada customer yang cocok dengan pencarian.
          </p>
        )}
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="app-card flex items-center gap-3 p-4">
            <span className="app-icon-tile h-10 w-10 flex-shrink-0">
              <User size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{customer.name}</p>
              {customer.phone && (
                <p
                  className="mt-0.5 flex items-center gap-1 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <Phone size={12} />
                  {formatPhoneNumber(customer.phone)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                setModalMode({
                  type: 'edit',
                  id: customer.id,
                  name: customer.name,
                  phone: customer.phone ?? '',
                })
              }
              className="rounded-full p-1.5"
              style={{ color: 'var(--app-text-mute)' }}
              aria-label="Edit customer"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={() => setDeletingId(customer.id)}
              className="rounded-full p-1.5"
              style={{ color: 'var(--app-danger)' }}
              aria-label="Hapus customer"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t px-4 pt-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          onClick={() => setModalMode({ type: 'create' })}
          className="app-btn-primary w-full"
        >
          <Plus size={18} />
          Tambah customer
        </button>
      </div>

      {modalMode && (
        <CustomerFormModal
          title={modalMode.type === 'edit' ? 'Edit Customer' : 'Tambah Customer'}
          submitLabel={modalMode.type === 'edit' ? 'Simpan perubahan' : 'Simpan'}
          initialValue={
            modalMode.type === 'edit'
              ? { name: modalMode.name, phone: modalMode.phone }
              : undefined
          }
          onClose={() => setModalMode(null)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmModal
        open={deletingId !== null}
        title="Hapus customer ini?"
        content="Customer akan hilang dari daftar saran nama pelanggan. Pesanan yang sudah tersimpan tidak akan terpengaruh."
        okText="Hapus"
        loading={isDeleting}
        onOk={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </main>
  )
}