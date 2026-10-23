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
import NewBadge from '../../../components/NewBadge'
import UserAvatar from '../../../components/UserAvatar'
import Switch from '../../../components/ui/Switch'
import { removeAvatar, uploadAvatar } from '../../../lib/avatar-functions'
import {
  changePassword,
  fetchCurrentUser,
  logoutUser,
  updateProfile,
} from '../../../lib/auth-functions'
import { NEW_FEATURES } from '../../../lib/new-feature'
import { listPaymentMethods } from '../../../lib/payment-methods-functions'
import {
  planBadgeText,
} from '../../../lib/subscription'
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

const rowClassName =
  'flex w-full items-center gap-3 px-4 py-3 text-left no-underline'

/** Satu kelompok menu: judul kecil + kartu berisi baris-baris menu. */
function MenuSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <h2
        className="mb-2 text-xs font-semibold uppercase"
        style={{ color: 'var(--app-text-mute)' }}
      >
        {title}
      </h2>
      <div
        className="app-card flex flex-col"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {children}
      </div>
    </section>
  )
}

/** Pembungkus satu baris menu: garis pemisah di atas, kecuali baris pertama. */
function MenuItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border-t first:border-t-0"
      style={{ borderColor: 'var(--app-border)' }}
    >
      {children}
    </div>
  )
}

function RowLabel({
  icon,
  label,
  description,
  badge,
}: {
  icon: React.ReactNode
  label: string
  description?: string
  /** Penanda kecil di samping label (mis. badge "New"). */
  badge?: React.ReactNode
}) {
  return (
    <>
      <span style={{ color: 'var(--app-text-soft)' }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {label}
          {badge}
        </span>
        {description && (
          <span
            className="block text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {description}
          </span>
        )}
      </span>
    </>
  )
}

function RowLink({
  to,
  icon,
  label,
  description,
  trailing,
  isNew,
}: {
  to: string
  icon: React.ReactNode
  label: string
  description?: string
  trailing?: React.ReactNode
  /** Tampilkan badge "New" di samping label (lihat `NEW_FEATURES`). */
  isNew?: boolean
}) {
  return (
    <Link to={to} className={rowClassName} style={{ color: 'var(--app-text)' }}>
      <RowLabel
        icon={icon}
        label={label}
        description={description}
        badge={isNew ? <NewBadge /> : undefined}
      />
      {trailing}
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
  const entitlements = user?.entitlements;

  // Badge & menu Subscription, rekening/QRIS, serta nama & foto brand hanya untuk pemilik
  // brand. Server tetap penentu akhir (`requireBrandPermission`).
  // (lewat variabel perantara supaya TypeScript tidak mempersempit `user`)
  const brandRole: string | undefined = user?.brandRole
  const isOwner = brandRole === 'owner'

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
        data: {
          name: data.name,
          brandName: data.brandName,
          waNumber: data.waNumber,
        },
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
          className="h-16 w-16 text-xl border"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-xl">{user?.name}</p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
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

      <div className="mt-6">
        <MenuSection title="Akun & Keamanan">
          {isOwner && (
            <MenuItem>
              <RowLink
                to="/profil/langganan"
                icon={<Crown size={18} />}
                label="Subscription"
                trailing={
                  entitlements ? (
                    <span
                      className="app-badge"
                      style={
                        entitlements.plan === 'free'
                          ? {
                              background: 'var(--app-border)',
                              color: 'var(--app-text-soft)',
                            }
                          : {
                              background: 'var(--app-accent-soft)',
                              color: 'var(--app-accent)',
                            }
                      }
                    >
                      {planBadgeText(entitlements)}
                    </span>
                  ) : undefined
                }
              />
            </MenuItem>
          )}
          <MenuItem>
            {user?.hasPassword ? (
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className={rowClassName}
                style={{ color: 'var(--app-text)' }}
              >
                <RowLabel
                  icon={<KeyRound size={18} />}
                  label="Keamanan"
                />
                <ChevronRight
                  size={18}
                  style={{ color: 'var(--app-text-mute)' }}
                />
              </button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <RowLabel
                  icon={<KeyRound size={18} />}
                  label="Keamanan"
                  description="Akun ini masuk lewat Google — kata sandi diatur dari akun Google kamu"
                />
              </div>
            )}
          </MenuItem>
        </MenuSection>

        <MenuSection title="Bisnis & Tim">
          <MenuItem>
            <RowLink
              to="/profil/fee-rules"
              icon={<Tag size={18} />}
              label="Manajemen Fee"
            />
          </MenuItem>
          <MenuItem>
            <RowLink
              to="/profil/customers"
              icon={<Contact size={18} />}
              label="Data Customer"
            />
          </MenuItem>
          {FEATURES.advancedMenu && (
            <>
              <MenuItem>
                <RowLink
                  to="/profil"
                  icon={<SlidersHorizontal size={18} />}
                  label="Master Control"
                />
              </MenuItem>
              <MenuItem>
                <RowLink
                  to="/profil"
                  icon={<History size={18} />}
                  label="Activity Logs"
                />
              </MenuItem>
            </>
          )}
          {isOwner && (
            <MenuItem>
              <RowLink
                to="/profil/tim"
                icon={<Users size={18} />}
                label="Kelola Tim"
                isNew={NEW_FEATURES.tim}
              />
            </MenuItem>
          )}
          {isOwner && (
            <MenuItem>
              <RowLink
                to="/profil/pembayaran"
                icon={<Landmark size={18} />}
                label="Metode Pembayaran"
              />
            </MenuItem>
          )}
        </MenuSection>

        <MenuSection title="Preferensi Sistem">
          <MenuItem>
            <div className="flex items-center gap-3 px-4 py-3">
              <RowLabel
                icon={<Moon size={18} />}
                label="Mode Tampilan"
              />
              <Switch
                checked={isDark}
                onChange={toggleDark}
                label="Mode gelap"
              />
            </div>
          </MenuItem>
          <MenuItem>
            <RowLink
              to="/profil/template-chat"
              icon={<MessageSquareText size={18} />}
              label="Template Chat WA"
            />
          </MenuItem>
        </MenuSection>
      </div>

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
            waNumber: user?.waNumber ?? '',
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
