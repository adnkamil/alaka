import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Inbox, Mail, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import PartnerFormModal from '../../components/PartnerFormModal'
import PartnerLogo from '../../components/PartnerLogo'
import ConfirmModal from '../../components/ui/ConfirmModal'
import Toast from '../../components/ui/Toast'
import { getErrorMessage } from '../../lib/error-message'
import { formatDate, formatPhoneNumber } from '../../lib/format'
import { partnerInitials } from '../../lib/partner-logo-rules'
import {
  createAdminPartner,
  deleteAdminPartner,
  resendAdminPartnerInvitation,
  setAdminPartnerDisabled,
  updateAdminPartner,
} from '../../lib/partner-functions'
import { adminPartnersQuery } from '../../lib/queries'
import type { PartnerRow } from '../../lib/partner-queries'
import type { PartnerStatus } from '../../lib/partner-rules'
import type { PartnerFormValue } from '../../components/PartnerFormModal'

export const Route = createFileRoute('/admin/partner')({
  // `q` = kata kunci pencarian; dipakai bersama oleh topbar desktop & halaman.
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === 'string' && search.q !== '' ? search.q : undefined,
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminPartnersQuery),
  component: AdminPartnerPage,
})

type Tab = 'all' | PartnerStatus

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'diundang', label: 'Diundang' },
  { key: 'nonaktif', label: 'Nonaktif' },
]

const STATUS_LABEL: Record<PartnerStatus, string> = {
  aktif: 'Aktif',
  diundang: 'Diundang',
  nonaktif: 'Nonaktif',
}

const STATUS_STYLE: Record<PartnerStatus, { bg: string; fg: string }> = {
  aktif: { bg: 'var(--app-success-soft)', fg: 'var(--app-success)' },
  diundang: { bg: 'var(--app-accent-soft)', fg: 'var(--app-accent)' },
  nonaktif: { bg: 'var(--app-border)', fg: 'var(--app-text-soft)' },
}

