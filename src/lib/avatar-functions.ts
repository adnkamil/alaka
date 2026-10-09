import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/schema'
import { getSessionUser } from './auth'
import { requireVerifiedEmail } from './email-verified'
import {
  AVATAR_MAX_DATA_URL_LENGTH,
  parseAvatarDataUrl,
} from './avatar-validation'
import { deleteAvatar, putAvatar } from './storage'

const uploadAvatarSchema = z.object({
  // Data URL WebP/JPEG hasil resize di client (±15-30 KB). Isinya dicek ulang
  // di `parseAvatarDataUrl` — client tidak dipercaya.
  dataUrl: z.string().max(AVATAR_MAX_DATA_URL_LENGTH, 'Foto terlalu besar'),
})

export const uploadAvatar = createServerFn({ method: 'POST' })
  .validator(uploadAvatarSchema)
  .handler(async ({ data }) => {
    const current = await getSessionUser()
    if (!current) throw new Error('Belum login')
    // Upload memakai storage: cegah akun spam yang belum terverifikasi.
    requireVerifiedEmail(current)

    const { bytes, contentType } = parseAvatarDataUrl(data.dataUrl)

    // Simpan file dulu, baru tandai di DB. Kalau update DB gagal, yang tersisa
    // cuma file yang akan ditimpa pada upload berikutnya.
    await putAvatar(current.id, bytes, contentType)

    const avatarUpdatedAt = new Date()
    await db
      .update(users)
      .set({ avatarUpdatedAt, updatedAt: avatarUpdatedAt })
      .where(eq(users.id, current.id))

    return { avatarUpdatedAt: avatarUpdatedAt.toISOString() }
  })

export const removeAvatar = createServerFn({ method: 'POST' }).handler(
  async () => {
    const current = await getSessionUser()
    if (!current) throw new Error('Belum login')

    // Tandai di DB dulu supaya UI langsung kembali ke inisial; file di storage
    // dihapus sesudahnya (kalau gagal, file yatim tidak terlihat siapa pun dan
    // ditimpa upload berikutnya).
    await db
      .update(users)
      .set({ avatarUpdatedAt: null, updatedAt: new Date() })
      .where(eq(users.id, current.id))

    try {
      await deleteAvatar(current.id)
    } catch (err) {
      console.error('Gagal menghapus file avatar dari storage:', err)
    }
  },
)
