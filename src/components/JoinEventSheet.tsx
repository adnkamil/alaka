import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, ChevronDown } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'

type FeeRuleOption = { id: string; name: string }

type Props = {
  eventName: string
  /** Rentang tanggal yang sudah diformat, mis. "20 – 22 Nov 2026". */
  dateLabel: string
  feeRules: Array<FeeRuleOption>
  /** Nomor WhatsApp brand sudah terisi? Kalau belum, ikut event diblokir. */
  hasWaNumber: boolean
  /** Hanya pemilik brand yang boleh mengisi nomor WhatsApp di Profil. */
  canEditWaNumber: boolean
  onConfirm: (feeRuleId: string | null) => Promise<void>
  onClose: () => void
}

/**
 * Bottom sheet konfirmasi "Ikut event ini?" (desain Figma "Konfirmasi Ikut
 * Event"): ringkasan event + pilihan aturan fee jastip, lalu tombol
 * "Ya, Ikut Event" dan "Batal".
 */
export default function JoinEventSheet({
  eventName,
  dateLabel,
  feeRules,
  hasWaNumber,
  canEditWaNumber,
  onConfirm,
  onClose,
}: Props) {
  const [feeRuleId, setFeeRuleId] = useState('')
  const [feeOpen, setFeeOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useBackToClose(true, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape pertama menutup daftar fee, baru yang kedua menutup sheet.
      if (feeOpen) setFeeOpen(false)
      else if (!isSubmitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, isSubmitting, feeOpen])

  const feeOptions = [{ id: '', name: 'Belum dipilih' }, ...feeRules]
  const selectedFeeName =
    feeOptions.find((option) => option.id === feeRuleId)?.name ??
    'Belum dipilih'

  async function handleConfirm() {
    setError(null)
    setIsSubmitting(true)
    try {
      await onConfirm(feeRuleId || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal ikut event')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ikut event ini?"
        className="relative w-full max-w-lg rounded-t-3xl px-5 pt-3"
        style={{
          background: 'var(--app-bg)',
          color: 'var(--app-text)',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: 'var(--app-border)' }}
        />

        <h2 className="text-lg font-bold">Ikut event ini?</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Event belanja baru akan dibuat otomatis di akunmu.
        </p>

        <dl
          className="mt-4 flex flex-col gap-2 rounded-2xl px-4 py-3.5 text-sm"
          style={{ background: 'var(--app-accent-soft)' }}
        >
          <div className="flex justify-between gap-4">
            <dt style={{ color: 'var(--app-text-soft)' }}>Event</dt>
            <dd className="text-right font-medium">{eventName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt style={{ color: 'var(--app-text-soft)' }}>Tanggal</dt>
            <dd className="text-right font-medium">{dateLabel}</dd>
          </div>
        </dl>

        {/* Dropdown buatan sendiri (bukan <select>): popup bawaan browser
            posisinya tidak bisa diatur dan sering muncul jauh dari kolomnya
            saat berada di dalam bottom sheet. */}
        <div className="mt-4 text-sm font-medium">
          <span id="join-fee-label">Aturan fee jastip</span>
          <div className="relative mt-1.5">
            {feeOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setFeeOpen(false)}
                  aria-hidden="true"
                />
                <ul
                  role="listbox"
                  aria-labelledby="join-fee-label"
                  className="absolute bottom-full left-0 right-0 z-20 mb-1.5 max-h-52 overflow-y-auto rounded-xl border py-1 shadow-lg"
                  style={{
                    background: 'var(--app-card)',
                    borderColor: 'var(--app-border)',
                  }}
                >
                  {feeOptions.map((option) => {
                    const selected = option.id === feeRuleId
                    return (
                      <li
                        key={option.id || 'none'}
                        role="option"
                        aria-selected={selected}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFeeRuleId(option.id)
                            setFeeOpen(false)
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm"
                          style={{
                            color: selected
                              ? 'var(--app-accent)'
                              : 'var(--app-text)',
                            background: selected
                              ? 'var(--app-accent-soft)'
                              : 'transparent',
                          }}
                        >
                          <span>{option.name}</span>
                          {selected && <Check size={16} />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={feeOpen}
              aria-labelledby="join-fee-label"
              disabled={isSubmitting}
              onClick={() => setFeeOpen((open) => !open)}
              className="app-input relative z-20 flex items-center justify-between gap-2 text-left disabled:opacity-50"
            >
              <span>{selectedFeeName}</span>
              <ChevronDown
                size={18}
                className={feeOpen ? 'rotate-180' : ''}
                style={{ color: 'var(--app-text-soft)' }}
              />
            </button>
          </div>
        </div>

        {!hasWaNumber && (
          <p
            role="alert"
            className="mt-4 rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: 'var(--app-danger-soft)',
              color: 'var(--app-danger)',
            }}
          >
            {canEditWaNumber ? (
              <>
                Isi nomor WhatsApp brand dulu supaya penyelenggara bisa
                menghubungimu.{' '}
                <Link to="/profil" className="font-semibold underline">
                  Buka Profil
                </Link>
              </>
            ) : (
              'Nomor WhatsApp brand belum diisi. Minta pemilik brand mengisinya di Profil.'
            )}
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={isSubmitting || !hasWaNumber}
          className="app-btn-primary mt-5 h-12 w-full disabled:opacity-50"
        >
          {isSubmitting ? 'Memproses...' : 'Ya, Ikut Event'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="mt-2 h-12 w-full text-sm font-semibold disabled:opacity-50"
          style={{ color: 'var(--app-text)' }}
        >
          Batal
        </button>
      </div>
    </div>
  )
}
