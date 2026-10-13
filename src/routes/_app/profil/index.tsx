import { useEffect, useState } from 'react'
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  Contact,
  Crown,
  History,
  KeyRound,
  Landmark,
  LogOut,
  MessageSquareText,
  Moon,
  SlidersHorizontal,
  Tag,
  Users,
} from 'lucide-react'
import ChangePasswordModal from '../../../components/ChangePasswordModal'
import EditProfileModal from '../../../components/EditProfileModal'
import type { ProfileFormValue } from '../../../components/EditProfileModal'
import UserAvatar from '../../../components/UserAvatar'
import Switch from '../../../components/ui/Switch'
import { removeAvatar, uploadAvatar } from '../../../lib/avatar-functions'
import {
  changePassword,
  fetchCurrentUser,
  logoutUser,
  updateProfile,
} from '../../../lib/auth-functions'
import {
  listPaymentMethods,
} from '../../../lib/payment-methods-functions'
import {
  hasFullAccess,
  planLabel,
} from '../../../lib/subscription'
import type { Entitlement } from '../../../lib/subscription'
import VerifyEmailBanner from '#/components/VerifyEmailBanner'

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

/** Keterangan singkat status paket di baris "Langganan" halaman Profil. */
function planRowSubtitle(entitlement: Entitlement | null) {
  if (!entitlement) return ''
  if (entitlement.plan === 'pro') return 'Semua fitur terbuka'
  if (entitlement.plan === 'trial') {
    return `Sisa ${entitlement.trialDaysLeft} hari trial`
  }
  return 'Fitur PRO terkunci'
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
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // Menu langganan, rekening/QRIS, serta nama & foto brand hanya untuk pemilik
  // brand. Server tetap penentu akhir (`requireBrandPermission`).
  // (lewat variabel perantara supaya TypeScript tidak mempersempit `user`)
  const brandRole: string | undefined = user?.brandRole
  const isOwner = brandRole === 'owner'

  // Ajakan upgrade di baris "Langganan" — TRIAL & PRO sama-sama akses penuh,
  // jadi cuma FREE yang perlu lihat CTA-nya. Pakai helper entitlement yang ada.
  const showUpgradeCta = user ? !hasFullAccess(user.entitlements) : false

  async function handleLogout() {
    await logoutUser()
    await navigate({ to: '/login' })
    // Setelah halaman lama di-unmount: kosongkan cache supaya akun berikutnya
    // di tab yang sama tidak melihat 'current-user'/data akun sebelumnya.
    queryClient.clear()
  }

  async function handleSaveProfile(data: ProfileFormValue) {
    try {
      await updateProfile({
        data: { name: data.name, brandName: data.brandName },
      })
      if (data.avatarChange?.type === 'upload') {
        await uploadAvatar({ data: { dataUrl: data.avatarChange.dataUrl } })
      } else if (data.avatarChange?.type === 'remove') {
        await removeAvatar()
      }
    } finally {
      // Segarkan tampilan walau salah satu langkah gagal (mis. profil sudah
      // tersimpan tapi foto gagal), supaya data di belakang modal tidak usang.
      await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    }
    setShowProfileModal(false)
  }

  async function handleChangePassword(data: {
    currentPassword: string
    newPassword: string
  }) {
    await changePassword({ data })
    setShowPasswordModal(false)
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <h1 className="mb-6 text-xl font-bold">Profil</h1>

      <button
        type="button"
        onClick={() => setShowProfileModal(true)}
        className="app-card flex w-full items-center gap-3 p-4 text-left"
        aria-label="Edit profil"
      >
        <UserAvatar
          brandId={user?.brandId ?? undefined}
          name={user?.name}
          avatarUpdatedAt={user?.avatarUpdatedAt}
          className="h-14 w-14 text-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {user?.brandName || 'Belum ada nama brand'}
          </p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
      </button>

      {user && !user.emailVerified && (
        <section className="mt-6 w-full">
          <VerifyEmailBanner email={user.email} />
        </section>
      )}

      {isOwner && (
        <section className="mt-6">
          <h2
            className="mb-2 text-xs font-semibold uppercase"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Langganan
          </h2>
          <Link
            to="/profil/langganan"
            className="app-card flex w-full items-center gap-3 p-4 no-underline"
            style={{ color: 'var(--app-text)' }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: 'var(--app-accent-soft)',
                color: 'var(--app-accent)',
              }}
            >
              <Crown size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                Paket {user ? planLabel(user.entitlements.plan) : '-'}
              </p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {planRowSubtitle(user?.entitlements ?? null)}
              </p>
            </div>
            {showUpgradeCta && (
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--app-accent)' }}
              >
                Upgrade
              </span>
            )}
            <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
          </Link>
        </section>
      )}
      <section className="mb-6 mt-6">
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

      {isOwner && (
        <section className="mb-6">
          <h2
            className="mb-2 text-xs font-semibold uppercase"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Pembayaran
          </h2>
          <div
            className="app-card"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <Link
              to="/profil/pembayaran"
              className="flex w-full items-center gap-3 px-4 py-3 no-underline"
              style={{ color: 'var(--app-text)' }}
            >
              <span style={{ color: 'var(--app-text-soft)' }}>
                <Landmark size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">Metode Pembayaran</span>
              </span>
              <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
            </Link>
          </div>
        </section>
      )}

      {isOwner && (
        <section className="mb-6">
          <h2
            className="mb-2 text-xs font-semibold uppercase"
            style={{ color: 'var(--app-text-mute)' }}
          >
            Tim
          </h2>
          <div
            className="app-card"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <Link
              to="/profil/tim"
              className="flex w-full items-center gap-3 px-4 py-3 no-underline"
              style={{ color: 'var(--app-text)' }}
            >
              <span style={{ color: 'var(--app-text-soft)' }}>
                <Users size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">Kelola Tim</span>
              </span>
              <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
            </Link>
          </div>
        </section>
      )}

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
          <Link
            to="/profil/template-chat"
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
            </span>
            <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
          </Link>
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

      {showProfileModal && (
        <EditProfileModal
          title="Edit Profil"
          submitLabel="Simpan"
          initialValue={{
            name: user?.name ?? '',
            brandName: user?.brandName ?? '',
          }}
          avatar={
            isOwner
              ? {
                  brandId: user?.brandId ?? undefined,
                  avatarUpdatedAt: user?.avatarUpdatedAt,
                }
              : undefined
          }
          brandNameEditable={isOwner}
          email={
            user
              ? { address: user.email, verified: user.emailVerified }
              : undefined
          }
          onClose={() => setShowProfileModal(false)}
          onSubmit={handleSaveProfile}
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
