import {
  buildKabariMessage,
  formatWibDateTime,
  partnerStatusCopy,
} from '../lib/event-slot'
import { buildWhatsAppLink } from '../lib/format'
import PartnerStatusBadge from './PartnerStatusBadge'
import type { PartnerReviewState } from '../lib/use-partner-review'

export type KabariContact = {
  waNumber: string | null
  brandName: string
  totalAmount: number
}

/**
 * Kartu status di sisi kanan halaman detail jastiper (Partner Portal): badge,
 * judul dan keterangan, batas sanggah, serta tombol aksi sesuai status:
 * "Selesai dicek" (pengajuan), "Hubungi jastiper" (dikembalikan), atau
 * "Kabari jastiper" (disetujui). Jumlah yang dapat diisi di kolom "Dapat".
 */
export default function PartnerReviewFooter({
  review,
  contact,
  hasItems,
  allSufficient,
}: {
  review: PartnerReviewState
  contact?: KabariContact
  /** Jastiper sudah menginput barang (walau belum submit). */
  hasItems: boolean
  /** Semua barang yang diminta sudah dapat. */
  allSufficient: boolean
}) {
  if (!review.data) return null
  const status = review.data.status
  const final = status === 'disetujui' || status === 'menyetujui'
  const editable = status === 'terkirim' || status === 'menunggu_verifikasi'
  const copy = partnerStatusCopy({
    status,
    hasItems,
    sanggahCount: review.data.sanggahCount,
  })
  const deadline = review.data.sanggahDeadline
    ? new Date(review.data.sanggahDeadline)
    : null
  const message = contact
    ? buildKabariMessage({
        status,
        brandName: contact.brandName,
        eventName: review.data.eventName || 'event',
        totalAmount: contact.totalAmount,
        sanggahDeadline: deadline,
      })
    : ''
  const waHref = contact?.waNumber
    ? buildWhatsAppLink(contact.waNumber, message)
    : null

  return (
    <section className="app-card flex flex-col gap-3 p-5">
      <PartnerStatusBadge status={status} />
      <div className="flex flex-col gap-1.5">
        <p className="text-[17px] font-bold leading-tight">{copy.title}</p>
        <p className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
          {copy.description}
        </p>
      </div>

      {editable && (
        <label className="flex flex-col gap-1 text-[11px]">
          <span style={{ color: 'var(--app-text-soft)' }}>
            Batas sanggah (WIB)
          </span>
          <input
            type="datetime-local"
            value={review.deadline}
            onChange={(e) => review.setDeadline(e.target.value)}
            className="rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: 'var(--app-border)' }}
          />
        </label>
      )}
      {editable && (
        <button
          type="button"
          disabled={review.busy}
          onClick={() => void review.save()}
          className="app-btn-primary w-full disabled:opacity-50"
        >
          Selesai dicek
        </button>
      )}

      {status === 'sanggah' && (
        <>
          {deadline && (
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[11px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Batas sanggah
              </span>
              <span className="text-[15px] font-semibold">
                {formatWibDateTime(deadline)}
              </span>
            </div>
          )}
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="app-btn-outline w-full no-underline"
            >
              Hubungi jastiper
            </a>
          )}
        </>
      )}

      {final && (
        <>
          {allSufficient && (
            <p
              className="text-[13px] font-semibold"
              style={{ color: 'var(--app-success)' }}
            >
              ✓ Semua barang sudah cukup
            </p>
          )}
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="app-btn-primary w-full no-underline"
              style={{ background: 'var(--app-success)' }}
            >
              Kabari jastiper
            </a>
          )}
        </>
      )}

      {review.message && (
        <p
          className="text-[13px]"
          style={{
            color: review.message.error ? '#b42318' : 'var(--app-success)',
          }}
        >
          {review.message.text}
        </p>
      )}
    </section>
  )
}
