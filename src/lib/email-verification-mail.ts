/**
 * Template email "verifikasi email" saat registrasi.
 *
 * Pola yang sama dengan `password-reset-mail.ts`: isi pesan dipisah dari
 * pengiriman (`mailer.ts`) supaya gampang diubah.
 */

export interface EmailVerificationMailContext {
  name: string
  brand: string
  verifyUrl: string
  expiresHours: number
}

// Nama & brand itu input user, jadi di-escape sebelum masuk HTML email.
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildEmailVerificationMail({
  name,
  brand,
  verifyUrl,
  expiresHours,
}: EmailVerificationMailContext) {
  const subject = `Verifikasi email ${brand}`
  const nameSafe = escapeHtml(name)
  const brandSafe = escapeHtml(brand)

  const text = [
    `Halo ${name},`,
    '',
    `Terima kasih sudah mendaftarkan ${brand}. Satu langkah lagi: buka link`,
    `ini untuk memastikan email kamu benar (berlaku ${expiresHours} jam):`,
    verifyUrl,
    '',
    'Kalau bukan kamu yang mendaftar, abaikan saja email ini.',
  ].join('\n')

  const html = `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:24px;background:#fdf9ef;color:#3a2f2a;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;border-collapse:collapse;background:#ffffff;border:1px solid #ecdfd0;border-radius:16px;">
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:16px;font-weight:700;">ALAKA</p>
                <p style="margin:0 0 16px;font-size:15px;">Halo ${nameSafe},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
                  Terima kasih sudah mendaftar di <strong>${brandSafe}</strong>.
                  Klik tombol di bawah ini untuk memastikan email kamu benar.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${verifyUrl}" style="display:inline-block;background:#b6584b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">Verifikasi email</a>
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5b52;">
                  Link ini berlaku ${expiresHours} jam.
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5b52;word-break:break-all;">
                  Tombolnya tidak jalan? Salin link berikut ke browser:<br />
                  <a href="${verifyUrl}" style="color:#b6584b;">${escapeHtml(verifyUrl)}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#6b5b52;">
                  Kalau bukan kamu yang mendaftar, abaikan saja email ini.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
