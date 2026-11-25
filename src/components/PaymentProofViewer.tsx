import { useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { useOptionalPartnerI18n } from './PartnerI18n'

interface PaymentProofViewerProps {
  /** Bukti transfer sebagai data URL (disimpan di `subscriptions.payment_proof_image`). */
  src: string
  label?: string
  className?: string
}

/**
 * Tombol "Lihat bukti transfer" yang membuka gambar di dalam aplikasi.
 *
 * Kenapa bukan `<a href={dataUrl} target="_blank">`: browser modern (Chrome,
 * Safari) memblokir navigasi ke URL `data:` di tab baru, jadi tautannya
 * kelihatan "mati". `<img src={dataUrl}>` tidak kena blokir itu.
 */
export default function PaymentProofViewer({
  src,
  label,
  className = 'mt-3 flex items-center gap-1.5 text-xs font-semibold',
}: PaymentProofViewerProps) {
  const [open, setOpen] = useState(false)
  const iv = useOptionalPartnerI18n().t.invoice

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        style={{ color: 'var(--app-accent)' }}
      >
        <ImageIcon size={14} />
        {label ?? iv.proofView}
      </button>
      {open && <ProofLightbox src={src} onClose={() => setOpen(false)} />}
    </>
  )
}

function ProofLightbox({
  src,
  onClose,
}: {
  src: string
  onClose: () => void
}) {
  // Tombol back HP/browser menutup preview, bukan meninggalkan halaman.
  useBackToClose(true, onClose)
  const iv = useOptionalPartnerI18n().t.invoice

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={iv.proofTitle}
        className="relative z-10 flex max-h-[90vh] w-full max-w-[420px] flex-col items-center"
      >
        <button
          type="button"
          onClick={onClose}
          className="mb-2 self-end rounded-full bg-black/60 p-2 text-white"
          aria-label={iv.close}
        >
          <X size={18} />
        </button>
        <img
          src={src}
          alt={iv.proofTitle}
          className="max-h-[80vh] w-full rounded-xl bg-white object-contain"
        />
      </div>
    </div>
  )
}
