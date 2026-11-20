import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Check, Minus, X } from 'lucide-react'
import PartnerCatalogPicker from '../../components/PartnerCatalogPicker'
import type { CatalogPick } from '../../components/PartnerCatalogPicker'
import { formatWibDateTime } from '../../lib/event-slot'
import { getEventPartnerItems } from '../../lib/partner-event-item-functions'
import type { PartnerEventItemCatalog } from '../../lib/partner-item-label'
import { ruleCoversVariant } from '../../lib/partner-pricing'
import { getErrorMessage } from '../../lib/error-message'
import { getSubmitDetail } from '../../lib/submit-detail-functions'
import type { SubmitDetailLine } from '../../lib/submit-detail-functions'
import {
  sendReplacementsBatch,
  waiveReplacementsBatch,
} from '../../lib/submit-functions'

export const Route = createFileRoute('/_app/events/$eventId_/submit/$submitNo')({
  component: SubmitDetailPage,
})

function StatusMark({ status }: { status: 'disetujui' | 'disanggah' | 'pengajuan' | 'dibatalkan' | null }) {
  if (status === 'disetujui') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: 'var(--app-success-soft)', color: '#15803d' }} aria-label="Disetujui">
        <Check size={14} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'dibatalkan') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' }} aria-label="Dibatalkan partner">
        <X size={14} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'disanggah') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full" style={{ background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' }} aria-label="Ditolak">
        <X size={14} strokeWidth={3} />
      </span>
    )
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full" style={{ color: 'var(--app-text-mute)' }} aria-label="Menunggu">
      <Minus size={14} />
    </span>
  )
}

/**
 * Katalog untuk memilih pengganti. Kalau barang yang ditolak punya aturan paket,
 * hanya produk (dan ukuran) aturan itu yang ditampilkan, supaya paketnya tetap
 * bisa terbentuk. Tanpa aturan, semua produk tampil.
 */
function catalogForRule(
  catalog: PartnerEventItemCatalog,
  ruleId: string | null,
): { catalog: PartnerEventItemCatalog; ruleName: string | null } {
  const rule = ruleId ? (catalog.rules ?? []).find((r) => r.id === ruleId) : undefined
  if (!rule) return { catalog, ruleName: null }
  return {
    ruleName: rule.name,
    catalog: {
      ...catalog,
      // Cukup satu aturan, jadi chip aturan lain tidak ditampilkan.
      rules: [],
      products: catalog.products
        .filter((p) => (p.rules ?? []).some((r) => r.id === rule.id))
        .map((p) => ({
          ...p,
          variants: p.variants.filter((v) =>
            ruleCoversVariant(
              { productIds: [p.id], productSizes: rule.productSizes },
              p.id,
              v.size,
            ),
          ),
        }))
        .filter((p) => p.variants.length > 0),
    },
  }
}

/** Keterangan keadaan barang yang ditolak, dan tombol keputusannya. */
function HoleNote({
  line,
  busy,
  onReplace,
  onWaive,
}: {
  line: SubmitDetailLine
  busy: boolean
  onReplace: () => void
  onWaive: () => void
}) {
  const hole = line.hole
  if (!hole || line.status !== 'disanggah') return null
  const partialNote = hole.replacements.length > 0 ? ' Sudah diganti sebagian.' : ''
  const note = (() => {
    switch (hole.status) {
      case 'perlu_keputusan':
        return hole.blocking
          ? `Belum diputuskan. Partner belum bisa menagih sebelum barang ini diganti atau diputuskan tidak diganti.${partialNote}`
          : `Belum diputuskan.${partialNote}`
      case 'tidak_diganti':
        return 'Diputuskan tidak diganti.'
      // Sudah diganti atau menunggu dicek: pengganti tampil sebagai baris di bawahnya.
      default:
        return null
    }
  })()
  const canDecide = hole.status === 'perlu_keputusan' && hole.openQty > 0
  return (
    <div className="mt-2 flex flex-col gap-2">
      {note && <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{note}</p>}
      {canDecide && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onReplace}
            className="app-btn-primary"
            style={{ minHeight: 36, fontSize: 13 }}
          >
            Ganti ({hole.openQty} pcs)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onWaive}
            className="app-btn-outline"
            style={{ minHeight: 36, fontSize: 13 }}
          >
            Tidak diganti
          </button>
        </div>
      )}
    </div>
  )
}

