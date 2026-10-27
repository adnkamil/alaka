import { useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import ConfirmModal from './ui/ConfirmModal'
import { getErrorMessage } from '../lib/error-message'
import { formatDate } from '../lib/format'
import {
  deletePartnerCatalog,
  uploadPartnerCatalog,
} from '../lib/partner-catalog-functions'
import {
  CATALOG_PDF_MAX_BYTES,
  formatFileSize,
} from '../lib/partner-catalog-rules'
import { partnerCatalogQuery } from '../lib/queries'

/** Isi berkas jadi base64 (tanpa awalan `data:...;base64,`). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Berkas tidak bisa dibaca'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Kartu katalog PDF di halaman Katalog partner: unggah / ganti / hapus / unduh.
 * Satu katalog per partner; jastiper mengunduhnya dari halaman semua event
 * milik partner ini.
 */
export default function PartnerCatalogCard() {
  const { data: catalog } = useSuspenseQuery(partnerCatalogQuery)
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['partner-catalog'] })
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih berkas yang sama dua kali tetap memicu onChange.
    e.target.value = ''
    if (!file) return
    setError(null)

    if (file.size > CATALOG_PDF_MAX_BYTES) {
      setError(
        `Ukuran PDF maksimal ${formatFileSize(CATALOG_PDF_MAX_BYTES)}. Kompres dulu, lalu coba lagi.`,
      )
      return
    }
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setError('Berkas harus berupa PDF.')
      return
    }

    setBusy(true)
    try {
      await uploadPartnerCatalog({
        data: { fileName: file.name, dataBase64: await fileToBase64(file) },
      })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengunggah katalog'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deletePartnerCatalog()
      await refresh()
      setConfirmDelete(false)
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menghapus katalog'))
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card mb-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <FileText size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Katalog PDF</p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Jastiper bisa mengunduhnya di halaman event kamu.
          </p>
        </div>
      </div>

      {catalog ? (
        <div className="flex flex-col gap-2">
          <p className="truncate text-sm font-medium">{catalog.name}</p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {formatFileSize(catalog.size)} · diunggah{' '}
            {formatDate(catalog.updatedAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={catalog.url}
              download
              className="app-btn-outline flex items-center gap-1.5 no-underline"
              style={{ width: 'auto', padding: '0.45rem 0.8rem' }}
            >
              <Download size={14} />
              Unduh
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="app-btn-outline flex items-center gap-1.5"
              style={{ width: 'auto', padding: '0.45rem 0.8rem' }}
            >
              <Upload size={14} />
              {busy ? 'Mengunggah...' : 'Ganti'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="app-btn-outline flex items-center gap-1.5"
              style={{
                width: 'auto',
                padding: '0.45rem 0.8rem',
                color: 'var(--app-danger)',
              }}
            >
              <Trash2 size={14} />
              Hapus
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="app-btn-outline flex items-center justify-center gap-1.5"
        >
          <Upload size={14} />
          {busy ? 'Mengunggah...' : 'Unggah katalog PDF'}
        </button>
      )}

      <p className="mt-2 text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
        Maksimal {formatFileSize(CATALOG_PDF_MAX_BYTES)}. Hanya satu katalog
        yang aktif; mengunggah lagi akan menggantinya.
      </p>
      {error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handlePick}
      />
      <ConfirmModal
        open={confirmDelete}
        title="Hapus katalog PDF?"
        content="Tombol unduh katalog hilang dari halaman event kamu. Kamu bisa mengunggah katalog baru kapan saja."
        okText="Hapus"
        loading={busy}
        onOk={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  )
}
