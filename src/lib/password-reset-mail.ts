/**
 * Template email "lupa kata sandi".
 *
 * Dipisah dari `mailer.ts` supaya isi pesan bisa diubah tanpa nyentuh
 * pengiriman — pola yang sama seperti `src/lib/message-template.ts`.
 */

export interface PasswordResetMailContext {
  name: string
  brand: string
  resetUrl: string
  expiresMinutes: number
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

export function buildPasswordResetMail({
  name,
  brand,
  resetUrl,
  expiresMinutes,
}: PasswordResetMailContext) {
  const subject = `Atur ulang kata sandi ${brand}`
  const nameSafe = escapeHtml(name)
  const brandSafe = escapeHtml(brand)

  const text = [
    `Halo ${name},`,
    '',
    `Kami menerima permintaan atur ulang kata sandi untuk akun ${brand}.`,
    `Buka link ini (berlaku ${expiresMinutes} menit, cuma bisa dipakai sekali):`,
    resetUrl,
    '',
    'Kalau bukan kamu yang minta, abaikan saja email ini — kata sandimu tidak',
    'berubah.',
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
                <p style="margin:0 0 16px;font-size:16px;font-weight:700;">Jastip</p>
                <p style="margin:0 0 16px;font-size:15px;">Halo ${nameSafe},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
                  Kami menerima permintaan untuk mengatur ulang kata sandi akun
                  <strong>${brandSafe}</strong>. Klik tombol di bawah ini untuk membuat
                  kata sandi baru.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${resetUrl}" style="display:inline-block;background:#b6584b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">Atur ulang kata sandi</a>
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5b52;">
                  Link ini berlaku ${expiresMinutes} menit dan cuma bisa dipakai sekali.
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b5b52;word-break:break-all;">
                  Tombolnya tidak jalan? Salin link berikut ke browser:<br />
                  <a href="${resetUrl}" style="color:#b6584b;">${escapeHtml(resetUrl)}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#6b5b52;">
                  Kalau bukan kamu yang minta, abaikan saja email ini — kata sandimu
                  tidak berubah.
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
