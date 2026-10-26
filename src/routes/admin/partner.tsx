import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Inbox, Mail, Plus, Search } from 'lucide-react'
import PartnerFormModal from '../../components/PartnerFormModal'
import Toast from '../../components/ui/Toast'
import { getErrorMessage } from '../../lib/error-message'
import { formatDate, formatPhoneNumber } from '../../lib/format'
import {
  createAdminPartner,
  resendAdminPartnerInvitation,
} from '../../lib/partner-functions'
import { adminPartnersQuery } from '../../lib/queries'
import type { PartnerRow } from '../../lib/partner-queries'
import type { PartnerFormValue } from '../../components/PartnerFormModal'

export const Route = createFileRoute('/admin/partner')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminPartnersQuery),
  component: AdminPartnerPage,
})

type Tab = 'all' | 'aktif' | 'diundang'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'diundang', label: 'Diundang' },
]

function AdminPartnerPage() {
  const { data: partners } = useSuspenseQuery(adminPartnersQuery)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const counts: Record<Tab, number> = {
    all: partners.length,
    aktif: partners.filter((p) => p.status === 'aktif').length,
    diundang: partners.filter((p) => p.status === 'diundang').length,
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
    await queryClient.invalidateQueries({ queryKey: ['admin-partners'] })
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
              onNotice={setNotice}
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
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </main>
  )
}

function PartnerCard({
  partner,
  onNotice,
}: {
  partner: PartnerRow
  onNotice: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)
  const active = partner.status === 'aktif'

  async function handleResend() {
    setSending(true)
    try {
      await resendAdminPartnerInvitation({ data: { id: partner.id } })
      onNotice(`Undangan dikirim ulang ke ${partner.email}`)
      await queryClient.invalidateQueries({ queryKey: ['admin-partners'] })
    } catch (err) {
      onNotice(getErrorMessage(err, 'Gagal mengirim ulang undangan'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="app-card p-4">
      <div className="flex items-start justify-between gap-3">
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
        </div>
        <span
          className="app-badge shrink-0"
          style={{
            background: active
              ? 'var(--app-success-soft)'
              : 'var(--app-accent-soft)',
            color: active ? 'var(--app-success)' : 'var(--app-accent)',
          }}
        >
          {active ? 'Aktif' : 'Diundang'}
        </span>
      </div>

      {!active && (
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ color: 'var(--app-accent)' }}
        >
          <Mail size={13} />
          {sending ? 'Mengirim...' : 'Kirim ulang undangan'}
        </button>
      )}
    </div>
  )
}
