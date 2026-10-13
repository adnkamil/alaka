import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { resolveAppUrl } from './app-url'
import { getSessionUser } from './auth'
import { requireBrandPermission } from './brand-permissions'
import { requireVerifiedEmail } from './email-verified'
import { buildInvitationMail } from './invitation-mail'
import { sendMail } from './mailer'
import {
  createInvitation,
  listTeam,
  removeAdmin,
  revokeInvitation,
} from './team-queries'
import { INVITATION_TTL_DAYS } from './team-rules'

/**
 * Kelola tim brand dari halaman Profil: lihat anggota & undangan, undang admin,
 * batalkan undangan, cabut admin. Semuanya HANYA untuk pemilik brand
 * (`team.manage`). `team-queries.ts` mengecek izin yang sama lagi — sengaja
 * ganda, karena ini pintu masuk akses ke brand.
 */

async function requireOwner() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  requireBrandPermission(user, 'team.manage')
  return user
}

export const fetchTeam = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireOwner()
  return listTeam(user.brandId)
})

export const inviteAdmin = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().trim().email('Email tidak valid') }))
  .handler(async ({ data }) => {
    const user = await requireOwner()
    // Mengundang = memberi orang lain akses ke brand: akun pengundang harus
    // terpercaya (email sudah terverifikasi).
    requireVerifiedEmail(user)

    const { invitation, token } = await createInvitation(user, data.email)

    const mail = buildInvitationMail({
      inviterName: user.name,
      brand: user.brandName?.trim() || 'brand jastip ini',
      inviteUrl: `${resolveAppUrl()}/undangan/${token}`,
      expiresDays: INVITATION_TTL_DAYS,
    })

    // Di-await (bukan fire-and-forget): di serverless proses bisa dihentikan
    // begitu response terkirim. Kalau email gagal terkirim, undangannya
    // dibatalkan supaya tidak menahan slot tanpa ada yang bisa memakainya.
    try {
      await sendMail({
        to: invitation.email,
        ...mail,
        idempotencyKey: `brand-invitation-${invitation.id}`,
      })
    } catch (error) {
      console.error('Email undangan tidak terkirim:', error)
      await revokeInvitation(user, invitation.id).catch((revokeError) => {
        console.error(
          'Gagal membatalkan undangan setelah email gagal:',
          revokeError,
        )
      })
      throw new Error('Email undangan gagal dikirim. Coba lagi sebentar.')
    }

    return { email: invitation.email }
  })

export const cancelInvitation = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const user = await requireOwner()
    await revokeInvitation(user, data.id)
  })

export const removeTeamAdmin = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const user = await requireOwner()
    await removeAdmin(user, data.userId)
  })
