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
  const [search, setSearch] = useState('')
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
    <main className="px-4 pb-6 pt-6">
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
    </main>
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
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'disable' | 'delete' | null>(null)
  const style = STATUS_STYLE[partner.status]
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
    </div>
  )
}
