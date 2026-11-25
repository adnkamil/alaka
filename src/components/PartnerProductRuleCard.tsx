import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useImperativeHandle, useState } from 'react'
import {
  listPartnerRules,
  setPartnerProductRules,
} from '../lib/partner-rule-functions'
import { formatRupiah } from '../lib/partner-product-rules'
import { usePartnerT } from './PartnerI18n'

const RULES_KEY = ['partner-rules']

export type PartnerProductRuleCardHandle = {
  /** `targetId` dipakai halaman tambah produk: id produk yang baru dibuat. */
  save: (targetId?: string) => Promise<void>
  /** Pesan galat kalau isian belum lengkap, atau null kalau siap disimpan. */
  validate: () => string | null
}

/** Aturan yang memuat produk ini -> ukuran yang ikut. Tanpa entri = tidak ikut. */
type Membership = Record<string, Array<string>>

function membershipOf(
  rules: Array<{
    id: string
    productIds: Array<string>
    productSizes: Record<string, Array<string>>
  }>,
  productId: string | undefined,
): Membership {
  const result: Membership = {}
  if (!productId) return result
  for (const r of rules) {
    if (r.productIds.includes(productId))
      result[r.id] = r.productSizes[productId] ?? []
  }
  return result
}

function membershipKey(m: Membership): string {
  return Object.keys(m)
    .sort()
    .map((id) => `${id}:${m[id].slice().sort().join('|')}`)
    .join(',')
}

/**
 * Kartu "Paket" di halaman produk: pilih aturan paket yang memuat produk ini
 * dan ukuran yang ikut di tiap aturan. Satu ukuran hanya boleh ikut satu
 * aturan; ukuran yang sudah dipilih aturan lain dikunci. `sizes` adalah ukuran
 * produk saat ini (ikut berubah dari editor varian sebelum disimpan).
 */
