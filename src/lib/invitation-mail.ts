/**
 * Template email "undangan jadi admin brand".
 *
 * Pola yang sama dengan `email-verification-mail.ts`: isi pesan dipisah dari
 * pengiriman (`mailer.ts`) supaya gampang diubah dan bisa dites tanpa SMTP.
 */

export interface InvitationMailContext {
  /** Nama pemilik yang mengundang. */
  inviterName: string
  /** Nama brand (atau pengganti kalau pemilik belum mengisi nama brand). */
  brand: string
  inviteUrl: string
  expiresDays: number
}

// Nama pemilik & brand itu input user, jadi di-escape sebelum masuk HTML email.
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildInvitationMail({
  inviterName,
  brand,
  inviteUrl,
  expiresDays,
}: InvitationMailContext) {
  const subject = `${inviterName} mengundang kamu jadi admin ${brand}`
  const inviterSafe = escapeHtml(inviterName)
  const brandSafe = escapeHtml(brand)

  const text = [
    'Halo,',
    '',
    `${inviterName} mengundang kamu untuk ikut mengelola ${brand} di ALAKA`,
    'sebagai admin. Buka link ini untuk membuat akun dan menerima undangan',
    `(berlaku ${expiresDays} hari):`,
    inviteUrl,
    '',
    'Kalau kamu tidak mengenal pengirimnya, abaikan saja email ini.',
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
                <p style="margin:0 0 16px;font-size:15px;">Halo,</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
                  <strong>${inviterSafe}</strong> mengundang kamu untuk ikut
                  mengelola <strong>${brandSafe}</strong> sebagai admin.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${inviteUrl}" style="display:inline-block;background:#b6584b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">Terima undangan</a>
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5b52;">
                  Link ini berlaku ${expiresDays} hari dan hanya bisa dipakai sekali.
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5b52;word-break:break-all;">
                  Tombolnya tidak jalan? Salin link berikut ke browser:<br />
                  <a href="${inviteUrl}" style="color:#b6584b;">${escapeHtml(inviteUrl)}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#6b5b52;">
                  Kalau kamu tidak mengenal pengirimnya, abaikan saja email ini.
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
