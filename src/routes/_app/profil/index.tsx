import { useEffect, useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  ChevronRight,
  CircleHelp,
  Contact,
  Download,
  History,
  Info,
  KeyRound,
  Landmark,
  LogOut,
  MessageSquareText,
  Moon,
  Plus,
  QrCode,
  SlidersHorizontal,
  Tag,
  Wallet,
} from 'lucide-react'
import ChangePasswordModal from '../../../components/ChangePasswordModal'
import EditProfileModal from '../../../components/EditProfileModal'
import MessageTemplateModal from '../../../components/MessageTemplateModal'
import type { PaymentMethodFormValue } from '../../../components/PaymentMethodModal'
import PaymentMethodModal from '../../../components/PaymentMethodModal'
import Switch from '../../../components/ui/Switch'
import {
  changePassword,
  fetchCurrentUser,
  logoutUser,
  updateProfile,
} from '../../../lib/auth-functions'
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  setPaymentMethodActive,
  updatePaymentMethod,
} from '../../../lib/payment-methods-functions'
import { updateMessageTemplate } from '../../../lib/message-template-functions'
import { DEFAULT_WA_MESSAGE_TEMPLATE } from '../../../lib/message-template'

// Fitur "Master Control" & "Activity Logs" di section Kelola disembunyikan dulu
// (belum fungsional). Ubah `advancedMenu` jadi `true` untuk memunculkannya lagi.
const FEATURES = {
  advancedMenu: false,
}

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

const paymentMethodsQuery = queryOptions({
  queryKey: ['payment-methods'],
  queryFn: () => listPaymentMethods(),
})

type PaymentMethod = Awaited<ReturnType<typeof listPaymentMethods>>[number]

/** Ikon + baris keterangan tiap metode pembayaran di daftar Profil. */
function paymentMethodIcon(type: PaymentMethod['type']) {
  if (type === 'wallet') return <Wallet size={18} />
  if (type === 'qris') return <QrCode size={18} />
  return <Landmark size={18} />
}

function paymentMethodSubtitle(method: PaymentMethod) {
  if (method.type === 'qris') {
    return method.qrisImage
      ? 'Gambar QRIS sudah diupload'
      : 'Belum ada gambar QRIS'
  }

  const owner = method.accountName ? `a/n ${method.accountName} · ` : ''
  return `${owner}${method.accountNumber ?? ''}`
}

// Event dari browser yang dipakai buat menampilkan prompt install PWA.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const Route = createFileRoute('/_app/profil/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(currentUserQuery),
      context.queryClient.ensureQueryData(paymentMethodsQuery),
    ]),
  component: ProfilPage,
})

function useDarkModePreference() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle(next: boolean) {
    setIsDark(next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    document.documentElement.style.colorScheme = next ? 'dark' : 'light'
  }

  return [isDark, toggle] as const
}

