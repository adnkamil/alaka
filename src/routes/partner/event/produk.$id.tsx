import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Package } from 'lucide-react'
import {
  ProductCheckRow,
  ProductSearchInput,
  matchesProductQuery,
} from '../../../components/PartnerProductPicker'
import { getErrorMessage } from '../../../lib/error-message'
import { setPartnerEventProducts } from '../../../lib/partner-event-product-functions'
import {
  MAX_EVENT_PRODUCTS,
  selectableProducts,
  toggleSelection,
} from '../../../lib/partner-event-product-rules'
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
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Produk nonaktif hanya tampil kalau sudah terpilih (supaya bisa dilepas).
  const alreadySelected = new Set(current.map((p) => p.id))
  const options = selectableProducts(catalog, alreadySelected)
  const visible = options.filter((p) => matchesProductQuery(p, query))

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
    <main className="flex flex-col gap-4 px-5 pb-[150px] pt-4">
      <header className="flex items-center gap-3">
        <Link
          to="/partner/event/$id"
          params={{ id }}
          aria-label="Kembali"
          className="-ml-1 flex size-8 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <h1 className="pm-display text-[22px] leading-tight">
          Produk di Event
        </h1>
      </header>
      <p className="-mt-2 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        {event.name} · {selected.size} dari {MAX_EVENT_PRODUCTS} produk unggulan
      </p>
      <p
        className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
        style={{
          background: 'var(--app-accent-soft)',
          color: 'var(--app-text-soft)',
        }}
      >
        Jastiper melihat produk unggulan ini di halaman event. Untuk katalog
        lengkap, unggah PDF di menu Katalog.
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
          <ProductSearchInput value={query} onChange={setQuery} />
          <div className="flex items-center justify-between">
            <p
              className="text-xs font-semibold"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Pilih produk
            </p>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-bold"
              style={{ color: 'var(--app-accent)' }}
            >
              Kosongkan
            </button>
          </div>

          {visible.length === 0 ? (
            <p
              className="py-6 text-center text-sm"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Tidak ada produk yang cocok dengan &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {visible.map((product) => {
                const checked = selected.has(product.id)
                // Sudah penuh: produk lain tidak bisa dicentang sampai ada yang dilepas.
                const full = !checked && selected.size >= MAX_EVENT_PRODUCTS
                return (
                  <ProductCheckRow
                    key={product.id}
                    product={product}
                    checked={checked}
                    disabled={full}
                    onToggle={() =>
                      setSelected((s) => toggleSelection(s, product.id))
                    }
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}

      {options.length > 0 && (
        <div className="pm-footer">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="app-btn-primary w-full"
          >
            {saving ? 'Menyimpan...' : `Simpan (${selected.size} produk)`}
          </button>
        </div>
      )}
    </main>
  )
}
