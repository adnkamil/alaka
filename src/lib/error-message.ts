/**
 * Ambil pesan yang layak ditampilkan ke user dari error server function.
 *
 * Kalau input gagal lolos validator zod, server melempar ZodError yang
 * `message`-nya berupa JSON mentah (array issue). Tanpa ini, layar user
 * menampilkan JSON tersebut. Di sini kita ambil `message` dari issue pertama
 * (pesan yang sudah ditulis di skema, mis. "Email tidak valid").
 *
 * File ini sengaja bebas dependency (tanpa `db` dsb.) supaya aman di-import
 * dari halaman/komponen client.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback

  const raw = err.message.trim()
  if (!raw) return fallback
  if (!raw.startsWith('[') && !raw.startsWith('{')) return raw

  try {
    const parsed: unknown = JSON.parse(raw)
    const issues = Array.isArray(parsed)
      ? parsed
      : (parsed as { issues?: unknown }).issues
    if (Array.isArray(issues)) {
      const first: unknown = issues[0]
      const message = (first as { message?: unknown } | undefined)?.message
      if (typeof message === 'string' && message) return message
    }
  } catch {
    // bukan JSON valid — jatuh ke fallback di bawah
  }
  return fallback
}