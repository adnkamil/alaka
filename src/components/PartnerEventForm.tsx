import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Package,
  CalendarDays,
  ChevronRight,
  MapPin,
  ShoppingBag,
  Upload,
} from 'lucide-react'
import {
  blobToDataUrl,
  fileToCalendarBannerBlob,
} from '../lib/calendar-banner-image'
import {
  CALENDAR_EVENT_LIMITS,
  END_DATE_ERROR,
  isEndDateValid,
} from '../lib/calendar-event-input'
import { MAX_EVENT_PRODUCTS } from '../lib/partner-event-product-rules'
import { partnerProductPhotoUrl } from '../lib/partner-product-rules'
import { PartnerProductPickerSheet } from './PartnerProductPicker'
import type { CalendarEventFormValue } from './CalendarEventForm'
import type { PartnerProductRow } from '../lib/partner-product-queries'

const FORM_ID = 'partner-event-form'

type Initial = Omit<CalendarEventFormValue, 'banner' | 'exhibitors'>

interface PartnerEventFormProps {
  initialValue: Initial
  /** URL banner yang sudah tersimpan (null = belum ada). */
  currentBannerSrc?: string | null
  submitLabel: string
  /** Judul & penunjuk halaman untuk header desktop (>= lg). */
  title: string
  breadcrumb: string
  /** Tujuan tombol Batal desktop: detail event (kalau ada id) atau daftar. */
  cancelEventId?: string
  /**
   * Katalog partner untuk memilih produk unggulan. Kalau tidak diisi (mis.
   * Ubah event), bagian pilihan produk tidak tampil.
   */
  products?: ReadonlyArray<PartnerProductRow>
  onSubmit: (
    value: CalendarEventFormValue,
    productIds: Array<string>,
  ) => Promise<void>
}

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
 * Form buat/ubah event untuk Partner Portal, mengikuti desain Figma (06).
 * Nilai yang dikirim sama dengan `CalendarEventForm`, jadi handler
 * `createPartnerEvent` tidak berubah. Partner tidak mengisi brand pameran
 * (diisi server).
 *
 * Mobile: satu kolom, tombol simpan menempel di bawah. Desktop (>= lg):
 * header Batal/Simpan, kartu informasi di kiri, banner & produk di kanan
 * (Figma "D6 Buat Event"). Satu DOM saja; urutan mobile diatur dengan `order`
 * dan `contents`.
 */
