import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Eye, EyeOff, KeyRound, Mail, Store } from 'lucide-react'
import Toast from '../../components/ui/Toast'
import { getErrorMessage } from '../../lib/error-message'
import { formatPhoneNumber } from '../../lib/format'
import {
  changeOwnPartnerPassword,
  updateOwnPartnerProfile,
} from '../../lib/partner-profile-functions'
import {
  PARTNER_NAME_MAX,
  normalizePartnerProfile,
} from '../../lib/partner-profile-rules'
import { PARTNER_PASSWORD_MIN_LENGTH } from '../../lib/partner-rules'
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
    <main className="flex flex-col gap-4 px-4 pb-6 pt-6">
      <h1 className="text-xl font-bold">Profil</h1>
      <ProfileForm
        initialName={partner.name}
        initialWaNumber={partner.waNumber ?? ''}
      />
      <EmailCard email={partner.email} />
      <PasswordForm />
    </main>
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
    <form className="app-card flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <Store size={16} />
        </span>
        <p className="text-sm font-semibold">Data partner</p>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
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

      <label className="flex flex-col gap-1 text-sm font-medium">
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

      {error && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="app-btn-primary">
        {saving ? 'Menyimpan...' : 'Simpan'}
      </button>
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </form>
  )
}

function EmailCard({ email }: { email: string }) {
  return (
    <section className="app-card flex flex-col gap-2 p-4">
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
    </section>
  )
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama')
      return
    }

    setSaving(true)
    try {
      await changeOwnPartnerPassword({
        data: { currentPassword, newPassword },
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice('Kata sandi diganti. Perangkat lain sudah keluar.')
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal mengganti kata sandi'))
    } finally {
      setSaving(false)
    }
  }

  const type = showPassword ? 'text' : 'password'
  return (
    <form className="app-card flex flex-col gap-4 p-4" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <KeyRound size={16} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold">Ganti kata sandi</p>
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label="Tampilkan kata sandi"
          style={{ color: 'var(--app-text-mute)' }}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Kata sandi lama
        <input
          type={type}
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="app-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kata sandi baru
        <input
          type={type}
          required
          minLength={PARTNER_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          placeholder={`Minimal ${PARTNER_PASSWORD_MIN_LENGTH} karakter`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="app-input"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Konfirmasi kata sandi baru
        <input
          type={type}
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="app-input"
        />
      </label>

      {error && (
        <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="app-btn-primary">
        {saving ? 'Menyimpan...' : 'Ganti kata sandi'}
      </button>
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </form>
  )
}
