import { useState } from 'react'
import { Lock, Plus, Sparkles, Trash2 } from 'lucide-react'
import NumberInput from './ui/NumberInput'
import { validateFeeTiers } from '../lib/fee-tier-validation'
import type { FeeTierInput } from '../lib/fee-tier-validation'
import type { FeeSuggestion } from '../lib/fee-suggestions'

export interface FeeRuleFormValue {
  name: string
  tiers: Array<FeeTierInput>
}

interface FeeRuleFormProps {
  initialValue?: FeeRuleFormValue
  /** Saran tier dari riwayat harga & fee barang user (fitur PRO `fee_suggestions`). */
  suggestions?: Array<FeeSuggestion>
  /** Fitur saran fee sedang terkunci (user FREE) — server tidak mengirim datanya. */
  suggestionsLocked?: boolean
  submitLabel: string
  onSubmit: (value: FeeRuleFormValue) => Promise<void>
}

const emptyTier: FeeTierInput = { minPrice: 0, maxPrice: 0, feeAmount: 0 }

function formatCompact(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function FeeRuleForm({
  initialValue,
  suggestions = [],
  suggestionsLocked = false,
  submitLabel,
  onSubmit,
}: FeeRuleFormProps) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [tiers, setTiers] = useState<Array<FeeTierInput>>(
    initialValue?.tiers ?? [{ ...emptyTier }],
  )
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tierErrors = validateFeeTiers(tiers)
  const hasErrors = tierErrors.length > 0 || name.trim().length === 0

  function updateTier(index: number, patch: Partial<FeeTierInput>) {
    setTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    )
  }

  function addTier() {
    setTiers((prev) => [...prev, { ...emptyTier }])
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index))
  }

  /**
   * Saran dipakai apa adanya sebagai tier baru. Kalau formnya masih kosong
   * (default berisi satu tier nol), saran langsung mengisi tier itu — bukan
   * menambah tier kosong yang harus dihapus manual.
   */
  function applySuggestion(suggestion: FeeSuggestion) {
    const tier: FeeTierInput = {
      minPrice: suggestion.minPrice,
      maxPrice: suggestion.maxPrice,
      feeAmount: suggestion.feeAmount,
    }
    setTiers((prev) => {
      const isEmptyForm = prev.every(
        (item) =>
          item.minPrice === 0 && item.maxPrice === 0 && item.feeAmount === 0,
      )
      return isEmptyForm ? [tier] : [...prev, tier]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hasErrors) return
    setServerError(null)
    setIsSubmitting(true)
    try {
      await onSubmit({ name, tiers })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama aturan
        <input
          required
          placeholder="cth. Fee jastip by Mici"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="app-input"
        />
      </label>

      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--app-text-soft)' }}
      >
        Tier harga
      </p>

      {suggestionsLocked ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-mute)',
          }}
        >
          <Lock size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Saran tier otomatis dari riwayat harga &amp; fee barang tersedia di
            paket PRO.
          </span>
        </div>
      ) : (
        suggestions.length > 0 && (
          <div className="app-card p-3">
            <p
              className="mb-2 flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: 'var(--app-accent)' }}
            >
              <Sparkles size={14} />
              Saran dari riwayat pesanan
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.minPrice}
                  className="flex items-center gap-2"
                >
                  <span
                    className="flex-1 text-xs"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {formatCompact(suggestion.minPrice)}-
                    {formatCompact(suggestion.maxPrice)} ={' '}
                    {formatCompact(suggestion.feeAmount)}
                    <span style={{ color: 'var(--app-text-mute)' }}>
                      {' '}
                      · {suggestion.sampleCount} barang
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className="app-btn-outline px-3 py-1 text-xs"
                  >
                    Pakai
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      <div className="flex flex-col gap-3">
        {tiers.map((tier, index) => {
          const error = tierErrors.find((e) => e.index === index)
          return (
            <div
              key={index}
              className="app-card p-3"
              style={error ? { borderColor: 'var(--app-danger)' } : undefined}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Tier {index + 1}
                </span>
                {tiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    style={{ color: 'var(--app-danger)' }}
                    aria-label="Hapus tier"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  Harga min
                  <NumberInput
                    value={tier.minPrice}
                    onChange={(minPrice) => updateTier(index, { minPrice })}
                    className="app-input"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Harga maks
                  <NumberInput
                    value={tier.maxPrice}
                    onChange={(maxPrice) => updateTier(index, { maxPrice })}
                    className="app-input"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs">
                Fee jastip
                <NumberInput
                  value={tier.feeAmount}
                  onChange={(feeAmount) => updateTier(index, { feeAmount })}
                  className="app-input"
                />
              </label>
              {error && (
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--app-danger)' }}
                >
                  {error.message}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <button type="button" onClick={addTier} className="app-btn-outline">
        <Plus size={16} />
        Tambah tier
      </button>

      {serverError && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={hasErrors || isSubmitting}
        className="app-btn-primary"
      >
        {isSubmitting ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
  )
}
