import { useRef, useState } from 'react'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import {
  ChevronRight,
  Globe,
  KeyRound,
  Landmark,
  LogOut,
  Mail,
  Store,
  Wallet,
} from 'lucide-react'
import ChangePasswordModal from '../../components/ChangePasswordModal'
import PartnerLogo from '../../components/PartnerLogo'
import { usePartnerI18n, usePartnerT } from '../../components/PartnerI18n'
import Toast from '../../components/ui/Toast'
import { blobToDataUrl, fileToAvatarBlob } from '../../lib/avatar-image'
import { formatPhoneNumber } from '../../lib/format'
import { logoutPartner } from '../../lib/partner-functions'
import {
  changeOwnPartnerPassword,
  updateOwnPartnerLogo,
  updateOwnPartnerProfile,
} from '../../lib/partner-profile-functions'
import {
  BANK_ACCOUNT_NAME_MAX,
  BANK_NAME_MAX,
  PARTNER_NAME_MAX,
  normalizePartnerBankAccount,
  normalizePartnerProfile,
} from '../../lib/partner-profile-rules'
import { currentPartnerQuery } from '../../lib/queries'
import { fetchPartnerCreditOverview } from '../../lib/partner-credit-functions'
import { formatRupiah } from '../../lib/partner-product-rules'
import {
  PARTNER_LOCALES,
  PARTNER_LOCALE_LABELS,
} from '../../lib/partner-locale'

export const Route = createFileRoute('/partner/profil')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(currentPartnerQuery),
  component: PartnerProfilePage,
})

function PartnerProfilePage() {
  const { data: partner } = useSuspenseQuery(currentPartnerQuery)
  const t = usePartnerT()
  // Layout `/partner` sudah memastikan partner ada; ini cuma penyempit tipe.
  if (!partner) return null

  return (
    <main className="pm-wide flex flex-col gap-4 px-5 pt-4 lg:gap-5">
      <header>
        <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
          {t.profile.title}
        </h1>
        <p
          className="mt-1 hidden text-[13px] lg:block"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {t.profile.subtitle}
        </p>
      </header>
      <div className="flex flex-col gap-4 lg:grid lg:max-w-[1040px] lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="lg:col-start-1 lg:row-start-1">
          <LogoCard name={partner.name} logoUrl={partner.logoUrl} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <CreditCard />
        </div>
        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <ProfileForm
            initialName={partner.name}
            initialWaNumber={partner.waNumber ?? ''}
            initialBankName={partner.bankName ?? ''}
            initialBankAccountNumber={partner.bankAccountNumber ?? ''}
            initialBankAccountName={partner.bankAccountName ?? ''}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-3">
          <AccountCard email={partner.email} />
        </div>
        <div className="lg:col-start-1 lg:row-start-4">
          <LanguageCard />
        </div>
      </div>
      {/* Di desktop tombol Keluar sudah ada di sidebar. */}
      <div className="lg:hidden">
        <LogoutButton />
      </div>
    </main>
  )
}

