import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { deletePartnerRule, listPartnerRules } from '../../../lib/partner-rule-functions'

export const Route = createFileRoute('/partner/paket/')({
  component: PartnerPaketPage,
})

const RULES_KEY = ['partner-rules']

function PartnerPaketPage() {
  const queryClient = useQueryClient()
  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => listPartnerRules(),
  })
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Hapus aturan "${name}"? Pesanan yang sudah memakainya tidak berubah.`)) return
    setActionError(null)
    try {
      await deletePartnerRule({ data: { id } })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus aturan')
    }
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">Aturan Paket</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
            {rules.length} aturan · membutuhkan langganan PRO
          </p>
        </div>
        <Link
          to="/partner/paket/baru"
          className="app-btn-primary gap-2 no-underline"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          <Plus size={16} />
          Tambah aturan
        </Link>
      </header>

      {error && (
        <div className="app-card p-4 text-sm" style={{ color: '#b42318' }}>
          Gagal memuat aturan paket.
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-sm" style={{ color: '#b42318' }}>
          {actionError}
        </p>
      )}
      {isLoading && <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Memuat…</p>}

      {!isLoading && rules.length === 0 && (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Layers size={28} style={{ color: 'var(--app-text-soft)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada aturan paket. Contoh: 3 pcs Rp100.000.
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="app-card overflow-x-auto p-0">
          <table className="w-full text-[13px]">
            <thead style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
              <tr>
                {['Nama aturan', 'Pcs', 'Harga paket', 'Produk', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                  <td className="px-4 py-3 font-bold">{rule.name}</td>
                  <td className="pm-num px-4 py-3">{rule.minQty}</td>
                  <td className="pm-num px-4 py-3" style={{ color: 'var(--app-accent)' }}>
                    Rp{rule.bundlePrice.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3">{rule.productIds.length} produk</td>
                  <td className="px-4 py-3">
                    <span className="app-badge">{rule.isActive ? 'Aktif' : 'Nonaktif'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        to="/partner/paket/$id"
                        params={{ id: rule.id }}
                        className="app-btn-outline no-underline"
                        style={{ minHeight: 36, fontSize: 13 }}
                      >
                        Ubah
                      </Link>
                      <button
                        type="button"
                        className="app-btn-outline"
                        style={{ minHeight: 36, fontSize: 13, color: '#b42318' }}
                        onClick={() => handleDelete(rule.id, rule.name)}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
