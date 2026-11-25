import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Layers, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import Pagination from '../../../components/ui/Pagination'
import { usePartnerI18n, usePartnerT } from '../../../components/PartnerI18n'
import PartnerTableToolbar from '../../../components/ui/PartnerTableToolbar'
import SortHeader, { ariaSortOf } from '../../../components/ui/SortHeader'
import { useTableSort } from '../../../lib/use-table-sort'
import type { RuleSortKey } from '../../../lib/partner-rule-sort'
import { useDebouncedValue } from '../../../lib/use-debounced-value'
import { DEFAULT_PAGE_SIZE } from '../../../lib/pagination'
import { deletePartnerRule } from '../../../lib/partner-rule-functions'
import { partnerRulesPageQuery } from '../../../lib/queries'

export const Route = createFileRoute('/partner/paket/')({
  component: PartnerPaketPage,
})

const RULES_KEY = ['partner-rules']

const COLUMNS = 'min-w-[920px] grid-cols-[minmax(0,1.5fr)_70px_150px_110px_110px_130px]'

function formatPrice(value: number, locale: string) {
  return `Rp${value.toLocaleString(locale)}`
}

function StatusBadge({ active }: { active: boolean }) {
  const b = usePartnerT().bundle
  return (
    <span
      className="app-badge shrink-0"
      style={{
        background: active ? 'var(--app-success-soft)' : 'var(--pm-muted)',
        color: active ? 'var(--app-success)' : 'var(--app-text-soft)',
      }}
    >
      {active ? b.active : b.inactive}
    </span>
  )
}

function PartnerPaketPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())
  const { sort, toggle } = useTableSort<RuleSortKey>()
  const { t, intlLocale } = usePartnerI18n()
  const b = t.bundle
  const { data, isLoading, error } = useQuery({
    ...partnerRulesPageQuery({ page, pageSize, search: debouncedSearch, sort }),
    // Tabel tetap tampil (data lama) selama halaman berikutnya ditarik.
    placeholderData: keepPreviousData,
  })
  const rules = data?.rows ?? []
  const total = data?.total ?? 0

  // Server membatasi halaman di luar jangkauan (mis. aturan terakhir dihapus).
  const serverPage = data?.page
  useEffect(() => {
    if (serverPage !== undefined && serverPage !== page) setPage(serverPage)
  }, [serverPage, page])

  const pager = {
    page: data?.page ?? page,
    pageSize,
    total,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  }
  const toolbarPager = pager
  function onSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string, name: string) {
    if (
      !window.confirm(b.deleteConfirm(name))
    )
      return
    setActionError(null)
    try {
      await deletePartnerRule({ data: { id } })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : b.deleteFailed,
      )
    }
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
            {b.title}
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {b.ruleCount(total)}
          </p>
        </div>
        <Link
          to="/partner/paket/baru"
          className="app-btn-primary shrink-0 gap-2 whitespace-nowrap no-underline"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          <Plus size={16} />
          {b.addRule}
        </Link>
      </header>

      {error && (
        <div
          className="app-card p-4 text-sm"
          style={{ color: 'var(--app-danger)' }}
        >
          {b.loadFailed}
        </div>
      )}
      {actionError && (
        <p
          role="alert"
          className="text-sm"
          style={{ color: 'var(--app-danger)' }}
        >
          {actionError}
        </p>
      )}
      {isLoading && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {t.common.loading}
        </p>
      )}

      {!isLoading && rules.length === 0 && !debouncedSearch && (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Layers size={28} style={{ color: 'var(--app-text-soft)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {b.empty}
          </p>
        </div>
      )}

      {(rules.length > 0 || debouncedSearch) && (
        <>
          <div className="hidden lg:block">
            <PartnerTableToolbar
              search={search}
              onSearchChange={onSearchChange}
              placeholder={b.searchRule}
              pager={toolbarPager}
            />
          </div>

          {/* Mobile: kartu bertumpuk. */}
          {rules.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
              {b.noMatch}
            </p>
          )}

          <div className="flex flex-col gap-3.5 lg:hidden">
            {rules.map((rule) => (
              <div key={rule.id} className="app-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{rule.name}</p>
                    <p
                      className="mt-0.5 text-[13px]"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {b.ruleSummary(rule.productIds.length, rule.minQty)}
                    </p>
                  </div>
                  <StatusBadge active={rule.isActive} />
                </div>
                <p
                  className="pm-num text-base font-bold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {formatPrice(rule.bundlePrice, intlLocale)}
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {' '}
                    {b.perPcs(rule.minQty)}
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    to="/partner/paket/$id"
                    params={{ id: rule.id }}
                    className="app-btn-outline no-underline"
                    style={{ minHeight: 40, fontSize: 13 }}
                  >
                    {b.edit}
                  </Link>
                  <button
                    type="button"
                    className="app-btn-outline"
                    style={{
                      minHeight: 40,
                      fontSize: 13,
                      color: 'var(--app-danger)',
                    }}
                    onClick={() => handleDelete(rule.id, rule.name)}
                  >
                    {b.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabel, gaya sama dengan katalog. */}
          <div className="app-card hidden overflow-x-auto lg:block">
            <div
              className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              {(
                [
                  [b.colName, 'name'],
                  [b.colPcs, 'minQty'],
                  [b.colPrice, 'bundlePrice'],
                ] as const
              ).map(([label, key]) => (
                <div key={key} role="columnheader" aria-sort={ariaSortOf(sort, key)}>
                  <SortHeader
                    label={label}
                    sortKey={key}
                    sort={sort}
                    onSort={(k) => {
                      toggle(k)
                      setPage(1)
                    }}
                  />
                </div>
              ))}
              <span>{b.colProducts}</span>
              <div role="columnheader" aria-sort={ariaSortOf(sort, 'isActive')}>
                <SortHeader
                  label={b.colStatus}
                  sortKey="isActive"
                  sort={sort}
                  onSort={(k) => {
                    toggle(k)
                    setPage(1)
                  }}
                />
              </div>
              <span>{b.colAction}</span>
            </div>
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`grid ${COLUMNS} items-center gap-4 border-t px-5 py-3`}
                style={{ borderColor: 'var(--app-border)' }}
              >
                <p className="truncate text-sm font-bold">{rule.name}</p>
                <span className="pm-num text-sm">{rule.minQty}</span>
                <span
                  className="pm-num text-sm font-bold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {formatPrice(rule.bundlePrice, intlLocale)}
                </span>
                <span
                  className="text-[13px]"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {b.productCount(rule.productIds.length)}
                </span>
                <div>
                  <StatusBadge active={rule.isActive} />
                </div>
                <div className="flex items-center gap-4">
                  <Link
                    to="/partner/paket/$id"
                    params={{ id: rule.id }}
                    className="text-[13px] font-semibold no-underline"
                    style={{ color: 'var(--app-accent)' }}
                  >
                    {b.edit}
                  </Link>
                  <button
                    type="button"
                    className="text-[13px] font-semibold"
                    style={{ color: 'var(--app-danger)' }}
                    onClick={() => handleDelete(rule.id, rule.name)}
                  >
                    {b.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden lg:block">
            <Pagination {...pager} className="justify-end" />
          </div>
          <div className="lg:hidden">
            <Pagination {...pager} className="justify-center" />
          </div>
        </>
      )}
    </main>
  )
}
