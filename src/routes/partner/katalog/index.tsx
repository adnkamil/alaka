import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Inbox, Package, Plus, Search } from 'lucide-react'
import Toast from '../../../components/ui/Toast'
import { getErrorMessage } from '../../../lib/error-message'
import { setPartnerProductActive } from '../../../lib/partner-product-functions'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../../../lib/partner-product-rules'
import { partnerProductsQuery } from '../../../lib/queries'
import type { PartnerProductRow } from '../../../lib/partner-product-queries'

export const Route = createFileRoute('/partner/katalog/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(partnerProductsQuery),
  component: PartnerCatalogPage,
})

type Tab = 'all' | 'aktif' | 'nonaktif'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'nonaktif', label: 'Nonaktif' },
]

function PartnerCatalogPage() {
  const { data: products } = useSuspenseQuery(partnerProductsQuery)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const counts: Record<Tab, number> = {
    all: products.length,
    aktif: products.filter((p) => p.isActive).length,
    nonaktif: products.filter((p) => !p.isActive).length,
  }

  const keyword = search.trim().toLowerCase()
  const visible = products.filter((p) => {
    if (tab === 'aktif' && !p.isActive) return false
    if (tab === 'nonaktif' && p.isActive) return false
    if (!keyword) return true
    return (
      p.name.toLowerCase().includes(keyword) ||
      (p.code ?? '').toLowerCase().includes(keyword)
    )
  })

  async function handleToggle(product: PartnerProductRow) {
    try {
      await setPartnerProductActive({
        data: { id: product.id, isActive: !product.isActive },
      })
      await queryClient.invalidateQueries({ queryKey: ['partner-products'] })
    } catch (err) {
      setNotice(getErrorMessage(err, 'Gagal mengubah status produk'))
    }
  }

  return (
    <main className="px-4 pb-6 pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Katalog Produk</h1>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {counts.all} produk · {counts.aktif} aktif
          </p>
        </div>
        <Link
          to="/partner/katalog/baru"
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-white no-underline shadow-sm"
          style={{ background: 'var(--app-accent)' }}
        >
          <Plus size={14} />
          Tambah produk
        </Link>
      </div>

      <div
        className="mb-3 flex items-center gap-2 rounded-xl border px-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
        }}
      >
        <Search size={16} style={{ color: 'var(--app-text-mute)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau kode produk"
          className="app-input min-w-0 flex-1 border-0 pl-0"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              tab === t.key
                ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-sm'
                : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-accent)]'
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === t.key
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {products.length === 0
              ? 'Belum ada produk. Tambahkan yang pertama.'
              : 'Belum ada produk yang cocok.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              onToggle={() => handleToggle(product)}
            />
          ))}
        </div>
      )}

      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </main>
  )
}

function ProductRow({
  product,
  onToggle,
}: {
  product: PartnerProductRow
  onToggle: () => void
}) {
  const photoUrl = partnerProductPhotoUrl(product.id, product.photoUpdatedAt)
  return (
    <div className="app-card flex items-center gap-3 p-3">
      <Link
        to="/partner/katalog/$id"
        params={{ id: product.id }}
        className="flex min-w-0 flex-1 items-center gap-3 no-underline"
        style={{ color: 'inherit' }}
      >
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
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
            <Package size={22} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{product.name}</p>
          <p
            className="text-sm font-bold"
            style={{ color: 'var(--app-accent)' }}
          >
            {formatRupiah(product.price)}
          </p>
          {product.code && (
            <p
              className="truncate text-[11px]"
              style={{ color: 'var(--app-text-mute)' }}
            >
              {product.code}
            </p>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={onToggle}
        className="app-badge shrink-0"
        style={{
          background: product.isActive
            ? 'var(--app-success-soft)'
            : 'var(--app-accent-soft)',
          color: product.isActive
            ? 'var(--app-success)'
            : 'var(--app-text-soft)',
        }}
        aria-label={product.isActive ? 'Nonaktifkan produk' : 'Aktifkan produk'}
      >
        {product.isActive ? 'Aktif' : 'Nonaktif'}
      </button>
    </div>
  )
}
