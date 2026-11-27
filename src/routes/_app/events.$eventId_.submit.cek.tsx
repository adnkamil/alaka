import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { formatRemaining, formatWibDateTime } from '../../lib/event-slot'
import { getSubmitPreview } from '../../lib/event-slot-functions'
import { displayItemName } from '../../lib/partner-item-label'
import { formatRupiah } from '../../lib/partner-product-rules'
import { submitOrdersBatch } from '../../lib/submit-functions'
import { useNow } from '../../lib/use-now'

export const Route = createFileRoute('/_app/events/$eventId_/submit/cek')({
  component: CheckOrdersPage,
})

const soft = { color: 'var(--app-text-soft)' }
const border = { borderColor: 'var(--app-border)' }

function CheckOrdersPage() {
  const { eventId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = useNow()
  const queryKey = ['submit-preview', eventId]
  const {
    data: preview,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey,
    queryFn: () => getSubmitPreview({ data: { eventId } }),
    // Harga, aturan paket, dan pesanan bisa berubah selagi halaman terbuka.
    staleTime: 0,
    refetchInterval: 30_000,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goStatus = () =>
    navigate({
      to: '/events/$eventId/status',
      params: { eventId },
      search: { tab: undefined },
    })

  async function submit(expected: Array<string>) {
    setBusy(true)
    setError(null)
    try {
      const { submitNo } = await submitOrdersBatch({
        data: { eventId, expected },
      })
      await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
      queryClient.removeQueries({ queryKey })
      await navigate({
        to: '/events/$eventId/submit/$submitNo',
        params: { eventId, submitNo: String(submitNo) },
        replace: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim')
      // Submit yang timeout bisa saja sudah tersimpan, dan penolakan berarti
      // angka di layar sudah usang. Muat ulang keduanya.
      await queryClient.invalidateQueries({ queryKey: ['event-slot', eventId] })
      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setBusy(false)
    }
  }

  const open =
    preview != null &&
    now.getTime() >= new Date(preview.opensAt).getTime() &&
    now.getTime() < new Date(preview.closesAt).getTime()
  const empty = preview != null && preview.totalPcs === 0

  return (
    <main className="app-shell relative mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-4 flex items-start gap-3">
        <button
          type="button"
          onClick={goStatus}
          aria-label="Kembali"
          className="rounded-full p-1.5"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold">Cek pesanan</h1>
          <p className="text-xs" style={soft}>
            {preview?.partnerName}
          </p>
        </div>
      </header>

      {isLoading && (
        <p className="text-sm" style={soft}>
          Memuat pesanan...
        </p>
      )}
      {loadError && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          Pesanan gagal dimuat. Coba buka ulang halaman ini.
        </p>
      )}
      {preview === null && (
        <p className="app-card p-4 text-sm" style={soft}>
          Event ini tidak memakai slot pemesanan.
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <section className="app-card p-4 text-xs" style={soft}>
            {open
              ? `Slot ditutup dalam ${formatRemaining(new Date(preview.closesAt), now)}`
              : now.getTime() < new Date(preview.opensAt).getTime()
                ? `Slot dibuka ${formatWibDateTime(preview.opensAt)}`
                : 'Slot sudah ditutup'}
          </section>

          {empty && (
            <p className="app-card p-4 text-sm" style={soft}>
              Tidak ada barang baru untuk dikirim.
            </p>
          )}

          {preview.bundles.length > 0 && (
            <section className="app-card p-4">
              <h2 className="text-sm font-semibold">
                Paket terbentuk ({preview.bundles.length})
              </h2>
              <ul className="mt-2 flex flex-col">
                {preview.bundles.map((bundle, i) => (
                  <li key={i} className="border-t py-3 last:pb-0" style={border}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-medium">{bundle.ruleName}</span>
                      <span className="flex-shrink-0 tabular-nums">
                        {formatRupiah(bundle.price)}
                      </span>
                    </div>
                    <ul className="mt-1 text-xs" style={soft}>
                      {bundle.parts.map((part) => (
                        <li key={part.label}>
                          {part.qty}× {displayItemName(part.label)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preview.singles.length > 0 && (
            <section className="app-card p-4">
              <h2 className="text-sm font-semibold">Satuan</h2>
              <ul className="mt-2 flex flex-col">
                {preview.singles.map((row, i) => (
                  <li key={i} className="border-t py-3 last:pb-0" style={border}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span>{displayItemName(row.label)}</span>
                      <span className="flex-shrink-0 tabular-nums">
                        {formatRupiah(row.amount)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs" style={soft}>
                      {row.qty} pcs × {formatRupiah(row.unitPrice)}
                      {row.note ? ` · ${row.note}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preview.unpriced.length > 0 && (
            <section
              className="rounded-2xl p-4 text-xs"
              style={{
                background: 'var(--app-warning-soft)',
                color: 'var(--app-warning)',
              }}
            >
              <p className="font-semibold">
                Tidak ikut dihitung (varian sudah tidak ada di partner)
              </p>
              <ul className="mt-1">
                {preview.unpriced.map((row) => (
                  <li key={row.label}>
                    {row.qty}× {displayItemName(row.label)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!empty && (
            <section className="app-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm" style={soft}>
                  Estimasi {preview.totalPcs} pcs
                </span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatRupiah(preview.total)}
                </span>
              </div>

              {preview.isFirstSubmit && preview.minPurchase !== null && (
                <div className="mt-3">
                  <div
                    className="h-2 overflow-hidden rounded-full"
                    style={{ background: 'var(--app-border)' }}
                    role="progressbar"
                    aria-label="Minimal pembelian"
                    aria-valuemin={0}
                    aria-valuemax={preview.minPurchase}
                    aria-valuenow={Math.min(preview.total, preview.minPurchase)}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (preview.total / preview.minPurchase) * 100)}%`,
                        background:
                          preview.shortfall > 0
                            ? 'var(--app-warning)'
                            : 'var(--app-success)',
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs" style={soft}>
                    Minimal pembelian {formatRupiah(preview.minPurchase)}.{' '}
                    {preview.shortfall > 0
                      ? `Kurang ${formatRupiah(preview.shortfall)} lagi.`
                      : 'Sudah memenuhi.'}
                  </p>
                </div>
              )}

              <p className="mt-3 text-xs leading-relaxed" style={soft}>
                Harga masih bisa berubah mengikuti stok yang didapat saat
                partner mengecek. Paket juga bisa berbeda kalau partner
                menggabungkan beberapa submit dalam satu tagihan.
              </p>
            </section>
          )}

          {error && (
            <p
              role="alert"
              className="text-sm"
              style={{ color: 'var(--app-danger)' }}
            >
              {error}
            </p>
          )}

          {!empty && (
            <div>
              <button
                type="button"
                disabled={busy || !open || preview.shortfall > 0}
                onClick={() => void submit(preview.fingerprint)}
                className="app-btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send size={15} />
                {busy ? 'Mengirim...' : 'Kirim ke partner'}
              </button>
              <p className="mt-2 text-center text-xs" style={soft}>
                Setelah dikirim, pesanan ini terkunci sampai partner selesai
                mengecek.
              </p>
            </div>
          )}

          {(empty || preview.shortfall > 0) && (
            <button
              type="button"
              onClick={() =>
                navigate({ to: '/events/$eventId', params: { eventId } })
              }
              className="app-btn-outline w-full"
            >
              Tambah pesanan
            </button>
          )}
        </div>
      )}
    </main>
  )
}
