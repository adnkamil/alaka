import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAdminUser } from './admin'
import { resolveAppUrl } from './app-url'
import { hashPassword } from './auth'
import { sendMail } from './mailer'
import {
  createPartnerSession,
  destroyPartnerSession,
  getCurrentPartner,
} from './partner-auth'
import { buildPartnerInvitationMail } from './partner-mail'
import {
  acceptPartnerInvitation,
  createPartner,
  discardInactivePartner,
  getPartnerInvitationPreview,
  listPartners,
  reissuePartnerInvitation,
} from './partner-queries'
import {
  PARTNER_INVITATION_TTL_DAYS,
  PARTNER_PASSWORD_MIN_LENGTH,
  partnerErrorMessage,
} from './partner-rules'

/**
 * Server function Partner Portal.
 *
 * - Bagian admin: SETIAP handler wajib `requireAdminUser()` di baris pertama
 *   (lihat `src/lib/admin.ts`).
 * - Terima undangan: publik (penerima belum punya sesi); yang mengikat adalah
 *   token undangan (32 byte acak, hanya hash-nya di database).
 */

const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Tautan undangan tidak valid')

// ---------- Admin ALAKA ----------

export const fetchAdminPartners = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdminUser()
    return listPartners()
  },
)

const createPartnerSchema = z.object({
  name: z.string().trim().min(1, 'Nama partner wajib diisi').max(120),
  email: z.string().trim().email('Email tidak valid'),
  waNumber: z.string().trim().max(32).optional(),
})

async function sendInvitationMail(
  partner: { id: string; name: string; email: string },
  token: string,
) {
  const mail = buildPartnerInvitationMail({
    partnerName: partner.name,
    inviteUrl: `${resolveAppUrl()}/undangan-partner/${token}`,
    expiresDays: PARTNER_INVITATION_TTL_DAYS,
  })
  await sendMail({
    to: partner.email,
    ...mail,
    // Token baru tiap kirim ulang -> kunci idempotensi ikut token (dipotong).
    idempotencyKey: `partner-invitation-${partner.id}-${token.slice(0, 12)}`,
  })
}

/** Daftarkan partner + kirim undangan lewat email. */
export const createAdminPartner = createServerFn({ method: 'POST' })
  .validator(createPartnerSchema)
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()
    const { partner, token } = await createPartner(admin.id, data)

    // Di-await (bukan fire-and-forget): di serverless proses bisa dihentikan
    // begitu response terkirim. Kalau email gagal, partner-nya dibatalkan agar
    // tidak tersisa akun "Diundang" yang tidak punya cara masuk.
    try {
      await sendInvitationMail(partner, token)
    } catch (error) {
      console.error('Email undangan partner tidak terkirim:', error)
      await discardInactivePartner(partner.id).catch((discardError) => {
        console.error(
          'Gagal membatalkan partner setelah email gagal:',
          discardError,
        )
      })
      throw new Error('Email undangan gagal dikirim. Coba lagi sebentar.')
    }
    return partner
  })

/** Kirim ulang undangan (token lama hangus). Hanya untuk partner "Diundang". */
export const resendAdminPartnerInvitation = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdminUser()
    const { partner, token } = await reissuePartnerInvitation(data.id)
    try {
      await sendInvitationMail(partner, token)
    } catch (error) {
      console.error('Email undangan partner tidak terkirim:', error)
      throw new Error('Email undangan gagal dikirim. Coba lagi sebentar.')
    }
    return { email: partner.email }
  })

// ---------- Terima undangan (publik) ----------

export const fetchPartnerInvitationPreview = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().max(256) }))
  .handler(async ({ data }) => {
    const preview = tokenSchema.safeParse(data.token).success
      ? await getPartnerInvitationPreview(data.token)
      : ({ state: 'invalid', reason: 'UNDANGAN_TIDAK_DITEMUKAN' } as const)
    if (preview.state === 'valid') {
      return {
        state: 'valid' as const,
        email: preview.email,
        partnerName: preview.partnerName,
      }
    }
    return {
      state: 'invalid' as const,
      reason: preview.reason,
      message: partnerErrorMessage(preview.reason),
    }
  })

const acceptSchema = z.object({
  token: tokenSchema,
  password: z
    .string()
    .min(
      PARTNER_PASSWORD_MIN_LENGTH,
      `Password minimal ${PARTNER_PASSWORD_MIN_LENGTH} karakter`,
    ),
})

/** Buat kata sandi lewat tautan undangan, lalu langsung login sebagai partner. */
export const acceptPartnerInvitationWithPassword = createServerFn({
  method: 'POST',
})
  .validator(acceptSchema)
  .handler(async ({ data }) => {
    const passwordHash = await hashPassword(data.password)
    const partner = await acceptPartnerInvitation(data.token, passwordHash)
    await createPartnerSession(partner.id)
    return { id: partner.id, name: partner.name }
  })

// ---------- Partner yang sedang login ----------

export const fetchCurrentPartner = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await getCurrentPartner()
    if (!partner) return null
    return {
      id: partner.id,
      name: partner.name,
      email: partner.email,
      waNumber: partner.waNumber,
    }
  },
)

export const logoutPartner = createServerFn({ method: 'POST' }).handler(
  async () => {
    await destroyPartnerSession()
  },
)