/** Barang satu submit, dikelompokkan per pemesan. Status: ✓ disetujui, ✗ ditolak, – menunggu. */
function SubmitDetailPage() {
  const { eventId, submitNo } = Route.useParams()
  const n = Number(submitNo)
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['submit-detail', eventId, n],
    queryFn: () => getSubmitDetail({ data: { eventId, submitNo: n } }),
  })
  const catalogQuery = useQuery({
    queryKey: ['partner-items', eventId],
    queryFn: () => getEventPartnerItems({ data: { eventId } }),
  })
  const [replacing, setReplacing] = useState<SubmitDetailLine | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Submit, ringkasan event, dan status pesanan semuanya berubah.
  const refresh = () => queryClient.invalidateQueries()

  async function handlePick(pick: CatalogPick) {
    if (!replacing?.hole) return
    if (pick.qty > replacing.hole.openQty) {
      setMessage({ tone: 'error', text: `Jumlah pengganti maksimal ${replacing.hole.openQty} pcs.` })
      return
    }
    setBusy(true)
    try {
      await sendReplacementsBatch({
        data: {
          eventId,
          replacements: [
            {
              hole: { kind: replacing.kind, id: replacing.id },
              partnerVariantId: pick.partnerVariantId,
              qty: pick.qty,
            },
          ],
        },
      })
      setReplacing(null)
      setMessage({ tone: 'ok', text: 'Pengganti dikirim. Submit ini kembali menunggu dicek partner, dan dicek lebih dulu dari antrean biasa.' })
      await refresh()
    } catch (err) {
      setMessage({ tone: 'error', text: getErrorMessage(err, 'Gagal mengirim pengganti.') })
    } finally {
      setBusy(false)
    }
  }

  async function handleWaive(line: SubmitDetailLine) {
    if (
      !window.confirm(
        `Tidak mengganti ${line.name}? Barang yang tidak tersedia ini tidak akan ditagih, dan paket lain tetap ditagih apa adanya.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await waiveReplacementsBatch({
        data: { eventId, holes: [{ kind: line.kind, id: line.id }] },
      })
      setMessage({ tone: 'ok', text: 'Diputuskan tidak diganti.' })
      await refresh()
    } catch (err) {
      setMessage({ tone: 'error', text: getErrorMessage(err, 'Gagal menyimpan keputusan.') })
    } finally {
      setBusy(false)
    }
  }

  /** Satu baris barang, beserta pengganti-penggantinya di bawahnya (menjorok). */
  function renderLine(
    line: SubmitDetailLine & { partial?: boolean },
    kidsOf: Map<string, Array<SubmitDetailLine>>,
    depth: number,
  ) {
    const kids = kidsOf.get(line.id) ?? []
    return (
      <li key={line.key} className={depth === 0 ? 'flex flex-col py-2.5' : 'flex flex-col'}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`truncate text-sm ${line.status === 'disanggah' && line.replaces ? 'line-through decoration-1' : ''}`}>
              {line.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>{line.qty} pcs</p>
            {line.replaces && (
              <p className="text-xs font-semibold" style={{ color: 'var(--app-accent)' }}>
                ↳ Pengganti untuk {line.replaces.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {line.partial && (
              <span className="text-xs" style={{ color: '#15803d' }}>Sebagian disetujui</span>
            )}
            {line.status === 'pengajuan' && (
              <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>Menunggu dicek</span>
            )}
            {line.status === 'disanggah' && (
              <span className="text-xs" style={{ color: '#b91c1c' }}>
                {line.replaces ? 'Ditolak lagi' : 'Kurang'}
              </span>
            )}
            {line.status === 'dibatalkan' && (
              <span className="text-xs" style={{ color: '#b91c1c' }}>Dibatalkan partner</span>
            )}
            <StatusMark status={line.status} />
          </div>
        </div>
        <HoleNote
          line={line}
          busy={busy}
          onReplace={() => {
            setMessage(null)
            setReplacing(line)
          }}
          onWaive={() => void handleWaive(line)}
        />
        {kids.length > 0 && (
          <ul
            className="ml-3 mt-2 flex flex-col gap-2 border-l-2 pl-3"
            style={{ borderColor: 'var(--app-accent-soft)' }}
          >
            {kids.map((kid) => renderLine(kid, kidsOf, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  if (replacing && catalogQuery.data) {
    const restricted = catalogForRule(catalogQuery.data, replacing.ruleId)
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: 'var(--app-bg, #fff)' }}>
        <PartnerCatalogPicker
          customerName={`pengganti ${replacing.name}`}
          catalog={restricted.catalog}
          maxQty={replacing.hole?.openQty ?? null}
          notice={
            restricted.ruleName
              ? `Hanya produk paket ${restricted.ruleName}, supaya pengganti ini tetap bisa masuk paket.`
              : null
          }
          pickedQty={{}}
          mode="add"
          initialVariantId={null}
          initialQty={Math.min(replacing.hole?.openQty ?? 1, 1)}
          onPick={(pick) => void handlePick(pick)}
          onClose={() => setReplacing(null)}
          toast={message?.tone === 'error' ? message.text : null}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
      <header className="flex items-start gap-3">
        <Link
          to="/events/$eventId/status"
          params={{ eventId }}
          search={{ tab: 'riwayat' }}
          aria-label="Kembali"
          className="-ml-1 flex size-8 shrink-0 items-center justify-center"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={22} />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Submit ke-{submitNo}</h1>
          {detail.data?.reopened && (
            <p className="text-xs font-semibold" style={{ color: 'var(--app-accent)' }}>
              Barang pengganti menunggu dicek partner
            </p>
          )}
          {detail.data && (
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              Dikirim {formatWibDateTime(new Date(detail.data.submittedAt))}
            </p>
          )}
        </div>
      </header>

      {detail.isLoading && <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Memuat…</p>}
      {detail.isError && <p className="text-sm text-red-600">Gagal memuat detail submit.</p>}
      {message && !replacing && (
        <p
          className="rounded-xl p-3 text-sm"
          role="status"
          style={
            message.tone === 'ok'
              ? { background: 'var(--app-success-soft)', color: '#15803d' }
              : { background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' }
          }
        >
          {message.text}
        </p>
      )}
      {detail.data && detail.data.customers.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>Tidak ada barang di submit ini.</p>
      )}

      {detail.data?.customers.map((c) => {
        // Pengganti tampil di bawah barang yang digantikan, berantai kalau
        // ditolak lagi dan diganti lagi.
        const ids = new Set(c.lines.map((l) => l.id))
        const kidsOf = new Map<string, Array<SubmitDetailLine>>()
        const roots: Array<SubmitDetailLine> = []
        for (const line of c.lines) {
          if (line.replacesId && ids.has(line.replacesId)) {
            const list = kidsOf.get(line.replacesId) ?? []
            list.push(line)
            kidsOf.set(line.replacesId, list)
          } else {
            roots.push(line)
          }
        }
        return (
          <section key={c.customerName} className="app-card p-4">
            <p className="text-sm font-semibold">{c.customerName}</p>
            <ul className="mt-3 flex flex-col divide-y" style={{ borderColor: 'var(--app-border)' }}>
              {roots.map((line) => renderLine(line, kidsOf, 0))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