export default function PartnerProductRuleCard({
  productId,
  sizes,
  ref,
}: {
  /** Kosong di halaman tambah produk. */
  productId?: string
  sizes: Array<string>
  ref?: React.Ref<PartnerProductRuleCardHandle>
}) {
  const queryClient = useQueryClient()
  const t = usePartnerT()
  const pr = t.productRule
  const {
    data: rules = [],
    error: loadError,
    isLoading,
  } = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => listPartnerRules(),
  })
  const saved = membershipOf(rules, productId)
  const savedKey = membershipKey(saved)
  const [selected, setSelected] = useState<Membership>({})
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  )

  useEffect(() => {
    setSelected(saved)
    // Hanya reset saat data tersimpan berubah (savedKey), bukan tiap render.
  }, [savedKey])

  // Ukuran yang sudah dihapus dari produk tidak ikut dikirim.
  const effective: Membership = Object.fromEntries(
    Object.entries(selected).map(([id, list]) => [
      id,
      list.filter((s) => sizes.includes(s)),
    ]),
  )
  const dirty = membershipKey(effective) !== savedKey

  /** Ukuran yang sudah dipilih aturan lain di kartu ini: ukuran -> nama aturan. */
  function usedByOthers(ruleId: string): Map<string, string> {
    const used = new Map<string, string>()
    for (const r of rules) {
      if (r.id === ruleId) continue
      for (const size of effective[r.id] ?? []) used.set(size, r.name)
    }
    return used
  }

  /** Produk tanpa ukuran hanya boleh ada di satu aturan. */
  function blockedNoSize(ruleId: string): string | null {
    if (sizes.length > 0) return null
    const other = rules.find((r) => r.id !== ruleId && r.id in effective)
    return other?.name ?? null
  }

  /** Alasan aturan tidak bisa dipilih untuk produk ini, atau null. */
  function unavailableReason(ruleId: string): string | null {
    const blockedBy = blockedNoSize(ruleId)
    if (blockedBy) return pr.noSizeAlreadyIn(blockedBy)
    if (sizes.length > 0) {
      const used = usedByOthers(ruleId)
      if (sizes.every((size) => used.has(size))) {
        return pr.allSizesUsed
      }
    }
    return null
  }

  function applyRule(ruleId: string, list: Array<string>) {
    setStatus(null)
    setSelected((s) => ({ ...s, [ruleId]: list }))
  }

  function removeRule(ruleId: string) {
    setStatus(null)
    setSelected((s) => {
      const { [ruleId]: _removed, ...rest } = s
      return rest
    })
  }

  // Modal: langkah "pilih" (daftar paket) lalu "ukuran" (ukuran yang ikut).
  const [modal, setModal] = useState<
    | null
    | { step: 'pick' }
    | { step: 'sizes'; ruleId: string; draft: Array<string>; fromPick: boolean }
  >(null)
  const [search, setSearch] = useState('')

  function openPicker() {
    setSearch('')
    setModal({ step: 'pick' })
  }

  function pickRule(ruleId: string) {
    if (sizes.length === 0) {
      applyRule(ruleId, [])
      setModal(null)
      return
    }
    const used = usedByOthers(ruleId)
    setModal({
      step: 'sizes',
      ruleId,
      draft: sizes.filter((size) => !used.has(size)),
      fromPick: true,
    })
  }

  function editSizes(ruleId: string) {
    setModal({
      step: 'sizes',
      ruleId,
      draft: effective[ruleId] ?? [],
      fromPick: false,
    })
  }

  useEffect(() => {
    if (!modal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  function validate(): string | null {
    if (sizes.length === 0) return null
    const missing = rules.find(
      (r) => r.id in effective && effective[r.id].length === 0,
    )
    return missing ? pr.pickSizeFor(missing.name) : null
  }

  async function save(targetId?: string) {
    const id = targetId ?? productId
    if (!id) throw new Error(pr.notSavedYet)
    if (!dirty) return
    setStatus(null)
    try {
      await setPartnerProductRules({
        data: {
          productId: id,
          rules: Object.entries(effective).map(([ruleId, list]) => ({
            ruleId,
            sizes: list,
          })),
        },
      })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
      setStatus({ ok: true, text: pr.saved })
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof Error ? err.message : pr.saveFailed,
      })
      throw err
    }
  }

  useImperativeHandle(ref, () => ({ save, validate }))

  if (loadError) return null

  const joined = rules.filter((r) => r.id in effective)
  const candidates = rules.filter(
    (r) =>
      !(r.id in effective) &&
      r.name.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const sizeRule =
    modal?.step === 'sizes'
      ? rules.find((r) => r.id === modal.ruleId)
      : undefined

  return (
    <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="pm-display text-base">{pr.title}</h2>
          <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
            {pr.intro}
            {sizes.length > 0 && pr.oneSizeOneBundle}
          </p>
        </div>
        {rules.length > 0 && (
          <button
            type="button"
            onClick={openPicker}
            className="app-btn-outline shrink-0"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            {pr.addBundle}
          </button>
        )}
      </div>

      {!isLoading && rules.length === 0 && (
        <div
          className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-4 text-sm"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <p style={{ color: 'var(--app-text-soft)' }}>
            {pr.emptyRules}
          </p>
          <Link
            to="/partner/paket/baru"
            className="app-btn-outline no-underline"
            style={{ minHeight: 40, fontSize: 13 }}
          >
            {pr.createRule}
          </Link>
        </div>
      )}

      {rules.length > 0 && joined.length === 0 && (
        <button
          type="button"
          onClick={openPicker}
          className="rounded-xl border border-dashed p-4 text-sm"
          style={{
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-soft)',
          }}
        >
          {pr.notInBundle}
        </button>
      )}

      {joined.length > 0 && (
        <div className="flex flex-col gap-2">
          {joined.map((r) => {
            const chosen = effective[r.id]
            return (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-xl border p-3"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="truncate font-semibold">{r.name}</span>
                    {!r.isActive && (
                      <span
                        className="text-[11px] font-semibold uppercase"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        {pr.inactive}
                      </span>
                    )}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {pr.ruleSummary(r.minQty, formatRupiah(r.bundlePrice))}
                  </span>
                  {sizes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {chosen.length === 0 ? (
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: 'var(--app-danger)' }}
                        >
                          {pr.noSizeChosen}
                        </span>
                      ) : (
                        chosen.map((size) => (
                          <span
                            key={size}
                            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{ background: 'var(--app-accent-strong)', color: 'var(--app-on-solid)' }}
                          >
                            {size}
                          </span>
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => editSizes(r.id)}
                        className="text-[11px] font-semibold underline"
                        style={{ color: 'var(--app-accent-strong)' }}
                      >
                        {pr.editSizes}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeRule(r.id)}
                  aria-label={pr.removeFrom(r.name)}
                  title={pr.removeFromThis}
                  className="p-1"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <X size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {rules.length > 0 && (
        <Link
          to="/partner/paket"
          className="self-start text-xs font-semibold no-underline"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          {pr.manageRules}
        </Link>
      )}

      {status && (
        <p
          className="text-sm"
          style={{ color: status.ok ? 'var(--app-success)' : 'var(--app-danger)' }}
          role="status"
        >
          {status.text}
        </p>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.step === 'pick' ? pr.pickBundle : pr.pickSizes}
            className="app-card flex max-h-[85dvh] w-full max-w-md flex-col gap-3 p-4 lg:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {modal.step === 'sizes' && modal.fromPick && (
                  <button
                    type="button"
                    onClick={() => setModal({ step: 'pick' })}
                    aria-label={pr.backToList}
                    className="-ml-1 p-1"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div className="min-w-0">
                  <h3 className="pm-display truncate text-base">
                    {modal.step === 'pick' ? pr.pickBundle : sizeRule?.name}
                  </h3>
                  <p
                    className="text-[11px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {modal.step === 'pick' ? pr.pickBundleHint : pr.pickSizesHint}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label={t.common.close}
                className="p-1"
              >
                <X size={18} />
              </button>
            </div>

            {modal.step === 'pick' && (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={pr.searchBundle}
                  aria-label={pr.searchBundle}
                  className="app-input"
                  autoFocus
                />
                <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
                  {candidates.length === 0 ? (
                    <p
                      className="py-6 text-center text-sm"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {search.trim() ? pr.noMatch : pr.allApplied}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {candidates.map((r) => {
                        const reason = unavailableReason(r.id)
                        return (
                          <button
                            key={r.id}
                            type="button"
                            disabled={reason !== null}
                            onClick={() => pickRule(r.id)}
                            className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                            style={{ borderColor: 'var(--app-border)' }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {r.name}
                                {!r.isActive && (
                                  <span
                                    className="ml-2 text-[11px] uppercase"
                                    style={{ color: 'var(--app-text-soft)' }}
                                  >
                                    {pr.inactive}
                                  </span>
                                )}
                              </span>
                              <span
                                className="text-[11px]"
                                style={{ color: 'var(--app-text-soft)' }}
                              >
                                {reason ??
                                  pr.ruleSummary(r.minQty, formatRupiah(r.bundlePrice))}
                              </span>
                            </span>
                            {reason === null && (
                              <ChevronRight
                                size={16}
                                className="shrink-0"
                                style={{ color: 'var(--app-text-soft)' }}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {modal.step === 'sizes' && sizeRule && (
              <SizePicker
                sizes={sizes}
                used={usedByOthers(sizeRule.id)}
                draft={modal.draft}
                onChange={(draft) => setModal({ ...modal, draft })}
                onApply={() => {
                  applyRule(sizeRule.id, modal.draft)
                  setModal(null)
                }}
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function SizePicker({
  sizes,
  used,
  draft,
  onChange,
  onApply,
}: {
  sizes: Array<string>
  /** Ukuran yang sudah ikut paket lain: ukuran -> nama paket. */
  used: Map<string, string>
  draft: Array<string>
  onChange: (draft: Array<string>) => void
  onApply: () => void
}) {
  const pr = usePartnerT().productRule
  const free = sizes.filter((size) => !used.has(size))
  const allOn = free.length > 0 && free.every((size) => draft.includes(size))
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{pr.sizes}</span>
        <button
          type="button"
          onClick={() => onChange(allOn ? [] : free)}
          className="text-[11px] font-semibold underline"
          style={{ color: 'var(--app-accent-strong)' }}
        >
          {allOn ? pr.clear : pr.selectAll}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const owner = used.get(size)
          const on = draft.includes(size)
          return (
            <button
              key={size}
              type="button"
              aria-pressed={on}
              disabled={owner !== undefined}
              title={owner ? pr.alreadyIn(owner) : undefined}
              onClick={() =>
                onChange(
                  on ? draft.filter((x) => x !== size) : [...draft, size],
                )
              }
              className="rounded-full border px-3 py-1 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: on ? 'var(--app-accent-strong)' : 'transparent',
                color: on ? '#fff' : 'var(--app-text)',
                borderColor: on ? 'var(--app-accent-strong)' : 'var(--app-border)',
              }}
            >
              {size}
            </button>
          )
        })}
      </div>
      {used.size > 0 && (
        <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
          {pr.dimmedNote}
        </p>
      )}
      <button
        type="button"
        onClick={onApply}
        disabled={draft.length === 0}
        className="app-btn-primary mt-1 w-full disabled:opacity-50"
        style={{ minHeight: 44, fontSize: 14 }}
      >
        {draft.length === 0
          ? pr.pickAtLeastOne
          : pr.applyTo(draft.length)}
      </button>
    </>
  )
}
