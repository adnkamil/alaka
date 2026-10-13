import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Mail, Plus, UserMinus, UserPlus, X } from 'lucide-react'
import { useBackToClose } from '../lib/back-to-close'
import { formatDate } from '../lib/format'
import {
  cancelInvitation,
  fetchTeam,
  inviteAdmin,
  removeTeamAdmin,
} from '../lib/team-functions'

/**
 * Bagian "Tim" di halaman Profil (hanya dirender untuk pemilik brand): daftar
 * anggota, undangan yang menunggu, undang admin, batalkan undangan, cabut admin.
 * Proteksi yang mengikat ada di server (`team-functions.ts`).
 */

const TEAM_QUERY_KEY = ['team'] as const

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function TeamSection() {
  const queryClient = useQueryClient()
  const {
    data: team,
    isPending,
    error,
  } = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: () => fetchTeam(),
  })
  const [inviteOpen, setInviteOpen] = useState(false)
  // Konfirmasi dua langkah di baris: id yang sedang menunggu konfirmasi.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setActionError(null)
    try {
      await action()
      setConfirming(null)
      await queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY })
    } catch (err) {
      setActionError(errorMessage(err, 'Aksi gagal. Coba lagi.'))
    } finally {
      setBusyId(null)
    }
  }

  const slotsFull = team ? team.slotsLeft <= 0 : true

  return (
    <section className="mb-6">
      <h2
        className="mb-2 text-xs font-semibold uppercase"
        style={{ color: 'var(--app-text-mute)' }}
      >
        Tim
      </h2>
      <div
        className="app-card flex flex-col"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {isPending && (
          <p
            className="px-4 py-3 text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            Memuat tim...
          </p>
        )}

        {error && (
          <p
            className="px-4 py-3 text-xs"
            style={{ color: 'var(--app-danger)' }}
          >
            {errorMessage(error, 'Gagal memuat tim.')}
          </p>
        )}

        {team?.members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">
                  {member.name}
                </span>
                <span
                  className="app-badge flex-shrink-0"
                  style={{
                    background: 'var(--app-border)',
                    color: 'var(--app-text-soft)',
                  }}
                >
                  {member.brandRole === 'owner' ? 'Pemilik' : 'Admin'}
                </span>
              </span>
              <span
                className="block truncate text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                {member.email}
              </span>
            </div>

            {member.brandRole === 'admin' &&
              (confirming === member.id ? (
                <div className="flex flex-shrink-0 items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() => setConfirming(null)}
                    style={{ color: 'var(--app-text-soft)' }}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() =>
                      void runAction(member.id, () =>
                        removeTeamAdmin({ data: { userId: member.id } }),
                      )
                    }
                    className="font-semibold"
                    style={{ color: 'var(--app-danger)' }}
                  >
                    {busyId === member.id ? 'Mencabut...' : 'Ya, cabut'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null)
                    setConfirming(member.id)
                  }}
                  className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold"
                  style={{ color: 'var(--app-danger)' }}
                >
                  <UserMinus size={14} />
                  Cabut
                </button>
              ))}
          </div>
        ))}

        {team?.invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <span style={{ color: 'var(--app-text-soft)' }}>
              <Mail size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">
                  {invitation.email}
                </span>
                <span
                  className="app-badge flex-shrink-0"
                  style={{
                    background: 'var(--app-border)',
                    color: 'var(--app-text-soft)',
                  }}
                >
                  Menunggu
                </span>
              </span>
              <span
                className="block truncate text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Berlaku sampai {formatDate(invitation.expiresAt)}
              </span>
            </div>

            {confirming === invitation.id ? (
              <div className="flex flex-shrink-0 items-center gap-2 text-xs">
                <button
                  type="button"
                  disabled={busyId === invitation.id}
                  onClick={() => setConfirming(null)}
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  Tidak
                </button>
                <button
                  type="button"
                  disabled={busyId === invitation.id}
                  onClick={() =>
                    void runAction(invitation.id, () =>
                      cancelInvitation({ data: { id: invitation.id } }),
                    )
                  }
                  className="font-semibold"
                  style={{ color: 'var(--app-danger)' }}
                >
                  {busyId === invitation.id ? 'Membatalkan...' : 'Ya, batalkan'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setConfirming(invitation.id)
                }}
                className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold"
                style={{ color: 'var(--app-danger)' }}
              >
                <X size={14} />
                Batalkan
              </button>
            )}
          </div>
        ))}

        {actionError && (
          <p
            className="px-4 py-2 text-xs"
            style={{ color: 'var(--app-danger)' }}
          >
            {actionError}
          </p>
        )}

        {team && (
          <>
            <button
              type="button"
              disabled={slotsFull}
              onClick={() => setInviteOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
              style={{
                color: slotsFull ? 'var(--app-text-mute)' : 'var(--app-accent)',
              }}
            >
              {slotsFull ? <Lock size={18} /> : <Plus size={18} />}
              <span className="flex-1 text-sm font-semibold">Undang admin</span>
              <span
                className="text-xs font-normal"
                style={{ color: 'var(--app-text-mute)' }}
              >
                {team.adminCount + team.invitations.length}/{team.maxAdmins}
              </span>
            </button>
            {slotsFull && (
              <p
                className="px-4 pb-3 text-xs"
                style={{ color: 'var(--app-text-soft)' }}
              >
                Slot admin penuh. Cabut admin atau batalkan undangan yang
                menunggu untuk mengundang orang lain.
              </p>
            )}
          </>
        )}
      </div>

      {inviteOpen && (
        <InviteAdminModal
          onClose={() => setInviteOpen(false)}
          onInvited={async () => {
            setInviteOpen(false)
            await queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY })
          }}
        />
      )}
    </section>
  )
}

function InviteAdminModal({
  onClose,
  onInvited,
}: {
  onClose: () => void
  onInvited: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tombol back menutup dialog, bukan meninggalkan halaman.
  useBackToClose(true, onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await inviteAdmin({ data: { email } })
      await onInvited()
    } catch (err) {
      setError(errorMessage(err, 'Gagal mengirim undangan.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-[390px] overflow-y-auto rounded-2xl border p-5 shadow-2xl"
        style={{
          background: 'var(--app-card)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="app-icon-tile h-10 w-10">
              <UserPlus size={18} />
            </span>
            <h3 className="text-base font-bold leading-tight">Undang admin</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1 transition-colors hover:opacity-75 disabled:opacity-30"
            style={{ color: 'var(--app-text-mute)' }}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Admin bisa mengelola event, order, customer, aturan fee, dan
            template pesan. Rekening, langganan, serta nama dan foto brand tetap
            milik kamu. Undangan hanya untuk email yang belum punya akun.
          </p>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Email admin
            <input
              type="email"
              required
              autoFocus
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="app-input"
            />
          </label>

          {error && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="app-btn-primary"
          >
            {isSubmitting ? 'Mengirim...' : 'Kirim undangan'}
          </button>
        </form>
      </div>
    </div>
  )
}
