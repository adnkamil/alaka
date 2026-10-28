import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { hashPassword, verifyPassword } from './auth'
import { createPartnerSession, requirePartner } from './partner-auth'
import {
  replacePartnerPassword,
  updatePartnerProfile,
} from './partner-profile-queries'
import { normalizePartnerProfile } from './partner-profile-rules'
import { PARTNER_PASSWORD_MIN_LENGTH } from './partner-rules'

/**
 * Profil partner. SETIAP handler wajib `requirePartner()` di baris pertama;
 * `partnerId` selalu dari sesi. Email tidak bisa diubah di sini: itu kunci
 * login dan harus unik lintas akun jastiper & partner, jadi perubahannya lewat
 * admin ALAKA.
 */

export const updateOwnPartnerProfile = createServerFn({ method: 'POST' })
  .validator(
    z.object({ name: z.string().max(500), waNumber: z.string().max(50) }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    // Validasi ulang di server: client tidak dipercaya.
    const result = normalizePartnerProfile(data)
    if (!result.ok) throw new Error(result.error)

    const updated = await updatePartnerProfile(partner.id, result.value)
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      waNumber: updated.waNumber,
    }
  })

export const changeOwnPartnerPassword = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      currentPassword: z.string().min(1, 'Kata sandi lama wajib diisi'),
      newPassword: z
        .string()
        .min(
          PARTNER_PASSWORD_MIN_LENGTH,
          `Password minimal ${PARTNER_PASSWORD_MIN_LENGTH} karakter`,
        ),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!partner.passwordHash) throw new Error('Kata sandi belum dibuat')

    const valid = await verifyPassword(
      data.currentPassword,
      partner.passwordHash,
    )
    if (!valid) throw new Error('Kata sandi lama salah')

    await replacePartnerPassword(
      partner.id,
      await hashPassword(data.newPassword),
    )
    // Perangkat lain keluar; perangkat ini dapat sesi baru supaya tidak ikut keluar.
    await createPartnerSession(partner.id)
    return { ok: true }
  })
