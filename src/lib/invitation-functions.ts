import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createSession, hashPassword } from './auth'
import { acceptInvitation, getInvitationPreview } from './team-queries'
import { teamErrorMessage } from './team-rules'

/**
 * Terima undangan admin brand (publik — penerima belum punya akun, jadi tidak
 * ada pengecekan login). Yang mengikat adalah token undangan (32 byte acak,
 * hanya hash-nya di database) dan aturan di `acceptInvitation`.
 */

const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Tautan undangan tidak valid')

/**
 * Data untuk halaman terima undangan: nama brand + email yang diundang. Token
 * yang formatnya salah dijawab "tidak ditemukan" (bukan error), supaya halaman
 * tetap menampilkan pesan yang ramah.
 */
export const fetchInvitationPreview = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().max(256) }))
  .handler(async ({ data }) => {
    const preview = tokenSchema.safeParse(data.token).success
      ? await getInvitationPreview(data.token)
      : ({ state: 'invalid', reason: 'UNDANGAN_TIDAK_DITEMUKAN' } as const)
    if (preview.state === 'valid') {
      return {
        state: 'valid' as const,
        email: preview.email,
        brandName: preview.brandName,
      }
    }
    return {
      state: 'invalid' as const,
      reason: preview.reason,
      message: teamErrorMessage(preview.reason),
    }
  })

const acceptSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().min(1, 'Nama wajib diisi'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
})

/**
 * Daftar lewat tautan undangan (email + password): akun baru jadi ADMIN di brand
 * pengundang, email langsung terverifikasi, lalu login.
 */
export const acceptInvitationWithPassword = createServerFn({ method: 'POST' })
  .validator(acceptSchema)
  .handler(async ({ data }) => {
    const passwordHash = await hashPassword(data.password)
    const user = await acceptInvitation(data.token, {
      name: data.name,
      email: data.email,
      passwordHash,
    })
    await createSession(user.id)
    return { id: user.id, name: user.name }
  })
