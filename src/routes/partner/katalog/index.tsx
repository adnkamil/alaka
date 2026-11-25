import { useEffect, useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Inbox, Package, Plus } from 'lucide-react'
import UnderlineTabs from '../../../components/ui/UnderlineTabs'
import { usePartnerT } from '../../../components/PartnerI18n'
import Pagination from '../../../components/ui/Pagination'
import Toast from '../../../components/ui/Toast'
import { getErrorMessage } from '../../../lib/error-message'
import { DEFAULT_PAGE_SIZE } from '../../../lib/pagination'
import { useDebouncedValue } from '../../../lib/use-debounced-value'
import { setPartnerProductActive } from '../../../lib/partner-product-functions'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../../../lib/partner-product-rules'
import { partnerProductsPageQuery } from '../../../lib/queries'
import type {
  PartnerProductListRow,
  PartnerProductRow,
  ProductSortKey,
} from '../../../lib/partner-product-queries'
import PartnerTableToolbar from '../../../components/ui/PartnerTableToolbar'
import SortHeader, { ariaSortOf } from '../../../components/ui/SortHeader'
import { useTableSort } from '../../../lib/use-table-sort'
import type { SortState } from '../../../lib/table-sort'

export const Route = createFileRoute('/partner/katalog/')({
  // Halaman pertama dimuat dulu; halaman/filter berikutnya ditarik per halaman.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      partnerProductsPageQuery({
        tab: 'all',
        search: '',
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      }),
    ),
  component: PartnerCatalogPage,
})

type Tab = 'all' | 'aktif' | 'nonaktif'

function useTabs(counts: Record<Tab, number>) {
  const c = usePartnerT().catalog
  return [
    { key: 'all' as const, label: c.tabAll, count: counts.all },
    { key: 'aktif' as const, label: c.tabActive, count: counts.aktif },
    { key: 'nonaktif' as const, label: c.tabInactive, count: counts.nonaktif },
  ]
}

function PartnerCatalogPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [notice, setNotice] = useState<string | null>(null)
  const { sort, toggle } = useTableSort<ProductSortKey>()
  const t = usePartnerT()
  const c = t.catalog
  // Kata kunci dikirim ke server setelah berhenti mengetik sebentar.
  const debouncedSearch = useDebouncedValue(search.trim())

  const { data } = useQuery({
    ...partnerProductsPageQuery({
      tab,
      search: debouncedSearch,
      page,
      pageSize,
      sort,
    }),
    // Tabel tetap tampil (data lama) selama halaman berikutnya ditarik.
    placeholderData: keepPreviousData,
  })

  // Server membatasi halaman di luar jangkauan (mis. baris terakhir dihapus).
  const serverPage = data?.page
  useEffect(() => {
    if (serverPage !== undefined && serverPage !== page) setPage(serverPage)
  }, [serverPage, page])

  const tabs = useTabs(data?.counts ?? { all: 0, aktif: 0, nonaktif: 0 })
  if (!data) return null
  const { rows: visible, counts } = data

  function changeTab(next: Tab) {
    setTab(next)
    setPage(1)
  }
  function changeSort(key: ProductSortKey) {
    toggle(key)
    setPage(1)
  }
  function changeSearch(next: string) {
    setSearch(next)
    setPage(1)
  }
  const pager = {
    page: data.page,
    pageSize: data.pageSize,
    total: data.total,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  }

  async function handleToggle(product: PartnerProductRow) {
    try {
      await setPartnerProductActive({
        data: { id: product.id, isActive: !product.isActive },
      })
      await queryClient.invalidateQueries({ queryKey: ['partner-products'] })
    } catch (err) {
      setNotice(getErrorMessage(err, c.toggleFailed))
    }
  }

  return (
    <>
      <main className="flex flex-col gap-3.5 px-5 pb-[150px] pt-4 lg:hidden">
        <h1 className="pm-display text-[22px] leading-tight">{c.title}</h1>

        <PartnerTableToolbar
          search={search}
          onSearchChange={changeSearch}
          placeholder={c.searchShort}
          pager={pager}
        />

        <UnderlineTabs
          ariaLabel={c.statusLabel}
          items={tabs}
          value={tab}
          onChange={changeTab}
        />

        {visible.length === 0 ? (
          <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
            <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              {counts.all === 0 ? c.emptyAll : c.emptyMatch}
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

        <Pagination {...pager} className="justify-center" />

        <div className="pm-footer">
          <Link
            to="/partner/katalog/baru"
            className="app-btn-primary w-full gap-2 no-underline"
          >
            <Plus size={18} />
            {c.add}
          </Link>
        </div>
      </main>
      <CatalogDesktop
        visible={visible}
        counts={counts}
        tab={tab}
        onTab={changeTab}
        search={search}
        onSearch={changeSearch}
        onToggle={handleToggle}
        pager={pager}
        sort={sort}
        onSort={changeSort}
        tabs={tabs}
      />
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </>
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
  const c = usePartnerT().catalog
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
        aria-label={product.isActive ? c.deactivate : c.activate}
      >
        {product.isActive ? c.active : c.inactive}
      </button>
    </div>
  )
}

const COLUMNS = 'min-w-[780px] grid-cols-[minmax(0,1fr)_130px_150px_110px_70px]'

/** Katalog layout desktop (>= lg) sesuai Figma "D3 Katalog Produk". */
function CatalogDesktop({
  visible,
  counts,
  tab,
  onTab,
  search,
  onSearch,
  onToggle,
  pager,
  sort,
  onSort,
  tabs,
}: {
  tabs: ReturnType<typeof useTabs>
  visible: Array<PartnerProductListRow>
  counts: Record<Tab, number>
  tab: Tab
  onTab: (tab: Tab) => void
  search: string
  onSearch: (value: string) => void
  onToggle: (product: PartnerProductRow) => void
  pager: React.ComponentProps<typeof Pagination>
  sort: SortState<ProductSortKey>
  onSort: (key: ProductSortKey) => void
}) {
  const c = usePartnerT().catalog
  return (
    <main className="pm-wide hidden flex-col gap-5 lg:flex">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pm-display text-[26px] leading-tight">
            {c.title}
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {c.summary(counts.all, counts.aktif)}
          </p>
        </div>
        <Link
          to="/partner/katalog/baru"
          className="app-btn-primary gap-2 no-underline"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          <Plus size={16} />
          {c.add}
        </Link>
      </header>

      <UnderlineTabs
        ariaLabel={c.statusLabel}
        items={tabs}
        value={tab}
        onChange={onTab}
      />

      {visible.length === 0 ? (
        <div className="app-card flex flex-col items-center gap-2 p-10 text-center">
          <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {counts.all === 0 ? c.emptyAll : c.emptyMatch}
          </p>
        </div>
      ) : (
        <>
          <PartnerTableToolbar
            search={search}
            onSearchChange={onSearch}
            placeholder={c.searchLong}
            pager={pager}
          />
          <div className="app-card overflow-x-auto">
            <div
              className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              {(
                [
                  [c.colProduct, 'name'],
                  [c.colPrice, 'price'],
                  [c.colUsedIn, 'eventCount'],
                  [c.colStatus, 'isActive'],
                ] as const
              ).map(([label, key]) => (
                <div key={key} role="columnheader" aria-sort={ariaSortOf(sort, key)}>
                  <SortHeader label={label} sortKey={key} sort={sort} onSort={onSort} />
                </div>
              ))}
              <span>{c.colAction}</span>
            </div>
            {visible.map((product) => (
              <DesktopProductRow
                key={product.id}
                product={product}
                onToggle={() => onToggle(product)}
              />
            ))}
          </div>
          <Pagination {...pager} />
        </>
      )}
    </main>
  )
}

function DesktopProductRow({
  product,
  onToggle,
}: {
  product: PartnerProductListRow
  onToggle: () => void
}) {
  const photoUrl = partnerProductPhotoUrl(product.id, product.photoUpdatedAt)
  const c = usePartnerT().catalog
  return (
    <div
      className={`grid ${COLUMNS} items-center gap-4 border-t px-5 py-3`}
      style={{ borderColor: 'var(--app-border)' }}
    >
      <Link
        to="/partner/katalog/$id"
        params={{ id: product.id }}
        className="flex min-w-0 items-center gap-3.5 no-underline"
        style={{ color: 'inherit' }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{
            background: 'var(--pm-tint)',
            color: 'var(--pm-gold)',
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
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{product.name}</p>
          {product.code && (
            <p
              className="truncate text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {product.code}
            </p>
          )}
        </div>
      </Link>
      <span
        className="pm-num text-sm font-bold"
        style={{ color: 'var(--app-accent)' }}
      >
        {formatRupiah(product.price)}
      </span>
      <span className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
        {product.eventCount > 0 ? c.usedIn(product.eventCount) : c.notUsed}
      </span>
      <div>
        <button
          type="button"
          onClick={onToggle}
          className="app-badge"
          style={{
            background: product.isActive
              ? 'var(--app-success-soft)'
              : 'var(--pm-muted)',
            color: product.isActive
              ? 'var(--app-success)'
              : 'var(--app-text-soft)',
          }}
          title={
            product.isActive ? c.clickDeactivate : c.clickActivate
          }
          aria-label={product.isActive ? c.deactivate : c.activate}
        >
          {product.isActive ? c.active : c.inactive}
        </button>
      </div>
      <Link
        to="/partner/katalog/$id"
        params={{ id: product.id }}
        className="text-[13px] font-semibold no-underline"
        style={{ color: 'var(--app-accent)' }}
      >
        {c.edit}
      </Link>
    </div>
  )
}
