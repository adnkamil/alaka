import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Package } from 'lucide-react'
import { getErrorMessage } from '../../../lib/error-message'
import { setPartnerEventProducts } from '../../../lib/partner-event-product-functions'
import {
  selectableProducts,
  toggleSelection,
} from '../../../lib/partner-event-product-rules'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../../../lib/partner-product-rules'
import {
  partnerEventProductsQuery,
  partnerEventQuery,
  partnerProductsQuery,
} from '../../../lib/queries'

export const Route = createFileRoute('/partner/event/produk/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(partnerEventQuery(params.id)),
      context.queryClient.ensureQueryData(partnerProductsQuery),
      context.queryClient.ensureQueryData(partnerEventProductsQuery(params.id)),
    ]),
  component: EventProductsPage,
})

function EventProductsPage() {
  const { id } = Route.useParams()
  const { data: event } = useSuspenseQuery(partnerEventQuery(id))
  const { data: catalog } = useSuspenseQuery(partnerProductsQuery)
  const { data: current } = useSuspenseQuery(partnerEventProductsQuery(id))
  const queryClient = useQueryClient()
  const navigate = Route.useNavigate()

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(current.map((p) => p.id)),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Produk nonaktif hanya tampil kalau sudah terpilih (supaya bisa dilepas).
  const alreadySelected = new Set(current.map((p) => p.id))
  const options = selectableProducts(catalog, alreadySelected)

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      await setPartnerEventProducts({
        data: { id, productIds: Array.from(selected) },
      })
      await queryClient.invalidateQueries({
        queryKey: ['partner-event-products', id],
      })
      await navigate({ to: '/partner/event/$id', params: { id } })
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan pilihan produk'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="px-4 pb-24 pt-4">
      <Link
        to="/partner/event/$id"
        params={{ id }}
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold no-underline"
        style={{ color: 'var(--app-accent)' }}
      >
        <ArrowLeft size={14} />
        Detail event
      </Link>
      <h1 className="text-xl font-bold">Produk di Event</h1>
      <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        {event.name} · {selected.size} dari {options.length} produk dipilih
      </p>

      {options.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-3 p-8 text-center">
          <Package size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada produk aktif di katalog.
          </p>
          <Link
            to="/partner/katalog/baru"
            className="app-btn-outline no-underline"
            style={{ width: 'auto', padding: '0.5rem 0.9rem' }}
          >
            Tambah produk
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSelected(new Set(options.map((p) => p.id)))}
              style={{ color: 'var(--app-accent)' }}
            >
              Pilih semua
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              style={{ color: 'var(--app-text-soft)' }}
            >
              Kosongkan
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {options.map((product) => {
              const photoUrl = partnerProductPhotoUrl(
                product.id,
                product.photoUpdatedAt,
              )
              const checked = selected.has(product.id)
              return (
                <label
                  key={product.id}
                  className="app-card flex cursor-pointer items-center gap-3 p-3"
                  style={{
                    borderColor: checked ? 'var(--app-accent)' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((s) => toggleSelection(s, product.id))
                    }
                    className="h-5 w-5 shrink-0"
                  />
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{
                      background: 'var(--app-accent-soft)',
                      color: 'var(--app-accent)',
                    }}
                  >
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package size={20} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {product.name}
                    </p>
                    <p
                      className="text-xs font-bold"
                      style={{ color: 'var(--app-accent)' }}
                    >
                      {formatRupiah(product.price)}
                    </p>
                  </div>
                  {!product.isActive && (
                    <span
                      className="app-badge shrink-0"
                      style={{
                        background: 'var(--app-border)',
                        color: 'var(--app-text-soft)',
                      }}
                    >
                      Nonaktif
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}

      {options.length > 0 && (
        <div
          className="fixed bottom-14 left-1/2 z-30 w-full -translate-x-1/2 border-t px-4 py-3"
          style={{
            maxWidth: 480,
            background: 'var(--app-card)',
            borderColor: 'var(--app-border)',
          }}
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="app-btn-primary"
          >
            {saving ? 'Menyimpan...' : `Simpan (${selected.size} produk)`}
          </button>
        </div>
      )}
    </main>
  )
}
