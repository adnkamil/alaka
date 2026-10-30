import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Layers, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import Pagination from '../../../components/ui/Pagination'
import { DEFAULT_PAGE_SIZE } from '../../../lib/pagination'
import { deletePartnerRule } from '../../../lib/partner-rule-functions'
import { partnerRulesPageQuery } from '../../../lib/queries'

export const Route = createFileRoute('/partner/paket/')({
  component: PartnerPaketPage,
})

const RULES_KEY = ['partner-rules']

const COLUMNS = 'grid-cols-[minmax(0,1.5fr)_70px_150px_110px_110px_130px]'

function formatPrice(value: number) {
  return `Rp${value.toLocaleString('id-ID')}`
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="app-badge shrink-0"
      style={{
        background: active ? 'var(--app-success-soft)' : 'var(--pm-muted)',
        color: active ? 'var(--app-success)' : 'var(--app-text-soft)',
      }}
    >
      {active ? 'Aktif' : 'Nonaktif'}
    </span>
  )
}

function PartnerPaketPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const { data, isLoading, error } = useQuery({
    ...partnerRulesPageQuery({ page, pageSize }),
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
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string, name: string) {
    if (
      !window.confirm(
        `Hapus aturan "${name}"? Pesanan yang sudah memakainya tidak berubah.`,
      )
    )
      return
    setActionError(null)
    try {
      await deletePartnerRule({ data: { id } })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menghapus aturan',
      )
    }
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
            Aturan Paket
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {total} aturan · membutuhkan langganan PRO
          </p>
        </div>
        <Link
          to="/partner/paket/baru"
          className="app-btn-primary shrink-0 gap-2 whitespace-nowrap no-underline"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          <Plus size={16} />
          Tambah aturan
        </Link>
      </header>

      {error && (
        <div
          className="app-card p-4 text-sm"
          style={{ color: 'var(--app-danger)' }}
        >
          Gagal memuat aturan paket.
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
          Memuat…
        </p>
      )}

      {!isLoading && rules.length === 0 && (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Layers size={28} style={{ color: 'var(--app-text-soft)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada aturan paket. Contoh: 3 pcs Rp100.000.
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <>
          <div className="hidden lg:block">
            <Pagination {...pager} />
          </div>

          {/* Mobile: kartu bertumpuk. */}
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
                      {rule.productIds.length} produk · min. {rule.minQty} pcs
                    </p>
                  </div>
                  <StatusBadge active={rule.isActive} />
                </div>
                <p
                  className="pm-num text-base font-bold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {formatPrice(rule.bundlePrice)}
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {' '}
                    / {rule.minQty} pcs
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    to="/partner/paket/$id"
                    params={{ id: rule.id }}
                    className="app-btn-outline no-underline"
                    style={{ minHeight: 40, fontSize: 13 }}
                  >
                    Ubah
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
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabel, gaya sama dengan katalog. */}
          <div className="app-card hidden overflow-hidden lg:block">
            <div
              className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              <span>Nama aturan</span>
              <span>Pcs</span>
              <span>Harga paket</span>
              <span>Produk</span>
              <span>Status</span>
              <span>Aksi</span>
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
                  {formatPrice(rule.bundlePrice)}
                </span>
                <span
                  className="text-[13px]"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {rule.productIds.length} produk
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
                    Ubah
                  </Link>
                  <button
                    type="button"
                    className="text-[13px] font-semibold"
                    style={{ color: 'var(--app-danger)' }}
                    onClick={() => handleDelete(rule.id, rule.name)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Pagination {...pager} className="justify-center lg:justify-end" />
        </>
      )}
    </main>
  )
}