function RowLink({
  to,
  icon,
  label,
}: {
  to: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 no-underline"
      style={{ color: 'var(--app-text)' }}
    >
      <span style={{ color: 'var(--app-text-soft)' }}>{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
    </Link>
  )
}

function ProfilPage() {
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const { data: paymentMethods } = useSuspenseQuery(paymentMethodsQuery)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isDark, toggleDark] = useDarkModePreference()
  const [paymentModal, setPaymentModal] = useState<
    { mode: 'create' } | { mode: 'edit'; id: string } | null
  >(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as unknown as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () =>
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  useEffect(() => {
    function computeInstalled() {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true
      setIsInstalled(standalone)
    }
    computeInstalled()
    const media = window.matchMedia('(display-mode: standalone)')
    media.addEventListener('change', computeInstalled)
    return () => media.removeEventListener('change', computeInstalled)
  }, [])

  async function handleLogout() {
    await logoutUser()
    await navigate({ to: '/login' })
  }

  async function handleSaveProfile(data: { name: string; brandName: string }) {
    await updateProfile({
      data: { name: data.name, brandName: data.brandName },
    })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    setShowProfileModal(false)
  }

  async function refreshPaymentMethods() {
    await queryClient.invalidateQueries({ queryKey: ['payment-methods'] })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
  }

  async function handleSavePaymentMethod(value: PaymentMethodFormValue) {
    // Server function pakai `undefined` buat "tidak ada gambar" (bukan null).
    const payload = {
      ...value,
      qrisImage: value.qrisImage ?? undefined,
    }

    if (paymentModal?.mode === 'edit') {
      await updatePaymentMethod({
        data: { id: paymentModal.id, ...payload },
      })
    } else {
      await createPaymentMethod({ data: payload })
    }
    await refreshPaymentMethods()
    setPaymentModal(null)
  }

  async function handleDeletePaymentMethod(id: string) {
    await deletePaymentMethod({ data: { id } })
    await refreshPaymentMethods()
    setPaymentModal(null)
  }

  async function handleTogglePaymentMethod(id: string, isActive: boolean) {
    await setPaymentMethodActive({ data: { id, isActive } })
    await refreshPaymentMethods()
  }

  // Metode yang lagi dibuka di modal (mode edit) — dipakai buat initialValue.
  const editingPaymentMethod =
    paymentModal?.mode === 'edit'
      ? paymentMethods.find((method) => method.id === paymentModal.id)
      : undefined

  async function handleSaveTemplate(template: string) {
    await updateMessageTemplate({ data: { template } })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    setShowTemplateModal(false)
  }

  async function handleChangePassword(data: {
    currentPassword: string
    newPassword: string
  }) {
    await changePassword({ data })
    setShowPasswordModal(false)
  }

  async function handleInstallClick() {
    if (isInstalled) return
    if (!deferredPrompt) {
      window.alert(
        'Browser ini tidak menampilkan tombol install otomatis. Di iPhone gunakan menu Share lalu "Tambahkan ke layar utama", di Chrome desktop klik ikon Install di address bar.',
      )
      return
    }
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <h1 className="mb-6 text-xl font-bold">Profil</h1>

      <button
        type="button"
        onClick={() => setShowProfileModal(true)}
        className="app-card mb-6 flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="app-avatar h-14 w-14 text-xl">
          {user?.name.at(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1">
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {user?.brandName || 'Belum ada nama brand'}
          </p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
      </button>

      <section className="mb-6">
        <h2
          className="mb-2 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Kelola
        </h2>
        <div
          className="app-card flex flex-col divide-y"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div
            style={{ borderColor: 'var(--app-border)' }}
            className="border-b"
          >
            <RowLink
              to="/profil/fee-rules"
              icon={<Tag size={18} />}
              label="Manajemen Fee"
            />
          </div>
          <div
            style={{ borderColor: 'var(--app-border)' }}
            className={FEATURES.advancedMenu ? 'border-b' : ''}
          >
            <RowLink
              to="/profil/customers"
              icon={<Contact size={18} />}
              label="Customer"
            />
          </div>
          {FEATURES.advancedMenu && (
            <>
              <div
                style={{ borderColor: 'var(--app-border)' }}
                className="border-b"
              >
                <RowLink
                  to="/profil"
                  icon={<SlidersHorizontal size={18} />}
                  label="Master Control"
                />
              </div>
              <RowLink
                to="/profil"
                icon={<History size={18} />}
                label="Activity Logs"
              />
            </>
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2
          className="mb-2 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Pembayaran
        </h2>
        <div
          className="app-card flex flex-col"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {paymentMethods.length === 0 && (
            <p
              className="px-4 py-3 text-xs"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Belum ada metode pembayaran. Tambahkan bank, e-wallet, atau QRIS
              supaya pelanggan bisa bayar.
            </p>
          )}

          {paymentMethods.map((method) => (
            <div
              key={method.id}
              className="flex items-center gap-3 border-b px-4 py-3"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <span style={{ color: 'var(--app-text-soft)' }}>
                {paymentMethodIcon(method.type)}
              </span>
              <button
                type="button"
                onClick={() => setPaymentModal({ mode: 'edit', id: method.id })}
                className="min-w-0 flex-1 text-left"
                style={{ color: 'var(--app-text)' }}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate">{method.provider}</span>
                  {!method.isActive && (
                    <span
                      className="app-badge flex-shrink-0"
                      style={{
                        background: 'var(--app-border)',
                        color: 'var(--app-text-soft)',
                      }}
                    >
                      Nonaktif
                    </span>
                  )}
                </span>
                <span
                  className="block truncate text-xs font-normal"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {paymentMethodSubtitle(method)}
                </span>
              </button>
              <Switch
                checked={method.isActive}
                onChange={(checked) =>
                  handleTogglePaymentMethod(method.id, checked)
                }
                label={`Aktifkan ${method.provider}`}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setPaymentModal({ mode: 'create' })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
            style={{ color: 'var(--app-accent)' }}
          >
            <Plus size={18} />
            <span className="flex-1 text-sm font-semibold">
              Tambah metode pembayaran
            </span>
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2
          className="mb-2 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Keamanan
        </h2>
        <div
          className="app-card flex flex-col"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {user?.hasPassword ? (
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left no-underline"
              style={{ color: 'var(--app-text)' }}
            >
              <span style={{ color: 'var(--app-text-soft)' }}>
                <KeyRound size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">Ubah Kata Sandi</span>
                <span
                  className="block truncate text-xs font-normal"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Ganti kata sandi akun kamu
                </span>
              </span>
              <ChevronRight
                size={18}
                style={{ color: 'var(--app-text-mute)' }}
              />
            </button>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3">
              <KeyRound size={18} style={{ color: 'var(--app-text-soft)' }} />
              <span className="min-w-0 flex-1">
                <span className="block">Kata Sandi</span>
                <span
                  className="block text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Akun ini masuk lewat Google — kata sandi diatur dari akun
                  Google kamu
                </span>
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2
          className="mb-2 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Preferensi
        </h2>
        <div
          className="app-card flex flex-col divide-y"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <Moon size={18} style={{ color: 'var(--app-text-soft)' }} />
            <span className="flex-1">Mode gelap</span>
            <Switch checked={isDark} onChange={toggleDark} label="Mode gelap" />
          </div>
          <button
            type="button"
            onClick={() => setShowTemplateModal(true)}
            className="flex w-full items-center gap-3 border-b px-4 py-3 text-left no-underline"
            style={{
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            <span style={{ color: 'var(--app-text-soft)' }}>
              <MessageSquareText size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Template Chat WA</span>
              <span
                className="block truncate text-xs font-normal"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {user?.waMessageTemplate
                  ? 'Template kustom — pesan invoice lewat WhatsApp'
                  : 'Template default — pesan invoice lewat WhatsApp'}
              </span>
            </span>
            <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
          </button>
          <div
            className="border-b"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <RowLink
              to="/profil"
              icon={<Bell size={18} />}
              label="Notifikasi"
            />
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex items-center gap-3 px-4 py-3 text-left no-underline"
          >
            <Download size={18} style={{ color: 'var(--app-accent)' }} />
            <span
              className="flex-1 font-medium"
              style={{ color: 'var(--app-accent)' }}
            >
              {isInstalled
                ? 'Terpasang di perangkat'
                : deferredPrompt
                  ? 'Install aplikasi sekarang'
                  : 'Tambahkan ke layar utama'}
            </span>
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2
          className="mb-2 text-xs font-semibold uppercase"
          style={{ color: 'var(--app-text-mute)' }}
        >
          Lainnya
        </h2>
        <div
          className="app-card flex flex-col divide-y"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div
            className="border-b"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <RowLink
              to="/profil"
              icon={<CircleHelp size={18} />}
              label="Bantuan"
            />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Info size={18} style={{ color: 'var(--app-text-soft)' }} />
            <span className="flex-1">Tentang aplikasi</span>
            <span className="text-sm" style={{ color: 'var(--app-text-mute)' }}>
              v1.0.0
            </span>
          </div>
        </div>
      </section>

      <button
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

      {paymentModal && (
        <PaymentMethodModal
          title={
            paymentModal.mode === 'edit'
              ? 'Edit Metode Pembayaran'
              : 'Tambah Metode Pembayaran'
          }
          submitLabel={
            paymentModal.mode === 'edit' ? 'Simpan perubahan' : 'Tambah'
          }
          initialValue={
            editingPaymentMethod
              ? {
                  type: editingPaymentMethod.type,
                  provider: editingPaymentMethod.provider,
                  accountNumber: editingPaymentMethod.accountNumber ?? '',
                  accountName: editingPaymentMethod.accountName ?? '',
                  qrisImage: editingPaymentMethod.qrisImage,
                  isActive: editingPaymentMethod.isActive,
                }
              : undefined
          }
          onClose={() => setPaymentModal(null)}
          onSubmit={handleSavePaymentMethod}
          onDelete={
            paymentModal.mode === 'edit'
              ? () => handleDeletePaymentMethod(paymentModal.id)
              : undefined
          }
        />
      )}

      {showProfileModal && (
        <EditProfileModal
          title="Edit Profil"
          submitLabel="Simpan"
          initialValue={{
            name: user?.name ?? '',
            brandName: user?.brandName ?? '',
          }}
          onClose={() => setShowProfileModal(false)}
          onSubmit={handleSaveProfile}
        />
      )}

      {showTemplateModal && (
        <MessageTemplateModal
          title="Template Chat WA"
          submitLabel="Simpan"
          initialValue={user?.waMessageTemplate ?? DEFAULT_WA_MESSAGE_TEMPLATE}
          onClose={() => setShowTemplateModal(false)}
          onSubmit={handleSaveTemplate}
        />
      )}

      {showPasswordModal && (
        <ChangePasswordModal
          title="Ubah Kata Sandi"
          submitLabel="Simpan"
          onClose={() => setShowPasswordModal(false)}
          onSubmit={handleChangePassword}
        />
      )}
    </main>
  )
}
