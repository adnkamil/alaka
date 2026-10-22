import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Camera, Plus, X } from 'lucide-react'
import {
  blobToDataUrl,
  fileToCalendarBannerBlob,
} from '../lib/calendar-banner-image'
import {
  CALENDAR_EVENT_LIMITS,
  END_DATE_ERROR,
  isEndDateValid,
  normalizeExhibitors,
} from '../lib/calendar-event-input'
import Switch from './ui/Switch'

/** Perubahan banner yang dipilih admin; undefined = banner tidak diubah. */
export type BannerChange =
  { type: 'upload'; dataUrl: string } | { type: 'remove' }

export interface CalendarEventFormValue {
  name: string
  location: string
  /** Format `YYYY-MM-DD`. */
  eventDate: string
  /** Tanggal terakhir event (`YYYY-MM-DD`); null = event sehari. */
  endDate: string | null
  /** true = event online (tanpa tempat fisik), false = offline. */
  isOnline: boolean
  description: string
  exhibitors: Array<string>
  banner?: BannerChange
}

interface CalendarEventFormProps {
  initialValue: Omit<CalendarEventFormValue, 'banner'>
  /** URL banner yang sudah tersimpan (null = belum ada). */
  currentBannerSrc: string | null
  /** Dipanggil tombol Batal (biasanya kembali ke daftar). */
  onCancel: () => void
  onSubmit: (value: CalendarEventFormValue) => Promise<void>
  /** Hanya diisi saat mengubah event yang sudah ada. */
  onDelete?: () => void
}

/**
 * Form event kalender untuk halaman admin (tambah & ubah). Murni form: judul,
 * navigasi, dan apa yang terjadi setelah simpan diatur halaman pemakainya.
 */
