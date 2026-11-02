import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { listPartnerRules, setPartnerProductRule } from '../lib/partner-rule-functions'

const RULES_KEY = ['partner-rules']

/**
 * Kartu "Paket" di halaman produk. Menampilkan paket yang sedang dipakai
 * produk ini dan bisa diganti langsung dari sini.
 */
export default function PartnerProductRuleCard({ productId }: { productId: string }) {
  const queryClient = useQueryClient()
  const { data: rules = [], error: loadError } = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => listPartnerRules(),
  })
  const currentRule = rules.find((r) => r.productIds.includes(productId)) ?? null
  const [selected, setSelected] = useState<string>('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(currentRule?.id ?? '')
  }, [currentRule?.id])

  const dirty = selected !== (currentRule?.id ?? '')

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      await setPartnerProductRule({
        data: { productId, ruleId: selected === '' ? null : selected },
      })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
      setStatus({ ok: true, text: 'Paket produk tersimpan.' })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan paket' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return null

  return (
    <section className="app-card flex flex-col gap-3 p-4 lg:p-5">
      <div>
        <h2 className="pm-display text-base">Paket</h2>
        <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
          Produk ini ikut aturan paket mana. Bisa diubah dari halaman ini atau dari halaman Paket.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Aturan paket</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="app-input"
        >
          <option value="">Tidak masuk paket</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.minQty} pcs · Rp{r.bundlePrice.toLocaleString('id-ID')}
              {r.id !== currentRule?.id && r.productIds.length > 0 ? ' (sudah ada produknya)' : ''}
            </option>
          ))}
        </select>
      </label>
      {status && (
        <p className="text-sm" style={{ color: status.ok ? '#3f7d58' : '#b42318' }} role="status">
          {status.text}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="app-btn-outline"
          style={{ minHeight: 40, fontSize: 13 }}
        >
          {saving ? 'Menyimpan…' : 'Simpan paket'}
        </button>
      </div>
    </section>
  )
}
