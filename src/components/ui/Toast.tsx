import { useCallback, useEffect, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'

/**
 * Alert melayang (toast) untuk info sesaat.
 *
 * Sengaja `position: fixed` supaya TIDAK ikut masuk alur layout — beda dengan
 * banner biasa yang bikin komponen di bawahnya ketarik turun. Munculnya naik
 * dari bawah, hilangnya naik + memudar (animasinya di `.app-toast` pada
 * `styles.css`).
 *
 * Lama tampil diatur `duration` (auto-dismiss) dan bisa ditutup manual; dua-duanya
 * minta parent melepas komponennya lewat `onClose` setelah animasi keluar selesai.
 */

/** Lama animasi keluar (ms) — samakan dengan transisi `.app-toast` di styles.css. */
const LEAVE_MS = 200

interface ToastProps {
  message: string
  /** Berapa lama alert tampil sebelum hilang sendiri (ms). */
  duration?: number
  onClose: () => void
}

export default function Toast({
  message,
  duration = 4000,
  onClose,
}: ToastProps) {
  // 'entering' -> dipasang dari posisi bawah, lalu 'visible' supaya ia naik.
  const [state, setState] = useState<'entering' | 'visible' | 'leaving'>(
    'entering',
  )
  const closingRef = useRef(false)
  const leaveTimerRef = useRef<number | null>(null)

  // Callback disimpan di ref: parent sering re-render (query refetch), dan kalau
  // `onClose` jadi dependency efek di bawah, timer-nya ikut ke-reset terus.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Naik ke posisi tetap. Butuh satu frame dulu supaya transisinya jalan
  // (kalau langsung 'visible', browser cuma melukis kondisi akhirnya).
  useEffect(() => {
    const frame = window.setTimeout(() => setState('visible'), 16)
    return () => window.clearTimeout(frame)
  }, [])

  const dismiss = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setState('leaving')
    leaveTimerRef.current = window.setTimeout(
      () => onCloseRef.current(),
      LEAVE_MS,
    )
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(dismiss, duration)
    return () => {
      window.clearTimeout(timer)
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current)
      }
    }
  }, [dismiss, duration])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-6">
      <div
        role="status"
        aria-live="polite"
        data-state={state}
        className="app-toast pointer-events-auto flex w-full max-w-[420px] items-start gap-2 rounded-2xl border px-4 py-3 text-xs font-medium shadow-xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-accent-soft)',
          color: 'var(--app-text)',
        }}
      >
        <Info
          size={16}
          className="mt-0.5 flex-shrink-0"
          style={{ color: 'var(--app-accent)' }}
        />
        <span className="flex-1 leading-relaxed">{message}</span>
        <button
          type="button"
          onClick={dismiss}
          className="flex-shrink-0 opacity-60 transition-opacity hover:opacity-100"
          style={{ color: 'var(--app-text-soft)' }}
          aria-label="Tutup notifikasi"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
