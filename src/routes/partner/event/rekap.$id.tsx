import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { getPartnerEventPicklist } from '../../../lib/partner-picklist-functions'

export const Route = createFileRoute('/partner/event/rekap/$id')({
  component: PartnerEventRekapPage,
})

function PartnerEventRekapPage() {
  const { id } = Route.useParams()
  const [filter, setFilter] = useState<string>('')
  const { data, error, isLoading } = useQuery({
    queryKey: ['partner-event-picklist', id, filter],
    queryFn: () =>
      getPartnerEventPicklist({
        data: { calendarEventId: id, ruleFilter: filter === '' ? null : filter },
      }),
  })

  const totalPcs = data?.rows.reduce((sum, r) => sum + r.total, 0) ?? 0

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-8 pt-4 lg:gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/partner/event/$id"
            params={{ id }}
            aria-label="Kembali"
            className="-ml-1 flex size-8 shrink-0 items-center justify-center lg:hidden"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">Rekap Barang</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
              {totalPcs} pcs untuk disiapkan
            </p>
          </div>
        </div>
        <Link to="/partner/event/$id" params={{ id }} className="app-btn-outline hidden lg:inline-flex" style={{ minHeight: 40, fontSize: 13 }}>
          Kembali ke event
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('')} className={`pm-chip ${filter === '' ? 'pm-chip--active' : ''}`}>
          Semua
        </button>
        <button type="button" onClick={() => setFilter('satuan')} className={`pm-chip ${filter === 'satuan' ? 'pm-chip--active' : ''}`}>
          Barang satuan
        </button>
        {data?.rules.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setFilter(r.id)}
            className={`pm-chip ${filter === r.id ? 'pm-chip--active' : ''}`}
          >
            Paket: {r.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="app-card p-4 text-sm" style={{ color: '#b42318' }}>
          Gagal memuat rekap.
        </div>
      )}
      {isLoading && <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Memuat…</p>}
      {data && data.rows.length === 0 && (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <PackageCheck size={28} style={{ color: 'var(--app-text-soft)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Belum ada barang untuk ditampilkan.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="app-card overflow-x-auto p-0">
          <table className="w-full text-[13px]">
            <thead style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
              <tr>
                {['Produk', 'Ukuran', 'Variasi', 'Sumber', 'Qty', 'Per jastiper'].map((h) => (
                  <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold ${h === 'Qty' ? 'text-right' : ''}`} style={{ color: 'var(--app-text-soft)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={`${row.ruleId ?? 'satuan'}|${row.productName}|${row.size ?? ''}|${row.variation ?? ''}`}
                  className="border-t"
                  style={{ borderColor: 'var(--app-border)' }}
                >
                  <td className="px-4 py-3 font-bold">{row.productName}</td>
                  <td className="px-4 py-3">{row.size ?? '-'}</td>
                  <td className="px-4 py-3">{row.variation ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className="app-badge">{row.ruleName ? `Paket: ${row.ruleName}` : 'Satuan'}</span>
                  </td>
                  <td className="pm-num px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
                    {row.total}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.byJastiper.map((j) => (
                        <span key={j.brandName} className="pm-chip" style={{ padding: '4px 10px', fontSize: 11 }}>
                          {j.brandName} · {j.qty}
                        </span>
                      ))}
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
