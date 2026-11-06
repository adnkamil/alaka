// Pratinjau paket di form pesanan: menghitung paket yang akan terbentuk dari barang
// di form, sebelum disimpan. Memakai logika FIFO yang sama dengan server. Murni,
// tanpa db, sehingga aman dipakai di browser.
import { formBundles } from './partner-bundle-fifo'

export type PreviewDraft = {
  key: string
  name: string
  partnerVariantId: string | null
  qty: number
}

export type PreviewCatalog = {
  rules: Array<{
    id: string
    name: string
    minQty: number
    bundlePrice: number
    productIds: Array<string>
    /** Kosong atau tidak ada = semua ukuran. */
    sizes?: Array<string>
  }>
  variants: Array<{ id: string; productId: string; size?: string | null }>
}

export type PreviewBundle = {
  ruleId: string
  ruleName: string
  bundlePrice: number
  parts: Array<{ key: string; label: string; qty: number }>
}

export type PreviewPending = {
  ruleId: string
  ruleName: string
  pcsShort: number
}

export function previewPartnerBundles(
  drafts: Array<PreviewDraft>,
  catalog: PreviewCatalog,
): { bundles: Array<PreviewBundle>; pending: Array<PreviewPending> } {
  const variantById = new Map(catalog.variants.map((v) => [v.id, v]))
  // Aturan yang cocok untuk satu barang: produknya ada di aturan dan ukurannya
  // masuk rentang aturan (kosong = semua ukuran).
  const ruleFor = (variantId: string) => {
    const variant = variantById.get(variantId)
    if (!variant) return undefined
    return catalog.rules.find(
      (rule) =>
        rule.productIds.includes(variant.productId) &&
        (!rule.sizes?.length ||
          (variant.size != null && rule.sizes.includes(variant.size))),
    )
  }

  // Kelompokkan barang per aturan. Urutan form dipakai sebagai urutan masuk (FIFO).
  const groups = new Map<string, { rule: (typeof catalog.rules)[number]; rows: Array<{ draft: PreviewDraft; index: number }> }>()
  drafts.forEach((draft, index) => {
    if (!draft.partnerVariantId || draft.qty < 1) return
    const rule = ruleFor(draft.partnerVariantId)
    if (!rule) return
    const group = groups.get(rule.id) ?? { rule, rows: [] }
    group.rows.push({ draft, index })
    groups.set(rule.id, group)
  })

  const bundles: Array<PreviewBundle> = []
  const pending: Array<PreviewPending> = []
  for (const [ruleId, group] of groups) {
    const labelByKey = new Map(group.rows.map((r) => [r.draft.key, r.draft.name]))
    const plan = formBundles(
      group.rows.map((r) => ({
        itemId: r.draft.key,
        qty: r.draft.qty,
        addedAt: new Date(r.index),
      })),
      group.rule.minQty,
    )
    for (const bundle of plan.bundles) {
      bundles.push({
        ruleId,
        ruleName: group.rule.name,
        bundlePrice: group.rule.bundlePrice,
        parts: bundle.parts.map((p) => ({
          key: p.itemId,
          label: labelByKey.get(p.itemId) ?? '',
          qty: p.qty,
        })),
      })
    }
    if (plan.pendingPcs > 0) {
      pending.push({ ruleId, ruleName: group.rule.name, pcsShort: plan.pcsShort })
    }
  }
  return { bundles, pending }
}
