import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ExternalLink, FileText } from 'lucide-react'
import { getErrorMessage } from '../lib/error-message'
import { saveOwnPartnerCatalogUrl } from '../lib/partner-catalog-functions'
import {
  CATALOG_URL_MAX_LENGTH,
  parseCatalogUrl,
} from '../lib/partner-catalog-rules'
import { partnerCatalogQuery } from '../lib/queries'

/**
 * Kartu link katalog di halaman Katalog partner. Katalog lengkap tidak
 * diunggah ke ALAKA: partner menempel link unduh (mis. Google Drive) dan
 * jastiper membukanya dari halaman event milik partner ini.
 */
export default function PartnerCatalogCard() {
  const { data: catalog } = useSuspenseQuery(partnerCatalogQuery)
  const queryClient = useQueryClient()
  const [value, setValue] = useState(catalog?.url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save(next: string) {
    setError(null)
    setSaved(false)

    const checked = parseCatalogUrl(next)
    if (!checked.ok) {
      setError(checked.error)
      return
    }

    setSaving(true)
    try {
      await saveOwnPartnerCatalogUrl({ data: { url: next } })
      await queryClient.invalidateQueries({ queryKey: ['partner-catalog'] })
      // Jastiper yang sedang membuka event ikut mendapat link terbaru.
      await queryClient.invalidateQueries({ queryKey: ['calendar-event'] })
      setValue(checked.url ?? '')
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan link katalog'))
    } finally {
      setSaving(false)
    }
  }

  const unchanged = value.trim() === (catalog?.url ?? '')

  return (
    <section className="app-card mb-4 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <FileText size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Link katalog lengkap</p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Jastiper bisa mengunduhnya di halaman event kamu.
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Link unduh katalog (PDF)
        <input
          type="url"
          inputMode="url"
          maxLength={CATALOG_URL_MAX_LENGTH}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          className="app-input"
          placeholder="https://drive.google.com/file/d/..."
        />
      </label>

      <div
        className="mt-2 rounded-xl px-3 py-2 text-xs"
        style={{
          background: 'var(--app-accent-soft)',
          color: 'var(--app-text-soft)',
        }}
      >
        <p className="mb-1 font-semibold">Pakai Google Drive?</p>
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>Unggah PDF katalog ke Google Drive.</li>
          <li>Klik kanan file → Bagikan → Bagikan.</li>
          <li>
            Ubah akses umum jadi &quot;Siapa saja yang memiliki link&quot;
            (Pelihat).
          </li>
          <li>Salin link, lalu tempel di sini.</li>
        </ol>
        <p className="mt-1">
          Kalau akses tidak dibuka untuk umum, jastiper tidak bisa mengunduh.
          Link dari layanan lain (Dropbox, situs sendiri) juga bisa.
        </p>
      </div>

      {error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--app-success)' }}>
          {value.trim() ? 'Link katalog disimpan.' : 'Link katalog dihapus.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || unchanged}
          onClick={() => void save(value)}
          className="app-btn-primary"
          style={{ width: 'auto', padding: '0.5rem 1rem' }}
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        {catalog && (
          <>
            <a
              href={catalog.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-btn-outline flex items-center gap-1.5 no-underline"
              style={{ width: 'auto', padding: '0.5rem 0.9rem' }}
            >
              <ExternalLink size={14} />
              Coba buka
            </a>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save('')}
              className="text-xs font-semibold disabled:opacity-50"
              style={{ color: 'var(--app-danger)' }}
            >
              Hapus link
            </button>
          </>
        )}
      </div>
    </section>
  )
}
