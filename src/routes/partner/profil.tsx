import { useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ChevronRight, KeyRound, LogOut, Mail, Store } from 'lucide-react'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import PartnerLogo from '../../components/PartnerLogo'
import PartnerSubscriptionCard from '../../components/PartnerSubscriptionCard'
import Toast from '../../components/ui/Toast'
import { blobToDataUrl, fileToAvatarBlob } from '../../lib/avatar-image'
import { getErrorMessage } from '../../lib/error-message'
import { formatPhoneNumber } from '../../lib/format'
import { logoutPartner } from '../../lib/partner-functions'
import {
  changeOwnPartnerPassword,
  updateOwnPartnerLogo,
  updateOwnPartnerProfile,
} from '../../lib/partner-profile-functions'
import {
  PARTNER_NAME_MAX,
  normalizePartnerProfile,
} from '../../lib/partner-profile-rules'
import { currentPartnerQuery } from '../../lib/queries'

export const Route = createFileRoute('/partner/profil')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(currentPartnerQuery),
  component: PartnerProfilePage,
})

function PartnerProfilePage() {
  const { data: partner } = useSuspenseQuery(currentPartnerQuery)
  // Layout `/partner` sudah memastikan partner ada; ini cuma penyempit tipe.
  if (!partner) return null

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4 lg:gap-5">
      <header>
        <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
          Profil
        </h1>
        <p
          className="mt-1 hidden text-[13px] lg:block"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Kelola logo, data partner, dan keamanan akun kamu.
        </p>
      </header>
      <div className="flex flex-col gap-4 lg:grid lg:max-w-[1040px] lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="lg:col-start-1 lg:row-start-1">
          <LogoCard name={partner.name} logoUrl={partner.logoUrl} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <PartnerSubscriptionCard />
        </div>
        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <ProfileForm
            initialName={partner.name}
            initialWaNumber={partner.waNumber ?? ''}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-3">
          <AccountCard email={partner.email} />
        </div>
      </div>
      {/* Di desktop tombol Keluar sudah ada di sidebar. */}
      <div className="lg:hidden">
        <LogoutButton />
      </div>
    </main>
  )
}

/** Keluar dari Partner Portal (sebelumnya ada di header global partner). */
function LogoutButton() {
  const queryClient = useQueryClient()
  const router = useRouter()

  async function handleLogout() {
    await logoutPartner()
    queryClient.clear()
    await router.navigate({ to: '/login' })
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="app-btn-outline w-full"
      style={{ color: 'var(--app-accent)' }}
    >
      <LogOut size={16} />
      Keluar
    </button>
  )
}

function ProfileForm({
  initialName,
  initialWaNumber,
}: {
  initialName: string
  initialWaNumber: string
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [waNumber, setWaNumber] = useState(initialWaNumber)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const checked = normalizePartnerProfile({ name, waNumber })
    if (!checked.ok) {
      setError(checked.error)
      return
    }

    setSaving(true)
    try {
      await updateOwnPartnerProfile({ data: { name, waNumber } })
      // Nama baru tampil di header (konteks route) dan di etalase jastiper.
      await queryClient.invalidateQueries({ queryKey: ['current-partner'] })
      await queryClient.invalidateQueries({ queryKey: ['calendar-event'] })
      await router.invalidate()
      setName(checked.value.name)
      setWaNumber(checked.value.waNumber ?? '')
      setNotice('Profil disimpan')
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan profil'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="app-card flex flex-col gap-4 p-4 lg:gap-5 lg:p-6"
      onSubmit={handleSubmit}
    >
      <div className="flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <Store size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold">Data partner</p>
          <p
            className="hidden text-xs lg:block"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Informasi ini tampil di etalase jastiper pada halaman event.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          Nama partner
          <input
            required
            maxLength={PARTNER_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="app-input"
          />
          <span
            className="text-xs font-normal"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Tampil di halaman event sebagai brand yang dipamerkan.
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          No. WhatsApp (opsional)
          <input
            type="tel"
            inputMode="tel"
            value={waNumber}
            onChange={(e) => setWaNumber(e.target.value)}
            className="app-input"
            placeholder="08xxxxxxxxxx"
          />
          {initialWaNumber && (
            <span
              className="text-xs font-normal"
              style={{ color: 'var(--app-text-soft)' }}
            >
              Tersimpan: {formatPhoneNumber(initialWaNumber)}
            </span>
          )}
        </label>
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="app-btn-primary lg:self-end lg:px-8"
      >
        {saving ? 'Menyimpan...' : 'Simpan perubahan'}
      </button>
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </form>
  )
}

function AccountCard({ email }: { email: string }) {
  const [changing, setChanging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleChangePassword(value: {
    currentPassword: string
    newPassword: string
  }) {
    try {
      await changeOwnPartnerPassword({ data: value })
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Gagal mengganti kata sandi'))
    }
    setChanging(false)
    setNotice('Kata sandi diganti. Perangkat lain sudah keluar.')
  }

  return (
    <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="app-icon-tile h-9 w-9 shrink-0">
            <Mail size={16} />
          </span>
          <p className="text-sm font-semibold">Email login</p>
        </div>
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Email tidak bisa diubah sendiri. Hubungi admin ALAKA kalau perlu
          menggantinya.
        </p>
      </div>

      <div className="border-t" style={{ borderColor: 'var(--app-border)' }} />

      <button
        type="button"
        onClick={() => setChanging(true)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <KeyRound size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Kata sandi</span>
          <span
            className="block text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Ganti kata sandi akun
          </span>
        </span>
        <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
      </button>

      {changing && (
        <ChangePasswordModal
          title="Ganti kata sandi"
          submitLabel="Ganti kata sandi"
          onClose={() => setChanging(false)}
          onSubmit={handleChangePassword}
        />
      )}
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </section>
  )
}

function LogoCard({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh() {
    // Logo baru tampil di header (konteks route) dan di etalase jastiper.
    await queryClient.invalidateQueries({ queryKey: ['current-partner'] })
    await queryClient.invalidateQueries({ queryKey: ['calendar-event'] })
    await router.invalidate()
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset supaya memilih berkas yang sama dua kali tetap memicu onChange.
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const blob = await fileToAvatarBlob(file)
      await updateOwnPartnerLogo({
        data: { action: 'replace', dataUrl: await blobToDataUrl(blob) },
      })
      await refresh()
      setNotice('Logo disimpan')
    } catch (err) {
      setError(getErrorMessage(err, 'Logo tidak bisa diproses'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setBusy(true)
    try {
      await updateOwnPartnerLogo({ data: { action: 'remove' } })
      await refresh()
      setNotice('Logo dihapus')
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menghapus logo'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card flex items-center gap-4 p-4 lg:flex-col lg:gap-5 lg:p-6 lg:text-center">
      <PartnerLogo name={name} logoUrl={logoUrl} size={72} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 lg:items-center">
        <p className="text-sm font-semibold">Logo partner</p>
        <div className="flex flex-wrap items-center gap-3 lg:justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="app-btn-outline"
            style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
          >
            {busy ? 'Memproses...' : logoUrl ? 'Ganti logo' : 'Unggah logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
              className="text-xs font-semibold disabled:opacity-50"
              style={{ color: 'var(--app-danger)' }}
            >
              Hapus
            </button>
          )}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
          Otomatis dipotong kotak dan dikecilkan. Tampil di header dan di
          halaman event.
        </p>
        {error && (
          <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
            {error}
          </p>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </section>
  )
}