export default function CalendarEventForm({
  initialValue,
  currentBannerSrc,
  onCancel,
  onSubmit,
  onDelete,
}: CalendarEventFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialValue.name)
  const [location, setLocation] = useState(initialValue.location)
  const [eventDate, setEventDate] = useState(initialValue.eventDate)
  const [endDate, setEndDate] = useState(initialValue.endDate)
  const [isOnline, setIsOnline] = useState(initialValue.isOnline)
  const [description, setDescription] = useState(initialValue.description)
  const [exhibitors, setExhibitors] = useState(initialValue.exhibitors)
  const [exhibitorInput, setExhibitorInput] = useState('')
  const [pendingBanner, setPendingBanner] = useState<{
    blob: Blob
    url: string
  } | null>(null)
  const [removeBanner, setRemoveBanner] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isBusy = isProcessing || isSubmitting
  const hasBanner = currentBannerSrc !== null

  // Lepas object URL preview saat diganti / modal ditutup.
  useEffect(() => {
    return () => {
      if (pendingBanner) URL.revokeObjectURL(pendingBanner.url)
    }
  }, [pendingBanner])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih file yang sama lagi tetap memicu onChange.
    e.target.value = ''
    if (!file) return

    setError(null)
    setIsProcessing(true)
    try {
      const blob = await fileToCalendarBannerBlob(file)
      setPendingBanner({ blob, url: URL.createObjectURL(blob) })
      setRemoveBanner(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses banner')
    } finally {
      setIsProcessing(false)
    }
  }

  function addExhibitors() {
    // Koma dianggap pemisah, jadi beberapa brand bisa ditempel sekaligus.
    const incoming = exhibitorInput.split(',')
    setExhibitors((current) =>
      normalizeExhibitors([...current, ...incoming]).slice(
        0,
        CALENDAR_EVENT_LIMITS.exhibitors,
      ),
    )
    setExhibitorInput('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEndDateValid(eventDate, endDate)) {
      setError(END_DATE_ERROR)
      return
    }
    setIsSubmitting(true)
    try {
      let banner: BannerChange | undefined
      if (pendingBanner) {
        banner = {
          type: 'upload',
          dataUrl: await blobToDataUrl(pendingBanner.blob),
        }
      } else if (removeBanner) {
        banner = { type: 'remove' }
      }
      // Brand yang masih diketik tapi belum ditekan "Tambah" ikut disimpan.
      const pending = exhibitorInput.split(',')
      await onSubmit({
        name: name.trim(),
        location: location.trim(),
        eventDate,
        endDate,
        isOnline,
        description: description.trim(),
        exhibitors: normalizeExhibitors([...exhibitors, ...pending]),
        banner,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan event')
    } finally {
      setIsSubmitting(false)
    }
  }

  const previewSrc = pendingBanner
    ? pendingBanner.url
    : hasBanner && !removeBanner
      ? currentBannerSrc
      : null

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Banner</p>
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{
            aspectRatio: '16 / 9',
            background:
              'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
          }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="Pratinjau banner"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center opacity-40">
              <CalendarDays size={40} color="white" />
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{
              border: '1px solid var(--app-border)',
              background: 'transparent',
              color: 'var(--app-text)',
            }}
          >
            <Camera size={13} />
            {isProcessing
              ? 'Memproses...'
              : previewSrc
                ? 'Ganti banner'
                : 'Pilih banner'}
          </button>
          {(pendingBanner || removeBanner) && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setPendingBanner(null)
                setRemoveBanner(false)
              }}
              className="text-xs font-semibold disabled:opacity-50"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Batalkan
            </button>
          )}
          {hasBanner && !pendingBanner && !removeBanner && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setRemoveBanner(true)}
              className="text-xs font-semibold disabled:opacity-50"
              style={{ color: 'var(--app-danger)' }}
            >
              Hapus banner
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--app-text-mute)' }}>
          Dipotong 16:9 dan diperkecil otomatis.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama event
        <input
          required
          autoFocus
          maxLength={CALENDAR_EVENT_LIMITS.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="app-input"
          placeholder="cth. Bazar Jastip Makassar"
        />
      </label>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Event online</p>
          <p
            className="mt-0.5 text-xs leading-relaxed"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {isOnline
              ? 'Online: PO lewat website atau chat admin brand, tanpa tempat fisik.'
              : 'Offline: event fisik di suatu tempat.'}
          </p>
        </div>
        <Switch
          checked={isOnline}
          onChange={setIsOnline}
          label="Event online"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {isOnline ? 'Platform / tempat PO' : 'Lokasi'}
        <input
          required
          maxLength={CALENDAR_EVENT_LIMITS.location}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="app-input"
          placeholder={
            isOnline
              ? 'cth. Instagram Live, website brand'
              : 'cth. Phinisi Point Mall, Makassar'
          }
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Tanggal
        <input
          type="date"
          required
          value={eventDate}
          onChange={(e) => {
            const value = e.target.value
            setEventDate(value)
            // Tanggal selesai yang jadi lebih awal dari tanggal mulai dikosongkan.
            if (endDate && endDate < value) setEndDate(null)
          }}
          className="app-input"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Tanggal selesai (opsional)
        <input
          type="date"
          min={eventDate}
          value={endDate ?? ''}
          onChange={(e) => setEndDate(e.target.value || null)}
          className="app-input"
        />
        <span
          className="text-xs font-normal leading-relaxed"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Kosongkan untuk event sehari. Event dianggap berlangsung sampai 23.59
          WIB di tanggal ini.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Deskripsi (opsional)
        <textarea
          rows={4}
          maxLength={CALENDAR_EVENT_LIMITS.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="app-input resize-y"
          placeholder="Tentang event ini"
        />
      </label>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="calendar-exhibitor-input"
          className="text-sm font-medium"
        >
          Brand yang dipamerkan (opsional)
        </label>
        <div className="flex gap-2">
          <input
            id="calendar-exhibitor-input"
            value={exhibitorInput}
            maxLength={CALENDAR_EVENT_LIMITS.exhibitor * 4}
            onChange={(e) => setExhibitorInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter menambah brand, bukan mengirim form.
              if (e.key === 'Enter') {
                e.preventDefault()
                addExhibitors()
              }
            }}
            className="app-input"
            placeholder="Ketik nama brand, pisahkan dengan koma"
          />
          {/* `.app-btn-primary` tidak ada di @layer, jadi padding bawaannya
              mengalahkan utility padding Tailwind. Ukuran tombol ikon ini
              diatur lewat `style` supaya pasti kotak setinggi kolom input. */}
          <button
            type="button"
            onClick={addExhibitors}
            disabled={exhibitorInput.trim() === ''}
            className="app-btn-primary flex-shrink-0 self-stretch"
            style={{ width: '3rem', padding: 0 }}
            aria-label="Tambah brand"
          >
            <Plus size={20} />
          </button>
        </div>
        {exhibitors.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {exhibitors.map((brand) => (
              <li
                key={brand}
                className="app-badge app-badge-accent gap-1.5 pr-1.5"
              >
                {brand}
                <button
                  type="button"
                  onClick={() =>
                    setExhibitors((current) =>
                      current.filter((item) => item !== brand),
                    )
                  }
                  aria-label={`Hapus ${brand}`}
                  className="rounded-full"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="app-btn-outline flex-1 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isBusy}
            className="app-btn-primary flex-1"
          >
            {isSubmitting ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
        {onDelete && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onDelete}
            className="app-btn-outline w-full disabled:opacity-50"
            style={{
              color: 'var(--app-danger)',
              borderColor: 'var(--app-danger)',
            }}
          >
            Hapus event
          </button>
        )}
      </div>
    </form>
  )
}
