import { getStore } from '@netlify/blobs'
import { detectAvatarContentType } from './avatar-validation'
import type { AvatarContentType } from './avatar-validation'

/**
 * Penyimpanan file (server-only). SEMUA akses ke Netlify Blobs lewat file ini,
 * dan app lain cuma memanggil `putAvatar` / `getAvatar` / `deleteAvatar`.
 * Kalau nanti pindah ke S3-compatible (R2, SumoPod, dst.), cukup tulis ulang
 * isi file ini — pemanggilnya tidak berubah.
 *
 * JANGAN di-import dari komponen/halaman: cuma dari handler server function
 * (`*-functions.ts`) dan route `src/routes/api/*`.
 */

const AVATAR_STORE = 'avatars'

function avatarStore() {
  return getStore({
    name: AVATAR_STORE,
    // Foto yang baru diganti harus langsung terbaca. Mode default (eventual)
    // bisa menyajikan foto lama sampai 60 detik setelah ditimpa.
    consistency: 'strong',
    // Singapura = region terdekat dengan user Indonesia. Region tidak
    // mengubah data yang sudah ada, jadi aman diganti belakangan.
    region: 'ap-southeast-1',
  })
}

/** Simpan/timpa foto milik user. Key = userId, jadi tidak ada file yatim. */
export async function putAvatar(
  userId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  // Salin ke Uint8Array baru supaya buffer-nya pasti ArrayBuffer biasa
  // (bukan SharedArrayBuffer) dan diterima sebagai BlobPart.
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await avatarStore().set(userId, body, { metadata: { contentType } })
}

export async function getAvatar(
  userId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  // Overload `type: 'blob'` dipakai karena tipe `arrayBuffer`-nya tidak
  // mencantumkan `null`, padahal key yang tidak ada mengembalikan null.
  const result = await avatarStore().getWithMetadata(userId, { type: 'blob' })
  if (!result) return null

  const data = await result.data.arrayBuffer()

  // Tipe dikenali dari isi file, bukan dari metadata, supaya yang disajikan
  // ke browser selalu gambar yang valid.
  const contentType = detectAvatarContentType(new Uint8Array(data))
  if (!contentType) return null

  return { data, contentType }
}

export async function deleteAvatar(userId: string): Promise<void> {
  await avatarStore().delete(userId)
}
