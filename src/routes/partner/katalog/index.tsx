import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Inbox, Package, Plus, Search } from 'lucide-react'
import PartnerCatalogCard from '../../../components/PartnerCatalogCard'
import Toast from '../../../components/ui/Toast'
import { getErrorMessage } from '../../../lib/error-message'
import { setPartnerProductActive } from '../../../lib/partner-product-functions'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../../../lib/partner-product-rules'
import { partnerCatalogQuery, partnerProductsQuery } from '../../../lib/queries'
import type { PartnerProductRow } from '../../../lib/partner-product-queries'

export const Route = createFileRoute('/partner/katalog/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(partnerProductsQuery),
      context.queryClient.ensureQueryData(partnerCatalogQuery),
    ]),
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
    <main className="flex flex-col gap-3.5 px-5 pb-[150px] pt-4">
      <h1 className="pm-display text-[22px] leading-tight">Katalog Produk</h1>

      <div
        className="flex h-[46px] items-center gap-2 rounded-xl border px-3.5"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--pm-input)',
        }}
      >
        <Search size={18} style={{ color: 'var(--app-text-mute)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none"
          style={{ color: 'var(--app-text)' }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pm-chip ${tab === t.key ? 'pm-chip--active' : ''}`}
          >
            {t.label} {counts[t.key]}
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
        <div className="flex flex-col gap-3.5">
          {visible.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              onToggle={() => handleToggle(product)}
            />
          ))}
        </div>
      )}

      <PartnerCatalogCard />

      <div className="pm-footer">
        <Link
          to="/partner/katalog/baru"
          className="app-btn-primary w-full gap-2 no-underline"
        >
          <Plus size={18} />
          Tambah produk
        </Link>
      </div>

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
            background: 'var(--pm-tint)',
            color: 'var(--app-text-mute)',
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
          <p className="truncate text-sm font-bold">{product.name}</p>
          <p className="pm-num text-sm" style={{ color: 'var(--app-accent)' }}>
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
            : 'var(--pm-muted)',
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
