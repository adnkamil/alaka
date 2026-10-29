import { useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Banknote, LogOut, Pencil, QrCode } from 'lucide-react'
import UpdateQrisModal from '../../components/UpdateQrisModal'
import {
  fetchSubscriptionSettingsAdmin,
  updateSubscriptionPrice,
  updateSubscriptionQris,
} from '../../lib/admin-functions'
import { logoutUser } from '../../lib/auth-functions'
import { discountPercent } from '../../lib/price-discount'

const subscriptionSettingsQuery = queryOptions({
  queryKey: ['admin-subscription-settings'],
  queryFn: () => fetchSubscriptionSettingsAdmin(),
})

export const Route = createFileRoute('/admin/pengaturan')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(subscriptionSettingsQuery),
  component: AdminSettingsPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: subscriptionSettings } = useSuspenseQuery(
    subscriptionSettingsQuery,
  )

  const [qrisModalOpen, setQrisModalOpen] = useState(false)
  const [priceEditing, setPriceEditing] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [originalInput, setOriginalInput] = useState('')
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)

  async function handleLogout() {
    await logoutUser()
    await navigate({ to: '/login' })
    // Setelah halaman lama di-unmount: kosongkan cache supaya akun berikutnya
    // di tab yang sama tidak melihat 'current-user'/data akun sebelumnya.
    queryClient.clear()
  }

  async function handleUpdateQris(qrisImage: string, qrisString: string) {
    await updateSubscriptionQris({ data: { qrisImage, qrisString } })
    await queryClient.invalidateQueries({
      queryKey: ['admin-subscription-settings'],
    })
    setQrisModalOpen(false)
  }

  function openPriceEditor() {
    setPriceInput(
      String(Math.round(Number(subscriptionSettings?.proPrice ?? '0'))),
    )
    setOriginalInput(
      subscriptionSettings?.originalPrice
        ? String(Math.round(Number(subscriptionSettings.originalPrice)))
        : '',
    )
    setPriceError(null)
    setPriceEditing(true)
  }

  // Persen dihitung otomatis dari dua input; ditampilkan sebagai preview saat edit.
  const editPercent = discountPercent(
    originalInput ? Number(originalInput) : null,
    priceInput ? Number(priceInput) : null,
  )
  const savedOriginal = subscriptionSettings?.originalPrice ?? null
  const savedPercent = discountPercent(
    savedOriginal,
    subscriptionSettings?.proPrice ?? '0',
  )

  async function handleSavePrice() {
    const promo = Number(priceInput)
    if (!priceInput || Number.isNaN(promo) || promo < 0) {
      setPriceError('Harga promo tidak valid')
      return
    }
    const original = originalInput ? Number(originalInput) : null
    if (original !== null && original <= promo) {
      setPriceError('Harga awal harus lebih besar dari harga promo')
      return
    }
    setPriceSaving(true)
    setPriceError(null)
    try {
      await updateSubscriptionPrice({
        data: { proPrice: promo, originalPrice: original },
      })
      await queryClient.invalidateQueries({
        queryKey: ['admin-subscription-settings'],
      })
      setPriceEditing(false)
    } catch (err) {
      setPriceError(
        err instanceof Error ? err.message : 'Gagal menyimpan harga',
      )
    } finally {
      setPriceSaving(false)
    }
  }

  return (
    <main className="pm-wide px-4 pb-6 pt-6 lg:max-w-[760px]! lg:mx-0!">
      <h1 className="mb-1 text-xl font-bold lg:text-[26px]">Pengaturan</h1>
      <p className="mb-6 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Pengaturan pembayaran PRO yang dipakai member saat mengajukan upgrade.
      </p>

      <section
        className="app-card mb-6 divide-y"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <p
          className="px-4 pt-4 pb-4 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Pengaturan Pembayaran PRO
        </p>
        <div
          className="flex items-center gap-3 p-4"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {subscriptionSettings?.qrisImage ? (
            <img
              src={subscriptionSettings.qrisImage}
              alt="QRIS pembayaran PRO"
              className="h-14 w-14 shrink-0 rounded-lg object-contain"
              style={{ border: '1px solid var(--app-border)' }}
            />
          ) : (
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: 'var(--app-warning-soft)',
                color: 'var(--app-warning)',
              }}
            >
              <QrCode size={22} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">QRIS Pembayaran</p>
            <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
              {subscriptionSettings?.qrisImage
                ? 'Ditampilkan ke member saat mengajukan upgrade.'
                : 'Belum ada QRIS — member belum bisa mengajukan upgrade.'}
            </p>
            {subscriptionSettings?.qrisImage &&
              !subscriptionSettings.qrisString && (
                <p
                  className="mt-1 text-[11px]"
                  style={{ color: 'var(--app-warning)' }}
                >
                  Upload ulang QRIS agar fitur nominal otomatis (QRIS dinamis)
                  aktif.
                </p>
              )}
          </div>
          <button
            type="button"
            onClick={() => setQrisModalOpen(true)}
            className="app-btn-outline shrink-0 text-xs"
          >
            {subscriptionSettings?.qrisImage ? 'Ganti' : 'Upload'}
          </button>
        </div>

        <div className="p-4" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
              }}
            >
              <Banknote size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Harga Membership</p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Nominal yang wajib ditransfer member saat mengajukan upgrade.
              </p>
              {!priceEditing && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {savedOriginal && (
                    <span
                      className="text-xs line-through"
                      style={{ color: 'var(--app-text-mute)' }}
                    >
                      {formatIDR(savedOriginal)}
                    </span>
                  )}
                  <span className="text-base font-bold">
                    {formatIDR(subscriptionSettings?.proPrice ?? '0')}
                  </span>
                  {savedPercent !== null && (
                    <span
                      className="app-badge"
                      style={{
                        background: 'var(--app-accent-soft)',
                        color: 'var(--app-accent)',
                      }}
                    >
                      Hemat {savedPercent}%
                    </span>
                  )}
                </div>
              )}
            </div>
            {!priceEditing && (
              <button
                type="button"
                onClick={openPriceEditor}
                className="app-btn-outline flex shrink-0 items-center gap-1.5 text-xs"
              >
                <Pencil size={13} />
                Ubah
              </button>
            )}
          </div>

          {priceEditing && (
            <div className="mt-3 flex flex-col gap-3">
              <RupiahField
                label="Harga promo (yang ditransfer member)"
                value={priceInput}
                onChange={setPriceInput}
                placeholder="15.000"
                autoFocus
              />
              <RupiahField
                label="Harga awal (dicoret, opsional)"
                value={originalInput}
                onChange={setOriginalInput}
                placeholder="50.000"
              />
              {editPercent !== null && (
                <p className="text-xs" style={{ color: 'var(--app-accent)' }}>
                  Diskon otomatis: <strong>{editPercent}%</strong>
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={priceSaving}
                  onClick={() => setPriceEditing(false)}
                  className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text-soft)',
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={priceSaving}
                  onClick={handleSavePrice}
                  className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--app-accent)' }}
                >
                  {priceSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          )}
          {priceError && (
            <p className="mt-2 text-xs" style={{ color: 'var(--app-danger)' }}>
              {priceError}
            </p>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={handleLogout}
        className="app-btn-outline w-full"
        style={{
          color: 'var(--app-danger)',
          borderColor: 'var(--app-danger-soft)',
        }}
      >
        <LogOut size={18} />
        Keluar
      </button>

      {qrisModalOpen && (
        <UpdateQrisModal
          currentQris={subscriptionSettings?.qrisImage ?? null}
          onClose={() => setQrisModalOpen(false)}
          onSubmit={handleUpdateQris}
        />
      )}
    </main>
  )
}

function RupiahField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (digits: string) => void
  placeholder: string
  autoFocus?: boolean
}) {
  return (
    <div>
      <p
        className="mb-1 text-xs font-semibold"
        style={{ color: 'var(--app-text-soft)' }}
      >
        {label}
      </p>
      <div
        className="flex items-center overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--app-border)' }}
      >
        <span
          className="shrink-0 whitespace-nowrap px-3 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Rp
        </span>
        <input
          autoFocus={autoFocus}
          inputMode="numeric"
          value={value ? Number(value).toLocaleString('id-ID') : ''}
          onChange={(e) =>
            onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))
          }
          className="app-input min-w-0 flex-1 border-0 pl-0"
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}
