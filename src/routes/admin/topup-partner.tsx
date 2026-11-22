import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import UnderlineTabs from '../../components/ui/UnderlineTabs'
import {
  adjustPartnerCredit,
  approvePartnerTopup,
  fetchAdminPartnerCredits,
  fetchAdminPartnerTopups,
  rejectPartnerTopup,
} from '../../lib/admin-partner-credit-functions'
import type {
  AdminPartnerCreditRow,
  AdminPartnerTopupRow,
} from '../../lib/admin-partner-credit-functions'
import { getErrorMessage } from '../../lib/error-message'
import { formatWibDateTime } from '../../lib/event-slot'
import { CREDIT_ADJUSTMENT_NOTE_MAX } from '../../lib/partner-credit'
import { formatRupiah } from '../../lib/partner-product-rules'

export const Route = createFileRoute('/admin/topup-partner')({
  component: AdminPartnerTopupPage,
})

type Tab = 'pending' | 'approved' | 'rejected' | 'saldo'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'rejected', label: 'Ditolak' },
  { key: 'saldo', label: 'Saldo partner' },
]

const TOPUPS_KEY = 'admin-partner-topups'
const CREDITS_KEY = 'admin-partner-credits'

/** Verifikasi top up saldo partner + daftar saldo dan koreksi manual. */
function AdminPartnerTopupPage() {
  const [tab, setTab] = useState<Tab>('pending')
  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="pm-display text-[22px] leading-tight">Top Up Partner</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--app-text-soft)' }}>
          Saldo partner dipakai membayar biaya admin ALAKA saat tagihan lunas. Persen biaya
          admin diatur di Pengaturan.
        </p>
      </header>
      <UnderlineTabs ariaLabel="Top up partner" items={TABS} value={tab} onChange={setTab} />
      {tab === 'saldo' ? <CreditList /> : <TopupList status={tab} />}
    </main>
  )
}

