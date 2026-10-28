import { useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
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

const FORM_ID = 'partner-product-form'

/** Label kolom di atas input, seperti di desain Figma. */
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-xs font-semibold"
        style={{ color: 'var(--app-text-soft)' }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Form tambah/ubah produk partner (dipakai halaman `baru` dan `$id`).
 * Tombol simpan menempel di bawah (`.pm-footer`) seperti di desain Figma.
 */
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
    <>
      <form
        id={FORM_ID}
        className="flex flex-col gap-3.5 pb-[120px]"
        onSubmit={handleSubmit}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePickPhoto}
        />
        <button
          type="button"
          disabled={photoBusy}
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border disabled:opacity-60"
          style={{
            borderColor: 'var(--app-border)',
            background: 'var(--pm-input)',
            minHeight: 120,
          }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Foto produk"
              className="h-32 w-full object-cover"
            />
          ) : (
            <>
              <Upload size={24} style={{ color: 'var(--app-accent)' }} />
              <span
                className="text-[13px] font-bold"
                style={{ color: 'var(--app-accent)' }}
              >
                {photoBusy ? 'Memproses...' : 'Unggah foto produk'}
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--app-text-soft)' }}
              >
                JPG/PNG, otomatis dikonversi ke WebP
              </span>
            </>
          )}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemovePhoto}
            className="flex items-center gap-1 self-start text-xs font-semibold"
            style={{ color: 'var(--app-danger)' }}
          >
            <Trash2 size={13} />
            Hapus foto
          </button>
        )}

        <Field label="Nama produk">
          <input
            required
            maxLength={PRODUCT_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="app-input"
            placeholder="mis. Kemeja Koko Premium"
          />
        </Field>

        <Field label="Kode produk (opsional)">
          <input
            maxLength={PRODUCT_CODE_MAX}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="app-input"
            placeholder="KKP-001"
          />
        </Field>

        <Field label="Harga">
          <input
            required
            inputMode="numeric"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            className="app-input"
            placeholder="189000"
          />
        </Field>
        {price !== null && priceText.trim() !== '' && (
          <p
            className="-mt-2 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {formatRupiah(price)}
          </p>
        )}

        <Field label="Deskripsi">
          <textarea
            rows={4}
            maxLength={PRODUCT_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="app-input resize-none"
            style={{ height: 92, padding: '13px 14px' }}
            placeholder="Bahan, ukuran, atau catatan lain"
          />
        </Field>

        <div
          className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-3.5"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold">Tampilkan di katalog</span>
            <span
              className="text-[11px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Jastiper bisa memilih produk ini saat ikut event.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            aria-label="Tampilkan di katalog"
            onClick={() => setIsActive((v) => !v)}
            className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors"
            style={{ background: isActive ? '#3f7d58' : '#d9cfbf' }}
          >
            <span
              className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
              style={{ left: isActive ? 23 : 3 }}
            />
          </button>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}
      </form>

      <div className="pm-footer">
        <button
          type="submit"
          form={FORM_ID}
          disabled={isSubmitting || photoBusy}
          className="app-btn-primary w-full"
        >
          {isSubmitting ? 'Menyimpan...' : submitLabel}
        </button>
      </div>
    </>
  )
}
