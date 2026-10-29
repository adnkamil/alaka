import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarDays,
  Image as ImageIcon,
  MapPin,
  Package,
  Pencil,
  Phone,
} from 'lucide-react'
import { EventDescription } from '../../../components/EventDescription'
import PartnerEventStatusBadge from '../../../components/PartnerEventStatusBadge'
import ConfirmModal from '../../../components/ui/ConfirmModal'
import Toast from '../../../components/ui/Toast'
import { formatDateRange } from '../../../lib/calendar'
import {
  buildWhatsAppLink,
  formatDate,
  formatPhoneNumber,
} from '../../../lib/format'
import { getErrorMessage } from '../../../lib/error-message'
import { setOwnPartnerEventEnded } from '../../../lib/partner-event-functions'
import { partnerEventStatus } from '../../../lib/partner-event-rules'
import {
  formatRupiah,
  partnerProductPhotoUrl,
} from '../../../lib/partner-product-rules'
import {
  partnerEventParticipantsQuery,
  partnerEventProductsQuery,
  partnerEventQuery,
} from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'

export const Route = createFileRoute('/partner/event/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(partnerEventQuery(params.id)),
      context.queryClient.ensureQueryData(
        partnerEventParticipantsQuery(params.id),
      ),
      context.queryClient.ensureQueryData(partnerEventProductsQuery(params.id)),
    ]),
  component: PartnerEventDetailPage,
})

type Tab = 'info' | 'produk' | 'jastiper'

const PARTICIPANT_COLUMNS = 'grid-cols-[minmax(0,1fr)_150px_170px_90px_130px]'