function AdminPartnerPage() {
  const { data: partners } = useSuspenseQuery(adminPartnersQuery)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const { q } = Route.useSearch()
  const navigate = Route.useNavigate()
  const search = q ?? ''
  const setSearch = (value: string) =>
    void navigate({ search: { q: value || undefined }, replace: true })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PartnerRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const counts: Record<Tab, number> = {
    all: partners.length,
    aktif: partners.filter((p) => p.status === 'aktif').length,
    diundang: partners.filter((p) => p.status === 'diundang').length,
    nonaktif: partners.filter((p) => p.status === 'nonaktif').length,
  }

  const keyword = search.trim().toLowerCase()
  const visible = partners.filter((p) => {
    if (tab !== 'all' && p.status !== tab) return false
    if (!keyword) return true
    return (
      p.name.toLowerCase().includes(keyword) ||
      p.email.toLowerCase().includes(keyword)
    )
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-partners'] })
  }

  async function handleCreate(value: PartnerFormValue) {
    await createAdminPartner({
      data: {
        name: value.name,
        email: value.email,
        waNumber: value.waNumber || undefined,
      },
    })
    setFormOpen(false)
    setNotice(`Undangan dikirim ke ${value.email}`)
    await refresh()
  }

  async function handleUpdate(partner: PartnerRow, value: PartnerFormValue) {
    const result = await updateAdminPartner({
      data: {
        id: partner.id,
        name: value.name,
        email: value.email,
        waNumber: value.waNumber || undefined,
      },
    })
    setEditing(null)
    setNotice(
      result.invitationSent
        ? `Tersimpan. Undangan baru dikirim ke ${value.email}`
        : 'Perubahan tersimpan',
    )
    await refresh()
  }

  return (
    <>
      <main className="px-4 pb-6 pt-6 lg:hidden">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Kelola Partner</h1>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm"
            style={{ background: 'var(--app-accent)' }}
          >
            <Plus size={14} />
            Tambah partner
          </button>
        </div>
        <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Daftarkan brand partner. Mereka menerima email undangan untuk membuat
          kata sandi, lalu masuk lewat halaman login biasa.
        </p>

        <div
          className="mb-3 flex items-center gap-2 rounded-xl border px-3"
          style={{
            borderColor: 'var(--app-border)',
            background: 'var(--app-card)',
          }}
        >
          <Search size={16} style={{ color: 'var(--app-text-mute)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau email"
            className="app-input min-w-0 flex-1 border-0 pl-0"
          />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                tab === t.key
                  ? 'border-[var(--app-accent)] bg-[var(--app-accent)] text-white shadow-sm'
                  : 'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-soft)] hover:border-[var(--app-accent)]'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  tab === t.key
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="app-card flex flex-col items-center gap-2 p-8 text-center">
            <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              {partners.length === 0
                ? 'Belum ada partner. Tambahkan yang pertama.'
                : 'Belum ada partner yang cocok.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((partner) => (
              <PartnerCard
                key={partner.id}
                partner={partner}
                onEdit={() => setEditing(partner)}
                onNotice={setNotice}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </main>
      <main className="pm-wide hidden flex-col gap-5 lg:flex">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="pm-display text-[26px] leading-tight">
              Kelola Partner
            </h1>
            <p
              className="mt-1 text-[13px]"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {counts.all} partner · {counts.aktif} aktif · {counts.diundang}{' '}
              diundang
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="app-btn-primary gap-2"
            style={{ minHeight: 44, fontSize: 14 }}
          >
            <Plus size={16} />
            Tambah partner
          </button>
        </header>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`pm-chip ${tab === t.key ? 'pm-chip--active' : ''}`}
              >
                {t.label} {counts[t.key]}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-[336px]">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--app-text-soft)' }}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau email"
              aria-label="Cari nama atau email"
              className="app-input pl-10"
              style={{ height: 42, borderRadius: 12 }}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="app-card flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={28} style={{ color: 'var(--app-text-mute)' }} />
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              {partners.length === 0
                ? 'Belum ada partner. Tambahkan yang pertama.'
                : 'Belum ada partner yang cocok.'}
            </p>
          </div>
        ) : (
          <div className="app-card overflow-hidden">
            <div
              className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              <span>Partner</span>
              <span>No. WhatsApp</span>
              <span>Produk</span>
              <span>Event</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {visible.map((partner) => (
              <PartnerTableRow
                key={partner.id}
                partner={partner}
                onEdit={() => setEditing(partner)}
                onNotice={setNotice}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </main>

      {formOpen && (
        <PartnerFormModal
          onClose={() => setFormOpen(false)}
          onSubmit={handleCreate}
        />
      )}
      {editing && (
        <PartnerFormModal
          initial={{
            name: editing.name,
            email: editing.email,
            waNumber: editing.waNumber ?? '',
          }}
          note={
            editing.status === 'diundang'
              ? 'Kalau email diganti, undangan lama hangus dan undangan baru dikirim ke email yang baru.'
              : editing.status === 'aktif'
                ? 'Kalau email diganti, partner keluar dari semua perangkat dan harus masuk lagi dengan email baru.'
                : 'Partner ini sedang nonaktif. Perubahan tersimpan, tapi tidak ada email yang dikirim.'
          }
          onClose={() => setEditing(null)}
          onSubmit={(value) => handleUpdate(editing, value)}
        />
      )}
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </>
  )
}

function usePartnerActions(
  partner: PartnerRow,
  onNotice: (message: string) => void,
  onChanged: () => Promise<void>,
) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'disable' | 'delete' | null>(null)
  const disabled = partner.status === 'nonaktif'

  async function run(action: () => Promise<string>, fallback: string) {
    setBusy(true)
    try {
      onNotice(await action())
      await onChanged()
    } catch (err) {
      onNotice(getErrorMessage(err, fallback))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const resend = () =>
    run(async () => {
      await resendAdminPartnerInvitation({ data: { id: partner.id } })
      return `Undangan dikirim ulang ke ${partner.email}`
    }, 'Gagal mengirim ulang undangan')

  const toggleDisabled = () =>
    run(async () => {
      await setAdminPartnerDisabled({
        data: { id: partner.id, disabled: !disabled },
      })
      return disabled
        ? `${partner.name} diaktifkan kembali`
        : `${partner.name} dinonaktifkan`
    }, 'Gagal mengubah status partner')

  const remove = () =>
    run(async () => {
      await deleteAdminPartner({ data: { id: partner.id } })
      return `${partner.name} dihapus`
    }, 'Gagal menghapus partner')

  return {
    busy,
    confirm,
    setConfirm,
    disabled,
    resend,
    toggleDisabled,
    remove,
  }
}

type PartnerActions = ReturnType<typeof usePartnerActions>

/** Dialog konfirmasi nonaktifkan / hapus, dipakai kartu mobile & baris desktop. */
function PartnerConfirmModals({
  partner,
  actions,
}: {
  partner: PartnerRow
  actions: PartnerActions
}) {
  const { busy, confirm, setConfirm, toggleDisabled, remove } = actions
  return (
    <>
      <ConfirmModal
        open={confirm === 'disable'}
        title={`Nonaktifkan ${partner.name}?`}
        content="Partner langsung keluar dari semua perangkat dan tidak bisa masuk lagi sampai diaktifkan. Produk, katalog, dan event-nya tetap ada; event yang sedang berjalan tetap tampil ke jastiper kecuali kamu akhiri."
        okText="Nonaktifkan"
        loading={busy}
        onOk={toggleDisabled}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'delete'}
        title={`Hapus ${partner.name}?`}
        content={`Akun, ${partner.productCount} produk, foto produk, dan katalog PDF-nya dihapus permanen dan tidak bisa dikembalikan. ${partner.eventCount} event miliknya tetap ada sebagai event admin supaya jastiper yang sudah ikut tidak kehilangan data. Kalau hanya ingin menghentikan akses, pakai Nonaktifkan.`}
        okText="Hapus permanen"
        loading={busy}
        onOk={remove}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}

function PartnerCard({
  partner,
  onEdit,
  onNotice,
  onChanged,
}: {
  partner: PartnerRow
  onEdit: () => void
  onNotice: (message: string) => void
  onChanged: () => Promise<void>
}) {
  const actions = usePartnerActions(partner, onNotice, onChanged)
  const { busy, setConfirm, disabled, resend, toggleDisabled } = actions
  const style = STATUS_STYLE[partner.status]

  return (
    <div className="app-card p-4">
      <div className="flex items-start justify-between gap-3">
        <PartnerLogo name={partner.name} logoUrl={partner.logoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{partner.name}</p>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {partner.email}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--app-text-mute)' }}>
            {partner.waNumber
              ? `${formatPhoneNumber(partner.waNumber)} · `
              : ''}
            Didaftarkan {formatDate(partner.createdAt)}
          </p>
          <p
            className="mt-1 text-xs font-semibold"
            style={{ color: 'var(--app-accent)' }}
          >
            {partner.productCount} produk · {partner.eventCount} event
          </p>
        </div>
        <span
          className="app-badge shrink-0"
          style={{ background: style.bg, color: style.fg }}
        >
          {STATUS_LABEL[partner.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="flex items-center gap-1.5 disabled:opacity-50"
          style={{ color: 'var(--app-accent)' }}
        >
          <Pencil size={13} />
          Ubah
        </button>
        {partner.status === 'diundang' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="flex items-center gap-1.5 disabled:opacity-50"
            style={{ color: 'var(--app-accent)' }}
          >
            <Mail size={13} />
            {busy ? 'Mengirim...' : 'Kirim ulang undangan'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            disabled ? void toggleDisabled() : setConfirm('disable')
          }
          className="flex items-center gap-1.5 disabled:opacity-50"
          style={{ color: 'var(--app-text-soft)' }}
        >
          <Power size={13} />
          {disabled ? 'Aktifkan' : 'Nonaktifkan'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirm('delete')}
          className="flex items-center gap-1.5 disabled:opacity-50"
          style={{ color: 'var(--app-danger)' }}
        >
          <Trash2 size={13} />
          Hapus
        </button>
      </div>

      <PartnerConfirmModals partner={partner} actions={actions} />
    </div>
  )
}

const COLUMNS = 'grid-cols-[minmax(0,1fr)_150px_70px_70px_110px_200px]'

/** Satu baris tabel partner di desktop (Figma "D8 Admin - Kelola Partner"). */
function PartnerTableRow({
  partner,
  onEdit,
  onNotice,
  onChanged,
}: {
  partner: PartnerRow
  onEdit: () => void
  onNotice: (message: string) => void
  onChanged: () => Promise<void>
}) {
  const actions = usePartnerActions(partner, onNotice, onChanged)
  const { busy, setConfirm, disabled, resend, toggleDisabled } = actions
  const style = STATUS_STYLE[partner.status]

  return (
    <div
      className={`grid ${COLUMNS} items-center gap-4 border-t px-5 py-3`}
      style={{ borderColor: 'var(--app-border)' }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <PartnerLogo
          name={partner.name}
          logoUrl={partner.logoUrl}
          size={42}
          shape="circle"
          initials={partnerInitials(partner.name)}
          className="pm-display text-sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{partner.name}</p>
          <p
            className="truncate text-[11px]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {partner.email}
          </p>
        </div>
      </div>
      <span className="pm-num text-[13px] font-medium">
        {partner.waNumber ? formatPhoneNumber(partner.waNumber) : '-'}
      </span>
      <span className="text-sm font-bold">{partner.productCount}</span>
      <span className="text-sm font-bold">{partner.eventCount}</span>
      <div>
        <span
          className="app-badge"
          style={{ background: style.bg, color: style.fg }}
        >
          {STATUS_LABEL[partner.status]}
        </span>
      </div>
      <div className="flex items-center gap-4 text-[13px] font-semibold">
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="disabled:opacity-50"
          style={{ color: 'var(--app-accent)' }}
        >
          Ubah
        </button>
        {partner.status === 'diundang' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="disabled:opacity-50"
            style={{ color: 'var(--app-accent)' }}
          >
            {busy ? 'Mengirim...' : 'Kirim ulang'}
          </button>
        )}
        <details className="relative">
          <summary
            className="cursor-pointer list-none select-none"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Lainnya
          </summary>
          <div
            className="app-card absolute right-0 top-full z-20 mt-1 flex w-40 flex-col p-1.5"
            style={{ boxShadow: '0 12px 32px rgba(43,33,24,0.12)' }}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                disabled ? void toggleDisabled() : setConfirm('disable')
              }
              className="rounded-lg px-3 py-2 text-left hover:bg-[var(--pm-tint)] disabled:opacity-50"
            >
              {disabled ? 'Aktifkan' : 'Nonaktifkan'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm('delete')}
              className="rounded-lg px-3 py-2 text-left hover:bg-[var(--pm-tint)] disabled:opacity-50"
              style={{ color: 'var(--app-danger)' }}
            >
              Hapus
            </button>
          </div>
        </details>
      </div>
      <PartnerConfirmModals partner={partner} actions={actions} />
    </div>
  )
}
