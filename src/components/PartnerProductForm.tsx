import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { getErrorMessage } from '../lib/error-message'
import {
  PRODUCT_CODE_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  formatRupiah,
  parseRupiah,
} from '../lib/partner-product-rules'
import {
  blobToDataUrl,
  fileToProductPhotoBlob,
} from '../lib/product-photo-image'

export type PartnerProductPhotoChange =
  | { action: 'keep' }
  | { action: 'remove' }
  | { action: 'replace'; dataUrl: string }

export interface PartnerProductFormValue {
  name: string
  code: string
  price: number
  description: string
  isActive: boolean
  photo: PartnerProductPhotoChange
}

export interface PartnerProductFormInitial {
  name: string
  code: string | null
  price: number
  description: string | null
  isActive: boolean
  /** URL foto yang sudah tersimpan (kalau ada). */
  photoUrl: string | null
}

interface PartnerProductFormProps {
  initial?: PartnerProductFormInitial
  submitLabel: string
  onSubmit: (value: PartnerProductFormValue) => Promise<void>
}

/** Form tambah/ubah produk partner (dipakai halaman `baru` dan `$id`). */
export default function PartnerProductForm({
  initial,
  submitLabel,
  onSubmit,
}: PartnerProductFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [priceText, setPriceText] = useState(
    initial ? String(initial.price) : '',
  )
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  // Foto yang sedang ditampilkan + perubahan yang akan dikirim.
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initial?.photoUrl ?? null,
  )
  const [photo, setPhoto] = useState<PartnerProductPhotoChange>({
    action: 'keep',
  })
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const price = parseRupiah(priceText)

  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
    e.target.value = ''
    if (!file) return
    setError(null)
    setPhotoBusy(true)
    try {
      const blob = await fileToProductPhotoBlob(file)
      const dataUrl = await blobToDataUrl(blob)
      setPhoto({ action: 'replace', dataUrl })
      setPreviewUrl(dataUrl)
    } catch (err) {
      setError(getErrorMessage(err, 'Foto tidak bisa diproses'))
    } finally {
      setPhotoBusy(false)
    }
  }

  function handleRemovePhoto() {
    setPreviewUrl(null)
    // Foto yang belum pernah disimpan cukup dilepas; yang sudah tersimpan
    // ditandai untuk dihapus saat disimpan.
    setPhoto(initial?.photoUrl ? { action: 'remove' } : { action: 'keep' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (price === null) {
      setError('Harga tidak valid. Isi angka rupiah, mis. 189000 atau 189.000.')
      return
    }
    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim(),
        price,
        description: description.trim(),
        isActive,
        photo,
      })
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan produk'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex items-center gap-4">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border"
          style={{
            borderColor: 'var(--app-border)',
            background: 'var(--app-accent-soft)',
            color: 'var(--app-accent)',
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Foto produk"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagePlus size={28} />
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            disabled={photoBusy}
            onClick={() => fileInput.current?.click()}
            className="app-btn-outline"
            style={{ width: 'auto', padding: '0.5rem 0.9rem' }}
          >
            {photoBusy
              ? 'Memproses...'
              : previewUrl
                ? 'Ganti foto'
                : 'Unggah foto'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="flex items-center gap-1 text-xs font-semibold"
              style={{ color: 'var(--app-danger)' }}
            >
              <Trash2 size={13} />
              Hapus foto
            </button>
          )}
          <p className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
            Otomatis dipotong kotak dan dikecilkan.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePickPhoto}
        />
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama produk
        <input
          required
          maxLength={PRODUCT_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="app-input"
          placeholder="mis. Kemeja Koko Premium"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Kode (opsional)
          <input
            maxLength={PRODUCT_CODE_MAX}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="app-input"
            placeholder="KKP-001"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Harga (Rp)
          <input
            required
            inputMode="numeric"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            className="app-input"
            placeholder="189000"
          />
        </label>
      </div>
      {price !== null && priceText.trim() !== '' && (
        <p className="-mt-2 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {formatRupiah(price)}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Deskripsi (opsional)
        <textarea
          rows={4}
          maxLength={PRODUCT_DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="app-input"
          placeholder="Bahan, ukuran, atau catatan lain"
        />
      </label>

      <label
        className="flex items-start justify-between gap-3 rounded-2xl border p-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
        }}
      >
        <span className="flex flex-col gap-0.5 text-sm">
          <span className="font-semibold">Tampilkan di katalog</span>
          <span className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Produk nonaktif disembunyikan, tapi datanya tetap tersimpan.
          </span>
        </span>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
      </label>

      {error && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || photoBusy}
        className="app-btn-primary"
      >
        {isSubmitting ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
  )
}
