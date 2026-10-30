/**
 * Aturan link katalog event partner — murni, tanpa `db`, dipakai UI dan server.
 *
 * Katalog lengkap TIDAK diunggah ke ALAKA: partner menempel link unduh (mis.
 * dari Google Drive) di form event dan jastiper membukanya di halaman event itu.
 */

export const CATALOG_URL_MAX_LENGTH = 2000

export type CatalogUrlResult =
  { ok: true; url: string | null } | { ok: false; error: string }

/**
 * Validasi link yang ditempel partner. Kosong = hapus link (`url: null`).
 * Hanya `https://`; menolak `javascript:`/`http:`/`data:`, link yang memuat
 * nama pengguna/kata sandi, `localhost`, dan alamat IP — link ini akan diketuk
 * jastiper, jadi harus alamat situs yang wajar. Hasilnya link yang sudah
 * dinormalkan (`URL.href`).
 */
export function parseCatalogUrl(input: string): CatalogUrlResult {
  const raw = input.trim()
  if (!raw) return { ok: true, url: null }
  if (raw.length > CATALOG_URL_MAX_LENGTH) {
    return { ok: false, error: 'Link terlalu panjang' }
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: 'Link tidak valid. Awali dengan https://' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Link harus diawali https://' }
  }
  if (url.username || url.password) {
    return {
      ok: false,
      error: 'Link tidak boleh memuat nama pengguna atau kata sandi',
    }
  }
  const host = url.hostname
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
  if (!host.includes('.') || isIp) {
    return {
      ok: false,
      error: 'Gunakan link dari situs, bukan alamat lokal atau IP',
    }
  }
  return { ok: true, url: url.href }
}

const DRIVE_HOST = 'drive.google.com'

/** Id berkas dari link Google Drive (`/file/d/<id>/view`, `/open?id=`, `/uc?id=`). */
function driveFileId(url: URL): string | null {
  if (url.hostname !== DRIVE_HOST) return null
  const match = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname)
  if (match) return match[1]
  if (url.pathname === '/open' || url.pathname === '/uc') {
    const id = url.searchParams.get('id')
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) return id
  }
  return null
}

/**
 * Link yang dipakai tombol "Unduh katalog". Link berkas Google Drive diubah ke
 * bentuk unduh langsung supaya jastiper tidak berhenti di halaman pratinjau
 * Drive; link lain (folder Drive, situs lain) dipakai apa adanya.
 */
export function catalogDownloadUrl(storedUrl: string): string {
  let url: URL
  try {
    url = new URL(storedUrl)
  } catch {
    return storedUrl
  }
  const id = driveFileId(url)
  return id ? `https://${DRIVE_HOST}/uc?export=download&id=${id}` : storedUrl
}

/** Nama situs untuk ditampilkan di samping tombol (tanpa "www."). */
export function catalogHost(storedUrl: string): string {
  try {
    return new URL(storedUrl).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
