/**
 * Template email "undangan jadi partner ALAKA". Pola sama dengan
 * `invitation-mail.ts`: isi pesan dipisah dari pengiriman (`mailer.ts`).
 */

export interface PartnerInvitationMailContext {
  /** Nama partner yang didaftarkan. */
  partnerName: string
  inviteUrl: string
  expiresDays: number
}

// Nama partner itu input admin, jadi di-escape sebelum masuk HTML email.
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildPartnerInvitationMail({
  partnerName,
  inviteUrl,
  expiresDays,
}: PartnerInvitationMailContext) {
  const subject = `Akun Partner ALAKA untuk ${partnerName}`
  const nameSafe = escapeHtml(partnerName)

  const text = [
    'Halo,',
    '',
    `${partnerName} sudah didaftarkan sebagai Partner di ALAKA.`,
    `Buka link ini untuk membuat kata sandi (berlaku ${expiresDays} hari):`,
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
                <p style="margin:0 0 16px;font-size:16px;font-weight:700;">ALAKA Partner</p>
                <p style="margin:0 0 16px;font-size:15px;">Halo,</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
                  <strong>${nameSafe}</strong> sudah didaftarkan sebagai Partner
                  di ALAKA. Buat kata sandi untuk mulai mengelola katalog dan
                  event.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${inviteUrl}" style="display:inline-block;background:#b6584b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">Buat kata sandi</a>
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

  return { subject, text, html }
}
