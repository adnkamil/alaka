import type { PartnerReviewState } from '../lib/use-partner-review'

/**
 * Batas waktu sanggah dan tombol simpan untuk pengecekan barang. Jumlah yang
 * dapat diisi di kolom "Dapat" pada tabel barang jastiper.
 */
export default function PartnerReviewFooter({
  review,
}: {
  review: PartnerReviewState
}) {
  if (!review.data) return null
  if (!review.submitted) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
        Jastiper ini belum mengirim pesanan ke kamu, jadi belum bisa dicek.
      </p>
    )
  }

  return (
    <div className="app-card flex flex-col gap-3 p-4">
      <p className="text-[13px]" style={{ color: 'var(--app-text-soft)' }}>
        {review.reviewed
          ? 'Ubah kolom "Dapat" untuk mengoreksi hasil, atau isi "Pengganti dapat" untuk memverifikasi barang pengganti. Paket yang kekurangan barang kembali ke keputusan jastiper.'
          : 'Isi kolom "Dapat" di tabel. Bawaan: dapat semua. Barang yang kurang dibagikan ke pemesan yang masuk lebih dulu.'}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-[13px] font-semibold">
          Batas waktu sanggah (WIB)
          <input
            type="datetime-local"
            value={review.deadline}
            onChange={(e) => review.setDeadline(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm font-normal"
            style={{ borderColor: 'var(--app-border)' }}
          />
          <span
            className="text-[12px] font-normal"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {review.reviewed ? 'Hanya boleh diperpanjang. ' : 'Wajib diisi. '}
            Lewat batas, paket bermasalah otomatis &quot;tidak ganti&quot;.
          </span>
        </label>
        <button
          type="button"
          disabled={review.busy}
          onClick={() => void review.save()}
          className="app-btn-primary disabled:opacity-50 sm:min-w-44"
        >
          {review.reviewed ? 'Simpan perubahan' : 'Selesai dicek'}
        </button>
      </div>
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
    </div>
  )
}