function TopupList({ status }: { status: AdminPartnerTopupRow['status'] }) {
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [TOPUPS_KEY, status],
    queryFn: () => fetchAdminPartnerTopups({ data: { status } }),
  })

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
      setRejectingId(null)
      setNote('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [TOPUPS_KEY] }),
        queryClient.invalidateQueries({ queryKey: [CREDITS_KEY] }),
      ])
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal memproses top up'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
      {isLoading && <p className="text-sm">Memuat…</p>}
      {!isLoading && rows.length === 0 && (
        <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Tidak ada top up di tab ini.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="app-card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{row.partnerName}</p>
                <p className="text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  Diajukan {formatWibDateTime(row.createdAt)}
                  {row.reviewedAt ? ` · Ditinjau ${formatWibDateTime(row.reviewedAt)}` : ''}
                </p>
              </div>
              <span className="pm-num text-sm font-bold" style={{ color: 'var(--app-accent)' }}>
                {formatRupiah(row.amount)}
              </span>
            </div>
            {row.hasProof && row.status === 'pending' && (
              <a href={`/api/partner-topup-proof/${row.id}`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/partner-topup-proof/${row.id}`}
                  alt={`Bukti transfer top up ${row.partnerName}`}
                  className="max-h-72 w-full rounded-xl border bg-white object-contain"
                />
              </a>
            )}
            {row.status === 'rejected' && row.reviewNote && (
              <p className="text-sm">Alasan: {row.reviewNote}</p>
            )}
            {row.status === 'pending' && rejectingId === row.id && (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold">Alasan penolakan (opsional)</span>
                  <input
                    className="app-input"
                    value={note}
                    maxLength={500}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Mis. nominal transfer tidak sesuai"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="app-btn-outline"
                    style={{ minHeight: 40, fontSize: 13 }}
                    disabled={busyId === row.id}
                    onClick={() => setRejectingId(null)}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="app-btn-outline"
                    style={{ minHeight: 40, fontSize: 13, color: 'var(--app-danger)' }}
                    disabled={busyId === row.id}
                    onClick={() =>
                      run(row.id, () =>
                        rejectPartnerTopup({
                          data: { id: row.id, note: note.trim() || undefined },
                        }),
                      )
                    }
                  >
                    Tolak top up
                  </button>
                </div>
              </div>
            )}
            {row.status === 'pending' && rejectingId !== row.id && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="app-btn-outline"
                  style={{ minHeight: 40, fontSize: 13 }}
                  disabled={busyId === row.id}
                  onClick={() => {
                    setRejectingId(row.id)
                    setNote('')
                  }}
                >
                  Tolak
                </button>
                <button
                  type="button"
                  className="app-btn-primary"
                  style={{ minHeight: 40, fontSize: 13 }}
                  disabled={busyId === row.id}
                  onClick={() => run(row.id, () => approvePartnerTopup({ data: { id: row.id } }))}
                >
                  Setujui · tambah saldo
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  )
}

function CreditList() {
  const [search, setSearch] = useState('')
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const { data: rows = [], isLoading } = useQuery({
    queryKey: [CREDITS_KEY],
    queryFn: () => fetchAdminPartnerCredits(),
  })
  const q = search.trim().toLowerCase()
  const visible = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.includes(q))
    : rows

  return (
    <>
      <input
        className="app-input lg:max-w-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari nama atau email partner"
        aria-label="Cari partner"
      />
      {isLoading && <p className="text-sm">Memuat…</p>}
      {!isLoading && visible.length === 0 && (
        <div className="app-card p-6 text-center text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Tidak ada partner.
        </div>
      )}
      <ul className="app-card divide-y" style={{ borderColor: 'var(--app-border)' }}>
        {visible.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.name}</p>
                <p className="truncate text-[11px]" style={{ color: 'var(--app-text-soft)' }}>
                  {row.email}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className="pm-num text-sm font-bold"
                  style={{ color: row.balance < 0 ? 'var(--app-danger)' : 'var(--app-text)' }}
                >
                  {row.balance < 0 ? `Tunggakan ${formatRupiah(-row.balance)}` : formatRupiah(row.balance)}
                </span>
                {adjustingId !== row.id && (
                  <button
                    type="button"
                    className="app-btn-outline text-xs"
                    onClick={() => setAdjustingId(row.id)}
                  >
                    Koreksi
                  </button>
                )}
              </div>
            </div>
            {adjustingId === row.id && (
              <AdjustForm partner={row} onDone={() => setAdjustingId(null)} />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function AdjustForm({
  partner,
  onDone,
}: {
  partner: AdminPartnerCreditRow
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<'add' | 'subtract'>('add')
  const [digits, setDigits] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const value = Number(digits)
    if (!digits || !Number.isSafeInteger(value) || value <= 0) {
      setError('Isi nominal koreksi.')
      return
    }
    if (!note.trim()) {
      setError('Catatan koreksi wajib diisi.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adjustPartnerCredit({
        data: {
          partnerId: partner.id,
          amount: direction === 'add' ? value : -value,
          note: note.trim(),
        },
      })
      await queryClient.invalidateQueries({ queryKey: [CREDITS_KEY] })
      onDone()
    } catch (err) {
      setError(getErrorMessage(err, 'Gagal menyimpan koreksi'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: 'var(--app-accent-soft)' }}>
      <div className="flex gap-2" role="radiogroup" aria-label="Arah koreksi">
        {(
          [
            ['add', 'Tambah saldo'],
            ['subtract', 'Kurangi saldo'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={direction === key}
            onClick={() => setDirection(key)}
            className="rounded-xl border px-3 py-1.5 text-xs font-semibold"
            style={{
              borderColor: direction === key ? 'var(--app-accent)' : 'var(--app-border)',
              background: direction === key ? 'var(--app-card)' : 'transparent',
              color: direction === key ? 'var(--app-accent)' : 'var(--app-text-soft)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="flex items-center overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--app-border)', background: 'var(--app-card)' }}
      >
        <span className="shrink-0 px-3 text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Rp
        </span>
        <input
          autoFocus
          inputMode="numeric"
          aria-label="Nominal koreksi"
          value={digits ? Number(digits).toLocaleString('id-ID') : ''}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
          className="app-input min-w-0 flex-1 border-0 pl-0"
          placeholder="10.000"
        />
      </div>
      <input
        className="app-input"
        aria-label="Catatan koreksi"
        value={note}
        maxLength={CREDIT_ADJUSTMENT_NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Catatan (wajib), mis. transfer dobel 12 Nov"
      />
      {error && (
        <p role="alert" className="text-xs" style={{ color: 'var(--app-danger)' }}>
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onDone}
          className="app-btn-outline text-xs"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="app-btn-primary text-xs"
        >
          {saving ? 'Menyimpan…' : 'Simpan koreksi'}
        </button>
      </div>
    </div>
  )
}
