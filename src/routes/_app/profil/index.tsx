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
  Landmark,
  LogOut,
  MessageSquareText,
  Moon,
  SlidersHorizontal,
  Tag,
} from 'lucide-react'
import BankAccountModal from '../../../components/BankAccountModal'
import EditProfileModal from '../../../components/EditProfileModal'
import MessageTemplateModal from '../../../components/MessageTemplateModal'
import Switch from '../../../components/ui/Switch'
import {
  fetchCurrentUser,
  logoutUser,
  updateProfile,
} from '../../../lib/auth-functions'
import { updateMessageTemplate } from '../../../lib/message-template-functions'
import { DEFAULT_WA_MESSAGE_TEMPLATE } from '../../../lib/message-template'

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

// Event dari browser yang dipakai buat menampilkan prompt install PWA.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const Route = createFileRoute('/_app/profil/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(currentUserQuery),
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isDark, toggleDark] = useDarkModePreference()
  const [showBankModal, setShowBankModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
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
      data: {
        name: data.name,
        brandName: data.brandName,
        bankName: user?.bankName ?? undefined,
        bankAccountNumber: user?.bankAccountNumber ?? undefined,
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    setShowProfileModal(false)
  }

  async function handleSaveBank(data: {
    bankName: string
    bankAccountNumber: string
  }) {
    await updateProfile({
      data: {
        name: user?.name ?? '',
        brandName: user?.brandName ?? undefined,
        bankName: data.bankName,
        bankAccountNumber: data.bankAccountNumber,
      },
    })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    setShowBankModal(false)
  }

  async function handleSaveTemplate(template: string) {
    await updateMessageTemplate({ data: { template } })
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    setShowTemplateModal(false)
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
            className="border-b"
          >
            <RowLink
              to="/profil/customers"
              icon={<Contact size={18} />}
              label="Customer"
            />
          </div>
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
          <button
            type="button"
            onClick={() => setShowBankModal(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left no-underline"
            style={{ color: 'var(--app-text)' }}
          >
            <span style={{ color: 'var(--app-text-soft)' }}>
              <Landmark size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">No. Rekening</span>
              <span
                className="block truncate text-xs font-normal"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {user?.bankName && user.bankAccountNumber
                  ? `${user.bankName} ${user.bankAccountNumber}`
                  : 'Belum diatur — tampil di invoice tagih'}
              </span>
            </span>
            <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
          </button>
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

      {showBankModal && (
        <BankAccountModal
          title="No. Rekening"
          submitLabel="Simpan"
          initialValue={{
            bankName: user?.bankName ?? '',
            bankAccountNumber: user?.bankAccountNumber ?? '',
          }}
          onClose={() => setShowBankModal(false)}
          onSubmit={handleSaveBank}
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
    </main>
  )
}
