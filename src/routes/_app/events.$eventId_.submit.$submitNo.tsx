import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Check, Clock, CornerDownRight, Minus, X } from 'lucide-react'
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

type LineStatus = SubmitDetailLine['status']

const GREEN = { background: 'var(--app-success-soft)', color: '#15803d' }
const RED = { background: 'var(--app-danger-soft, #fee2e2)', color: '#b91c1c' }
const AMBER = { background: 'var(--app-warning-soft)', color: '#b45309' }
const MUTE = { background: 'var(--app-border)', color: 'var(--app-text-mute)' }

/** Warna, ikon, dan label status satu barang. */
function statusMeta(line: SubmitDetailLine & { partial?: boolean }) {
  const status: LineStatus = line.status
  switch (status) {
    case 'disetujui':
      return { tone: GREEN, Icon: Check, label: line.partial ? 'Sebagian disetujui' : 'Disetujui' }
    case 'disanggah':
      return { tone: RED, Icon: X, label: line.replaces ? 'Ditolak lagi' : 'Kurang' }
    case 'dibatalkan':
      return { tone: RED, Icon: X, label: 'Dibatalkan partner' }
    case 'pengajuan':
      return { tone: AMBER, Icon: Clock, label: 'Menunggu dicek' }
    default:
      return { tone: MUTE, Icon: Minus, label: 'Belum dikirim' }
  }
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
    const meta = statusMeta(line)
    const struck = line.status === 'disanggah' && Boolean(line.replaces)
    return (
      <li
        key={line.key}
        className={depth === 0 ? 'flex flex-col py-3' : 'flex flex-col pb-2.5 pt-1.5'}
        style={depth === 0 ? { borderTop: '1px solid var(--app-border)' } : undefined}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg"
            style={meta.tone}
            aria-hidden="true"
          >
            <meta.Icon size={15} strokeWidth={2.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`min-w-0 truncate text-sm font-medium ${struck ? 'line-through decoration-1' : ''}`}
                style={struck ? { color: 'var(--app-text-mute)' } : undefined}
              >
                {line.product}
              </p>
              <span
                className="flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={meta.tone}
              >
                {meta.label}
              </span>
            </div>
            <div
              className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {line.variant && <span>{line.variant}</span>}
              {line.variant && <span aria-hidden="true">·</span>}
              <span>{line.qty} pcs</span>
              {line.inBundle && (
                <span
                  className="rounded px-1.5 py-px text-[10px] font-semibold"
                  style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
                >
                  Paket
                </span>
              )}
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
          </div>
        </div>
        {kids.length > 0 && (
          <ul className="ml-4 mt-3 flex flex-col gap-1">
            {kids.map((kid) => (
              <li
                key={kid.key}
                className="rounded-xl border px-3 pt-2"
                style={{ borderColor: 'var(--app-accent-soft)', background: 'var(--app-card)' }}
              >
                <p
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--app-accent)' }}
                >
                  <CornerDownRight size={12} />
                  Pengganti
                </p>
                <ul>{renderLine(kid, kidsOf, depth + 1)}</ul>
              </li>
            ))}
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
        // Ringkasan dihitung dari keadaan akhir: pcs yang sudah diganti dihitung
        // dari penggantinya, bukan dari barang yang ditolak. Sisa yang belum
        // diganti tetap dihitung dengan status barang aslinya.
        const effectiveQty = (l: SubmitDetailLine) =>
          Math.max(0, l.qty - (kidsOf.get(l.id) ?? []).reduce((sum, k) => sum + k.qty, 0))
        const qtyWhere = (match: (l: SubmitDetailLine) => boolean) =>
          c.lines.filter(match).reduce((sum, l) => sum + effectiveQty(l), 0)
        const pcs = qtyWhere(() => true)
        const approved = qtyWhere((l) => l.status === 'disetujui')
        const rejected = qtyWhere((l) => l.status === 'disanggah' || l.status === 'dibatalkan')
        const waiting = qtyWhere((l) => l.status === 'pengajuan')
        const needsDecision = c.lines.some(
          (l) => l.status === 'disanggah' && l.hole?.status === 'perlu_keputusan' && l.hole.openQty > 0,
        )
        return (
          <section key={c.customerName} className="app-card px-4 pb-1 pt-4">
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex size-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase"
                style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
                aria-hidden="true"
              >
                {c.customerName.charAt(0) || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.customerName}</p>
                <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  {[
                    `${pcs} pcs`,
                    approved > 0 && `${approved} disetujui`,
                    rejected > 0 && `${rejected} ditolak`,
                    waiting > 0 && `${waiting} menunggu`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {needsDecision && (
                <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={RED}>
                  Perlu keputusan
                </span>
              )}
            </div>
            <ul className="flex flex-col">
              {roots.map((line) => renderLine(line, kidsOf, 0))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
