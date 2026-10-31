import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Package } from 'lucide-react'
import { ProductChecklist } from '../../../components/PartnerProductPicker'
import { getErrorMessage } from '../../../lib/error-message'
import { setPartnerEventProducts } from '../../../lib/partner-event-product-functions'
import { selectableProducts } from '../../../lib/partner-event-product-rules'
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
  const selectedCount = options.reduce(
    (n, p) => (selected.has(p.id) ? n + 1 : n),
    0,
  )

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      await setPartnerEventProducts({
        data: {
          id,
          productIds: options
            .filter((p) => selected.has(p.id))
            .map((p) => p.id),
        },
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
    <>
      <main className="flex flex-col gap-4 px-5 pb-[150px] pt-4 lg:hidden">
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
          {event.name} · {selectedCount} dari {options.length} produk dipilih
        </p>
        <p
          className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
          style={{
            background: 'var(--app-accent-soft)',
            color: 'var(--app-text-soft)',
          }}
        >
          Jastiper melihat produk yang dicentang di halaman event. Centang
          sebanyak yang kamu mau, atau pilih semua sekaligus.
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
          <ProductChecklist
            options={options}
            selected={selected}
            onChange={setSelected}
          />
        )}

        {error && (
          <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        {options.length > 0 && (
          <div className="pm-footer lg:hidden">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="app-btn-primary w-full"
            >
              {saving ? 'Menyimpan...' : `Simpan (${selectedCount} produk)`}
            </button>
          </div>
        )}
      </main>

      <main className="pm-wide hidden flex-col gap-5 lg:flex">
        <header>
          <h1 className="pm-display text-[26px] leading-tight">
            Produk di Event
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <Link
              to="/partner/event"
              className="no-underline"
              style={{ color: 'inherit' }}
            >
              Event
            </Link>{' '}
            /{' '}
            <Link
              to="/partner/event/$id"
              params={{ id }}
              className="no-underline"
              style={{ color: 'inherit' }}
            >
              {event.name}
            </Link>{' '}
            / Produk
          </p>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6">
          <section className="pm-lg-card p-5">
            {options.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <Package size={28} style={{ color: 'var(--app-text-mute)' }} />
                <p
                  className="text-sm"
                  style={{ color: 'var(--app-text-soft)' }}
                >
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
              <ProductChecklist
                variant="desktop"
                options={options}
                selected={selected}
                onChange={setSelected}
              />
            )}
          </section>

          <aside className="pm-lg-card sticky top-[96px] flex flex-col gap-4 p-5">
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: 'var(--pm-gold)' }}
              >
                Produk dipilih
              </p>
              <p className="pm-display mt-1 text-[32px] leading-none">
                {selectedCount}
                <span
                  className="ml-1.5 text-base font-medium"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  dari {options.length}
                </span>
              </p>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full"
                style={{ background: 'var(--pm-muted)' }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={options.length}
                aria-valuenow={selectedCount}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${options.length === 0 ? 0 : (selectedCount / options.length) * 100}%`,
                    background: 'var(--app-accent)',
                  }}
                />
              </div>
            </div>
            <p
              className="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-text-soft)',
              }}
            >
              Jastiper melihat produk yang dicentang di halaman event. Centang
              sebanyak yang kamu mau, atau pilih semua sekaligus.
            </p>
            {error && (
              <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={saving || options.length === 0}
                onClick={() => void handleSave()}
                className="app-btn-primary w-full disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : `Simpan (${selectedCount} produk)`}
              </button>
              <Link
                to="/partner/event/$id"
                params={{ id }}
                className="app-btn-outline w-full no-underline"
              >
                Batal
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </>
  )
}
