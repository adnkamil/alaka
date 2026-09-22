import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { users } from '../../../../db/schema'
import { SESSION_COOKIE_NAME, createSessionToken } from '../../../../lib/auth'
import { exchangeGoogleCode } from '../../../../lib/google-auth'

const STATE_COOKIE = 'google_oauth_state'
const CLEAR_STATE_COOKIE = `${STATE_COOKIE}=; Path=/; Max-Age=0`

function readCookie(request: Request, name: string) {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function redirectTo(location: string) {
  const headers = new Headers({ Location: location })
  headers.append('Set-Cookie', CLEAR_STATE_COOKIE)
  return new Response(null, { status: 302, headers })
}

// Ini dibuka di window/tab baru (popup), jadi alih-alih redirect biasa,
// kita render halaman kecil yang nyuruh tab asal (opener) pindah ke
// halaman utama, lalu nutup popup-nya sendiri.
function closePopupAndRefreshOpenerHtml(openerUrl: string) {
  return `<!doctype html>
<html>
  <body>
    <script>
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.location.href = ${JSON.stringify(openerUrl)};
        }
      } catch (e) {}
      window.close();
    </script>
  </body>
</html>`
}

export const Route = createFileRoute('/api/auth/google/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const origin = url.origin
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const savedState = readCookie(request, STATE_COOKIE)

        if (!code || !state || !savedState || state !== savedState) {
          return redirectTo(`${origin}/login?error=google_state`)
        }

        try {
          const redirectUri = `${origin}/api/auth/google/callback`
          const profile = await exchangeGoogleCode({ code, redirectUri })

          if (!profile.email) {
            throw new Error('Google tidak mengirim email')
          }

          // 1. Sudah pernah login pakai Google ini sebelumnya
          let user = await db.query.users.findFirst({
            where: eq(users.googleId, profile.sub),
          })

          // 2. Belum pernah, tapi email-nya sudah terdaftar (akun password) -> sambungkan
          if (!user) {
            const existingByEmail = await db.query.users.findFirst({
              where: eq(users.email, profile.email),
            })
            if (existingByEmail) {
              ;[user] = await db
                .update(users)
                .set({ googleId: profile.sub, updatedAt: new Date() })
                .where(eq(users.id, existingByEmail.id))
                .returning()
            }
          }

          // 3. Belum ada sama sekali -> bikin akun baru tanpa password
          if (!user) {
            ;[user] = await db
              .insert(users)
              .values({
                name: profile.name || profile.email.split('@')[0],
                email: profile.email,
                googleId: profile.sub,
              })
              .returning()
          }

          const isProd = process.env.NODE_ENV === 'production'
          const { token, expiresAt } = await createSessionToken(user.id)
          const sessionCookie = `${SESSION_COOKIE_NAME}=${token}; Path=/; Expires=${expiresAt.toUTCString()}; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`

          const headers = new Headers({ 'Content-Type': 'text/html' })
          headers.append('Set-Cookie', CLEAR_STATE_COOKIE)
          headers.append('Set-Cookie', sessionCookie)

          return new Response(
            closePopupAndRefreshOpenerHtml(
              `${origin}${user.isAdmin ? '/admin' : '/'}`,
            ),
            { headers },
          )
        } catch (err) {
          console.error('Google login gagal:', err)
          return redirectTo(`${origin}/login?error=google`)
        }
      },
    },
  },
})