export default function PartnerEventForm({
  initialValue,
  currentBannerSrc = null,
  submitLabel,
  title,
  breadcrumb,
  cancelEventId,
  products,
  onSubmit,
}: PartnerEventFormProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialValue.name)
  const [location, setLocation] = useState(initialValue.location)
  const [eventDate, setEventDate] = useState(initialValue.eventDate)
  const [endDate, setEndDate] = useState(initialValue.endDate)
  const [isOnline, setIsOnline] = useState(initialValue.isOnline)
  const [description, setDescription] = useState(initialValue.description)
  const [bannerDataUrl, setBannerDataUrl] = useState<string | null>(null)
  // Banner tersimpan dihapus (dikirim sebagai `remove` saat simpan).
  const [removeBanner, setRemoveBanner] = useState(false)
  const [productIds, setProductIds] = useState<Array<string>>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const blob = await fileToCalendarBannerBlob(file)
      setBannerDataUrl(await blobToDataUrl(blob))
      setRemoveBanner(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses banner')
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEndDateValid(eventDate, endDate)) {
      setError(END_DATE_ERROR)
      return
    }
    setBusy(true)
    try {
      await onSubmit(
        {
          name: name.trim(),
          location: location.trim(),
          eventDate,
          endDate,
          isOnline,
          description: description.trim(),
          exhibitors: [],
          banner: bannerDataUrl
            ? { type: 'upload', dataUrl: bannerDataUrl }
            : removeBanner
              ? { type: 'remove' }
              : undefined,
        },
        productIds,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan event')
    } finally {
      setBusy(false)
    }
  }

  const iconStyle = { color: 'var(--app-text-soft)' }
  const previewSrc = bannerDataUrl ?? (removeBanner ? null : currentBannerSrc)

  function handleRemoveBanner() {
    setBannerDataUrl(null)
    // Banner yang baru dipilih cukup dibatalkan; yang tersimpan ditandai hapus.
    if (currentBannerSrc) setRemoveBanner(true)
  }

  const submitText = busy ? 'Menyimpan...' : submitLabel
  const selectedProducts = (products ?? []).filter((p) =>
    productIds.includes(p.id),
  )
  const cancelClass = 'app-btn-outline no-underline'
  const buttonStyle = { minHeight: 44, fontSize: 14 }

  return (
    <>
      <form
        id={FORM_ID}
        className="flex flex-col gap-3.5 pb-[120px] lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-5 lg:gap-y-5 lg:pb-0"
        onSubmit={handleSubmit}
      >
        <header className="hidden items-start justify-between gap-4 lg:col-span-2 lg:row-start-1 lg:flex">
          <div>
            <h1 className="pm-display text-[26px] leading-tight">{title}</h1>
            <p
              className="mt-1 text-[13px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              <Link
                to="/partner/event"
                className="no-underline"
                style={{ color: 'inherit' }}
              >
                Event
              </Link>{' '}
              / {breadcrumb}
            </p>
          </div>
          <div className="flex gap-3">
            {cancelEventId ? (
              <Link
                to="/partner/event/$id"
                params={{ id: cancelEventId }}
                className={cancelClass}
                style={buttonStyle}
              >
                Batal
              </Link>
            ) : (
              <Link
                to="/partner/event"
                className={cancelClass}
                style={buttonStyle}
              >
                Batal
              </Link>
            )}
            <button
              type="submit"
              disabled={busy}
              className="app-btn-primary"
              style={buttonStyle}
            >
              {submitText}
            </button>
          </div>
        </header>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePickBanner}
        />

        {/* Kartu informasi: di mobile hanya pembungkus transparan. */}
        <div className="contents pm-lg-card lg:col-start-1 lg:row-start-2 lg:flex lg:flex-col lg:gap-4 lg:p-6">
          <h2 className="pm-display order-1 hidden text-base lg:block">
            Informasi event
          </h2>

          {/* Offline / Online */}
          <div
            className="order-1 flex rounded-xl p-1 lg:w-[276px]"
            style={{ background: 'var(--pm-muted)' }}
            role="radiogroup"
            aria-label="Jenis event"
          >
            {[
              { value: false, label: 'Offline' },
              { value: true, label: 'Online' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={isOnline === opt.value}
                onClick={() => setIsOnline(opt.value)}
                className="flex-1 rounded-[10px] py-2 text-sm font-semibold transition-colors"
                style={{
                  background:
                    isOnline === opt.value ? '#ffffff' : 'transparent',
                  color:
                    isOnline === opt.value
                      ? 'var(--app-accent)'
                      : 'var(--app-text-soft)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="order-1 flex flex-col gap-3.5 lg:gap-4">
            <Field label="Nama event">
              <input
                required
                autoFocus
                maxLength={CALENDAR_EVENT_LIMITS.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="app-input"
                placeholder="cth. Imbex Fair 2026"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
              <Field label="Tanggal mulai">
                <div className="relative">
                  <CalendarDays
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={iconStyle}
                  />
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => {
                      const value = e.target.value
                      setEventDate(value)
                      // Tanggal selesai yang jadi lebih awal dari mulai dikosongkan.
                      if (endDate && endDate < value) setEndDate(null)
                    }}
                    className="app-input pl-10"
                  />
                </div>
              </Field>
              <Field label="Tanggal selesai">
                <div className="relative">
                  <CalendarDays
                    size={18}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={iconStyle}
                  />
                  <input
                    type="date"
                    min={eventDate}
                    value={endDate ?? ''}
                    onChange={(e) => setEndDate(e.target.value || null)}
                    className="app-input pl-10"
                  />
                </div>
              </Field>
            </div>

            <Field label={isOnline ? 'Platform / tempat PO' : 'Lokasi'}>
              <div className="relative">
                <MapPin
                  size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
                  style={iconStyle}
                />
                <input
                  required
                  maxLength={CALENDAR_EVENT_LIMITS.location}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="app-input pl-10"
                  placeholder={
                    isOnline
                      ? 'cth. Instagram Live'
                      : 'cth. Istora Senayan, Jakarta'
                  }
                />
              </div>
            </Field>
          </div>

          <div className="order-3">
            <Field label="Deskripsi">
              <textarea
                rows={4}
                maxLength={CALENDAR_EVENT_LIMITS.description}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="app-input resize-none !h-[92px] lg:!h-[132px]"
                style={{ padding: '13px 14px' }}
                placeholder="Tentang event ini"
              />
            </Field>
          </div>
        </div>

        <div className="contents lg:col-start-2 lg:row-start-2 lg:flex lg:flex-col lg:gap-5">
          <div className="order-2 flex flex-col gap-3.5 pm-lg-card lg:gap-3 lg:p-5">
            <h2 className="pm-display hidden text-base lg:block">
              Banner event
            </h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left disabled:opacity-60 lg:min-h-[158px] lg:flex-col lg:justify-center lg:overflow-hidden lg:p-0 lg:text-center"
              style={{
                borderColor: 'var(--app-border)',
                background: 'var(--pm-input)',
              }}
            >
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Pratinjau banner"
                  className="h-12 w-20 shrink-0 rounded-xl object-cover lg:h-[158px] lg:w-full lg:rounded-none"
                />
              ) : (
                <Upload
                  size={22}
                  className="shrink-0"
                  style={{ color: 'var(--app-accent)' }}
                />
              )}
              <span className="flex flex-col gap-0.5 lg:items-center lg:pb-3">
                <span
                  className="text-[13px] font-bold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  {busy
                    ? 'Memproses...'
                    : previewSrc
                      ? 'Ganti banner event'
                      : 'Unggah banner event'}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Rasio 16:9, maks. 1000px
                </span>
              </span>
            </button>
            {previewSrc && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRemoveBanner}
                className="-mt-2 self-start text-xs font-semibold disabled:opacity-50 lg:mt-0"
                style={{ color: 'var(--app-danger)' }}
              >
                Hapus banner
              </button>
            )}
          </div>

          {products && (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="order-4 flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left lg:hidden"
                style={{ borderColor: 'var(--app-border)' }}
              >
                <ShoppingBag
                  size={22}
                  className="shrink-0"
                  style={{ color: 'var(--app-accent)' }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-bold">Produk di event ini</span>
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    {productIds.length === 0
                      ? 'Opsional, bisa diubah nanti'
                      : `${productIds.length} dari ${MAX_EVENT_PRODUCTS} produk dipilih`}
                  </span>
                </span>
                <ChevronRight
                  size={18}
                  className="shrink-0"
                  style={iconStyle}
                />
              </button>

              <div className="pm-lg-card hidden flex-col gap-3 p-5 lg:flex">
                <div className="flex items-center justify-between">
                  <h2 className="pm-display text-base">Produk di event</h2>
                  <span
                    className="app-badge"
                    style={{
                      background: 'var(--app-success-soft)',
                      color: 'var(--app-success)',
                    }}
                  >
                    {productIds.length} / {MAX_EVENT_PRODUCTS}
                  </span>
                </div>
                {selectedProducts.length === 0 ? (
                  <p
                    className="text-[13px]"
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Opsional, bisa diubah nanti.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {selectedProducts.map((p) => {
                      const photoUrl = partnerProductPhotoUrl(
                        p.id,
                        p.photoUpdatedAt,
                      )
                      return (
                        <li key={p.id} className="flex items-center gap-3">
                          <div
                            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                            style={{
                              background: 'var(--pm-tint)',
                              color: 'var(--pm-gold)',
                            }}
                          >
                            {photoUrl ? (
                              <img
                                src={photoUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package size={15} />
                            )}
                          </div>
                          <span className="truncate text-sm font-medium">
                            {p.name}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="self-start text-xs font-semibold"
                  style={{ color: 'var(--app-accent)' }}
                >
                  Kelola pilihan produk
                </button>
              </div>
            </>
          )}
        </div>

        {error && (
          <p
            className="order-5 text-sm lg:col-span-2 lg:row-start-3"
            style={{ color: 'var(--app-danger)' }}
          >
            {error}
          </p>
        )}
      </form>

      {pickerOpen && products && (
        <PartnerProductPickerSheet
          title="Produk di Event"
          products={products}
          initialIds={productIds}
          onClose={() => setPickerOpen(false)}
          onSave={(ids) => {
            setProductIds(ids)
            setPickerOpen(false)
          }}
        />
      )}

      <div className="pm-footer lg:hidden">
        <button
          type="submit"
          form={FORM_ID}
          disabled={busy}
          className="app-btn-primary w-full"
        >
          {submitText}
        </button>
      </div>
    </>
  )
}
