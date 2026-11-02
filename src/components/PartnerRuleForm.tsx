import { useState } from 'react'
import RupiahInput from './ui/RupiahInput'

export type RuleFormValue = {
  name: string
  minQty: string
  bundlePrice: string
  isActive: boolean
  productIds: Array<string>
}

export type RuleFormProduct = { id: string; name: string; isActive: boolean }

interface PartnerRuleFormProps {
  title: string
  initial: RuleFormValue
  products: Array<RuleFormProduct>
  saving: boolean
  error: string | null
  onSubmit: (value: RuleFormValue) => void
  onCancel: () => void
}

/**
 * Form aturan paket. Pilihan produk berupa tabel dengan checklist. Daftar produk
 * sudah disaring oleh pemanggil (hanya produk yang tersedia).
 */
export default function PartnerRuleForm({
  title,
  initial,
  products,
  saving,
  error,
  onSubmit,
  onCancel,
}: PartnerRuleFormProps) {
  const [value, setValue] = useState<RuleFormValue>(initial)
  const [search, setSearch] = useState('')

  const visible = products.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const allVisibleChecked =
    visible.length > 0 && visible.every((p) => value.productIds.includes(p.id))

  function toggle(id: string) {
    setValue((v) => ({
      ...v,
      productIds: v.productIds.includes(id)
        ? v.productIds.filter((p) => p !== id)
        : [...v.productIds, id],
    }))
  }

  function toggleAllVisible() {
    setValue((v) => {
      const visibleIds = visible.map((p) => p.id)
      const next = allVisibleChecked
        ? v.productIds.filter((id) => !visibleIds.includes(id))
        : [...new Set([...v.productIds, ...visibleIds])]
      return { ...v, productIds: next }
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value)
      }}
    >
      <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
        <h2 className="pm-display text-base">{title}</h2>
        <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-4">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-xs font-semibold">Nama aturan</span>
            <input
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
              placeholder="Mis. 3 pcs Rp100.000"
              className="app-input"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Jumlah pcs per paket</span>
            <input
              type="number"
              min={1}
              value={value.minQty}
              onChange={(e) => setValue({ ...value, minQty: e.target.value })}
              className="app-input pm-num"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Harga paket (HPP jastiper)</span>
            <RupiahInput
              value={value.bundlePrice}
              onChange={(v) => setValue({ ...value, bundlePrice: v })}
              className="app-input pm-num"
              placeholder="100.000"
              required
            />
          </label>
        </div>

        <div
          className="flex items-center justify-between gap-3 rounded-2xl border p-3.5"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold">Aktif</span>
            <span className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
              Aturan nonaktif tidak bisa dipilih jastiper.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.isActive}
            aria-label="Aktif"
            onClick={() => setValue({ ...value, isActive: !value.isActive })}
            className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors"
            style={{ background: value.isActive ? '#3f7d58' : '#d9cfbf' }}
          >
            <span
              className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
              style={{ left: value.isActive ? 23 : 3 }}
            />
          </button>
        </div>
      </section>

      <section className="app-card flex flex-col gap-3 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="pm-display text-base">Produk dalam aturan</h2>
            <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
              {value.productIds.length} dipilih · hanya produk yang belum punya aturan yang muncul.
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk"
            className="app-input max-w-[240px]"
          />
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Tidak ada produk yang tersedia.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--app-border)' }}>
            <table className="w-full text-[13px]">
              <thead style={{ background: 'var(--app-card-soft, #f7f1e7)' }}>
                <tr>
                  <th className="w-12 px-4 py-2.5 text-left">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={toggleAllVisible}
                      aria-label="Pilih semua"
                      className="h-4 w-4 accent-[#3f7d58]"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>
                    Produk
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: 'var(--app-text-soft)' }}>
                    Status katalog
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const checked = value.productIds.includes(p.id)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      className="cursor-pointer border-t"
                      style={{
                        borderColor: 'var(--app-border)',
                        background: checked ? 'var(--app-accent-soft)' : undefined,
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Pilih ${p.name}`}
                          className="h-4 w-4 accent-[#3f7d58]"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-bold">{p.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="app-badge">{p.isActive ? 'Aktif' : 'Nonaktif'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm" style={{ color: '#b42318' }}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="app-btn-outline" style={{ minHeight: 44, fontSize: 14 }}>
          Batal
        </button>
        <button
          type="submit"
          disabled={saving || value.productIds.length === 0}
          className="app-btn-primary"
          style={{ minHeight: 44, fontSize: 14 }}
        >
          {saving ? 'Menyimpan…' : 'Simpan aturan'}
        </button>
      </div>
    </form>
  )
}
