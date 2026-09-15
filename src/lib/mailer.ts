/**
 * Pengirim email aplikasi.
 *
 * Provider: Resend (HTTP API) — dipilih karena repo ini belum pakai SDK pihak
 * ketiga sama sekali (Google OAuth pun diimplementasi pakai `fetch` mentah di
 * `google-auth.ts`), jadi nol dependency baru dan gampang diganti provider.
 *
 * MAIL_MODE:
 * - `console` (default) => email cuma di-log ke terminal. Seluruh flow bisa
 *   dites tanpa domain/akun Resend.
 * - `resend`            => dikirim lewat API Resend. Butuh domain terverifikasi
 *   + RESEND_API_KEY + MAIL_FROM.
 *
 * Jadi waktu domainnya sudah dibeli, yang berubah cuma isi .env — bukan kode.
 */

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface MailInput {
  to: string
  subject: string
  html: string
  text: string
  /** Opsional, buat cegah email dobel kalau request-nya di-retry. */
  idempotencyKey?: string
}

// Env dibaca di dalam fungsi (bukan module scope) — sama seperti pola
// requireGoogleEnv() di google-auth.ts dan aman untuk runtime per-request.
function requireResendEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.MAIL_FROM?.trim()
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY / MAIL_FROM belum di-set di .env.local')
  }
  return { apiKey, from }
}

export function mailMode() {
  return process.env.MAIL_MODE?.trim() || 'console'
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  idempotencyKey,
}: MailInput) {
  const mode = mailMode()

  if (mode !== 'resend') {
    console.log(
      `\n[mail:${mode}] → ${to}\nSubjek: ${subject}\n${'-'.repeat(60)}\n${text}\n${'-'.repeat(60)}\n`,
    )
    return
  }

  const { apiKey, from } = requireResendEnv()

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Resend gagal (${res.status}): ${detail}`)
  }
}
