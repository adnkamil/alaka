import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { fetchPartnerProducts } from '../../../lib/partner-product-functions'
import {
  deletePartnerRule,
  listPartnerRules,
  savePartnerRule,
} from '../../../lib/partner-rule-functions'

export const Route = createFileRoute('/partner/paket/')({
  component: PartnerPaketPage,
})

type RuleDraft = {
  id?: string
  name: string
  minQty: string
  bundlePrice: string
  isActive: boolean
  productIds: Array<string>
}

const emptyDraft: RuleDraft = {
  name: '',
  minQty: '3',
  bundlePrice: '',
  isActive: true,
  productIds: [],
}

const RULES_KEY = ['partner-rules']

function PartnerPaketPage() {
  const queryClient = useQueryClient()
  const { data: rules = [] } = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => listPartnerRules(),
  })
  const { data: products = [] } = useQuery({
    queryKey: ['partner-products'],
    queryFn: () => fetchPartnerProducts(),
  })
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const productName = new Map(products.map((p) => [p.id, p.name]))

  function toggleProduct(id: string) {
    if (!draft) return
    const has = draft.productIds.includes(id)
    setDraft({
      ...draft,
      productIds: has ? draft.productIds.filter((p) => p !== id) : [...draft.productIds, id],
    })
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      await savePartnerRule({
        data: {
          id: draft.id,
          name: draft.name,
          minQty: Number(draft.minQty),
          bundlePrice: Number(draft.bundlePrice),
          isActive: draft.isActive,
          productIds: draft.productIds,
        },
      })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aturan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Hapus aturan paket ini? Pesanan yang sudah memakainya tidak berubah.')) return
    try {
      await deletePartnerRule({ data: { id } })
      await queryClient.invalidateQueries({ queryKey: RULES_KEY })
      if (draft?.id === id) setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus aturan')
    }
  }

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pb-[120px] pt-4 lg:gap-5 lg:pb-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">Aturan Paket</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
            {rules.length} aturan · membutuhkan langganan PRO
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setDraft({ ...emptyDraft })
          }}
          className="app-btn-primary gap-2"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          <Plus size={16} />
          Tambah aturan
        </button>
      </header>

      {rules.length === 0 && !draft && (
        <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
          <Layers size={28} style={{ color: 'var(--app-text-soft)' }} />
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum ada aturan paket. Contoh: 3 pcs Rp100.000.
          </p>
        </div>
      )}

      {rules.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rules.map((rule) => (
            <article key={rule.id} className="app-card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{rule.name}</p>
                  <p className="pm-num mt-0.5 text-sm" style={{ color: 'var(--app-accent)' }}>
                    {rule.minQty} pcs · Rp{rule.bundlePrice.toLocaleString('id-ID')}
                  </p>
                </div>
                <span className={`app-badge shrink-0 ${rule.isActive ? '' : 'opacity-60'}`}>
                  {rule.isActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {rule.productIds.length === 0 && (
                  <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>Belum ada produk</span>
                )}
                {rule.productIds.map((id) => (
                  <span key={id} className="pm-chip">
                    {productName.get(id) ?? 'Produk'}
                  </span>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="app-btn-outline"
                  style={{ minHeight: 36, fontSize: 13 }}
                  onClick={() => {
                    setError(null)
                    setDraft({
                      id: rule.id,
                      name: rule.name,
                      minQty: String(rule.minQty),
                      bundlePrice: String(rule.bundlePrice),
                      isActive: rule.isActive,
                      productIds: rule.productIds,
                    })
                  }}
                >
                  Ubah
                </button>
                <button
                  type="button"
                  className="app-btn-outline"
                  style={{ minHeight: 36, fontSize: 13, color: '#b42318' }}
                  onClick={() => handleDelete(rule.id)}
                >
                  Hapus
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
          <h2 className="pm-display text-base">{draft.id ? 'Ubah aturan' : 'Aturan baru'}</h2>

          <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-4">
            <label className="flex flex-col gap-1.5 lg:col-span-2">
              <span className="text-xs font-semibold">Nama aturan</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Mis. 3 pcs Rp100.000"
                className="app-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Jumlah pcs per paket</span>
              <input
                type="number"
                min={1}
                value={draft.minQty}
                onChange={(e) => setDraft({ ...draft, minQty: e.target.value })}
                className="app-input pm-num"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Harga paket (HPP jastiper)</span>
              <input
                type="number"
                min={0}
                value={draft.bundlePrice}
                onChange={(e) => setDraft({ ...draft, bundlePrice: e.target.value })}
                className="app-input pm-num"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border p-3.5" style={{ borderColor: 'var(--app-border)' }}>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold">Aktif</span>
              <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                Aturan nonaktif tidak bisa dipilih jastiper.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.isActive}
              aria-label="Aktif"
              onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
              className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors"
              style={{ background: draft.isActive ? '#3f7d58' : '#d9cfbf' }}
            >
              <span
                className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
                style={{ left: draft.isActive ? 23 : 3 }}
              />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold">Produk dalam aturan</span>
            <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
              Satu produk hanya boleh masuk satu aturan.
            </p>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => {
                const active = draft.productIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleProduct(p.id)}
                    className={`pm-chip ${active ? 'pm-chip--active' : ''}`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm" style={{ color: '#b42318' }}>
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="app-btn-outline"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="app-btn-primary"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              {saving ? 'Menyimpan…' : 'Simpan aturan'}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