/** Pilihan bahasa Partner Portal; disimpan di cookie (lihat partner-locale). */
function LanguageCard() {
  const { t, locale, setLocale } = usePartnerI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(next: (typeof PARTNER_LOCALES)[number]) {
    if (next === locale) return
    setError(null)
    setBusy(true)
    try {
      await setLocale(next)
    } catch {
      setError(t.shell.languageSaveFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card flex flex-col gap-3 p-4 lg:p-5">
      <div className="flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <Globe size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold">{t.shell.language}</p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {t.shell.languageHint}
          </p>
        </div>
      </div>
      <div
        role="group"
        aria-label={t.shell.language}
        className="grid grid-cols-2 gap-2"
      >
        {PARTNER_LOCALES.map((option) => {
          const active = option === locale
          return (
            <button
              key={option}
              type="button"
              lang={option}
              aria-pressed={active}
              disabled={busy}
              onClick={() => void choose(option)}
              className="min-h-[44px] rounded-xl border px-3 text-sm disabled:opacity-60"
              style={{
                borderColor: active ? 'var(--app-accent)' : 'var(--app-border)',
                background: active ? 'var(--app-accent-soft)' : 'transparent',
                color: active ? 'var(--app-accent)' : 'var(--app-text)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {PARTNER_LOCALE_LABELS[option]}
            </button>
          )
        })}
      </div>
      {error && (
        <p className="text-xs" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
    </section>
  )
}

/** Keluar dari Partner Portal (sebelumnya ada di header global partner). */
function LogoutButton() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = usePartnerT()

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
      {t.profile.logout}
    </button>
  )
}

function ProfileForm({
  initialName,
  initialWaNumber,
  initialBankName,
  initialBankAccountNumber,
  initialBankAccountName,
}: {
  initialName: string
  initialWaNumber: string
  initialBankName: string
  initialBankAccountNumber: string
  initialBankAccountName: string
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [waNumber, setWaNumber] = useState(initialWaNumber)
  const [bankName, setBankName] = useState(initialBankName)
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialBankAccountNumber,
  )
  const [bankAccountName, setBankAccountName] = useState(initialBankAccountName)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { t, translateError, errorMessage } = usePartnerI18n()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const checked = normalizePartnerProfile({ name, waNumber })
    if (!checked.ok) {
      setError(translateError(checked.error))
      return
    }

    const bank = normalizePartnerBankAccount({
      bankName,
      bankAccountNumber,
      bankAccountName,
    })
    if (!bank.ok) {
      setError(translateError(bank.error))
      return
    }

    setSaving(true)
    try {
      await updateOwnPartnerProfile({
        data: {
          name,
          waNumber,
          bankName,
          bankAccountNumber,
          bankAccountName,
        },
      })
      // Nama baru tampil di header (konteks route) dan di etalase jastiper.
      await queryClient.invalidateQueries({ queryKey: ['current-partner'] })
      await queryClient.invalidateQueries({ queryKey: ['calendar-event'] })
      await router.invalidate()
      setName(checked.value.name)
      setWaNumber(checked.value.waNumber ?? '')
      setBankName(bank.value.bankName ?? '')
      setBankAccountNumber(bank.value.bankAccountNumber ?? '')
      setBankAccountName(bank.value.bankAccountName ?? '')
      setNotice(t.profile.profileSaved)
    } catch (err) {
      setError(errorMessage(err, t.profile.profileSaveFailed))
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
          <p className="text-sm font-semibold">{t.profile.partnerData}</p>
          <p
            className="hidden text-xs lg:block"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {t.profile.partnerDataHint}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          {t.profile.partnerName}
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
            {t.profile.partnerNameHint}
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          {t.profile.whatsapp}
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
              {t.profile.savedNumber(formatPhoneNumber(initialWaNumber))}
            </span>
          )}
        </label>
      </div>

      <div className="border-t" style={{ borderColor: 'var(--app-border)' }} />

      <div className="flex items-center gap-2">
        <span className="app-icon-tile h-9 w-9 shrink-0">
          <Landmark size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold">{t.profile.bankSection}</p>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            {t.profile.bankSectionHint}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          {t.profile.bankName}
          <input
            maxLength={BANK_NAME_MAX}
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="app-input"
            placeholder={t.profile.bankNamePlaceholder}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          {t.profile.bankAccountNumber}
          <input
            inputMode="numeric"
            value={bankAccountNumber}
            onChange={(e) => setBankAccountNumber(e.target.value)}
            className="app-input"
            placeholder={t.profile.bankAccountNumberPlaceholder}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold lg:col-span-2">
          {t.profile.bankAccountName}
          <input
            maxLength={BANK_ACCOUNT_NAME_MAX}
            value={bankAccountName}
            onChange={(e) => setBankAccountName(e.target.value)}
            className="app-input"
            placeholder={t.profile.bankAccountNamePlaceholder}
          />
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
        {saving ? t.common.saving : t.common.saveChanges}
      </button>
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </form>
  )
}

/** Ringkasan saldo kredit; ketuk untuk top up dan riwayat di /partner/saldo. */
function CreditCard() {
  const t = usePartnerT()
  const { data } = useQuery({
    queryKey: ['partner-credit'],
    queryFn: () => fetchPartnerCreditOverview(),
  })
  const balance = data ? Number(data.balance) : null
  return (
    <Link
      to="/partner/saldo"
      className="app-card flex items-center gap-3 p-4 no-underline lg:p-5"
    >
      <span className="app-icon-tile h-9 w-9 shrink-0">
        <Wallet size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t.profile.credit}</span>
        <span
          className="pm-num block text-xs"
          style={{
            color: balance !== null && balance < 0 ? 'var(--app-danger)' : 'var(--app-text-soft)',
          }}
        >
          {balance === null
            ? t.profile.creditHint
            : formatRupiah(balance)}
        </span>
      </span>
      <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
    </Link>
  )
}

function AccountCard({ email }: { email: string }) {
  const [changing, setChanging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { t, errorMessage } = usePartnerI18n()

  async function handleChangePassword(value: {
    currentPassword: string
    newPassword: string
  }) {
    try {
      await changeOwnPartnerPassword({ data: value })
    } catch (err) {
      throw new Error(errorMessage(err, t.profile.changePasswordFailed))
    }
    setChanging(false)
    setNotice(t.profile.passwordChanged)
  }

  return (
    <section className="app-card flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="app-icon-tile h-9 w-9 shrink-0">
            <Mail size={16} />
          </span>
          <p className="text-sm font-semibold">{t.profile.loginEmail}</p>
        </div>
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {t.profile.loginEmailHint}
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
          <span className="block text-sm font-semibold">{t.profile.password}</span>
          <span
            className="block text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {t.profile.passwordHint}
          </span>
        </span>
        <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
      </button>

      {changing && (
        <ChangePasswordModal
          title={t.profile.changePassword}
          submitLabel={t.profile.changePassword}
          text={t.profile.passwordModal}
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
  const { t, errorMessage } = usePartnerI18n()

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
      setNotice(t.profile.logoSaved)
    } catch (err) {
      setError(errorMessage(err, t.profile.logoProcessFailed))
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
      setNotice(t.profile.logoRemoved)
    } catch (err) {
      setError(errorMessage(err, t.profile.logoRemoveFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app-card flex items-center gap-4 p-4 lg:flex-col lg:gap-5 lg:p-6 lg:text-center">
      <PartnerLogo name={name} logoUrl={logoUrl} size={72} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 lg:items-center">
        <p className="text-sm font-semibold">{t.profile.logo}</p>
        <div className="flex flex-wrap items-center gap-3 lg:justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="app-btn-outline"
            style={{ width: 'auto', padding: '0.4rem 0.8rem' }}
          >
            {busy
              ? t.common.processing
              : logoUrl
                ? t.profile.logoChange
                : t.profile.logoUpload}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
              className="text-xs font-semibold disabled:opacity-50"
              style={{ color: 'var(--app-danger)' }}
            >
              {t.common.delete}
            </button>
          )}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--app-text-mute)' }}>
          {t.profile.logoHint}
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