/** Inisial dari nama brand, mis. "Mici Shop" → "MS". */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function PartnerEventDetailPage() {
  const { id } = Route.useParams()
  const { data: event } = useSuspenseQuery(partnerEventQuery(id))
  const { data: participants } = useSuspenseQuery(
    partnerEventParticipantsQuery(id),
  )
  const { data: products } = useSuspenseQuery(partnerEventProductsQuery(id))
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('jastiper')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const status = partnerEventStatus(event, todayIsoDateInAppTimeZone())
  const totalOrders = participants.reduce((sum, p) => sum + p.orderCount, 0)
  const tabs = [
    { key: 'info', label: 'Info' },
    { key: 'produk', label: `Produk ${products.length}` },
    { key: 'jastiper', label: `Jastiper ${participants.length}` },
  ] as const

  async function handleSetEnded(ended: boolean) {
    setBusy(true)
    try {
      await setOwnPartnerEventEnded({ data: { id, ended } })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partner-events'] }),
        queryClient.invalidateQueries({ queryKey: ['partner-event', id] }),
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
      ])
      setConfirmEnd(false)
    } catch (err) {
      setNotice(getErrorMessage(err, 'Gagal mengubah status event'))
      setConfirmEnd(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <main className="flex flex-col gap-4 px-5 pt-4 lg:hidden">
        <header className="flex items-center gap-3">
          <Link
            to="/partner/event"
            aria-label="Kembali"
            className="-ml-1 flex size-8 items-center justify-center"
            style={{ color: 'var(--app-text)' }}
          >
            <ArrowLeft size={22} />
          </Link>
          <h1 className="pm-display flex-1 text-[22px] leading-tight">
            Detail Event
          </h1>
          <PartnerEventStatusBadge status={status} />
        </header>

        <div
          className="flex h-[112px] w-full items-center justify-center overflow-hidden rounded-2xl"
          style={{
            background: event.bannerSrc ? undefined : 'var(--pm-tint)',
            color: 'var(--pm-gold)',
          }}
        >
          {event.bannerSrc ? (
            <img
              src={event.bannerSrc}
              alt={event.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon size={26} />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="pm-display text-xl leading-snug">{event.name}</h2>
          <div
            className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
            >
              {event.isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={14} />
              {formatDateRange(event.eventDate, event.endDate)}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={14} />
              <span className="truncate">{event.location}</span>
            </span>
          </div>
        </div>

        <div className="flex gap-2" role="tablist" aria-label="Isi event">
          {(
            [
              { key: 'info', label: 'Info' },
              { key: 'produk', label: `Produk ${products.length}` },
              { key: 'jastiper', label: `Jastiper ${participants.length}` },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`pm-chip ${tab === item.key ? 'pm-chip--active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <section className="flex flex-col gap-3">
            <div className="app-card p-4">
              {event.description ? (
                <EventDescription text={event.description} />
              ) : (
                <p
                  className="text-sm"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Belum ada deskripsi. Tambahkan lewat Ubah event.
                </p>
              )}
            </div>
            <div className="flex gap-2.5">
              <Link
                to="/partner/event/ubah/$id"
                params={{ id }}
                className="app-btn-outline flex-1 gap-1.5 no-underline"
              >
                <Pencil size={14} />
                Ubah event
              </Link>
              {event.isEnded ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSetEnded(false)}
                  className="app-btn-outline flex-1 disabled:opacity-50"
                >
                  Buka kembali
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmEnd(true)}
                  className="app-btn-outline flex-1 disabled:opacity-50"
                  style={{ color: 'var(--app-danger)' }}
                >
                  Akhiri event
                </button>
              )}
            </div>
          </section>
        )}

        {tab === 'produk' && (
          <section className="flex flex-col gap-2.5">
            <Link
              to="/partner/event/produk/$id"
              params={{ id }}
              className="app-btn-outline gap-1.5 no-underline"
            >
              <Package size={14} />
              Kelola produk
            </Link>
            {products.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada produk yang dipilih untuk event ini.
              </p>
            ) : (
              products.map((product) => {
                const photoUrl = partnerProductPhotoUrl(
                  product.id,
                  product.photoUpdatedAt,
                )
                return (
                  <div
                    key={product.id}
                    className="app-card flex items-center gap-3 p-3"
                  >
                    <div
                      className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                      style={{
                        background: 'var(--pm-tint)',
                        color: 'var(--app-text-mute)',
                      }}
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package size={20} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {product.name}
                      </p>
                      <p
                        className="pm-num text-sm"
                        style={{ color: 'var(--app-accent)' }}
                      >
                        {formatRupiah(product.price)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </section>
        )}

        {tab === 'jastiper' && (
          <section className="flex flex-col gap-2.5">
            {participants.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada jastiper yang ikut event ini.
              </p>
            ) : (
              participants.map((row) => {
                const name = row.brandName || 'Tanpa nama'
                return (
                  <div
                    key={row.brandId}
                    className="app-card flex items-center gap-3 p-3"
                  >
                    <span
                      className="pm-display flex size-10 shrink-0 items-center justify-center rounded-full text-sm"
                      style={{
                        background: 'var(--app-accent-soft)',
                        color: '#9c463b',
                      }}
                    >
                      {initialsOf(row.brandName ?? '')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p
                        className="truncate text-xs"
                        style={{ color: 'var(--app-text-soft)' }}
                      >
                        Ikut {formatDate(row.joinedAt)}
                        {row.waNumber
                          ? ` · ${formatPhoneNumber(row.waNumber)}`
                          : ''}
                      </p>
                    </div>
                    {row.waNumber ? (
                      <a
                        href={`tel:${row.waNumber}`}
                        aria-label={`Telepon ${name}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full no-underline"
                        style={{
                          background: 'var(--app-success-soft)',
                          color: 'var(--app-success)',
                        }}
                      >
                        <Phone size={16} />
                      </a>
                    ) : null}
                  </div>
                )
              })
            )}
          </section>
        )}
      </main>

      <main className="pm-wide hidden flex-col gap-5 lg:flex">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="pm-display truncate text-[26px] leading-tight">
              {event.name}
            </h1>
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
              / {event.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <PartnerEventStatusBadge status={status} />
            <Link
              to="/partner/event/ubah/$id"
              params={{ id }}
              className="app-btn-outline no-underline"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              Edit event
            </Link>
          </div>
        </header>

        <div className="app-card grid grid-cols-5 gap-6 px-6 py-5">
          {[
            { label: 'Tipe', value: event.isOnline ? 'Online' : 'Offline' },
            {
              label: 'Tanggal',
              value: formatDateRange(event.eventDate, event.endDate),
            },
            { label: 'Lokasi', value: event.location },
            { label: 'Jastiper', value: `${participants.length} bergabung` },
            { label: 'Pesanan', value: `${totalOrders} masuk` },
          ].map((item) => (
            <div key={item.label} className="min-w-0">
              <p
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: 'var(--pm-gold)' }}
              >
                {item.label}
              </p>
              <p className="mt-1.5 truncate text-[15px] font-bold">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-2" role="tablist" aria-label="Isi event">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`pm-chip ${tab === item.key ? 'pm-chip--active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'info' && (
          <section className="app-card flex flex-col gap-4 p-6">
            {event.bannerSrc && (
              <img
                src={event.bannerSrc}
                alt={event.name}
                className="h-[200px] w-full rounded-2xl object-cover"
              />
            )}
            {event.description ? (
              <EventDescription text={event.description} />
            ) : (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada deskripsi. Tambahkan lewat Edit event.
              </p>
            )}
            <div>
              {event.isEnded ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSetEnded(false)}
                  className="app-btn-outline disabled:opacity-50"
                  style={{ minHeight: 44, fontSize: 14 }}
                >
                  Buka kembali
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmEnd(true)}
                  className="app-btn-outline disabled:opacity-50"
                  style={{
                    minHeight: 44,
                    fontSize: 14,
                    color: 'var(--app-danger)',
                  }}
                >
                  Akhiri event
                </button>
              )}
            </div>
          </section>
        )}

        {tab === 'produk' && (
          <section className="flex flex-col gap-3">
            <Link
              to="/partner/event/produk/$id"
              params={{ id }}
              className="app-btn-outline gap-1.5 self-start no-underline"
              style={{ minHeight: 44, fontSize: 14 }}
            >
              <Package size={14} />
              Kelola produk
            </Link>
            {products.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
                Belum ada produk yang dipilih untuk event ini.
              </p>
            ) : (
              <div className="app-card overflow-hidden">
                {products.map((product, i) => {
                  const photoUrl = partnerProductPhotoUrl(
                    product.id,
                    product.photoUpdatedAt,
                  )
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-3.5 px-5 py-3"
                      style={{
                        borderTop:
                          i === 0 ? undefined : '1px solid var(--app-border)',
                      }}
                    >
                      <div
                        className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                        style={{
                          background: 'var(--pm-tint)',
                          color: 'var(--pm-gold)',
                        }}
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package size={20} />
                        )}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">
                        {product.name}
                      </p>
                      <p
                        className="pm-num text-sm font-bold"
                        style={{ color: 'var(--app-accent)' }}
                      >
                        {formatRupiah(product.price)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'jastiper' &&
          (participants.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Belum ada jastiper yang ikut event ini.
            </p>
          ) : (
            <div className="app-card overflow-hidden">
              <div
                className={`grid ${PARTICIPANT_COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
                style={{
                  background: 'var(--pm-tint)',
                  color: 'var(--pm-gold)',
                }}
              >
                <span>Jastiper</span>
                <span>Tanggal ikut</span>
                <span>No. WhatsApp</span>
                <span>Pesanan</span>
                <span>Aksi</span>
              </div>
              {participants.map((row) => {
                const name = row.brandName || 'Tanpa nama'
                return (
                  <div
                    key={row.brandId}
                    className={`grid ${PARTICIPANT_COLUMNS} items-center gap-4 border-t px-5 py-3`}
                    style={{ borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span
                        className="pm-display flex size-11 shrink-0 items-center justify-center rounded-full text-sm"
                        style={{
                          background: 'var(--app-accent-soft)',
                          color: '#9c463b',
                        }}
                      >
                        {initialsOf(row.brandName ?? '')}
                      </span>
                      <p className="truncate text-sm font-bold">{name}</p>
                    </div>
                    <span
                      className="text-[13px]"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {formatDate(row.joinedAt)}
                    </span>
                    <span className="pm-num text-[13px] font-medium">
                      {row.waNumber ? formatPhoneNumber(row.waNumber) : '-'}
                    </span>
                    <span className="text-sm font-bold">{row.orderCount}</span>
                    <div>
                      {row.waNumber ? (
                        <a
                          href={buildWhatsAppLink(row.waNumber, '')}
                          target="_blank"
                          rel="noreferrer"
                          className="app-btn-outline gap-2 no-underline"
                          style={{ minHeight: 38, fontSize: 13 }}
                        >
                          <Phone size={15} />
                          Hubungi
                        </a>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
      </main>

      <ConfirmModal
        open={confirmEnd}
        title="Akhiri event ini?"
        content="Event langsung hilang dari kalender jastiper. Data jastiper yang sudah ikut tetap tersimpan, dan event bisa dibuka kembali kapan saja."
        okText="Akhiri event"
        loading={busy}
        onOk={() => handleSetEnded(true)}
        onCancel={() => setConfirmEnd(false)}
      />
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </>
  )
}
