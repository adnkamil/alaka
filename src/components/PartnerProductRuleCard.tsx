import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useImperativeHandle, useState } from 'react'
import { listPartnerRules, setPartnerProductRules } from '../lib/partner-rule-functions'

const RULES_KEY = ['partner-rules']

export type PartnerProductRuleCardHandle = { save: () => Promise<void> }

function rulesOf(rules: Array<{ id: string; productIds: Array<string> }>, productId: string) {
  return rules.filter((r) => r.productIds.includes(productId)).map((r) => r.id)
}

/**
 * Kartu "Paket" di halaman produk. Satu produk bisa masuk beberapa aturan
 * (mis. S–L dan XL–XXL dengan harga paket berbeda). Centang aturan yang dipakai.
 */
export default function PartnerProductRuleCard({
  productId,
  ref,
}: {
  productId: string
  ref?: React.Ref<PartnerProductRuleCardHandle>
}) {
  const queryClient = useQueryClient()
  const { data: rules = [], error: loadError } = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => listPartnerRules(),
  })
  const currentIds = rulesOf(rules, productId)
  const currentKey = currentIds.slice().sort().join(',')
  const [selected, setSelected] = useState<Array<string>>([])
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setSelected(currentIds)
    // currentKey dipakai sebagai dependency supaya tidak reset terus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

  const dirty = selected.slice().sort().join(',') !== currentKey

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function save() {
    setStatus(null)
    try {
      await setPartnerProductRules({ data: { productId, ruleIds: selected } })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
      setStatus({ ok: true, text: 'Paket produk tersimpan.' })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Gagal menyimpan paket' })
      throw err
    }
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (dirty) await save()
    },
  }))

  if (loadError) return null

  return (
    <section className="app-card flex flex-col gap-3 p-4 lg:p-5">
      <div>
        <h2 className="pm-display text-base">Paket</h2>
        <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
          Produk ini bisa masuk lebih dari satu aturan paket, selama rentang ukurannya tidak sama.
          Bisa diubah dari halaman ini atau dari halaman Paket.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold">Aturan paket</span>
        {rules.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada aturan paket.
          </p>
        )}
        {rules.map((r) => {
          const on = selected.includes(r.id)
          return (
            <label
              key={r.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(r.id)}
                className="h-4 w-4 accent-[#7a4a2a]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  {r.name}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {status && (
        <p className="text-sm" style={{ color: status.ok ? '#3f7d58' : '#b42318' }} role="status">
          {status.text}
        </p>
      )}
    </section>
  )
}
