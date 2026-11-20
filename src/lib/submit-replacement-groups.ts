// Status alur pengganti per submit (server-only, menerima `tx`). Aturan murni
// ada di `submit-replacement.ts`. Tidak mengunci apa pun kecuali diminta, jadi
// aman dipakai untuk membaca daftar dan pratinjau.
import { and, eq, inArray } from 'drizzle-orm'
import { eventSubmissions, itemComponents, items } from '../db/schema'
import type { OrderTx } from './order-status-queries'
import { analyzeHoles, replacementGroups } from './submit-replacement'
import type {
  GroupSubmit,
  Hole,
  ReplacementGroup,
  ReplacementRow,
} from './submit-replacement'

/** Semua baris satuan dan komponen paket yang diajukan lewat submit-submit ini. */
export async function loadGroupRows(
  tx: OrderTx,
  submissionIds: Array<string>,
): Promise<Array<ReplacementRow>> {
  if (submissionIds.length === 0) return []
  const singles = await tx
    .select({
      id: items.id,
      submissionId: items.submissionId,
      status: items.submitStatus,
      qty: items.qty,
      replacesItemId: items.replacesItemId,
      replacesComponentId: items.replacesComponentId,
      waivedAt: items.replacementWaivedAt,
    })
    .from(items)
    .where(
      and(inArray(items.submissionId, submissionIds), eq(items.isBundle, false)),
    )
  const comps = await tx
    .select({
      id: itemComponents.id,
      submissionId: itemComponents.submissionId,
      status: itemComponents.submitStatus,
      qty: itemComponents.qty,
      bundleQty: items.qty,
      replacesItemId: itemComponents.replacesItemId,
      replacesComponentId: itemComponents.replacesComponentId,
      waivedAt: itemComponents.replacementWaivedAt,
    })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .where(inArray(itemComponents.submissionId, submissionIds))

  const rows: Array<ReplacementRow> = []
  for (const r of singles) {
    if (!r.submissionId || !r.status) continue
    rows.push({
      id: r.id,
      kind: 'satuan',
      submissionId: r.submissionId,
      status: r.status,
      qty: r.qty,
      replacesId: r.replacesItemId ?? r.replacesComponentId,
      waivedAt: r.waivedAt,
    })
  }
  for (const c of comps) {
    if (!c.submissionId || !c.status) continue
    rows.push({
      id: c.id,
      kind: 'komponen',
      submissionId: c.submissionId,
      status: c.status,
      // Pcs komponen = jumlah paket × isi per paket.
      qty: c.bundleQty * c.qty,
      replacesId: c.replacesItemId ?? c.replacesComponentId,
      waivedAt: c.waivedAt,
    })
  }
  return rows
}

export type SubmitState = GroupSubmit & { submitNo: number }

/** Nomor dan status cek submit-submit ini. `lock` mengunci barisnya. */
export async function loadSubmitStates(
  tx: OrderTx,
  submissionIds: Array<string>,
  options: { lock?: boolean } = {},
): Promise<Array<SubmitState>> {
  if (submissionIds.length === 0) return []
  const query = tx
    .select({
      id: eventSubmissions.id,
      submitNo: eventSubmissions.submitNo,
      checkedAt: eventSubmissions.stockCheckedAt,
    })
    .from(eventSubmissions)
    .where(inArray(eventSubmissions.id, submissionIds))
    .orderBy(eventSubmissions.id)
  const rows = options.lock ? await query.for('update') : await query
  return rows.map((s) => ({
    id: s.id,
    submitNo: s.submitNo,
    checked: s.checkedAt !== null,
  }))
}

export type SubmitAnalysis = {
  /** Posisi tiap submit di alur pengganti, per id submit. */
  groups: Map<string, ReplacementGroup>
  holes: Array<Hole>
}

/** Hitung lubang dan posisi untuk submit-submit yang sudah dimuat. */
export async function analyzeSubmits(
  tx: OrderTx,
  submits: Array<GroupSubmit>,
): Promise<SubmitAnalysis> {
  const rows = await loadGroupRows(
    tx,
    submits.map((s) => s.id),
  )
  const holes = analyzeHoles(rows)
  return { groups: replacementGroups({ submits, holes }), holes }
}
